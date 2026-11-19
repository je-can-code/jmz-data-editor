# Bundle and Play: plan

Written 2026-11-18. The goal: ship the editor as one self-contained desktop app with a **Play** button, so that
someone with no Bun, no Go and no dev server can edit an RMMZ project and playtest it on a current NW.js. The first
install is Jeremy's laptop, for a demo on **Saturday 2026-11-21**. A second user, on Linux or Windows, comes after.

Why a bundle at all: stock RMMZ's Test Play runs the NW.js that ships inside the RMMZ install (0.48.4, Chromium 85,
five-plus years old; read from the Steam install's `nwjs-win` on 2026-11-17), the built plugins need Chromium 110 or
newer (a 2026-11-17 scan found `.at()` at 92, `Object.hasOwn` at 93, `findLastIndex` at 97 and `toSpliced` at 110),
and newer NW.js versions are much faster. Swapping the runtime inside an RMMZ install does not stick, because an RMMZ update restores the old one. The editor already runs
on a current NW.js, so the editor becomes the place where a game is played as well as edited.

Two parts, in this order:

1. **Play** (section 1). Works on today's dev stack with no bundle at all, so it can land first.
2. **The bundle** (sections 2 to 4): build, boot, install.

Section 4 cuts the work into packages, section 5 is acceptance, section 6 lists Jeremy's decisions with a default for
each, and section 7 is later work. It all goes on one branch, as one PR.

Conventions in this doc: **(verified: file:line)** means read in the source on 2026-11-18. **(unverified)** means
reasoned or remembered, and has to be confirmed before relying on it. Follow the repo's conventions for style, tests and git;
nothing here repeats it.

---

## 0. The Saturday cut line

**Needed for Saturday:** all of section 1; the production API base (2.2); the API serving the UI (2.3); the bundle
build (2.1); bundle-mode boot with per-user config, a fixed port, a log file, an error window and exit-with-parent
(2.4); the top bar showing the API's project root (2.5); publish and the laptop installer (section 3); acceptance
milestones M1 to M4.

**Can trail Saturday:** the first-run folder picker and switching projects (2.6), remote updates, the Windows build,
delivering plugin builds into a project (section 7).

---

## Facts this plan rests on

