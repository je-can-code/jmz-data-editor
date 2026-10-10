import type { ComponentType } from 'react';
import type { DocumentKey } from '../model/documentKeys.ts';
import type { PatchPath } from '../model/patches.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';
import type { CommandCatalogEntry } from './catalogTypes.ts';

/**
 * Where a command sits, as the list holding it knows: the document, the list's path in it (an event page's list on a
 * map, or a common event's), and every command before it in that list. An editor whose command depends on what came
 * before it, such as a move route that starts where earlier routes left its walker, reads it from here.
 */
type CommandWhereabouts = {
  readonly documentKey: DocumentKey;
  readonly listPath: PatchPath;
  readonly before: readonly RmmzEventCommand[];
};

/**
 * A whole block, handed to an editor that changes the block's structure rather than one command: Show Choices
 * adds, removes and renames branches, and Conditional Branch adds or removes its Else. {@code blockSpanAt}
 * finds the span: a conditional branch through its end, and a Show Choices list from the first of the
 * consecutive commands HIME_LargeChoices merges through the last one's end, wherever in it the row sits.
 */
type CommandBlockEdit = {
  /**
   * Every command of the block, from its first line through its end line.
   */
  readonly commands: readonly RmmzEventCommand[];

  /**
   * Replaces the whole block, as one change.
   */
  readonly onChange: (commands: readonly RmmzEventCommand[]) => void;
};

/**
 * What a command editor is handed: the command (with the lines continuing it), its entry, and a way to replace
 * them. It changes nothing itself; the list turns a change into a patch, so every edit lands in history.
 */
type CommandEditorProps = {
  readonly entry: CommandCatalogEntry;
  readonly command: RmmzEventCommand;
  readonly continuation: readonly RmmzEventCommand[];
  readonly onChange: (command: RmmzEventCommand, continuation: readonly RmmzEventCommand[]) => void;

  /**
   * The whole block, for the editors that change a block's structure; absent for every other command.
   */
  readonly block?: CommandBlockEdit;

  /**
   * Where the command sits, when a list is showing it; absent for an editor shown on its own.
   */
  readonly whereabouts?: CommandWhereabouts;
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
export type { CommandBlockEdit, CommandEditor, CommandEditorProps, CommandWhereabouts };
