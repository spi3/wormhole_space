let currentStreams = [];
let localStreams = [];
let selectedInputStreamName = null;

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')        // Replace spaces with -
    .replace(/[^\w\-]+/g, '')    // Remove non-word chars (except -)
    .replace(/\-\-+/g, '-')      // Replace multiple - with single -
    .replace(/^-+/, '')          // Trim - from start
    .replace(/-+$/, '');         // Trim - from end
}
let shareMode = null;
let liveKitInputMap = {};
let tryToStreaming = false;

const seatArea = $('#seat-area');
const seatTemplate = _.template($('#seat-template').html());

const inputVideo = document.getElementById('input-video');

const beforeStreamingTitle = $('#before-streaming-title');

const deviceInputPreviewArea = $('#device-input-preview-area');
const rtmpInputPreviewArea = $('#rtmp-input-preview-area');
const captureSelectArea = $('#capture-select-area');

const sourceSelectArea = $('#source-select-area');
const videoSourceSelect = $('#video-source-select');
const audioSourceSelect = $('#audio-source-select');
const constraintsSelect = $('.constraints-select');

const resolutionSelect = $('#resolution-select');
const fpsSelect = $('#fps-select');
const bitrateSelect = $('#bitrate-select');
const qualitySelect = $('.quality-select');

const whipInputUrlInput = $('#whip-input-url-input');
const waitingRtmpInputText = $('#waiting-rtmp-input-text');
const connectedRtmpInputText = $('#connected-rtmp-input-text');

const shareDeviceButton = $('#share-device-button');
const shareDisplayButton = $('#share-display-button');
const shareRtmpButton = $('#share-rtmp-button');

const backToCaptureSelectButton = $('.back-to-capture-select-button');
const startShareButton = $('#start-share-button');

const inputErrorMessage = $('#input-error-message');

const inputDeviceModal = $('#input-device-modal');

const totalUserCountSpan = $('#total-user-count-span');
const videoUserCountSpan = $('#video-user-count-span');

const startStreamButton = $('#start-stream-button');

if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
  shareDisplayButton.addClass('d-none');
}

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  shareDeviceButton.addClass('d-none');
}

shareDeviceButton.on('click', function () {

  shareMode = 'device';

  OvenLiveKit.getDevices()
    .then(function (devices) {

      if (devices) {
        renderDevice('video', videoSourceSelect, devices.videoinput,);
        renderDevice('audio', audioSourceSelect, devices.audioinput);
      }

      createWebRTCInput();
    })
    .catch(function (error) {

      showErrorMessage(error);
    });
});

constraintsSelect.on('change', function () {

  removeInputStream(selectedInputStreamName);
  createWebRTCInput();
});

qualitySelect.on('change', function () {
  // Only re-capture if already in a sharing mode
  if (shareMode === 'device' || shareMode === 'display') {
    removeInputStream(selectedInputStreamName);
    createWebRTCInput();
  }
});

shareRtmpButton.on('click', function () {
  shareMode = 'rtmp';
  readyStreaming();
});

shareDisplayButton.on('click', function () {

  shareMode = 'display';

  createWebRTCInput();
});

backToCaptureSelectButton.on('click', function () {

  cancelReadyStreaming();
});

startShareButton.on('click', function () {

  startStreaming();
});

startStreamButton.on('click', function () {

  // Use the username as the stream name (slugified for URL safety)
  selectedInputStreamName = slugify(CURRENT_USERNAME);

  inputDeviceModal.modal('show');
});

function renderDevice(type, select, devices) {

  select.empty();

  if (devices.length === 0) {

    select.append('<option value="">No Source Available</option>')
  } else {

    _.each(devices, function (device) {

      let option = $('<option></option>');

      option.text(device.label);
      option.val(device.deviceId);
      select.append(option);
    });
  }

  select.find('option').eq(0).prop('selected', true);
}

function arrayRemove(arr, value) {

  return arr.filter(function (ele) {
    return ele != value;
  });
}