| Fact | Source |
|---|---|
| The NW.js shell starts the dev stack with `spawn('bun', ['run','dev',...], { detached: true, stdio: 'inherit' })` | verified: `nw-app/main.js:383-397` |
| The shell's config lives at `<repo>/.config/jmz-data-editor.json` | verified: `nw-app/main.js:161` |
| Project root precedence: `--project-root`, then `JMZ_PROJECT_ROOT`, then the config file | verified: `nw-app/main.js:358-362` |
| The shell waits up to 10 s for the UI, then opens windows whether or not it answered | verified: `nw-app/main.js:411-420` |
| Shutdown kills the process group with `process.kill(-pid)`, which is POSIX-only | verified: `nw-app/main.js:132-154` |
| Pages talk to the shell over the `jmz-shell` BroadcastChannel through a hidden `shell.html` window | verified: `nw-app/main.js:266-316`, `app/public/shell.html` |
| Page requests are a closed union: `hello`, `open`, `clipboard-read`; the shell announces `shell-ready` | verified: `app/src/core/infrastructure/shell/WindowShell.ts:10-19` |
| `WindowShell.isRelayed` is true only when the NW.js shell answered | verified: `WindowShell.ts:186-189` |
| `serverEnvironment(apiBase, uiUrl)` derives `JMZ_API_ADDRESS` and `JMZ_UI_ORIGINS` | verified: `nw-app/shellRules.js:209-216` |
| The editor's NW manifest has `"chromium-args": "--disable-popup-blocking --use-angle=vulkan"` and `name` `jmz-data-editor-nw` | verified: `nw-app/package.json:2,6` |
| Dev starts the API with `go run ./cmd/api` (cwd `server`) and the UI with Vite on port 3000 | verified: `scripts/dev-full.ts:303-348` |
| The API only listens on `127.0.0.1` or `localhost`; it panics on bad config or a failed listen | verified: `server/cmd/api/main.go:45-56,92-105` |
| The API refuses an unknown `Host` (403) and any `Origin` not in `JMZ_UI_ORIGINS` (403); requests with no `Origin` are served | verified: `server/internal/middleware/cors.go:42-56` |
| The API resolves every path from `JMZ_PROJECT_ROOT`, read per request; no runtime dependence on its working directory | verified: `server/internal/api/request.go:65-73`, `health.go:18`, `file_changes.go:40` (`os.Getwd` appears only in the test helper `internal/gametest`) |
| Go module: `go 1.26.2`, dependencies `fsnotify` and `x/sys` only, so `CGO_ENABLED=0` builds and cross-compiles cleanly | verified: `server/go.mod` |
| `/api/health` returns `{ ok, projectRoot, projectRootOk }`. `projectRootOk` only says `JMZ_PROJECT_ROOT` is set; nothing checks that the folder exists | verified: `server/internal/api/health.go:16-33` (`rootOk := projectRoot != ""`, line 19) |
| A production UI build has no API base: `getJmzHttpApiBase()` returns `null` outside dev unless `VITE_JMZ_API_BASE` was set at build time, which lands on `BackendGate` | verified: `app/src/constants/jmzHttpApiBase.ts:5-17` |
| Vite builds two pages (`index.html`, `map.html`) into `app/build`; `public/` (`shell.html`, `popout.html`) is copied alongside | verified: `app/vite.config.ts` (`build.outDir`, `rolldownOptions.input`) |
| The UI keeps its own project root in `localStorage` (`rmmzProjectRoot`), defaulting to a stale `/run/media/je/exdrive/.../chef-adventure/` | verified: `project-path.context.tsx:9-27`, `PathConstants.ts:4` |
| That UI root is display-only for data: loads map a path to an API route by basename, and `/api/iconset` ignores the path; resource loads only check it is non-empty | verified: `jsonApiRoutes.ts:1-15`, `ImageService.ts:106-115`, e.g. `difficulty.context.tsx:52` |
| `localStorage` and all three BroadcastChannels (`jmz-shell`, `jmz-sync`, `jmz-file-changes`) are per-origin | verified: `MessageChannelLike.ts` (`CHANNEL_NAMES`); browser rule |
| Chef Adventure is launched today by `${NWJS_EXE:-nw} ./chef-adventure/ "test"` in the background, output discarded | verified: `ca/debug.sh:1` |
| RMMZ reads its `test` flag from **the first** app argument only: `nw.App.argv[0].split("&")` | verified: `ca/chef-adventure/js/rmmz_core.js:226-235` |
| Chef Adventure's manifest `name` is `rmmz-game`, RMMZ's default, so every RMMZ game shares one default NW.js profile | verified: `ca/chef-adventure/package.json` |
| A second NW.js launch on a profile already in use exits at once with code 0 (about 25 ms), printing "Opening in existing browser session", and the running instance gets an `nw.App` `open` event carrying the second command line. A separate `--user-data-dir` avoids it | verified 2026-11-18: a probe app launched twice on one `--user-data-dir`, off-screen under Xvfb |
| Under NW.js, `process.execPath` is the real `nw` binary, with the `~/.local/bin/nw` link resolved: `/mnt/exdrive/dev/utilities/nwjs/nw` | verified 2026-11-18, same probe |
| NW.js does **not** drop Chromium switches from `nw.App.argv`. Launched as `nw <app> test --user-data-dir=<dir> ...`, both `argv` and `fullArgv` read `[ 'test', '--user-data-dir=<dir>', ... ]`, so only putting `test` first gets it into RMMZ's `argv[0]` | verified 2026-11-18, same probe |
| `--user-data-dir=<dir>` moves the app's whole profile: `nw.App.dataPath` reads `<dir>/Default` | verified 2026-11-18, same probe |
| The desktop's `nw` is `~/.local/bin/nw` -> `/mnt/exdrive/dev/utilities/nwjs/nw`: **NW.js 0.118.0, Chrome 155.0.8059.40, SDK flavor** (ships `chromedriver`, `nwjc`). 565 MB unpacked. An older `nwjs-v0.110.1` sits beside it | verified: version strings in `lib/libnw.so`, `du` |
| Chef Adventure's game folder is 409 MB | verified: `du` |
| `bin/neutralino-*` and `dist/application*` are untracked, git-ignored leftovers; no tracked file mentions Neutralino. Not part of this work; leave them alone | verified: `.gitignore`, `git grep -i neutralino` |
| The laptop: glibc 2.44, Bun 1.3.14, **no Node**; it mounts the desktop's `/mnt/exdrive` as `/mnt/j-desktop` with `file_mode=0664`, so nothing on the share executes | noted 2026-11-06 while installing Zed builds. The laptop runs the same OS as the desktop (Jeremy, 2026-11-18), and both GPUs are AMD: a Radeon 890M there, an RX 6950 XT on the desktop |
| The precedent for laptop installs: `publish.js` packs builds into `/mnt/exdrive/dev/zed-builds/` with a `versions.json`; `laptop.js`, run by hand through `bun` from the share, tries each build before replacing anything and keeps the previous one | verified: `/mnt/exdrive/dev/zed/script/mods/README.md` ("The laptop") |

---

## 1. Play

A **Play** button that launches the open project as a playtest, exactly like `ca/debug.sh` does today, using the
NW.js the editor itself is running on. Under the dev stack that is the desktop's 0.118.0 SDK, the same runtime
`debug.sh` uses, so the result is identical.

### 1.1 The request

- Add `{ type: 'play'; replyTo: string }` to the `ShellRequest` union (`WindowShell.ts:10-13`).
- Add `play(): Promise<PlayResult>` to `WindowShell`. It opens a reply channel under a random name, the same way
  `#readThroughShell` does for the clipboard (`WindowShell.ts:248-270`), posts the request, and resolves with the
  shell's answer, or with `'unavailable'` at once when `isRelayed` is false.
- `PlayResult` is `'started' | 'already-running' | 'not-a-game' | 'failed' | 'unavailable'`.
- `play()` waits up to 5 s for the answer, on a constant of its own. The clipboard's `SHELL_READ_TIMEOUT_MS` is 2 s
  (verified: `WindowShell.ts:100`), shorter than the health check plus step 3's one-second watch in 1.2, so reusing
  it would report every launch as a timeout.
