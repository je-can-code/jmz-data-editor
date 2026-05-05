# JMZ Data Editor

`jmz-data-editor` is a GUI editor for **RPG Maker MZ** database files and several **JMZ plugin** configuration files.
The frontend is a **React + MUI + Vite** app under `app/`. Disk I/O is handled by a small **Go HTTP API** under
`server/`.

This project is intended to replace or augment the stock MZ database editor with richer tooling for plugin-heavy
projects like **Chef Adventure**.

## What this app is

- A board-based editor over:
  - core RPG Maker MZ `data/*.json`
  - plugin config files such as `config.sdp.json`, `config.quest.json`, `config.crafting.json`, etc.
- A local-only tool:
  - the UI talks to a localhost Go server
  - the Go server reads and writes the selected game project on disk

## Requirements

- [Bun](https://bun.sh/docs/installation)
- Go toolchain
- An RPG Maker MZ project folder
- Optional: `nw` on PATH if you want the NW.js desktop wrapper

## Project root

The Go API reads and writes relative to `JMZ_PROJECT_ROOT`, which should point at the **game project root** containing
`data/`, `img/`, `js/`, etc.

Example:

```bash
export JMZ_PROJECT_ROOT="/absolute/path/to/your/game"
```

## Install

Frontend dependencies live under `app/`:

```bash
cd app
bun i
```

## Start the app

### Recommended: one command

From the repo root:

```bash
JMZ_PROJECT_ROOT="/absolute/path/to/your/game" bun run dev
```

What this does:
- starts the Go API
- waits for `GET /api/health`
- starts the Vite UI
- tears both down together on Ctrl+C

### UI-only (optional)

If you intentionally want to run the Vite UI by itself:

```bash
cd app
bun run start
```

This is mostly useful if you are already running the backend separately.

### Backend-only (optional)

If you want to run the Go API manually:

```bash
cd server
JMZ_PROJECT_ROOT="/absolute/path/to/your/game" go run ./cmd/api
```

The default API base is `http://127.0.0.1:8080`.

## Optional: run via NW.js

This repo includes a small **NW.js dev wrapper** that launches the same dev runner and opens the UI in an NW window.

Prerequisite:
- `nw` available on PATH

Run:

```bash
JMZ_PROJECT_ROOT="/absolute/path/to/your/game" bun run nw:dev
```

The NW wrapper persists local machine-specific settings in:

- `.config/jmz-data-editor.json`

Example:

```json
{
  "projectRoot": "/absolute/path/to/your/game",
  "apiBase": "http://127.0.0.1:8080"
}
```

Current precedence for choosing the project root is:

1. CLI `--project-root`
2. `JMZ_PROJECT_ROOT`
3. `.config/jmz-data-editor.json`

## Current support by board

Legend:
- ✅ **Supported**: first-class UI exists and is actively used.
- 🟡 **Partial**: some pieces exist, but expect gaps/rough edges.
- ❌ **Not yet**: planned or referenced elsewhere, but not implemented in a board UI.

### Index

Path: `/`

- ✅ Placeholder / landing board

### Enemies

Path: `/enemies`

Core MZ support:
- ✅ enemy database rows
- ✅ base parameters
- ✅ traits

Plugin-oriented support:
- **JABS**
  - ✅ battler data
  - ✅ AI traits
  - ✅ team assignment
  - 🟡 config/note-driven fields (varies by section)
- **Drops / loot tooling**
  - ✅ extra drops
- **SDP**
  - ✅ enemy SDP drop support
- **Natural growth / level scaling**
  - ✅ parameter growth tooling
- **Passive ABS**
  - 🟡 passive enemy note parsing/editing

### Skills

Path: `/skills`

Core MZ support:
- ✅ skill list and selection
- ✅ core fields
- ✅ animation selection
- ✅ icon selection from `IconSet.png`
- 🟡 usable item sections and note editing (coverage varies by section)

Plugin-oriented support:
- **JABS**
  - ✅ JABS extension panel
  - ✅ extend/base relationships
  - 🟡 note-backed JABS metadata (varies by field)
- **SKS / skill note tooling**
  - 🟡 supported parser/editor sections where implemented

### States

Path: `/states`

Core MZ support:
- ✅ state list and selection
- ✅ core state fields
- ✅ traits

Plugin-oriented support:
- **JABS**
  - 🟡 plugin note sections
- **Crit / combat note extensions**
  - 🟡 supported parser/editor sections
- **Drops**
  - 🟡 state-related note sections where available
- **SDP**
  - 🟡 state plugin note sections
- **Proficiency**
  - 🟡 state plugin note sections
- 🟡 additional note-backed plugin fields gathered in the state plugin sections panel

### SDP

Path: `/sdp`

Plugin support:
- **Stat Distribution Panels**
  - ✅ panel list
  - ✅ panel configuration
  - ✅ rank-up parts / rewards / costs
  - 🟡 related note/config editing exposed by the board

### Quests

Path: `/quests`

Plugin support:
- **Questopedia**
  - ✅ quest list and metadata
  - ✅ categories
  - ✅ tags
  - ✅ objectives
  - ✅ objective fulfillment data
  - ✅ objective log data

### Crafting

Path: `/crafting`

Plugin support:
- **Crafting**
  - ✅ recipe list
  - ✅ recipe ingredients/components
  - 🟡 crafting configuration exposed by the board

### Proficiency

Path: `/proficiency`

Plugin support:
- **Skill Proficiency System**
  - ✅ conditionals
  - ✅ actor applicability
  - ✅ skill rewards
  - ✅ requirements
  - ✅ requirement-secondary-skill relationships

### JABS

Path: `/jabs`

Plugin support:
- **JABS Teams**
  - ✅ team list
  - ✅ team metadata
  - ✅ opposition relationships

## Features

- **Global search**
  - `Ctrl+F` opens a bottom search bar
  - searches across loaded enemies, items, skills, states, actors, classes, weapons, armors, quests, SDP entries,
    crafting recipes, and proficiency conditionals
- **Deep-linkable selection**
  - enemies, skills, states, SDP, and quests support URL-synced selection
- **Consistent save / reload**
  - boards expose save/reload flows against the active project
- **Backend readiness guard**
  - the UI checks `GET /api/health` and shows a friendly gate when the backend is unreachable or missing
    `JMZ_PROJECT_ROOT`
- **Desktop wrapper option**
  - NW.js wrapper can launch the local dev stack and open a desktop window

## Architecture notes

- Route registry: `app/src/platform/compositionRoot/routing.config.tsx`
- App shell / board host: `app/src/presentation/shell/`
- Resource providers and project path context: `app/src/presentation/context/`
- Shared data access: `app/src/services/` and `app/src/core/infrastructure/fs/http/`
- Go API entrypoint: `server/cmd/api/main.go`

## Testing

Frontend:

```bash
cd app
bun run test
bun run coverage
```

Backend:

```bash
cd server
go test ./...
```

## License

This repository is currently marked **MIT** in the root `package.json`.

## Roadmap

- Flesh out unsupported database areas and plugin note sections
- Improve the NW.js flow from “dev wrapper” into a fuller desktop experience
- Continue tightening docs around release/distribution workflow
