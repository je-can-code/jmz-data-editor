import type { ComponentType } from 'react';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import type { CommandCatalogEntry } from './catalogTypes.ts';

/**
 * What a command editor is handed: the command (with the lines continuing it), its entry, and a way to replace
 * them. It changes nothing itself; the list turns a change into a patch, so every edit lands in history.
 */
type CommandEditorProps = {
  readonly entry: CommandCatalogEntry;
  readonly command: RmmzEventCommand;
  readonly continuation: readonly RmmzEventCommand[];
  readonly onChange: (command: RmmzEventCommand, continuation: readonly RmmzEventCommand[]) => void;
};

/**
 * An editor for one kind of command.
 */
type CommandEditor = ComponentType<CommandEditorProps>;

/**
 * Where the hand-built editors plug in (Show Text, Show Choices, Conditional Branch, Control Variables, Set
 * Movement Route, Transfer Player, Plugin Command, Script). Every other entry gets the form its fields generate,
 * so an entry without a registered editor is never a gap.
 *
 * An editor can be registered for one entry, or for every entry of a code (the plugin command editor serves
 * every plugin command, all of which share code 357); the entry's own registration wins.
 */
class CommandEditorRegistry<TEditor = CommandEditor>
{
  #byEntry = new Map<string, TEditor>();

  #byCode = new Map<number, TEditor>();

  /**
   * Registers an editor for one entry.
   * @param {string} entryId The entry id.
   * @param {TEditor} editor The editor.
   */
  registerForEntry(entryId: string, editor: TEditor): void
  {
    if (this.#byEntry.has(entryId))
    {
      throw new Error(`${entryId} already has an editor`);
    }

    this.#byEntry.set(entryId, editor);
  }

  /**
   * Registers an editor for every entry of a code.
   * @param {number} code The command code.
   * @param {TEditor} editor The editor.
   */
  registerForCode(code: number, editor: TEditor): void
  {
    if (this.#byCode.has(code))
    {
      throw new Error(`code ${code} already has an editor`);
    }

    this.#byCode.set(code, editor);
  }

  /**
   * Finds the hand-built editor for an entry.
   * @param {CommandCatalogEntry} entry The entry.
   * @returns {TEditor | null} The editor, or null when the entry uses its generated form.
   */
  editorFor(entry: CommandCatalogEntry): TEditor | null
  {
    return this.#byEntry.get(entry.id) ?? this.#byCode.get(entry.code) ?? null;
  }
}

export { CommandEditorRegistry };
export type { CommandEditor, CommandEditorProps };