- Reply-channel names need their own fixed prefix and the same UUID pattern the clipboard uses, and the shell must
  refuse any other name (`shellRules.js:150`, `clipboardAnswer`).

### 1.2 The shell's handler

In `nw-app/main.js`, inside the relay's `onmessage` (`main.js:279-309`), handle `play`:

1. **Ask the API for the project root** (`GET {apiBase}/api/health`, `data.projectRoot`). The API is the source of
   truth for which project is open, and this works the same in dev, `--attach` and bundle modes. Under `--attach`
   the shell's own `projectRoot` is optional and need not match the API it attached to (`main.js:358-373`). The
   shell's `httpGet` reads only the status and discards the body (`main.js:90-105`), so this needs a small
   JSON-reading GET beside it; bundle-mode readiness (2.4) uses the same one.
2. **Check it is a game folder**: it holds `package.json` and `index.html`. If not, answer `not-a-game`.
3. **One playtest per project** (D1). If this shell already started one for that root and its process is alive, answer
   `already-running` and launch nothing. A playtest outlives the editor, so after an editor restart the shell has lost
   track of it. The per-project profile covers that case by itself: a launch onto a profile in use exits at once with
   code 0 and opens nothing (see the facts; it took 25 ms). So the handler watches each new process for one second.
   An exit with code 0 inside that window answers `already-running`, any other exit inside it answers `failed`, and a
   process still running when the window closes answers `started`.
4. **Spawn** `process.execPath` (the `nw` binary, verified) with the arguments
   `[ projectRoot, 'test', '--user-data-dir=<profile>' ]`:
   - `test` must come **immediately after the path**. RMMZ reads only the first app argument
     (`rmmz_core.js:231-232`), and NW.js leaves Chromium switches in `nw.App.argv` (verified), so a switch placed
     before `test` would take its place.
   - `<profile>` is a per-project folder: `<cache>/jmz-editor/playtest/<sha1 of the absolute project root>`, where
     `<cache>` is `$XDG_CACHE_HOME` or `~/.cache` on Linux. Without its own profile, Play would hand off to any copy of
     the game already open from `debug.sh` (same `rmmz-game` profile), and two projects would share one profile.
   - `detached: true`, `stdio: 'ignore'`, then `unref()`, so the game outlives the editor the way `debug.sh`'s does,
     and closing the editor never kills a playtest. The one-second watch in step 3 listens for `exit` without holding
     the game.
5. **Answer** with step 3's outcome on the reply channel, and log a `play` event with the arguments and the outcome
   (the shell already logs when `--log` is given). Log `process.execPath` in the `boot` event too, since the bundle
   runs a different copy of NW.js than the dev stack does.

### 1.3 The rules, kept testable

Following the existing split (`shellRules.js` holds decisions, `main.js` holds NW.js calls), add to `shellRules.js`
and cover in `app/test/nw-app/shellRules.test.ts`:

- `playArguments(projectRoot, profileDirectory)`: the argument array, `test` second.
- `playtestProfileDirectory(cacheRoot, projectRoot)`: deterministic per root, different for two roots.
- `isGameFolder(listing)`: true only with both `package.json` and `index.html`.
- `playReplyChannel(name)`: accepts only the new prefix plus a UUID.
- `playOutcome(exit)`: from how the new process ended inside the one-second window, or that it did not end:
  `already-running` for code 0, `failed` for any other code or a signal, `started` when it is still running.

`WindowShell.play()` gets its branches covered in `app/test/core/infrastructure/shell/WindowShell.test.ts`: not
relayed, relayed and answered, relayed and timed out, a reply on the wrong channel ignored.

### 1.4 The button

- **Visible only when `isRelayed`.** In a plain browser (`bun run dev:ui`) nothing can launch NW.js, so the button
  does not render.
- Placement (D3): the map editor's `WorkspaceBar`, beside Save
  (`app/src/mapEditor/workspace/WorkspaceChrome.tsx:175-201`). Whether the data editor's top bar
  (`app/src/components/topbar/ProjectPathAppBar.tsx`) gets a button too is reopened (D3); build that one only if D3
  settles that way.
- **Play runs what is on disk** (D2). If the map editor holds unsaved edits (`hub.dirtyKeys()`,
  `WorkspaceChrome.tsx:171`), it asks "Play without your unsaved changes?" before launching. Which other windows the
  check covers is reopened with D3 (D10): edits left unsaved in the data editor are not seen by the map editor. A data
  editor button would need its own count, since the data editor has no total: each resource context carries its own
  `hasUnsavedEdits` (`presentation/context/resources/factories/context.factory.tsx:26`), so it would need a small hook
  that reads every context `shell/app.providers.tsx` mounts. That hook waits with its button.
- Report the result in the map editor's notices (`NOTICE_DURATIONS`, `WorkspaceChrome.tsx`). Copy follows the repo's
  UI copy rules: for example, "Playing.", "Already running.", "This folder isn't a game."

---

## 2. The bundle

### 2.1 Build: `bun run bundle`

