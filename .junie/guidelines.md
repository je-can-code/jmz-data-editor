# Project Guidelines

* This codebase is a neutralinojs app, using react as a front end.
* The purpose of the app is to act as a replacement front end for RPG Maker MZ's database editor.
  * Additionally, to grant ease of manipulation of various notes on objects throughout the database with GUI elements.
* All code responses should use the same coding style and formatting as exists across the codebase.

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
* The application is organized into "boards" that represent different editors for RPG Maker MZ data or my personal plugin data
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