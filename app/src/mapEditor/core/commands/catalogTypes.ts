import type { JsonValue } from '../model/json.ts';
import type { RmmzEventCommand } from '../model/rmmzTypes.ts';

/**
 * What kind of input a field is, which decides the control its generated form shows and how its value reads in
 * a sentence. Database kinds ({@code actor}, {@code item} and the rest) hold an id and read as a name.
 */
type CommandFieldKind =
  | 'number'
  | 'text'
  | 'multiline'
  | 'boolean'
  | 'select'
  | 'switch'
  | 'variable'
  | 'self-switch'
  | 'actor'
  | 'class'
  | 'skill'
  | 'item'
  | 'weapon'
  | 'armor'
  | 'enemy'
  | 'troop'
  | 'state'
  | 'animation'
  | 'tileset'
  | 'common-event'
  | 'map'
  | 'map-point'
  | 'event'
  | 'audio'
  | 'image'
  | 'face'
  | 'character'
  | 'file'
  | 'color'
  | 'struct'
  | 'list'
  | 'json';

/**
 * Where a field's value lives inside a command: an index into its parameters, then keys or indexes below that.
 * Control Switches' first switch is {@code [0]}; a plugin command's quest key is {@code [3, 'questKey']}.
 */
type CommandParamPath = readonly (number | string)[];

/**
 * When a field shows, judged on the other fields' values: equal to one value, one of several, or combinations.
 * Declarative, so a catalog entry stays plain data.
 */
type FieldCondition =
  | { readonly field: string; readonly equals: JsonValue }
  | { readonly field: string; readonly oneOf: readonly JsonValue[] }
  | { readonly all: readonly FieldCondition[] }
  | { readonly any: readonly FieldCondition[] }
  | { readonly not: FieldCondition };

/**
 * One choice of a select field.
 */
type FieldOption = {
  readonly value: JsonValue;
  readonly label: string;
};

/**
 * One input of a command.
 */
type CommandField = {
  /**
   * The field's name, unique within its entry; sentences and conditions refer to it.
   */
  readonly key: string;

  /**
   * What the form calls it, in the author's words.
   */
  readonly label: string;

  /**
   * Where its value lives in the command.
   */
  readonly param: CommandParamPath;

  /**
   * What kind of input it is.
   */
  readonly kind: CommandFieldKind;

  /**
   * How the value is kept: as itself, or as text (plugin command arguments are always text, whatever they mean).
   */
  readonly storage?: 'raw' | 'string';

  /**
   * The value a new command starts with.
   */
  readonly default?: JsonValue;

  /**
   * The choices of a select field.
   */
  readonly options?: readonly FieldOption[];

  /**
   * The bounds of a number field.
   */
  readonly min?: number;
  readonly max?: number;

  /**
   * The folder an audio, image or file field picks from.
   */
  readonly folder?: string;

  /**
   * When the field shows; always, when absent.
   */
  readonly visibleWhen?: FieldCondition;

  /**
   * A line of help under the control.
   */
  readonly help?: string;

  /**
   * For text that runs over several lines, where the lines live: {@code continuation} keeps one line per
   * continuation command (Show Text's 401s), {@code first-and-continuation} starts on the command itself and
   * carries on in continuation commands (a comment's 108, then its 408s). {@code param} then points at the text
   * inside each line's parameters, and the value is the lines joined with newlines. Absent for everything else.
   */
  readonly lines?: 'continuation' | 'first-and-continuation';
};

/**
 * The groups the command list offers, in the author's words.
 */
type CommandCategory =
  | 'Message'
  | 'Game Progression'
  | 'Flow Control'
  | 'Party'
  | 'Actor'
  | 'Movement'
  | 'Character'
  | 'Picture'
  | 'Timing'
  | 'Screen'
  | 'Audio & Video'
  | 'Scene Control'
  | 'System Settings'
  | 'Map'
  | 'Battle'
  | 'Advanced'
  | 'Plugin'
  | 'Other';

