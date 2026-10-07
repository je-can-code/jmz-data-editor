import { isJsonObject, jsonEquals, type JsonValue } from '../model/json.ts';

/**
 * Names one kind of state a preview can set: the core's switches and variables, or a kind a plugin module adds, named
 * with its module's id in front like everything a module adds ({@code quest.states}).
 */
type PreviewKind = string;

/**
 * Names one piece of state a preview can set: its kind, a colon, then the thing's own key within that kind, such as
 * {@code switch:74}, {@code variable:12} or {@code quest.states:CHEF_01}. Whatever reads a piece of state from a preview
 * says so by its key, so that a change to it judges again exactly what reads it, and nothing else.
 */
type PreviewKey = `${PreviewKind}:${string}`;

/**
 * A preview as JSON, for remembering it between sessions: each kind's things set, by key, with the value each is set
 * to. A thing left at what a fresh save holds is never listed.
 */
type PreviewJson = { [kind: string]: { [key: string]: JsonValue } };

/**
 * The kind a switch is set under: by its id, on, as {@code true}.
 */
const SWITCH_KIND: PreviewKind = 'switch';

/**
 * The kind a variable is set under: by its id, at its value.
 */
const VARIABLE_KIND: PreviewKind = 'variable';

/**
 * Names a switch as a piece of preview state.
 * @param {number} switchId The switch.
 * @returns {PreviewKey} The key, such as {@code switch:74}.
 */
const switchKey = (switchId: number): PreviewKey =>
{
  return `${SWITCH_KIND}:${switchId}`;
};

/**
 * Names a variable as a piece of preview state.
 * @param {number} variableId The variable.
 * @returns {PreviewKey} The key, such as {@code variable:74}.
 */
const variableKey = (variableId: number): PreviewKey =>
{
  return `${VARIABLE_KIND}:${variableId}`;
};

/**
 * Reports whether a key names a switch or a variable by an id the game could have: a whole number from 1.
 * @param {string} key The key.
 * @returns {boolean} True for such an id.
 */
const isGameId = (key: string): boolean =>
{
  return /^[1-9]\d*$/u.test(key);
};

/**
 * Reports whether a value is one a kind may set: on, for a switch; any number but 0, for a variable; anything JSON can
 * hold but null, for a kind a module adds, which says for itself what its values mean.
 * @param {PreviewKind} kind The kind.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True when it may be set; anything else reads as a fresh save's.
 */
const isSettable = (kind: PreviewKind, value: JsonValue | undefined): value is JsonValue =>
{
  if (kind === SWITCH_KIND)
  {
    return value === true;
  }

  if (kind === VARIABLE_KIND)
  {
    return typeof value === 'number' && Number.isFinite(value) && value !== 0;
  }

  return value !== undefined && value !== null;
};

/**
 * How far along the story the author asks every map to show the game, beyond a fresh save: switches turned on,
 * variables set, and whatever kinds of state a plugin module adds, such as where each quest stands. Anything it leaves
 * unset reads as a fresh save has it: every switch off and every variable 0. It is never written into the game's data;
 * it is only what the page rule judges every event's pages against.
 *
 * A preview never changes once made; each change makes another, so whoever holds one can tell a change by asking
 * {@link changedKeys}.
 */
class GamePreview
{
  /**
   * The preview of a fresh save, which sets nothing.
   */
  static readonly FRESH: GamePreview = new GamePreview(new Map());

  #kinds: ReadonlyMap<PreviewKind, ReadonlyMap<string, JsonValue>>;

  /**
   * @param {ReadonlyMap<PreviewKind, ReadonlyMap<string, JsonValue>>} kinds Each kind's things set, by key; no kind
   * empty, and every value one its kind may set. {@link fromJson} and the {@code with} methods build them so.
   */
  constructor(kinds: ReadonlyMap<PreviewKind, ReadonlyMap<string, JsonValue>>)
  {
    this.#kinds = kinds;
  }

  /**
   * Reads a remembered preview, keeping whatever of it a preview could set and dropping the rest, so a record from an
   * older or broken session never stops the editor: a switch set to anything but on, a variable set to something other
   * than a number, a switch or variable whose id is no id, and a kind that is no object.
   * @param {unknown} json The remembered preview.
   * @returns {GamePreview} The preview; a fresh save's when nothing could be kept.
   */
  static fromJson(json: unknown): GamePreview
  {
    if (isJsonObject(json) === false)
    {
      return GamePreview.FRESH;
    }

    const kinds = new Map<PreviewKind, ReadonlyMap<string, JsonValue>>();
    Object.entries(json).forEach(([ kind, things ]) =>
    {
      if (isJsonObject(things) === false)
      {
        return;
      }

      // the core's kinds name things by the game's own ids; a module's kinds name them however the module does.
      const core = kind === SWITCH_KIND || kind === VARIABLE_KIND;
      const kept = Object.entries(things).filter(([ key, value ]) => (core === false || isGameId(key)) && isSettable(kind, value));
      if (kept.length > 0)
      {
        kinds.set(kind, new Map(kept));
      }
    });

    return kinds.size === 0
      ? GamePreview.FRESH
      : new GamePreview(kinds);
  }

  /**
   * Whether the preview sets nothing at all, so every map shows a fresh save.
   * @returns {boolean} True when nothing is set.
   */
  get isFresh(): boolean
  {
    return this.#kinds.size === 0;
  }