A new `scripts/bundle/build.ts` (Bun, like `dev-full.ts`), wired as `"bundle"` in the root `package.json`. Output
goes to a new `release/` folder (add it to `.gitignore`; do not reuse `dist/` or `bin/`, which hold the untracked
leftovers named above).

Steps:

1. **UI:** `cd app && bun run build`, with `VITE_JMZ_API_BASE` unset (see 2.2). Output: `app/build/`.
2. **API:** in `server/`, `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -X main.version=<v>" -o <out>/server/jmz-api ./cmd/api`.
   Add a `-version` flag to `cmd/api` that prints `main.version` and exits before any config is read (the installer
   uses it as a smoke test).
3. **Runtime:** copy NW.js into `<out>/nwjs/`. Source for Linux: the directory Chef Adventure already runs on,
   `/mnt/exdrive/dev/utilities/nwjs` (0.118.0 SDK), taken as a build input (`--nwjs <dir>`, defaulting to the
   directory behind `nw` on `PATH`). Check the version strings and refuse to bundle anything but the pinned version.
   The SDK flavor keeps DevTools for playtests. A Windows build needs a download from `dl.nwjs.io` with its SHA-256
   checked (section 7).
4. **Shell:** copy `nw-app/main.js` and `nw-app/shellRules.js` into `<out>/editor/`, and **generate**
   `<out>/editor/package.json` from `nw-app/package.json` with two changes:
   - `name: "jmz-editor"`, so the bundle gets its own NW.js profile and does not hand off to a dev shell
     (`jmz-data-editor-nw`) running at the same time. The hand-off itself is verified (see the facts); M3 checks that
     the two names keep the bundle and a dev shell apart.
   - `chromium-args` taken from a per-target setting. `--use-angle=vulkan` is tuned to the desktop and untested on
     the laptop: keep `--disable-popup-blocking`, and settle the ANGLE flag during the laptop dry run (M4).
5. **UI files:** copy `app/build/` to `<out>/ui/`.
6. **Manifest:** write `<out>/bundle.json`:
   `{ "version", "commit", "dirty", "builtAt", "nwjs": "0.118.0-sdk", "port": 47380 }`.
   `version` is `<UTC yyyymmdd.HHMM>-<short sha>`, plus `-dirty` when the tree has uncommitted changes.
7. **Launcher:** write `<out>/jmz-editor`, executable:
   `#!/bin/sh` / `HERE="$(dirname "$(readlink -f "$0")")"` / `exec "$HERE/nwjs/nw" "$HERE/editor" "$@"`.
   Launching by explicit path is deliberate. Whether a path argument overrides a `package.nw` beside the binary is
   **unverified**, so do not use the `package.nw` layout without testing it first.
8. **Pack:** `release/jmz-editor-linux-x64-<version>.tar.gz` with modes preserved, plus `release/versions.json`
   (`{ "linux-x64": { "version", "file", "sha256" } }`).
9. **Publish** (`bun run bundle --publish`): copy the tarball, `versions.json` **and the installer**
   (`scripts/bundle/install.ts`, section 3) into `/mnt/exdrive/dev/jmz-builds/`, the editor's sibling of
   `zed-builds`, which the laptop sees as `/mnt/j-desktop/dev/jmz-builds/`. The destination can be pointed at another
   folder (`--publish-dir <dir>`), so tests never write to the real one. Publish refuses to run while the installer is
   missing.

Layout:

```
jmz-editor-<version>/
  jmz-editor        launcher
  bundle.json       version, commit, default port
  nwjs/             NW.js 0.118.0 SDK, linux-x64
  editor/           main.js, shellRules.js, generated package.json
  server/jmz-api    the API, static, CGO off
  ui/               index.html, map.html, shell.html, popout.html, assets/
```

### 2.2 The UI's API base in production

`getJmzHttpApiBase()` (`jmzHttpApiBase.ts:5-17`): keep the explicit `VITE_JMZ_API_BASE` first and the dev default
second, and in a production build fall back to **the page's own origin**, because in the bundle the API serves the
page (2.3). Baking a URL in at build time would tie the port to the build. Cover the new branch beside the existing
ones.

With a production build always naming a base, `getJmzHttpApiBase()` returns `string`, and the null checks its callers
still make are dead: `main.tsx`, `BackendGate`'s "Backend not configured" screen, `ImageService`, `JabsPluginsReader`,
`EnemyPlacementsReader` and `browserEnvironment`. P4 removes them along with 2.5, which works in `BackendGate` too.

### 2.3 The API serves the UI

When `JMZ_UI_DIR` is set, `routes()` (`main.go:116+`) also serves that directory for `GET` requests that are not
`/api/...`:

- Behind the same `CORS` middleware. With `JMZ_UI_ORIGINS` set to the bundle's own origin, every request from the
  bundle's pages passes whether or not the browser sends `Origin`: a request without one is served, and one carrying
  the bundle's own origin is allowed (`cors.go:42-56`).
- `index.html` and the other `.html` files go out with `Cache-Control: no-cache`, so an update is never masked by a
  cached page. Hashed `assets/` files can be cached.
