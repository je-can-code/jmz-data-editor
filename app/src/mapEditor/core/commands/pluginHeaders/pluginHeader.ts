import type { PluginCommandArg } from '../pluginCommands.ts';

/**
 * One argument of a plugin command, or one field of a struct, as a plugin header declares it. It carries
 * everything the catalog's own argument type does, plus what only a hand-built form uses: the decimals a number
 * keeps, the words a boolean's two states read as, and the parameter it is grouped under.
 */
type PluginArgSchema = PluginCommandArg & {
  /**
   * How many decimal places a number keeps.
   */
  readonly decimals?: number;

  /**
   * What a boolean reads as when true, and when false.
   */
  readonly on?: string;
  readonly off?: string;

  /**
   * True when a file must be deployed with the game.
   */
  readonly require?: boolean;

  /**
   * The parameter this one is grouped under.
   */
  readonly parent?: string;
};

/**
 * One command a plugin offers, as its header declares it with {@code @command}.
 */
type PluginCommandSchema = {
  /**
   * The plugin's name as {@code js/plugins.js} spells it, which is also what a plugin command stores.
   */
  readonly plugin: string;

  /**
   * The command's name, which a plugin command stores.
   */
  readonly command: string;

  /**
   * What the plugin calls it.
   */
  readonly text?: string;

  /**
   * What it does, in the plugin's words.
   */
  readonly description?: string;

  /**
   * Its arguments, in the order the header lists them.
   */
  readonly args: readonly PluginArgSchema[];
};

/**
 * A struct a plugin header declares with {@code ~struct~}, which an argument's type names as
 * {@code struct<Name>}.
 */
type PluginStructSchema = {
  readonly name: string;
  readonly params: readonly PluginArgSchema[];
};

/**
 * Everything the editor reads from one plugin's header: what the plugin is, the commands it offers and the
 * structs their arguments use.
 */
type PluginHeader = {
  /**
   * The plugin's name as {@code js/plugins.js} spells it.
   */
  readonly plugin: string;

  /**
   * Its {@code @plugindesc}.
   */
  readonly description: string;

  /**
   * Its commands, in the order the header lists them.
   */
  readonly commands: readonly PluginCommandSchema[];

  /**
   * Its structs.
   */
  readonly structs: readonly PluginStructSchema[];
};

export type { PluginArgSchema, PluginCommandSchema, PluginHeader, PluginStructSchema };
