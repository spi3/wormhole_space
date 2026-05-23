# Repository Guidelines

## Project Structure & Module Organization
`OvenSpace.py` is the Flask and Socket.IO entrypoint; it loads `ovenspace.cfg` or the path in `OVENSPACE_CONFIG`. Keep backend helpers in `components/` (`components/user.py` is the current pattern). Jinja templates live in `templates/`, with shared partials prefixed by `_` such as `templates/_site_topbar.html`. Frontend assets are split under `static/css`, `static/js`, and `static/img`. Branding and documentation images belong in `assets/`. Container and deployment files are rooted at `Dockerfile`, `docker-compose.yml`, `run.sh`, and `ovespace.service`.

## Build, Test, and Development Commands
Create a Python 3.9 virtualenv and install dependencies with `python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`. Run the local dev server with `python OvenSpace.py`; it expects `ovenspace.cfg` in the working directory unless `OVENSPACE_CONFIG` overrides it. Use `gunicorn --bind 0.0.0.0:5000 --worker-class eventlet -w 1 --threads 1 OvenSpace:app` or `./run.sh` for a production-like app server. Use `docker compose up --build` to start the app plus OvenMediaEngine locally. `make server` starts a standalone OvenMediaEngine container using `Server.xml`.

## Coding Style & Naming Conventions
Follow the existing Python style: 4-space indentation, snake_case for functions and variables, and UPPER_SNAKE_CASE for config-derived constants such as `OME_API_HOST`. Keep Flask routes and Socket.IO handlers in `OvenSpace.py` unless a change justifies extracting a module. Template filenames should stay descriptive and partials should keep the leading underscore convention. No formatter config is checked in, so match surrounding code closely and keep imports grouped and unused code removed.

## Testing Guidelines
There is no automated test suite in this repository today. For backend changes, at minimum verify `python OvenSpace.py` starts cleanly, `/` and `/stream` render, and `/getStreams` returns successfully with and without a reachable OME backend. For streaming or config changes, smoke-test `docker compose up --build` and confirm environment overrides such as `OME_API_HOST`, `OME_CLIENT_HOST`, and `SITE_HOST` behave as expected.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes: `feat:`, `fix:`, `refactor:`, and `chore:`. Keep commit subjects imperative and scoped to one change. Pull requests should explain the user-facing effect, note config or deployment impacts, link related issues, and include screenshots for template or CSS updates. If a PR changes runtime configuration, document the required `ovenspace.cfg` or environment variable updates in the description.

## Security & Configuration Tips
Do not commit real API tokens or environment-specific hostnames. Treat `ovenspace.cfg` as local/deployment configuration and prefer environment overrides for secrets and host routing.
