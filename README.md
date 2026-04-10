# JMZ Data Editor

Desktop ([Neutralino](https://neutralino.js.org/)) and browser ([Vite](https://vitejs.dev/)) GUI for editing RPG Maker MZ `data/*.json` and plugin-specific JSON that backs several JMZ plugins. The stack is **React 19**, **MUI 7**, **React Router 7**, **TypeScript**, **Vitest**, and **Bun** (under `app/`).

## Boards and data

Each route is a **board** over JSON under your game’s `data/` folder (and related plugin files), loaded after you set `projectRoot` in `.config/config.yaml`. The **home** board is still minimal (placeholder).

| Board       | Path           | Focus |
|-------------|----------------|-------|
| Index       | `/`            | Entry / overview (work in progress) |
| Enemies     | `/enemies`     | Enemy database, traits, extra drops, JABS-oriented fields |
| Skills      | `/skills`      | Skills (usable-item sections, animations, notes), IconSet-backed icon picker, JABS extensions |
| States      | `/states`      | States database, core RMMZ fields, traits, plugin note sections (JABS, crit, drops, SDP, proficiency, etc.) |
| SDP         | `/sdp`         | Stat Distribution (SDP) plugin data |
| Quests      | `/quests`      | Questopedia-oriented quest and objective editing |
| Crafting    | `/crafting`    | Crafting plugin recipes and configuration |
| Proficiency | `/proficiency` | Skill Proficiency System conditionals |

Coverage and polish vary by board; unsupported engine or plugin fields should be treated as “not yet in the editor.”

## Features

- **Global search** — **Ctrl+F** toggles a bottom bar that searches across loaded enemies, items, skills, states, actors, classes, weapons, armors, quests (including objective rows resolved to target names), SDP entries, crafting recipes, and proficiency conditionals. Choosing a result navigates to the board path with a query string when that board exists; paths without a registered board fall through to the index.
- **URL selection** — On enemies, skills, states, SDP, and quests boards, the selected row can stay in sync with the URL (shareable/bookmarkable deep links via query parameters).
- **Project root** — Desktop builds read `.config/config.yaml` (see below). The app bar can reload project data after you change YAML or files on disk.
- **Save / reload** — Boards use consistent save and reload controls against the resolved project root.

## Architecture (for contributors)

- **Board registry** — `APP_ROUTES` in `app/src/platform/compositionRoot/routing.config.tsx` lists boards, paths, icons, and feature-flag ids.
- **Contexts** — Project path and per-resource providers (enemies, skills, states, items, quests, etc.) feed the UI and global search.
- **Layering** — Domain-style models, services, and presentation components; plugin note parsing where boards need structured edits beyond raw text.
- **CI** — GitHub Actions runs `bun run test` in `app/` on pull requests targeting `main` or `master` (`.github/workflows/test.yaml`).

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
   contains `data/` and `img/`. The legacy key `projectPath` is still accepted if `projectRoot` is not set.

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

## Tests and CI

From `app/`:

```bash
bun run test
bun run coverage
```

Pull requests against `main` or `master` run the same unit tests in GitHub Actions.

## License

Application sources under `app/` are licensed **LGPL-3.0-or-later** (see `app/package.json`). The small root `package.json`
Neutralino wrapper scripts use **MIT**.

## Roadmap

- Properly documented, OS-agnostic release and install story (binaries or installer), beyond “clone and `neu run`.”
- Dedicated editor boards (or deep links) for database types that global search already indexes but do not yet have a
  first-class route.

---
