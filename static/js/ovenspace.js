let currentStreams = [];
let localStreams = [];
let selectedInputStreamName = null;
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

const rtmpInputUrlInput = $('#rtmp-input-url-input');
const rtmpInputStreamkeyInput = $('#rtmp-input-streamkey-input');
const srtInputUrlInput = $('#srt-input-url-input');
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

  // Use the username as the stream name
  selectedInputStreamName = CURRENT_USERNAME;

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

    rtmpInputUrlInput.val(OME_RTMP_INPUT_URL);
    rtmpInputStreamkeyInput.val(selectedInputStreamName);

    srtInputUrlInput.val(OME_SRT_INPUT_URL + encodeURIComponent(selectedInputStreamName));

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
    autoStart: true,
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

// ESC key handler to exit theatre mode
$(document).on('keydown', function(e) {
  if (e.key === 'Escape' && currentTheatreMode) {
    exitTheatreMode();
  }
});

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

checkStream();

startStreamCheckTimer();