# Project Guidelines

* **NEVER** use terminal commands like `cat`, `sed`, `grep`, `awk`, `head`, or `tail` to read or search file contents.
* To read or examine file contents, you **MUST** use the provided internal tools (like `open`, `open_entire_file`,
  `get_file_structure`, or `search_project`) to bring the file data directly into your context.
* You should NEVER write to the filesystem, ever. I will choose what files to add and what to add to them.
* Prefer your own internal tools over various terminal commands for parsing/searching code (ex: open_file instead of
  cat).
* This codebase is a React (Vite) app with a local Go HTTP API backend for disk I/O.
* The purpose of the app is to act as a replacement front end for RPG Maker MZ's database editor.
  * Additionally, to grant ease of manipulation of various notes on objects throughout the database with GUI elements.
* All code responses should use the same coding style and formatting as exists across the codebase.
* Liberal use of comments is encouraged.
* Liberal use of emoji in your responses is encouraged.
* When raising concerns about something, instead of directing me to look into another file, just look yourself instead
  and explain why you think it's a concern.

## Development Environment

* The project uses Bun as the package manager and runtime environment instead of npm/Node.js
* Vite is used as the build tool for the React frontend
* TypeScript is used throughout the codebase

## Project Structure

* `/app` - Contains the React frontend application
* `/app/src` - Source code for the React application
  * `/boards` - Contains the different database editor boards (enemies, crafting, etc.)
  * `/components` - Reusable React components
  * `/enums` - TypeScript enums used throughout the application
  * `/services` - Services for data handling and other operations
  * `/types` - TypeScript type definitions

## Architecture & Patterns

* The application is organized into "boards" that represent different editors for RPG Maker MZ data or my personal
  plugin data
* MUI (Material-UI) is used extensively for UI components
* State management is done primarily with React's useState and useEffect hooks
* The app uses a pattern of parsing and modifying "notes" fields from RPG Maker objects

## Data Flow

* The app reads data from RPG Maker MZ's or my custom data files located in the user's project `/data` directory
* Changes are made in the UI and then saved back to the original data files
* Many operations involve parsing and modifying the "note" field of RPG Maker objects

## RPG Maker MZ Integration

* More details about how the app interacts with RPG Maker MZ data structures
* This supports a few of my own custom plugins:
  * crafting recipe management
  * SDPs (stat distribution panels) management
  * skill proficiency management
  * quest management
  * parameter growth management (in the context of enemies)
  * levels for enemies
  * extra enemy drop management

## Code Formatting Style

* **Braces placement**:
  * Opening braces `{` should always be on a new line if syntactically possible
  * Closing braces `}` are on their own line
  * Example:
    ```typescript
    function example()
    {
      // code here
    }
    ```
  * Arrow functions follow the same pattern:
    ```typescript
    lines.forEach(line =>
    {
      // code here
    });
    ```

* **Spacing**:
  * Spaces around operators: `const [ , traitName ] = match;` (not `[,traitName]`)
  * Spaces after commas in parameter lists
  * Spaces inside array brackets: `[ , traitName ]` not `[, traitName]`
  * Spaces before opening braces

* **Method structure**:
  * Static methods with clear documentation
  * Private methods/properties with `#` prefix

* **Conditional blocks**:
  * `if` statements have braces on new lines even for single-line blocks
  * Example:
    ```typescript
    if (condition)
    {
      doSomething();
    }
    ```

JMZ Style Capsule

- Braces: Allman (opening brace on its own line) for functions, classes, and blocks.
- Semicolons: required.
- Quotes: prefer double quotes for strings and imports.
- Trailing commas: keep on multiline objects/arrays.
- Inline comments: short imperative sentence, end with a period.
- JSDoc: include a short description and @param tags for function inputs; include types in the JSDoc tags.
- Exports: group named exports at the bottom of the file.
- Types: preserve ambient RMMZ style `import X = Rmmz.*` usage.

an example of a documented and well-written function:

```ts
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