- A directory beside the binary rather than `go:embed`: `go:embed` needs the files at compile time inside the
  module, which would break plain `go run ./cmd/api` in dev.
- Tests beside `server/cmd/api/access_test.go`: served when set, 404 when unset, `Host` check still refuses, `/api`
  routes unchanged.

### 2.4 Bundle mode in the shell

`main.js` runs in **bundle mode** when `../bundle.json` exists relative to itself, and in dev mode (today's
behavior, unchanged) otherwise. Put the decisions in `shellRules.js` with tests.

| Concern | Dev mode (today) | Bundle mode |
|---|---|---|
| What starts | `bun run dev` (Go via `go run`, Vite) | `server/jmz-api` only |
| First window | the data editor (`/`), or the map editor (`/map.html`) with `--maps` (`shellRules.js:65-68`) | the map editor (`/map.html`), D3's default while D3 is open. One rule in `shellRules.js`, so settling D3 the other way is a one-line change. The data editor stays one click away through the bar's Data editor button (`WorkspaceChrome.tsx:199`) |
| Origin | UI on `:3000`, API on `:8080` | **one fixed loopback origin** for both, default `http://127.0.0.1:47380`, overridable as `port` in the config. Never an ephemeral port: `localStorage` and the channels are per-origin, so a new port would wipe them every launch. Never 3000 or 8080, so the bundle runs beside a dev stack |
| API environment | `serverEnvironment(apiBase, uiUrl)` | same function, with `apiBase` and `uiUrl` both the bundle origin, plus `JMZ_PROJECT_ROOT`, `JMZ_UI_DIR=<bundle>/ui` and `JMZ_EXIT_WITH_PARENT=1` |
| Config file | `<repo>/.config/jmz-data-editor.json` | per user, surviving updates: `$XDG_CONFIG_HOME/jmz-editor/config.json` (default `~/.config/jmz-editor/config.json`); `{ "projectRoot", "port" }` |
| Project root | flag, env, config | same precedence |
| Child output | `stdio: 'inherit'` | appended to `<state>/jmz-editor/api.log` (`$XDG_STATE_HOME` or `~/.local/state`); the shell's own `--log` defaults to `<state>/jmz-editor/shell.log` |
| Readiness | wait 10 s for the UI, then open anyway | before starting the API, check that the root exists and holds `data/System.json`, since `projectRootOk` only means the variable is set; then wait for `/api/health` with `ok` (read with the JSON GET from 1.2); on a bad root, a timeout or an exit, show the error window instead |
| Shutdown | kill the process group | `child.kill()` on the single child, which also works on Windows |

**Exit with the parent.** A crashed shell must not leave the API holding the port, or the next launch fails. Spawn
the API with `stdin: 'pipe'` and, when `JMZ_EXIT_WITH_PARENT=1`, have it read stdin in a goroutine and exit when
stdin closes. The pipe closes when the shell dies, however it dies, on Linux and Windows alike. Test it in Go. The
API exits as soon as stdin closes, so the shell must spawn it with `stdin: 'pipe'` and keep the pipe open for the life
of the app: with `'ignore'` it stops at once.

**Saves survive a sudden stop.** The exit on a closed stdin and the shell's `child.kill()` both end the API at once.
The data editor's saves go through `store.save` (`server/internal/store/json.go:69-76`), a plain `os.WriteFile`, so a
stop in the middle of one can leave a database file cut short. The map editor's saves already go through
`WriteFileAtomic` (`server/internal/store/atomic.go`): `save` moves onto it too, with a test that a failed write leaves
the old file whole.

**The error window.** Generalize `showMissingProjectRoot` (`main.js:321-338`) into one small window that states
what went wrong in plain words (no project chosen, port already in use, the API stopped) and names the log file.
There is no terminal in a desktop launch, so a `panic` or an inherited stdout is otherwise invisible.

### 2.5 The top bar shows the API's root

In a fresh origin the UI's root falls back to the stale `/run/media/...` default (`PathConstants.ts:4`), which the
top bar would show. Data still loads, since routes key on basename, but the display is wrong. Seed the UI's root
from `/api/health`'s `projectRoot` once the backend gate passes, so the bar always shows the folder actually being
edited. Keep in mind the resource contexts skip loading while the root is empty (`difficulty.context.tsx:52` and
siblings), so seeding must happen before or instead of clearing the default.

### 2.6 Choosing and switching projects (can trail Saturday)

- **First run:** when no root is configured, the error window offers a folder picker
  (`<input type="file" nwdirectory>`), checks the folder is an RMMZ project (`data/System.json` present), saves it to
  the config, and starts the API.
- **Switching:** a shell request (`choose-project`) opens the same picker. On a new root the shell stops the API,
  starts it on the new root, and reloads every open window, since each holds the old project's data. A window with
  unsaved edits gets its normal `beforeunload` prompt.

---

## 3. Install on the laptop

Modelled on the Zed builds' `laptop.js`.

