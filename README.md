# JMZ Data Editor

Desktop (Neutralino) and browser (Vite) GUI for editing game data that backs several of my RPG Maker MZ plugins. The
long-term goal is a setup that works cleanly on multiple OSes; today, follow the prerequisites below for your platform.

## Boards and data

Each route is a “board” over JSON under your game’s `data/` folder (loaded via `projectRoot` in `.config/config.yaml`).

| Board       | Path           | Focus                                                          |
|-------------|----------------|----------------------------------------------------------------|
| Index       | `/`            | Entry / overview                                               |
| Enemies     | `/enemies`     | Enemy database, extra drops, JABS-related fields               |
| Skills      | `/skills`      | Skills (including usable item–style sections where applicable) |
| SDP         | `/sdp`         | Stat Distribution (SDP) plugin data                            |
| Quests      | `/quests`      | Questopedia-oriented quest data                                |
| Crafting    | `/crafting`    | Crafting plugin configuration                                  |
| Proficiency | `/proficiency` | Skill Proficiency System                                       |

Coverage and polish vary by board; treat unsupported fields as “not yet in the editor.”

## Preamble

On Linux, if webkit/GTK libraries are missing, see
[this GitHub comment](https://github.com/bambulab/BambuStudio/issues/3973#issuecomment-2085476683) for environment
hints.

## Point the editor at your RPG Maker MZ project

The **Neutralino** build reads `projectRoot` from **YAML** at **`.config/config.yaml`** (not JSON). Paths are resolved
from
the Neutralino application root—for this repository, that is normally the **repository root** (same directory as
`neutralino.config.json`). If your tool runs with `NL_PATH` ending in `app`, `build`, or `dist`, the reader also checks
the parent directory for `.config/config.yaml`.

1. From the repository root:

   ```bash
   mkdir -p .config
   cp config.example.yaml .config/config.yaml
   ```

2. Edit `.config/config.yaml` and set `projectRoot` to the **absolute path** of your game folder—the directory that
   contains `data/` and `img/`.

3. Restart the desktop app, or use **Reload project** in the top bar so YAML is re-read and providers refresh.

The `.config/` directory is gitignored so local paths are not committed.

In **Vite / browser dev** (`bun run dev` inside `app/`), that file is **not** loaded; the UI may still mention
`.config/config.yaml` for when you use the desktop build.

## Prerequisites

- [Bun](https://bun.sh/docs/installation) (package install and scripts under `app/`)
- For the **desktop** shell: [Neutralino CLI](https://neutralino.js.org/docs/getting-started/installation) (`neu`),
  aligned with the versions expected by this repo’s `neutralino.config.json`

## Install dependencies

```bash
cd app
bun i
```

## Build the web bundle (required for Neutralino)

`neutralino.config.json` serves the app from `app/build/` (Vite output). After dependency changes or fresh clone:

```bash
cd app
bun run build
```

## Run the desktop app

From the **repository root** (parent of `app/`):

```bash
neu run
```

Options such as `--window-enable-inspector` are supported by Neutralino; see their CLI docs.

This repository’s root `package.json` may define `bun start` / `bun dev` as a **machine-specific** wrapper (for example
Distrobox). If you do not use that environment, run `neu run` directly as above.

Ensure `.config/config.yaml` exists and `projectRoot` points at your game before relying on file-backed data.

## Run the web UI (development)

Useful for UI work without Neutralino; **filesystem YAML and native APIs are not available** in this mode.

```bash
cd app
bun run dev
```

Then open the URL Vite prints (default `http://localhost:3000` per Neutralino `devUrl` in config).

## Tests

From `app/`:

```bash
bun run test
bun run coverage
```

## Roadmap

- Properly documented, OS-agnostic release and install story (binaries or installer), beyond “clone and `neu run`.”

---