/**
 * What a sentence builder can read about the command it describes.
 */
type SentenceParts = {
  /**
   * The command.
   */
  readonly command: RmmzEventCommand;

  /**
   * The lines that continue it, such as Show Text's text lines; empty when it has none.
   */
  readonly continuation: readonly RmmzEventCommand[];

  /**
   * Reads a field's value.
   * @param {string} key The field.
   * @returns {JsonValue | undefined} The value, or undefined when absent.
   */
  value(key: string): JsonValue | undefined;

  /**
   * Reads a field's value as a sentence shows it: a name for an id, a label for a choice.
   * @param {string} key The field.
   * @returns {string} The text.
   */
  text(key: string): string;
};

/**
 * Builds a row's sentence by hand, for rows a template cannot say.
 */
type SentenceBuilder = (parts: SentenceParts) => string;

/**
 * How a command's block is laid out: the code closing it, and the codes of the branches inside it. Conditional
 * Branch (111) has an else (411) and ends at 412; Show Choices (102) has its choices (402) and cancel (403) and
 * ends at 404.
 */
type CommandBlock = {
  readonly end: number;
  readonly branches?: readonly number[];
};

/**
 * One command, described declaratively: its inputs, when each shows, the sentence its row reads as, where it
 * sits in the list, and the words that find it. A generated form covers most commands from this alone; the few
 * that need more register a hand-built editor against the entry's id.
 */
type CommandCatalogEntry = {
  /**
   * Unique across the catalog: {@code core:121}, or {@code plugin:J-OMNI-Quests:progress-quest}.
   */
  readonly id: string;

  /**
   * The command code it writes.
   */
  readonly code: number;

  /**
   * What the list calls it; plugin commands start with {@code Plugin:}.
   */
  readonly name: string;

  /**
   * Its group in the list.
   */
  readonly category: CommandCategory;

  /**
   * Words the search matches besides the name.
   */
  readonly keywords: readonly string[];

  /**
   * Its inputs.
   */
  readonly fields: readonly CommandField[];

  /**
   * The sentence its row reads as: a template naming fields in braces ({@code 'Switch {switch} = {value}'}), or
   * a builder.
   */
  readonly sentence: string | SentenceBuilder;

  /**
   * The code of the lines that continue it, such as 401 after Show Text.
   */
  readonly continuation?: number;

  /**
   * Its block, for commands that open one.
   */
  readonly block?: CommandBlock;

  /**
   * True for codes that only exist inside another command's structure (an else, a branch end), which the list
   * never offers on their own.
   */
  readonly structural?: boolean;

  /**
   * The plugin and command a plugin command entry stands for.
   */
  readonly plugin?: { readonly name: string; readonly command: string };

  /**
   * The parameters a new command starts with, exactly as MZ would write a fresh one. Without it, a new command is
   * built from its fields' defaults.
   */
  readonly defaultParameters?: readonly JsonValue[];

  /**
   * The inputs of each continuation line, for commands whose lines are rows of data rather than text (a shop's
   * further goods, one 605 per item). The generated form shows one row of these per line.
   */
  readonly continuationFields?: readonly CommandField[];

  /**
   * Rebuilds the continuation lines from the command itself, for commands whose lines only mirror a parameter
   * (Set Movement Route's 505s repeat its route, one per step). Called after every generated-form edit, so the
   * lines MZ shows never go stale.
   * @param {RmmzEventCommand} command The command, as edited.
   * @returns {RmmzEventCommand[]} Its continuation lines.
   */
  readonly deriveContinuation?: (command: RmmzEventCommand) => RmmzEventCommand[];
};

export type {
  CommandBlock,
  CommandCatalogEntry,
  CommandCategory,
  CommandField,
  CommandFieldKind,
  CommandParamPath,
  FieldCondition,
  FieldOption,
  SentenceBuilder,
  SentenceParts,
};