function createWebRTCInput() {

  const quality = getSelectedQuality();
  const createOptions = {
    callbacks: {
      connected: function () {

        console.log('App Connected');

        if (tryToStreaming) {

          createLocalPlayer(selectedInputStreamName);
          inputDeviceModal.modal('hide');

          tryToStreaming = false;
        }
      },
      connectionClosed: function (type, event) {

        console.log('App Connection Closed');

        if (type === 'websocket') {

        }
        if (type === 'ice') {

        }
      },
      iceStateChange: function (state) {

        console.log('App ICE State', state);
      },
      error: function (error) {

        console.log('App Error On OvenLiveKit', error);

        if (tryToStreaming) {

          currentStreams = arrayRemove(currentStreams, selectedInputStreamName);
          localStreams = arrayRemove(localStreams, selectedInputStreamName);
          tryToStreaming = false;
        }

        showErrorMessage(error);
      }
    }
  };

  // Apply bitrate limit if set (not unlimited)
  if (quality.bitrate > 0) {
    createOptions.connectionConfig = {
      maxVideoBitrate: quality.bitrate,
      sdp: {
        appendFmtp: {
          'x-google-max-bitrate': quality.bitrate,
          'x-google-start-bitrate': Math.floor(quality.bitrate / 2)
        }
      }
    };
  }

  const input = OvenLiveKit.create(createOptions);

  input.attachMedia(inputVideo);

  let errorMsg = null;

  if (shareMode === 'device') {

    input.getUserMedia(getDeviceConstraints()).then(function (stream) {

    }).catch(function (error) {
      // cancelReadyStreaming();
      errorMsg = error;
    }).finally(function () {
      readyStreaming();
      deviceInputPreviewArea.removeClass('d-none');
      sourceSelectArea.removeClass('d-none');
      if (errorMsg) {
        showErrorMessage(errorMsg);
      }
    });
  }

  if (shareMode === 'display') {

    input.getDisplayMedia(getDisplayConstraints()).then(function (stream) {

    }).catch(function (error) {
      // cancelReadyStreaming();
      errorMsg = error;

    }).finally(function () {
      readyStreaming();
      deviceInputPreviewArea.removeClass('d-none');
      sourceSelectArea.addClass('d-none');
      if (errorMsg) {
        showErrorMessage(errorMsg);
      }
    });
  }

  liveKitInputMap[selectedInputStreamName] = input;
}

function readyStreaming() {

  captureSelectArea.addClass('d-none');
  inputErrorMessage.addClass('d-none').text('');

  if (shareMode === 'device' || shareMode === 'display') {
    deviceInputPreviewArea.find('button').prop('disabled', false);

    if (shareMode === 'device') {
      beforeStreamingTitle.text('Click start button to share your WebCam / Mic');
    } else if (shareMode === 'display') {
      beforeStreamingTitle.text('Click start button to share screen');
    }

  }

  if (shareMode === 'rtmp') {
    rtmpInputPreviewArea.find('button').prop('disabled', false);
    rtmpInputPreviewArea.removeClass('d-none');
    beforeStreamingTitle.text('Send the input stream using a live encoder.');

    const whipInputUrl = OME_WEBRTC_INPUT_HOST.replace('ws', 'http') + '/' + APP_NAME + '/' + selectedInputStreamName + '?direction=whip&transport=tcp';
    whipInputUrlInput.val(whipInputUrl);
  }

}

function resetInputUI() {

  inputVideo.srcObject = null;
  shareMode = null;

  deviceInputPreviewArea.addClass('d-none');
  deviceInputPreviewArea.find('button').prop('disabled', true);

  rtmpInputPreviewArea.addClass('d-none');
  rtmpInputPreviewArea.find('button').prop('disabled', true);

  waitingRtmpInputText.removeClass('d-none');
  connectedRtmpInputText.addClass('d-none');

  beforeStreamingTitle.text('Please choose sharing mode');
  captureSelectArea.removeClass('d-none');

  inputErrorMessage.addClass('d-none').text('');
}

function cancelReadyStreaming() {
  removeInputStream(selectedInputStreamName);
  resetInputUI();
}