  /**
   * Reads what one thing is set to.
   * @param {PreviewKind} kind The kind.
   * @param {string} key The thing's key within the kind.
   * @returns {JsonValue | undefined} Its value, or undefined while it is as a fresh save holds it.
   */
  value(kind: PreviewKind, key: string): JsonValue | undefined
  {
    return this.#kinds.get(kind)?.get(key);
  }

  /**
   * Reports whether a switch is on.
   * @param {number} switchId The switch.
   * @returns {boolean} True when the preview turns it on.
   */
  isSwitchOn(switchId: number): boolean
  {
    return this.value(SWITCH_KIND, String(switchId)) === true;
  }

  /**
   * Reads a variable.
   * @param {number} variableId The variable.
   * @returns {number} Its value: what the preview sets it to, or 0, as on a fresh save.
   */
  variable(variableId: number): number
  {
    const value = this.value(VARIABLE_KIND, String(variableId));
    return typeof value === 'number'
      ? value
      : 0;
  }

  /**
   * Counts the things one kind sets.
   * @param {PreviewKind} kind The kind.
   * @returns {number} How many.
   */
  count(kind: PreviewKind): number
  {
    return this.#kinds.get(kind)?.size ?? 0;
  }

  /**
   * Lists the kinds the preview sets anything of.
   * @returns {PreviewKind[]} The kinds, in the order they were first set.
   */
  kinds(): PreviewKind[]
  {
    return [ ...this.#kinds.keys() ];
  }

  /**
   * Lists the switches the preview turns on.
   * @returns {number[]} Their ids, ascending.
   */
  switchesOn(): number[]
  {
    return [ ...this.#kinds.get(SWITCH_KIND)?.keys() ?? [] ]
      .map(Number)
      .sort((left, right) => left - right);
  }

  /**
   * Sets one thing, or puts it back as a fresh save holds it.
   * @param {PreviewKind} kind The kind.
   * @param {string} key The thing's key within the kind.
   * @param {JsonValue | undefined} value Its value, or undefined, or a value its kind cannot set (a switch set to
   * anything but on, a variable set to 0), to put it back.
   * @returns {GamePreview} The preview with it set; this very preview when nothing changed.
   */
  with(kind: PreviewKind, key: string, value: JsonValue | undefined): GamePreview
  {
    const current = this.value(kind, key);
    const next = isSettable(kind, value) ? value : undefined;
    if (jsonEquals(current, next))
    {
      return this;
    }

    // a kind left with nothing set goes, so a preview setting nothing is a fresh save's.
    const kinds = new Map(this.#kinds);
    const things = new Map(this.#kinds.get(kind));
    if (next === undefined)
    {
      things.delete(key);
    }
    else
    {
      things.set(key, next);
    }

    if (things.size === 0)
    {
      kinds.delete(kind);
    }
    else
    {
      kinds.set(kind, things);
    }

    return kinds.size === 0
      ? GamePreview.FRESH
      : new GamePreview(kinds);
  }

  /**
   * Turns a switch on or off.
   * @param {number} switchId The switch.
   * @param {boolean} on True for on; off puts it back as a fresh save holds it.
   * @returns {GamePreview} The preview with the switch so.
   */
  withSwitch(switchId: number, on: boolean): GamePreview
  {
    return this.with(SWITCH_KIND, String(switchId), on);
  }

  /**
   * Sets a variable.
   * @param {number} variableId The variable.
   * @param {number} value Its value; 0 puts it back as a fresh save holds it.
   * @returns {GamePreview} The preview with the variable so.
   */
  withVariable(variableId: number, value: number): GamePreview
  {
    return this.with(VARIABLE_KIND, String(variableId), value);
  }

  /**
   * Lists every piece of state one preview sets otherwise than another: set in one alone, or set to different values.
   * @param {GamePreview} other The other preview.
   * @returns {Set<PreviewKey>} The keys; empty when the two set the same things the same way.
   */
  changedKeys(other: GamePreview): Set<PreviewKey>
  {
    const changed = new Set<PreviewKey>();
    const kinds = new Set([ ...this.#kinds.keys(), ...other.#kinds.keys() ]);
    kinds.forEach(kind =>
    {
      const keys = new Set([ ...this.#kinds.get(kind)?.keys() ?? [], ...other.#kinds.get(kind)?.keys() ?? [] ]);
      keys.forEach(key =>
      {
        if (jsonEquals(this.value(kind, key), other.value(kind, key)) === false)
        {
          changed.add(`${kind}:${key}`);
        }
      });
    });

    return changed;
  }

  /**
   * Reports whether two previews set the same things the same way.
   * @param {GamePreview} other The other preview.
   * @returns {boolean} True when they do.
   */
  equals(other: GamePreview): boolean
  {
    return this === other || this.changedKeys(other).size === 0;
  }

  /**
   * Writes the preview as JSON, for remembering it.
   * @returns {PreviewJson} Each kind's things set, by key.
   */
  toJson(): PreviewJson
  {
    const json: PreviewJson = {};
    this.#kinds.forEach((things, kind) =>
    {
      json[kind] = Object.fromEntries(things);
    });

    return json;
  }
}

export { GamePreview, SWITCH_KIND, switchKey, VARIABLE_KIND, variableKey };
export type { PreviewJson, PreviewKey, PreviewKind };
