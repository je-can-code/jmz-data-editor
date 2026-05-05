# Go API migration (post-Neutralino)

This document tracks the shift from a desktop filesystem bridge to a **local Go HTTP API** for disk I/O.

Neutralino has been removed. The React UI (`app/`) now reads/writes project files exclusively via HTTP to the Go API
(`server/`).

## Current state (today)

- **UI transport**: `HttpJsonStore` (`app/src/core/infrastructure/fs/http/HttpJsonStore.ts`)
- **Server contract**: `RestResponse[T]` envelope for GET/POST responses.
- **Project root**: Go server reads `JMZ_PROJECT_ROOT` (see `server/internal/api/request.go`).
- **Assets**
  - IconSet: `GET /api/iconset` (binary png).
  - plugins.js: `GET /api/plugin-metadata` (raw `application/javascript`).

## Remaining goals

### Phase 1: “Two processes” dev (UI + server)

Success = a predictable dev loop where:
- the server runs locally (localhost only),
- the UI runs via Vite,
- the UI has a good failure mode when the server isn’t running / env isn’t set.

Checklist:
- [ ] **Add a friendly “API unavailable” screen** instead of throwing from `main.tsx`.
  - Detect: `fetch` fails or returns 4xx/5xx (or a `/api/health` endpoint if we add one).
  - Message should mention:
    - start server command
    - `JMZ_PROJECT_ROOT` requirement
    - `VITE_JMZ_API_BASE` override (optional)
- [ ] **Add a `/api/health` endpoint** on the Go side (cheap + explicit).
- [ ] **Add a root script to run both processes** (optional but nice).
  - Example: `bun run dev:full` that starts the Go server + `bun run start` for the UI.
  - Keep it Bun-first (no npm/yarn).

### Phase 2: “One run” wrapper (NW.js)

Success = one command launches:
- Go API (child process)
- UI (desktop shell pointing at Vite dev URL or built assets)

Checklist:
- [ ] Decide dev story:
  - NW.js loads `http://127.0.0.1:3000` in dev
  - NW.js loads built `app/build/` in release
- [ ] Wrapper should set/forward `JMZ_PROJECT_ROOT` (or provide a picker UI that can restart the server).
- [ ] Add packaging/release instructions.

## Notes / conventions

- The UI still builds filesystem-style paths (ex: `${projectPath}/${filename}`) via `DataService`. The HTTP layer maps
  basenames to routes (`jsonApiRoutes.ts`).
- Server remains localhost-only; no auth is assumed.

# Neutralino → Go API migration

This document tracks deprecating **Neutralino.js** as the disk I/O bridge for **jmz-data-editor** and replacing it with a **local Go HTTP API**. The React app stays; only the transport to read/write project files changes.

## Goals

- **Phase 1:** Run the Go server and the Vite client **concurrently** (two processes) during development.
- **Phase 2 (ideal):** One “Run” experience (e.g. **NW.js** wrapper) that starts **Go + UI** together.
- **Scope:** Localhost only; no requirement to expose the API on the public internet.
- **End state:** **Full purge** of Neutralino — no dependency, no globals, no leftover code paths.
- **Project root (phase 1):** Prefer **`.env`** on the frontend (e.g. `VITE_*`) for project path instead of reading `.config/config.yaml` via Neutralino.

## Architecture summary

- Implement a **`JsonStore`** adapter that uses **`fetch`** against the Go API (**`GoHttpJsonStore`** or similar) and call **`setJsonStore(...)`** from `main.tsx` instead of **`NeutralinoJsonStore`**.
- **Not everything** goes through `JsonStore` today. These call **`@neutralinojs/lib` `filesystem` directly** and must be rewired (or removed):
  - **`readJmzEditorYamlConfig`** — `.config/config.yaml` bootstrap (optional if `.env` replaces it).
  - **`ImageService`** — **`IconSet.png`** via **`readBinaryFile`**.
  - **`JabsPluginsReader`** — **`js/plugins.js`** for JABS **`actionMapId`** (this is **jmz-data-editor**, not “only RMMZ’s editor”).
- **Recommendation:** Serve **IconSet** as **`GET`** binary from Go (`image/png`) with **`projectPath`** in query — simple and consistent with “one pipe.”

## Tests

- Keep **`MemoryJsonStore`** for unit tests that do not care about HTTP.
- Optionally add **`fetch` mocks** or a tiny integration harness for the HTTP store later — not mandatory on day one.

---

## Checklist

### A. Go API (parity with the app)

1. **Inventory parity with `DataService` + resource contexts**  
   Every **`DatabaseFilenames`** / **`ConfigFilenames`** file the UI loads or saves should have API coverage using the **same boring pattern** as skills (e.g. **`projectPath`** query + body = raw JSON), including **nullable slots** (`[]*T`) where **`null`** must round-trip like MZ.