function showErrorMessage(error) {

  let errorMessage = '';

  if (error.message) {

    errorMessage = error.message;
  } else if (error.name) {

    errorMessage = error.name;
  } else {

    errorMessage = error.toString();
  }

  if (errorMessage === 'OverconstrainedError') {

    errorMessage = 'The input device does not support the specified resolution or frame rate.';
  }

  if (errorMessage === 'Cannot create offer') {

    errorMessage = 'Cannot create stream.';
  }

  inputErrorMessage.removeClass('d-none').text(errorMessage);
}

function startStreaming() {

  if (selectedInputStreamName && liveKitInputMap[selectedInputStreamName]) {

    tryToStreaming = true;
    localStreams.push(selectedInputStreamName);
    currentStreams.push(selectedInputStreamName);

    // Notify others about this stream
    socket.emit('stream started', {
      stream_name: selectedInputStreamName,
      username: CURRENT_USERNAME
    });

    liveKitInputMap[selectedInputStreamName].startStreaming(OME_WEBRTC_INPUT_HOST + '/' + APP_NAME + '/' + selectedInputStreamName + '?direction=send&transport=tcp');
  }
}

inputDeviceModal.on('hidden.bs.modal', function () {
  resetInputUI();
});

function getSelectedQuality() {
  const resolution = resolutionSelect.val().split('x');
  const fps = parseInt(fpsSelect.val(), 10);
  const bitrate = parseInt(bitrateSelect.val(), 10);
  return {
    width: parseInt(resolution[0], 10),
    height: parseInt(resolution[1], 10),
    fps: fps,
    bitrate: bitrate  // in kbps, 0 = unlimited
  };
}

function getDeviceConstraints() {

  let videoDeviceId = videoSourceSelect.val();
  let audioDeviceId = audioSourceSelect.val();
  let quality = getSelectedQuality();

  let newConstraints = {};

  if (videoDeviceId) {
    newConstraints.video = {
      deviceId: {
        exact: videoDeviceId
      },
      width: { ideal: quality.width },
      height: { ideal: quality.height },
      frameRate: { ideal: quality.fps }
    };
  }

  if (audioDeviceId) {
    newConstraints.audio = {
      deviceId: {
        exact: audioDeviceId
      }
    };
  }

  return newConstraints;
}

function getDisplayConstraints() {

  let quality = getSelectedQuality();
  let newConstraint = {};

  newConstraint.video = {
    width: { ideal: quality.width },
    height: { ideal: quality.height },
    frameRate: { ideal: quality.fps }
  };
  newConstraint.audio = true;

  return newConstraint;
}

function getAspectRatioClass(width, height) {
  if (!width || !height) return 'ratio-16x9';

  const ratio = width / height;

  // Determine best matching aspect ratio
  if (ratio >= 3.4) {
    return 'ratio-32x9';      // Super ultrawide (32:9 ~ 3.56)
  } else if (ratio >= 2.2) {
    return 'ratio-21x9';      // Ultrawide (21:9 ~ 2.33)
  } else if (ratio >= 1.6) {
    return 'ratio-16x9';      // Standard widescreen (16:9 ~ 1.78)
  } else if (ratio >= 1.2) {
    return 'ratio-4x3';       // Classic (4:3 ~ 1.33)
  } else if (ratio >= 0.9) {
    return 'ratio-1x1';       // Square (1:1)
  } else {
    return 'ratio-9x16';      // Vertical/Portrait (9:16 ~ 0.56)
  }
}

function applyAspectRatioToSeat(seat, width, height) {
  const ratioClass = getAspectRatioClass(width, height);
  seat.removeClass('ratio-16x9 ratio-21x9 ratio-32x9 ratio-4x3 ratio-1x1 ratio-9x16');
  seat.addClass(ratioClass);
  console.log('Applied aspect ratio:', ratioClass, 'for', width, 'x', height);
}