- A new `scripts/bundle/install.ts`, which `--publish` copies into `jmz-builds/` beside the tarball. It is run **by
  hand on the laptop through `bun`, from the share**: `bun /mnt/j-desktop/dev/jmz-builds/install.ts`. It runs from
  the builds folder rather than from the repo because the desktop's checkout changes branch with PR work, so a
  script inside it can vanish; the copy beside the tarball always matches it. It finds `versions.json` and the
  tarball in its own folder, and uses Bun and Node built-ins only (nothing from the repo or `node_modules`).
- Reads `versions.json`. If that version is already installed, it says so and stops, so running it twice is harmless.
- Copies the tarball to a local temp folder, checks its SHA-256, and extracts it to
  `~/.local/jmz-editor/<version>/`. Modes come from the archive, so the share's `file_mode=0664` does not matter.
- **Tries the build before switching to it:** `server/jmz-api -version` must print the expected version, and `ldd`
  on `nwjs/nw`, `nwjs/lib/*.so` and `libvulkan.so.1` must report nothing `not found`. NW.js's libraries find each
  other only through `nw`'s `RPATH` (`$ORIGIN/lib/`): plain `ldd` on the desktop's working copy reports
  `libnw.so => not found` for `libnode.so` and `libffmpeg.so => not found` for `libnw.so`, so the check runs with
  `LD_LIBRARY_PATH=<bundle>/nwjs/lib` (verified 2026-11-18). On failure it names what is missing and changes nothing.
- Switches `~/.local/jmz-editor/current` to the new version, keeps the one it replaced as `previous`, and prunes older
  ones.
- Writes `~/.local/bin/jmz-editor` (a link to `current/jmz-editor`) and
  `~/.local/share/applications/jmz-editor.desktop` (`Exec` that link, `Terminal=false`, an icon from the bundle), so
  the editor opens from the app menu with no terminal.

**The demo itself needs a local game.** The share exists only at home, so before Saturday copy Chef Adventure's game
folder (409 MB) onto the laptop, for example `rsync -a /mnt/j-desktop/dev/gaming/ca/chef-adventure/ ~/games/chef-adventure/`,
and set `projectRoot` in `~/.config/jmz-editor/config.json` to it. Treat that copy as disposable: never sync it back
over the desktop's tree.

---

## 4. Packages and order

One branch, one PR, five packages. A package is done when its done-when holds, and a package that depends on another
starts once that one is done. Saturday's bundle builds straight from the branch (its version carries the commit), so
the demo never waits on the merge.

| Package | Covers | Starts | Shares files with |
|---|---|---|---|
| P1 Play | section 1 | first; **merged 2026-11-18** | P3: `nw-app/main.js`, `nw-app/shellRules.js` |
| P2 Server | 2.2; 2.3; the API's `-version` flag (2.1, step 2); exit-with-parent (2.4) | beside P1; **merged 2026-11-18** | nothing |
| P3 Bundle | the rest of 2.1, publish included; the rest of 2.4 except the atomic save | once P1's off-screen checks and P2 are done; **merged 2026-11-18** | P1 |
| P4 Install | section 3's `install.ts`; the atomic save in 2.4; 2.5; the dead null checks named in 2.2 | beside P3, built against the layout in 2.1; **merged 2026-11-18** | nothing |
| P5 Projects | 2.6 | after Saturday, unless there is time before | P3 |

**Off-screen** means an Xvfb display with `WAYLAND_DISPLAY` unset and no sound, run so it cannot touch an editor
already open on the desktop: from a checkout other than the main one (the shell rewrites
`<repo>/.config/jmz-data-editor.json` on every boot, `main.js:375-379`), on its own `--api-base` and `--ui-url` ports
(the open editor holds 8080 and 3000), and with its own `--user-data-dir` (a launch onto the open editor's profile
would hand off to it instead of starting). Setting `XDG_CACHE_HOME` for a run also moves Go's build cache, so a cold
`go run` can miss the dev runner's 5 s health wait: warm that cache with `go build` first. NW.js keeps a crash-report
folder under `~/.config/<manifest name>` even when given `--user-data-dir`, so every launch of the bundle and every
run of the installer uses a temp `HOME`; with `HOME` moved, pin `GOCACHE`, `GOMODCACHE` and `GOPATH` to the real ones
for anything that runs Go. Committed tests run on CI, which has no NW.js, no game folder and no `/mnt`: the stand-in
laptop and the acceptance checks are scripted runs, not test files.

**The test project** is a temp copy of Chef Adventure's folder, data and all, whose `package.json` points `main` at a
recording `main.js` that writes `nw.App.argv` and `nw.App.dataPath` to a file and stays open. The editor loads and
saves the copy like the real project, and Play launches the recorder instead of the game, which would open on the
desktop's screen with sound. No run touches the live folder, and the committed tests build their own made-up folders
rather than using the copy.

### P1 Play: done when

- In `app/`, `bun run typecheck` and `bun run test` pass, and `bun run lint` passes at the root. `shellRules.test.ts`
  covers the five rules in 1.3, and `WindowShell.test.ts` covers `play()`'s four branches.