2. **Map files**  
   **`Map###.json`** — same pattern; pass **`mapId`** or filename as agreed (query or path segment).

3. **Extra resources (if features stay)**  
   - **`GET`** text for **`js/plugins.js`** if **`JabsPluginsReader`** remains.  
   - **`GET`** binary for **IconSet** under the project (derive path the same way **`ImageService`** does today).  
   - **`.config/config.yaml`:** omit if bootstrapping uses **`.env`** only.

4. **Server hygiene (minimal)**  
   Bind **`127.0.0.1`**, add **CORS** for **`http://localhost:*`** (Vite dev ports), and tighten **path validation** (`..`, canonical project root) before relying on this beyond solo dev.

5. **Run book**  
   Document **port**, **`go run` / binary**, and “start API before UI” for phase 1.

### B. Client — HTTP `JsonStore`

6. Implement **`GoHttpJsonStore`** (name flexible) — **`readJson` / `writeJson`** via **`fetch`**, mapping **`(projectRoot, filename)`** to the Go URL contract (align with **`executeLoad` / `executeSave`** path layout).

7. **`main.tsx`** — **`setJsonStore(new GoHttpJsonStore(...))`**; **remove** Neutralino **`init`**, **`app`**, **`events`**, **`neuWindow`**, NL sessionStorage dev hacks, **`app.exit`** on window close (replace with nothing until NW phase).

8. **Environment** — **`.env` / `.env.example`**: e.g. **`VITE_JMZ_API_BASE`**, **`VITE_JMZ_PROJECT_ROOT`** (must match what you send as **`projectPath`** to the API).

### C. Non–`JsonStore` Neutralino call sites

9. **`readJmzEditorYamlConfig` / `ProjectPathProvider`** — drop YAML-on-disk bootstrap if **`.env`** owns initial root; seed **`projectRoot`** from env + optional **localStorage** behavior.

10. **`ImageService.loadIconSetPng`** — **`fetch`** Go icon endpoint → **`arrayBuffer`**.

11. **`JabsPluginsReader`** — **`fetch`** plugins text from Go **or** temporarily stub **`actionMapId`** until the route exists.

### D. Build tooling / artifacts

12. **`vite.config.ts`** — remove Neutralino plugin and **`__neutralino_globals`** injection.

13. **`app/index.html`** — remove Neutralino globals script tag.

14. **`app/package.json`** — remove **`@neutralinojs/lib`**.

15. Delete **`neutralino.config.json`** and Neutralino resource dirs if unused.

16. **`app/src/vite-env.d.ts`** — remove **`NL_*`** declarations.

17. **`.gitignore`** — remove Neutralino-only entries if obsolete.

### E. Docs & repo hygiene

18. **`README.md`** — phase 1 two-process workflow; **`.env.example`**; link **`server/`** Go module.

19. **`.junie/guidelines.md`** (or team guidelines) — stop calling the app “Neutralino-first.”

20. **Tests** — update or remove **`readJmzEditorYamlConfig`** tests if behavior is removed; keep **`MemoryJsonStore`** for **`DataService`** tests.

### F. Phase 2 — single action “Run”

21. **Launcher** — start Go, wait for **health** (or fixed port), then open **NW** (or dev browser) against **`localhost`**.

22. **NW package** — load built **`dist`** or dev URL; **no Neutralino**.

23. Optional: ship **Go binary + NW** in one directory / installer.

### G. Purge verification

24. **Grep** — `neutralino`, `@neutralinojs`, `NL_`, Neutralino **`filesystem`** imports — **zero** in source (history aside).

25. **Smoke test** — load project, edit representative boards, save, confirm **`data/*.json`** on disk; **IconSet** loads; JABS flow works or is consciously stubbed.

---

## Reference — Neutralino touchpoints (pre-migration)

| Area | Role |
|------|------|
| **`NeutralinoJsonStore`** | **`JsonStore`** via **`filesystem.readFile` / `writeFile`**. |
| **`main.tsx`** | **`setJsonStore`**, **`init`**, **`app.exit`**, **`events`**, **`neuWindow`**, NL dev auth. |
| **`readJmzEditorYamlConfig`** | **`.config/config.yaml`** + **`NL_PATH`**. |
| **`ImageService`** | **`readBinaryFile`** IconSet. |
| **`JabsPluginsReader`** | **`readFile`** **`js/plugins.js`**. |
| **Vite plugin + `index.html`** | **`__neutralino_globals.js`**. |

---

## Session note

Use this file as the single source of truth while migrating. **Answer questions and adjust the plan in chat**; only change this doc when the agreed approach shifts.