function createLocalPlayer(streamName) {

  let seat = $('#seat-' + streamName);

  // If seat doesn't exist, create it dynamically
  if (seat.length === 0) {
    const newSeat = $(seatTemplate({
      streamName: streamName
    }));

    // Add leave button handler
    newSeat.on('mouseenter', function () {
      newSeat.find('.leave-button').stop().fadeIn();
    });

    newSeat.on('mouseleave', function () {
      newSeat.find('.leave-button').stop().fadeOut();
    });

    newSeat.find('.leave-button').data('stream-name', streamName);

    newSeat.find('.leave-button').on('click', function () {
      destroyPlayer($(this).data('stream-name'))
    });

    // Add theatre mode button handler
    newSeat.find('.theatre-mode-button').on('click', function (e) {
      e.stopPropagation();
      toggleTheatreMode(seat[0]);
    });

    // Add viewer badge click handler
    newSeat.find('.viewer-count-badge').on('click', function (e) {
      e.stopPropagation();
      toggleViewerList(newSeat);
    });

    seatArea.append(newSeat);
    seat = $('#seat-' + streamName);
  }

  seat.addClass('seat-on');

  seat.find('.local-player-area').removeClass('d-none');

  // Set the streamer header to current user
  seat.parent().find('.streamer-name-header').text(CURRENT_USERNAME);

  // Streamer also counts as watching their own stream
  socket.emit('watching stream', { stream_name: streamName });

  const localVideo = document.getElementById('local-player-' + streamName);
  localVideo.srcObject = liveKitInputMap[streamName].inputStream;

  // Detect aspect ratio from video track
  const stream = liveKitInputMap[streamName].inputStream;
  let dimensionsApplied = false;

  if (stream) {
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const settings = videoTrack.getSettings();
      if (settings.width && settings.height) {
        applyAspectRatioToSeat(seat, settings.width, settings.height);
        dimensionsApplied = true;
      }
    }
  }

  // Fallback: check video element dimensions after it loads
  if (!dimensionsApplied) {
    localVideo.addEventListener('loadedmetadata', function() {
      if (localVideo.videoWidth && localVideo.videoHeight) {
        applyAspectRatioToSeat(seat, localVideo.videoWidth, localVideo.videoHeight);
      }
    });
  }
}

function createPlayer(streamName) {

  let seat = $('#seat-' + streamName);

  // If seat doesn't exist, create it dynamically
  if (seat.length === 0) {
    const newSeat = $(seatTemplate({
      streamName: streamName
    }));

    // Add leave button handler
    newSeat.on('mouseenter', function () {
      newSeat.find('.leave-button').stop().fadeIn();
    });

    newSeat.on('mouseleave', function () {
      newSeat.find('.leave-button').stop().fadeOut();
    });

    newSeat.find('.leave-button').data('stream-name', streamName);

    newSeat.find('.leave-button').on('click', function () {
      destroyPlayer($(this).data('stream-name'))
    });

    // Add theatre mode button handler
    newSeat.find('.theatre-mode-button').on('click', function (e) {
      e.stopPropagation();
      toggleTheatreMode(seat[0]);
    });

    // Add viewer badge click handler
    newSeat.find('.viewer-count-badge').on('click', function (e) {
      e.stopPropagation();
      toggleViewerList(newSeat);
    });

    seatArea.append(newSeat);
    seat = $('#seat-' + streamName);
  }

  seat.addClass('seat-on');

  seat.find('.player-area').removeClass('d-none');

  // Stream name is the username, so display it as the header
  seat.parent().find('.streamer-name-header').text(streamName);

  // Notify server we're watching this stream
  socket.emit('watching stream', { stream_name: streamName });

  const playerOption = {
    // image: OME_THUMBNAIL_HOST + '/' + APP_NAME + '/' + streamName + '/thumb.png',
    autoFallback: false,
    autoStart: false,
    sources: [
      {
        label: 'WebRTC',
        type: 'webrtc',
        file: OME_WEBRTC_STREAMING_HOST + '/' + APP_NAME + '/' + streamName + '?transport=tcp'
      },
      {
        label: 'LLHLS',
        type: 'llhls',
        file: OME_LLHLS_STREAMING_HOST + '/' + APP_NAME + '/' + streamName + '/llhls.m3u8'
      }
    ]
  };

  const player = OvenPlayer.create(document.getElementById('player-' + streamName), playerOption);

  // Detect aspect ratio when video metadata is loaded
  player.on('ready', function () {
    const video = player.getMediaElement();
    if (video) {
      let dimensionsApplied = false;
      const checkDimensions = function () {
        if (!dimensionsApplied && video.videoWidth && video.videoHeight) {
          applyAspectRatioToSeat(seat, video.videoWidth, video.videoHeight);
          dimensionsApplied = true;
        }
      };

      // Check immediately
      checkDimensions();

      // Listen for metadata load
      video.addEventListener('loadedmetadata', checkDimensions);

      // For WebRTC streams, dimensions may not be immediately available
      // Poll a few times to catch them
      let attempts = 0;
      const pollInterval = setInterval(function() {
        checkDimensions();
        attempts++;
        if (dimensionsApplied || attempts >= 10) {
          clearInterval(pollInterval);
        }
      }, 500);
    }
  });

  player.on('error', function (error) {

    console.log('App Error On Player', error);

    destroyPlayer(streamName);
  });
}

