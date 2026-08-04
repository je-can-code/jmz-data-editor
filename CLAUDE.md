# jmz-data-editor

A replacement front end for RPG Maker MZ's database editor, authored by **Jeremy** (JE). Beyond
covering the stock database, it exists to make the `note` field on RMMZ objects editable through real
GUI controls instead of hand-typed notetags.

It is a **React (Vite) app in TypeScript** with a **local Go HTTP API** handling disk I/O, packaged for
the desktop with NW.js.

Sibling repos: `rmmz-plugins` (the plugins this editor authors data for) and `ca` (Chef Adventure, the
game that consumes both). Anything this editor writes is parsed by a plugin over there — when the two
disagree about a data shape, **the editor's output is the contract**.

---

## Working with Jeremy

Be warm and personable, use emoji liberally in conversation, and explain what you did and why. Ask
before executing when something is ambiguous. **Never put emoji in code, comments, or commit messages.**

**When you have a concern about some other part of the codebase, go read it yourself** and explain why
you think it's a concern. Do not tell Jeremy to go look at a file.

Liberal use of comments in code is encouraged.

## CodeGraph

A CodeGraph MCP server is configured at user scope, so `codegraph_*` tools are available here. The
server ships its own usage instructions and they load automatically — follow those for tool selection
rather than looking for a second copy in this file.

**The one thing the server does not warn you about:** `codegraph sync` can report *"Already up to
date"* while the index is badly stale — that failure was observed in the sibling `rmmz-plugins` repo on
2026-07-30, where the index had silently missed six weeks of new files. If a lookup returns nothing for
a symbol you are confident exists, run `codegraph status`, compare its file count against a real
`find`, and run `codegraph index` — not `sync` — before trusting another answer.

## Stack and layout

| Path | What it is |
|---|---|
| `app/` | The React + TypeScript frontend (Vite) |
| `server/` | Go HTTP API for disk I/O — `cmd/` and `internal/`, see `go.mod` |
| `nw-app/` | NW.js desktop packaging |
| `scripts/` | Repo tooling, including `dev-full.ts` |

Inside `app/src`:

| Path | What it is |
|---|---|
| `core/` | `domain/`, `enums/`, `infrastructure/`, `types/` — the non-UI heart |
| `presentation/` | `boards/`, `components/`, `context/`, `hooks/`, `routing/`, `shell/`, `theme/` |
| `services/` | `DataService.ts`, `SystemService.ts`, `ImageService.ts`, plus `jabs/`, `parsers/`, `sdp/`, `utils/` |
| `mappers/` | `JsonMapper.ts`, `ParameterIdMapper.ts` |
| `components/`, `constants/`, `platform/`, `styles/`, `types/` | Shared surfaces |

**The app is organized into "boards"** — one per editor type, under `app/src/presentation/boards/`:
`armors`, `boss`, `classes`, `crafting`, `enemies`, `items`, `jabs`, `level`, `proficiency`, `quests`,
`sdp`, `skills`, `states`, `weapons`, plus `_index`.

Boards cover both stock RMMZ data and Jeremy's own plugin data — crafting recipes, SDP (stat
distribution panels), skill proficiency, quests, enemy parameter growth, enemy levels, boss encounters,
and extra enemy drop management.

**Adding a config-driven board touches five places**, and missing one fails quietly: a Go model under
`server/internal/models/plugins/`, its two routes in `server/cmd/api/main.go`, an entry in
`app/src/core/enums/ConfigFilenames.ts`, a `case` in `jsonApiRoutes.ts`, and a `BoardDefinition` in
`app/src/platform/compositionRoot/routing.config.tsx`. Most also want a resource context under
`presentation/context/resources/` mounted in `shell/app.providers.tsx`.

**Data flow:** read from the RMMZ project's `/data` directory (or Jeremy's custom data files), edit in
the UI, write back to the original files. A large share of that work is parsing and rewriting the `note`
field on RMMZ objects.

## Commands

```bash
bun run dev        # full stack via scripts/dev-full.ts
bun run dev:ui     # frontend only
bun run nw:dev     # NW.js desktop shell
bun run build      # tsc, then vite build
```

Inside `app/`: `bun run typecheck` (`tsc --noEmit`), `bun run test`, `bun run test:watch`,
`bun run coverage`.

**Bun is the package manager and the runtime.** Never `npm`, never `yarn`, never Python.

## Testing

**Tests live in `app/test/`, not beside the source.** That tree mirrors `app/src/` —
`test/services/parsers/`, `test/core/domain/valueObjects/`, `test/components/core/`, and so on. Looking
only inside `app/src` will find nothing and give you the wrong impression: there is an established
suite here covering services, parsers, mappers, enums, domain entities, value objects, and hooks, plus
several of the shared core components. **Match it. This repo is not greenfield.**

