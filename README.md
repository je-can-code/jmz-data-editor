# JMZ Data Editor (OS-agnostic)

This editor contains multiple "boards" that provide a GUI for manipulating the configuration data for the various
plugins I have developed. 

## Currently supported plugins
Only some of the plugins I've authored are supported with this editor as this is a still fairly new project.

- Skill Proficiency System (complete)
- Crafting (complete)
- Questopedia (complete)
- Enemies (base params and extra drops from my plugin)

## Preamble
If you run into issues on linux about `libwebkit2gtk` missing or something, review
[**this comment on github**](https://github.com/bambulab/BambuStudio/issues/3973#issuecomment-2085476683) to get your
system up and running.

## Running the app
To run the app there are a couple steps involved.

1) Globally install `bun` (used as an `npm` alternative here):
> https://bun.sh/docs/installation

1) Install the packages:
```bash
cd /app
bun i
```

1) Navigate back to the root and run the app:
```bash
cd ..
bun start
```

1) Set the "project path" at the `/data` directory of your project where all the configuration files are
derived from, and that is it!

> Later, properly OS-agnostic publishing 

---

## Stopping Ollama (Linux/Kubuntu)
If you’re using local LLMs via Ollama and want to stop it from running, use one of the following depending on how it was started.

- If you launched a one-off chat or generation in a terminal (e.g., `ollama run ...`)
  - Press Ctrl+C in that terminal to stop the current generation and exit.

- Stop currently running model sessions via the Ollama CLI
  - List running sessions: `ollama ps`
  - Stop a session/model: `ollama stop <name>` (for example: `ollama stop qwen2.5-coder:7b`)

- If Ollama is running as a systemd service
  - User service (common on desktop installs):
    - Stop: `systemctl --user stop ollama`
    - Disable (so it won’t start on login): `systemctl --user disable ollama`
    - Status: `systemctl --user status ollama`
  - System service (requires sudo on some installs):
    - Stop: `sudo systemctl stop ollama`
    - Disable: `sudo systemctl disable ollama`
    - Status: `systemctl status ollama`

- If you run Ollama via Docker/Compose
  - Single container: `docker stop ollama` (or the container name you used)
  - Docker Compose: `docker compose down`

- Verify it’s no longer listening on the default port (11434)
  - `ss -lntp | grep 11434` (no output means nothing is listening on that port)

- Last‑resort kill (only if needed)
  - `pkill -x ollama` (or `killall ollama`)

Notes
- Stopping the service/server prevents background usage; your models remain downloaded. To reclaim disk space, remove models with `ollama rm <model>`.
- If you want to pause usage temporarily, stopping the service is sufficient. Re‑enable with `systemctl --user enable --now ollama` or `sudo systemctl enable --now ollama` depending on how it was installed.