function removeInputStream(streamName) {
  if (liveKitInputMap[streamName]) {

    liveKitInputMap[streamName].remove();
    liveKitInputMap[streamName] = null;
    delete liveKitInputMap[streamName];
  }
}

function destroyPlayer(streamName) {
  console.log('>>> destroyPlayer', streamName);

  // If this was our stream, notify others
  if (localStreams.includes(streamName)) {
    socket.emit('stream stopped', { stream_name: streamName });
  }

  // Notify we stopped watching this stream
  socket.emit('stopped watching stream', { stream_name: streamName });

  currentStreams = arrayRemove(currentStreams, streamName);
  localStreams = arrayRemove(localStreams, streamName);

  const seat = $('#seat-' + streamName);

  const player = OvenPlayer.getPlayerByContainerId('player-' + streamName);

  if (player) {
    player.remove();
  }

  const localPlayer = document.getElementById('local-player-' + streamName);

  if (localPlayer) {
    localPlayer.srcObject = null;
  }

  removeInputStream(streamName);

  // Completely remove the seat element from the grid
  seat.parent().remove();

  // Clean up local stream owners and viewers tracking
  delete streamOwners[streamName];
  delete streamViewers[streamName];
}

async function getStreams() {

  const promise = await $.ajax({
    method: 'get',
    url: '/getStreams',
  });

  return promise;
}

function gotStreams(resp) {

  if (resp.statusCode === 200) {

    const streams = resp.response;

    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
    //
    // // handled streams in OvenSpace. Local streams + Remote streams.
    // console.log('>>> currentStreams', currentStreams);
    //
    // // Local streams sending to OvenMediaEngine from user device.
    // console.log('>>> local  Streams', localStreams);
    //
    // // All streams created in OvenMediaEngine.
    // console.log('>>> ome    streams', streams);


    const missingLocalStreams = [];

    // Care ome stream creating is slow
    localStreams.forEach(streamName => {

      if (!streams.includes(streamName)) {
        missingLocalStreams.push(streamName);
      }
    });

    // console.log('>>> missingStreams', missingLocalStreams);

    missingLocalStreams.forEach(streamName => {
      streams.push(streamName);
    });

    streams.forEach((streamName, index) => {

      // Create player when new stream is detected
      if (!currentStreams.includes(streamName)) {

        // rtmp input stream detected
        if (shareMode === 'rtmp'
          && streamName === selectedInputStreamName) {

          waitingRtmpInputText.addClass('d-none');
          connectedRtmpInputText.removeClass('d-none');

          setTimeout(function () {

            inputDeviceModal.modal('hide');
          }, 4000)
        }

        // making peer connection with zero delay don't work well...
        setTimeout(function () {
          console.log('>>> createPlayer', streamName);
          createPlayer(streamName);
        }, 200 * index);
      }
    });

    currentStreams.forEach(streamName => {

      // Delete player when exising stream is removed
      if (!streams.includes(streamName) && !localStreams.includes(streamName)) {

        destroyPlayer(streamName);
      }
    });

    currentStreams = streams;

    videoUserCountSpan.text(currentStreams.length);
    updateMultiSelectButtonVisibility();
  }
}