```bash
bun run test        # from app/; coverage is on by default
bun run test:watch
bun run coverage
```

Coverage is enabled inside `vitest.config.ts` itself, so even a single-file run prints the whole
coverage table and buries the result. Pass `--coverage.enabled=false` while iterating.

Conventions:

- A block comment above the top-level `describe` states the contract the module owes its callers, and
  why that contract matters. It is the most valuable part of the file — write it first.
- One `describe` per exported function; `it` names read as behavior.
- **Every test body carries inline `// Arrange` / `// Act` / `// Assert` comments.** This is Jeremy's
  convention in every repo he writes in, and it holds here regardless of what any older test file in
  this tree happens to look like. A test with nothing to arrange still gets the comment, with a line
  saying what the empty setup means.
- Assertions chain onto their own line — `expect(actual)` then `.toBe(expected);`.
- The default environment is `node`. A test needing the DOM opts in per file with a
  `@vitest-environment jsdom` docblock, then uses `@testing-library/react` and
  `@testing-library/jest-dom`.
- `test/setupTests.ts` is deliberately empty; there are no global hooks to inherit or work around.

**Boards are largely untested, and that is the pattern rather than a gap.** When logic worth testing
turns up inside a board — anything deciding what gets written to disk — extract it to a value object or
service and cover it there, rather than reaching for a component test.

---

## Code style

TypeScript throughout. **Preserve the ambient RMMZ-style `import X = Rmmz.*` usage** — it is
deliberate, not legacy.

- **Allman braces** — opening `{` on its own line for functions, classes, and every block, arrow
  functions included. `if` statements get braces on new lines even for single-line bodies.
- **Semicolons** always. **2-space indent.**
- **Single quotes** for strings and imports.
- **Trailing commas** on multiline objects and arrays.
- **Spacing:** around operators, after commas in parameter lists, inside array brackets
  (`const [ , traitName ] = match;`, not `[,traitName]`), and before opening braces.
- **`#` prefix for private** methods and properties.
- **Group named exports at the bottom of the file** rather than exporting inline at each declaration.
  This holds across ~107 of 127 source files; match it.

**Comments:** short imperative sentences ending in a period, on the line above the code.

**JSDoc:** a real description plus `@param` tags carrying types, even though TypeScript already types
the signature. The reference shape:

```typescript
/**
 * Joins a base project path and filename using a forward slash.
 * @param {string} projectPath The basepath to the location where the file should live.
 * @param {string} filename The filename itself, including the extension.
 * @returns {string} The combined path representing the target file.
 */
const joinPath = (projectPath: string, filename: string): string =>
{
  // build the destination filepath to write the data to.
  return `${projectPath}/${filename}`;
};

export { joinPath };
```

**UI:** MUI (Material-UI) throughout. State via React's `useState` and `useEffect`.

---

## Writing UI copy

Labels, helper text, and section blurbs are written **for authors and designers**, not for plugin or
runtime internals. The bar is the same as an in-game skill or state description: useful to somebody
balancing content, not to somebody reading source.

**Do:**

- Describe what the field *does*, plainly — "How long this state lasts on the map."
- Use game terms the author already knows — map, battler, expires, bonus, and frames when the field is
  genuinely frames.
- Keep section intros to one short sentence, when they are needed at all.
- Write status lines that report an **outcome** — "Does not expire on the map." / "Expires on the map
  ~60s."

**Do not:**

- Explain J-ABS, RMMZ, `removeByWalking`, `stepsToRemove`, or why the engine behaves as it does.
- Put notetag names in labels, checkboxes, or `helperText` — no `<stateDuration:N>`, no "writes …".
- Use developer-facing phrasing like **Runtime:** or **J-ABS reads**.
- Restate the accordion title in a subtitle that says the same thing again.

**The test:** if a sentence would feel wrong on a Final Fantasy ability screen, it does not belong in
this editor.

---

## Git and pull requests

- **Never push directly to `main`.** Feature branch and a PR, always.
- **Squash-merge every PR.** No merge commits, no rebase merges.
- Scope a work item to a single PR; do not propose phased splits without a hard blocker.
- **Never reference Claude, Cursor, AI, or any AI tool** in a commit message, PR body, code comment, or
  anywhere else in the repo. No `Co-Authored-By` trailers, no "Generated with" footers. Jeremy is the
  sole author and commits must read in his own voice.
- Use the `gh` CLI for GitHub operations. Write PR bodies to a temp file and pass `--body-file` rather
  than inlining a heredoc — bodies contain backticks and `$`, and the shell will happily mangle both.
- **Never modify code with regex, `sed`, or `perl`** — read the file, then edit it. Ask before any bulk
  mechanical pass.