- Off-screen, with the editor started by `bun run nw:dev` on the test project and Play clicked over the DevTools
  protocol: the first click records `test` first and the per-project profile, and reports "Playing."; the second
  reports "Already running."; quitting the editor leaves the recorder running; after an editor restart, Play still
  reports "Already running."; a copy with no `index.html` reports "This folder isn't a game."; an unsaved edit in
  the map editor brings up the prompt first. Pages are driven by a small script over the DevTools protocol: launch
  NW.js with `--remote-debugging-port` and its own `--user-data-dir`, read `/json/list`, and `Runtime.evaluate` in the
  page's target. A `new_instance` window under Xvfb is listed as an ordinary `page` target (verified 2026-11-18 by a
  probe that clicked a button and read the result back).
- Jeremy's half of M2 (section 5), any time before the review. P3 does not wait for it.

### P2 Server: done when

- `go test ./...` passes in `server/`, run locally, since CI runs only the app suite. New tests beside
  `server/cmd/api/access_test.go` cover the UI served when `JMZ_UI_DIR` is set and 404 when it is not, a path climbing
  out of the UI folder refused, the `Host` check still refusing, `.html` sent with `no-cache`, the `/api` routes
  unchanged, `-version` printing and exiting before any config is read, and the API exiting when its stdin closes
  under `JMZ_EXIT_WITH_PARENT=1`, and not without it.
- `app/` tests pass, with the new production branch of `getJmzHttpApiBase()` covered.
- M1 (section 5), off-screen.

### P3 Bundle: done when

- `bun run bundle` writes the tarball and `versions.json` under `release/` and refuses any NW.js but the pinned
  0.118.0 SDK. `--publish` refuses while `scripts/bundle/install.ts` is missing, and otherwise copies the tarball,
  `versions.json` and the installer into the publish folder. `release/` is in `.gitignore`. The whole chain, publish
  into a scratch folder and then install from it, runs once P3 and P4 are both merged.
- The bundle-mode rules are covered in `shellRules.test.ts`: which mode, the config and log paths from the XDG
  variables (`cacheDirectory` in `shellRules.js` already reads `XDG_CACHE_HOME` that way), the fixed origin, the first
  window, the root check and readiness.
- M3 (section 5), off-screen.

### P4 Install: done when

- In a stand-in laptop on the desktop (an empty `HOME`, and the builds folder copied with every execute bit off, the
  way the share mounts it): a first install switches `current` and writes the link and the `.desktop` file; a second
  run of the same version says so and changes nothing; a newer version keeps the old one as `previous` and prunes
  anything older; a tarball whose SHA-256 is wrong and a build with a library missing are each refused, naming the
  cause and changing nothing.
- `install.ts` uses Bun and Node built-ins only.
- The `.desktop` file's `Exec` is an absolute path, since the laptop's `PATH` lacks `~/.local/bin`.
- `store.save` writes through `WriteFileAtomic` (2.4), and `go test ./...` passes in `server/` with a test that a
  failed write leaves the old file whole. A data editor save is not reported back to the page as a change made
  outside the editor (a rename reaches the file watcher differently from a write in place).
- 2.5's seeding is covered where it lives, and a production build served by the API (as in M1), in a fresh profile,
  shows the API's project root in the top bar.
- The dead null checks named in 2.2 are gone, along with the tests that only covered them.
- The app menu entry uses the UI's `favicon.ico`, the only icon the repo has. Whether the menu wants a PNG instead is
  settled in M4.

### The review

One review over the whole branch once P1 to P4 are done, before anything reaches the laptop: process lifetimes (no
API left holding the port, no playtest killed by the editor), the static handler and the origin checks, the installer
never removing the version in use, and every config and log write. Known items for it:

- The static handler caches every file sitting directly in `assets/` for good, which suits Vite's hashed output, but a
  file copied there from `public/assets/` carries no hash and would be cached across an update.
- The installer prunes by age alone, so two installs without restarting the editor remove the build still running.
- The installer follows `versions.json`, so publishing an older build installs it and makes the newer one `previous`.
- With `getJmzHttpApiBase()` always naming a base, the map editor's no-server mode is reachable only from tests.
- The app menu entry is named "JMZ Editor"; the page title says "JMZ Data Editor".
- A playtest inherits a socket to the editor's crash reporter, so the editor's two `chrome_crashpad_handler`
  processes live on until the game exits.
- `config.json` sits in `~/.config/jmz-editor`, which is also the bundle's NW.js profile folder, so deleting the
  profile deletes the config.
- A `~` in `projectRoot` is not expanded.
- Untracked files mark a build `-dirty`, so a build from a checkout holding an untracked doc carries the label.
- Publish never removes old tarballs from the publish folder.

Then one more pass over the review's own fixes, and the findings go to Jeremy in one batch.

### The laptop

The laptop runs the same OS as the desktop and both GPUs are AMD, so nothing is checked there ahead of the bundle.
The installer's own `ldd` check (section 3) still runs at L1, and M4 settles the ANGLE flag on the laptop's screen.

- **L1, after the review:** publish from the branch, install over SSH with `install.ts`, copy the game folder, and
  write the config (section 3). A missing library named by `ldd` gets settled then.
- **L2, Jeremy, at home, before Saturday:** M4.
- **If M4 fails on Friday:** the game alone, played on the laptop from the bundle's NW.js and the copied game folder,
  keeps the playing half of the demo. The editor half waits for a fix.

### The calendar