function checkStream() {

  getStreams().then(gotStreams).catch(function (e) {
    console.error('Could not get streams from OME.');
  });
}

function startStreamCheckTimer() {

  checkStream();

  setInterval(() => {

    checkStream();
  }, 2500);
}

let socket = io({
  transports: ['websocket']
});

socket.on('user count', function (data) {
  totalUserCountSpan.text(data.user_count);
});

socket.on('user list', function (data) {
  updateUsersList(data.users);
});

// Track stream owners locally
let streamOwners = {};

socket.on('stream owner', function (data) {
  streamOwners[data.stream_name] = data.username;
  updateStreamerLabel(data.stream_name, data.username);
});

socket.on('all stream owners', function (data) {
  streamOwners = data;
  // Update all existing stream labels
  Object.keys(data).forEach(function(streamName) {
    updateStreamerLabel(streamName, data[streamName]);
  });
});

// Request stream owners and viewers when connected
socket.on('connect', function() {
  socket.emit('get stream owners');
  socket.emit('get all stream viewers');
});

// Track stream viewers locally
let streamViewers = {};

socket.on('stream viewers', function (data) {
  streamViewers[data.stream_name] = {
    viewers: data.viewers,
    count: data.count
  };
  updateViewerCount(data.stream_name, data.count, data.viewers);
});

socket.on('all stream viewers', function (data) {
  streamViewers = data;
  Object.keys(data).forEach(function(streamName) {
    updateViewerCount(streamName, data[streamName].count, data[streamName].viewers);
  });
});

function updateStreamerLabel(streamName, username) {
  const seat = $('#seat-' + streamName);
  if (seat.length > 0) {
    seat.parent().find('.streamer-name-header').text(username);
  }
}

function updateViewerCount(streamName, count, viewers) {
  const seat = $('#seat-' + streamName);
  if (seat.length > 0) {
    const streamHeader = seat.parent().find('.stream-header');
    streamHeader.find('.viewer-count').text(count);

    // Update viewer list content
    const viewerListContent = streamHeader.find('.viewer-list-content');
    viewerListContent.empty();

    if (viewers && viewers.length > 0) {
      viewers.forEach(function(viewer) {
        viewerListContent.append(
          '<div class="viewer-item"><i class="fas fa-user"></i>' + viewer + '</div>'
        );
      });
    } else {
      viewerListContent.append('<div class="no-viewers">No viewers</div>');
    }
  }
}

function toggleViewerList(seatCol) {
  const popup = seatCol.find('.viewer-list-popup');
  popup.toggleClass('d-none');
}

function updateUsersList(users) {
  const usersList = $('#users-list');
  usersList.empty();

  if (users.length === 0) {
    usersList.append('<div class="text-center text-muted">No users connected</div>');
    return;
  }

  users.forEach(function(username) {
    const userItem = $('<div class="list-group-item"></div>');
    userItem.html('<i class="fas fa-user me-2"></i>' + username);
    usersList.append(userItem);
  });
}

// Theatre Mode functionality
let currentTheatreMode = null;

// Multi-Theatre Mode functionality
let multiSelectMode = false;
let selectedStreams = [];
let currentMultiTheatreMode = false;

function enterTheatreMode(seatElement) {
  if (currentTheatreMode) {
    exitTheatreMode();
  }

  const seatCol = $(seatElement).parent();
  seatCol.addClass('theatre-mode');
  $('#theatre-backdrop').addClass('active');
  currentTheatreMode = seatCol;

  // Disable body scroll
  $('body').css('overflow', 'hidden');
}

function exitTheatreMode() {
  if (currentTheatreMode) {
    currentTheatreMode.removeClass('theatre-mode');
    $('#theatre-backdrop').removeClass('active');
    currentTheatreMode = null;

    // Re-enable body scroll
    $('body').css('overflow', '');
  }
}

function toggleTheatreMode(seatElement) {
  const seatCol = $(seatElement).parent();

  if (seatCol.hasClass('theatre-mode')) {
    exitTheatreMode();
  } else {
    enterTheatreMode(seatElement);
  }
}

// Don't render static seats anymore - seats will be created dynamically when streams appear

// Backdrop click handler to exit theatre mode
$('#theatre-backdrop').on('click', function() {
  exitTheatreMode();
});

// Close viewer popups when clicking outside
$(document).on('click', function(e) {
  if (!$(e.target).closest('.viewer-count-badge, .viewer-list-popup').length) {
    $('.viewer-list-popup').addClass('d-none');
  }
});

// Multi-Theatre Mode Functions
function toggleMultiSelectMode() {
  multiSelectMode = !multiSelectMode;

  if (multiSelectMode) {
    $('#multi-select-toggle').addClass('active');
    $('.multi-select-checkbox').addClass('visible');
    updateMultiTheaterButton();
  } else {
    $('#multi-select-toggle').removeClass('active');
    $('.multi-select-checkbox').removeClass('visible');
    $('.multi-select-checkbox input').prop('checked', false);
    selectedStreams = [];
    $('#enter-multi-theater').addClass('d-none');
  }
}

function updateMultiTheaterButton() {
  if (selectedStreams.length >= 2) {
    $('#enter-multi-theater').removeClass('d-none');
    $('#enter-multi-theater').find('span').remove();
    $('#enter-multi-theater').append('<span class="ms-1">(' + selectedStreams.length + ')</span>');
  } else {
    $('#enter-multi-theater').addClass('d-none');
  }
}

function getMultiTheaterLayout(count) {
  // Determine optimal grid layout based on stream count
  if (count === 2) {
    return { cols: 2, rows: 1 }; // 2x1 side-by-side
  } else if (count === 3) {
    return { cols: 3, rows: 1 }; // 3x1
  } else if (count === 4) {
    return { cols: 2, rows: 2 }; // 2x2 grid
  } else if (count <= 6) {
    return { cols: 3, rows: 2 }; // 3x2 grid
  } else if (count <= 9) {
    return { cols: 3, rows: 3 }; // 3x3 grid
  } else {
    return { cols: 4, rows: Math.ceil(count / 4) }; // 4xN grid
  }
}

function enterMultiTheatreMode() {
  if (currentMultiTheatreMode || selectedStreams.length < 2) {
    return;
  }

  // Exit single theater mode if active
  if (currentTheatreMode) {
    exitTheatreMode();
  }

  currentMultiTheatreMode = true;
  const layout = getMultiTheaterLayout(selectedStreams.length);
  const container = $('#multi-theatre-container');
  container.empty();

  // Calculate dimensions
  const cellWidth = 100 / layout.cols;
  const cellHeight = 100 / layout.rows;

  // Move selected seats into multi-theater container (not clone - we need the actual players!)
  selectedStreams.forEach((streamName) => {
    const originalSeat = $('#seat-' + streamName);
    const originalCol = originalSeat.parent();

    // Store original parent and index for restoration
    originalCol.data('multi-theatre-original-parent', originalCol.parent());
    originalCol.data('multi-theatre-original-index', originalCol.index());

    // Detach from original location
    originalCol.detach();

    // Style the seat for multi-theater grid
    // For single-row layouts, use auto height to allow vertical centering
    const gridStyles = {
      width: cellWidth + '%',
      maxWidth: 'none',
      position: 'relative',
      flex: 'none'
    };

    if (layout.rows === 1) {
      gridStyles.height = 'auto';
    } else {
      gridStyles.height = cellHeight + '%';
    }

    originalCol.css(gridStyles);

    // For single-row layouts, use auto height on the seat too
    const seatStyles = {
      width: '100%',
      margin: '0'
    };

    if (layout.rows === 1) {
      seatStyles.height = 'auto';
    } else {
      seatStyles.height = '100%';
    }

    originalSeat.css(seatStyles);

    // Hide checkboxes and single theater button in multi-theater mode
    originalCol.find('.multi-select-checkbox').hide();
    originalCol.find('.theatre-mode-button').hide();

    // Add marker class
    originalCol.addClass('multi-theatre-moved');

    container.append(originalCol);
  });

  // Show backdrop and container
  $('#multi-theatre-backdrop').addClass('active');
  container.addClass('active');

  // Disable body scroll
  $('body').css('overflow', 'hidden');

  // Exit multi-select mode
  multiSelectMode = false;
  $('#multi-select-toggle').removeClass('active');
  $('.multi-select-checkbox').removeClass('visible');
  $('#enter-multi-theater').addClass('d-none');
}