The build started on the evening of 2026-11-18. The latest each step can land and still leave Friday for the laptop:

| Day | Steps |
|---|---|
| Wednesday 2026-11-18, evening | P1 beside P2, then P3 beside P4: all four merged. The chain checked on the merged branch: built, published into a scratch folder, installed into a stand-in laptop (twice, the second a no-op), then launched off-screen with no `bun`, `go` or `nw` on `PATH`: the API on the configured root, the map editor first, the data editor showing the project folder, the port freed on quit |
| Thursday 2026-11-19 | the review and its fixes |
| Friday 2026-11-20 | L1; L2 by the evening |
| Saturday 2026-11-21 | the demo |

---

## 5. Acceptance

M1 and M3 run off-screen (section 4). M2's real-game half and all of M4 need Jeremy.

- **M1, production UI against a compiled API.** `bun run build` in `app/`, `go build` the API, start it with
  `JMZ_UI_DIR=app/build`, `JMZ_API_ADDRESS=127.0.0.1:47380`, `JMZ_UI_ORIGINS=http://127.0.0.1:47380` and a temp copy
  of the project as its root, open `http://127.0.0.1:47380/` in headless Chromium: the backend gate passes, boards
  load and save, `/map.html` opens, IconSet icons render.
- **M2, Play on the dev stack.** The mechanics are proven off-screen on the test project (P1). Jeremy's half, on
  the real game: under `bun run nw:dev`, Play launches Chef Adventure in test mode, so F9 opens the debug screen on a
  map and F8 opens DevTools. Both only work when `test` arrived (`rmmz_scenes.js:1089-1091`,
  `rmmz_managers.js:2129-2133`), so they prove the argument order on the real game. A second click answers "Already
  running." Running `ca/debug.sh` first, then Play, gives two separate games (separate profiles).
- **M3, a clean machine on the desktop.** Off-screen, with `HOME` pointed at an empty temp folder and a `PATH` holding
  no `bun`, `go` or `nw`, and a dev stack running at the same time under `bun run nw:dev`, off-screen on its own ports
  and profile as section 4 describes (so the two NW.js apps run side by side): the bundle launches from its launcher,
  edits to the test project save, Play launches its recorder, and quitting leaves nothing listening on 47380. Kill the shell with `SIGKILL` and confirm the
  API exits with it. Start a second copy while one is open and confirm it hands off to the first. Occupy port 47380
  with something else and confirm the error window names the problem and the log.
- **M4, the laptop dry run, before Saturday.** Install through section 3, copy the game, launch from the app menu,
  edit, Play with a controller. Settle the ANGLE flag here. Then disconnect from the home network (no share) and run
  it all again, because that is what the demo looks like.

---

## 6. Decisions (Jeremy's), with defaults

D1 and D2 were settled on 2026-11-18. D3 was settled the same day, then reopened that evening together with D10. The
rest stand at their defaults until Jeremy changes one.

| # | Decision | Default |
|---|---|---|
| D1 | Play while that project's playtest is still running | **Settled:** answer "Already running." and launch nothing |
| D2 | Play with unsaved edits in the window | **Settled:** confirm first: "Play without your unsaved changes?" |
| D3 | Where the button lives | **Reopened:** Play only in the map editor, with the map editor as the main editor that the bundle opens on. Settled earlier as both the data editor's top bar and the map editor's toolbar. The map editor's button is built either way, and until D3 is settled the bundle opens on the map editor |
| D4 | A keyboard shortcut for Play | None for now |
| D5 | The bundle's port | 47380, overridable in the config |
| D6 | The bundle's NW.js | 0.118.0 SDK, the runtime Chef Adventure is tested on. Moving to a newer NW.js is its own decision |
| D7 | Publish folder | `/mnt/exdrive/dev/jmz-builds/` |
| D8 | Install folder on the laptop | `~/.local/jmz-editor/` with `current` and `previous` links |
| D9 | Updates for a second user away from the share | Open until after Saturday. The versioned folders and `versions.json` are the shape a download-based updater would read |
| D10 | Which unsaved edits the prompt sees | **Reopened with D3.** The window Play is clicked in, so with Play only in the map editor, edits left unsaved in the data editor are not seen. Alternative: every open window, asked over the shared channel before launching |

---

## 7. Later, not in this plan

- **Windows build:** the same steps with `GOOS=windows`, the win-x64 NW.js SDK downloaded from `dl.nwjs.io` with
  its SHA-256 checked, a `.cmd` launcher (or a tested `package.nw` layout), and the config under `%APPDATA%\jmz-editor`.
  Bundle mode already avoids the POSIX-only process-group kill, and exit-with-parent works there too.
- **Remote updates** for a second user: check `versions.json` from a hosted location on launch, download, verify, and
  switch the same way the installer does.
- **One release for editor and plugins:** the editor installing fresh plugin builds into the open project, since its
  output is the plugins' data contract.
- **Play from this map:** start the playtest on the map the map editor shows.
- **Saves from the data editor carry no client id.** They reach the file-change stream with `client: ""`, so a map
  editor holding `System.json` or `CommonEvents.json` takes a data editor save for a change made outside the editor.
  This predates the bundle.