function exitMultiTheatreMode() {
  if (!currentMultiTheatreMode) {
    return;
  }

  currentMultiTheatreMode = false;

  // Move seats back to their original positions
  $('.multi-theatre-moved').each(function() {
    const col = $(this);
    const originalParent = col.data('multi-theatre-original-parent');
    const originalIndex = col.data('multi-theatre-original-index');

    // Remove multi-theater styling
    col.css({
      width: '',
      height: '',
      maxWidth: '',
      position: '',
      flex: ''
    });

    col.find('.seat').css({
      width: '',
      height: '',
      margin: ''
    });

    // Show checkboxes and theater button again
    col.find('.multi-select-checkbox').show();
    col.find('.theatre-mode-button').show();

    // Detach and reinsert at original position
    col.detach();
    col.removeClass('multi-theatre-moved');

    // Reinsert at the original index
    const siblings = originalParent.children();
    if (originalIndex >= siblings.length) {
      originalParent.append(col);
    } else {
      siblings.eq(originalIndex).before(col);
    }

    // Clean up data
    col.removeData('multi-theatre-original-parent');
    col.removeData('multi-theatre-original-index');
  });

  // Clear and hide container
  $('#multi-theatre-container').empty().removeClass('active');
  $('#multi-theatre-backdrop').removeClass('active');

  // Re-enable body scroll
  $('body').css('overflow', '');

  // Clear selections
  $('.multi-select-checkbox input').prop('checked', false);
  selectedStreams = [];
}

// Multi-select toggle button handler
$('#multi-select-toggle').on('click', function() {
  toggleMultiSelectMode();
});

// Multi-theater enter button handler
$('#enter-multi-theater').on('click', function() {
  enterMultiTheatreMode();
});

// Multi-theater backdrop click handler
$('#multi-theatre-backdrop').on('click', function() {
  exitMultiTheatreMode();
});

// Checkbox change handler (delegated for dynamic content)
$(document).on('change', '.multi-select-checkbox input', function() {
  const streamName = $(this).data('stream');

  if ($(this).is(':checked')) {
    if (!selectedStreams.includes(streamName)) {
      selectedStreams.push(streamName);
    }
  } else {
    selectedStreams = selectedStreams.filter(s => s !== streamName);
  }

  updateMultiTheaterButton();
});

// Update keyboard shortcuts
$(document).on('keydown', function(e) {
  // ESC key handler for both modes
  if (e.key === 'Escape') {
    if (currentMultiTheatreMode) {
      exitMultiTheatreMode();
    } else if (currentTheatreMode) {
      exitTheatreMode();
    }
  }

  // 'M' key to toggle multi-theater for selected streams
  if (e.key === 'm' || e.key === 'M') {
    if (!currentMultiTheatreMode && !currentTheatreMode) {
      if (selectedStreams.length >= 2) {
        enterMultiTheatreMode();
      } else if (!multiSelectMode) {
        toggleMultiSelectMode();
      }
    }
  }
});

// Show multi-select button when there are 2+ streams
function updateMultiSelectButtonVisibility() {
  if (currentStreams.length >= 2) {
    $('#multi-select-toggle').removeClass('d-none');
  } else {
    $('#multi-select-toggle').addClass('d-none');
  }
}

checkStream();

startStreamCheckTimer();