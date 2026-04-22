import type { StatePassiveAbsExtension } from '@core/domain/entities/state/StatePassiveAbsExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-Passive-ABS state tags: enemy affix pools, tier HUD coloring.
 */
class StatePassiveAbsNoteParser
{
  static readonly #RE_PREFIX = /<enemy-prefix>/gi;

  static readonly #RE_SUFFIX = /<enemy-suffix>/gi;

  static readonly #RE_WEIGHT = /<affix-weight:[1-9]\d*>/gi;

  static readonly #RE_TIER_HEX = /<tier-color-hex:(#[0-9A-Fa-f]{6})>/gi;

  /** Legacy tag; stripped so notes stay aligned with tier-color-hex–driven HUD tint. */
  static readonly #RE_TIER_HUD_LEGACY = /<tier-hud-message-color:(\d+)>/gi;

  /**
   * Strips all Passive-ABS state tags managed by this parser.
   *
   * @param note Raw note text.
   * @returns Note without those tags.
   */
  static strip(note: string): string
  {
    let n = note;
    n = n.replace(StatePassiveAbsNoteParser.#ensureGlobal(StatePassiveAbsNoteParser.#RE_PREFIX), '');
    n = n.replace(StatePassiveAbsNoteParser.#ensureGlobal(StatePassiveAbsNoteParser.#RE_SUFFIX), '');
    n = n.replace(StatePassiveAbsNoteParser.#ensureGlobal(StatePassiveAbsNoteParser.#RE_WEIGHT), '');
    n = n.replace(StatePassiveAbsNoteParser.#ensureGlobal(StatePassiveAbsNoteParser.#RE_TIER_HEX), '');
    n = n.replace(StatePassiveAbsNoteParser.#ensureGlobal(StatePassiveAbsNoteParser.#RE_TIER_HUD_LEGACY), '');
    return NoteNormalizer.normalize(n);
  }

  /**
   * Fills {@link StatePassiveAbsExtension} fields from the note.
   *
   * @param ext Extension to hydrate.
   * @param note Raw note text.
   */
  static hydrate(
    ext: StatePassiveAbsExtension,
    note: string
  ): void
  {
    ext.enemyPrefix = StatePassiveAbsNoteParser.#hasTag(note, StatePassiveAbsNoteParser.#RE_PREFIX);
    ext.enemySuffix = StatePassiveAbsNoteParser.#hasTag(note, StatePassiveAbsNoteParser.#RE_SUFFIX);
    ext.affixWeight = StatePassiveAbsNoteParser.#readFirstAffixWeight(note);
    ext.tierColorHex = StatePassiveAbsNoteParser.#readFirstTierHex(note);
  }

  /**
   * Writes Passive-ABS tags ahead of the remaining note.
   *
   * @param ext Values to serialize.
   * @param baseNote Note already stripped of these tags.
   * @returns Full note with Passive-ABS header.
   */
  static write(
    ext: StatePassiveAbsExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    if (ext.enemyPrefix === true)
    {
      parts.push('<enemy-prefix>');
    }
    if (ext.enemySuffix === true)
    {
      parts.push('<enemy-suffix>');
    }
    if (ext.affixWeight !== null && ext.affixWeight >= 1)
    {
      parts.push(`<affix-weight:${ext.affixWeight}>`);
    }
    if (ext.tierColorHex.trim() !== '')
    {
      const hex = ext.tierColorHex.trim()
        .toUpperCase();
      if (StatePassiveAbsNoteParser.#isSixDigitHex(hex) === true)
      {
        parts.push(`<tier-color-hex:${hex}>`);
      }
    }
    const head = parts.length > 0
      ? `${parts.join('\n')}\n`
      : '';
    return NoteNormalizer.normalize(head + baseNote);
  }

  static #ensureGlobal(re: RegExp): RegExp
  {
    if (re.global)
    {
      return re;
    }
    return new RegExp(re.source, `${re.flags}g`);
  }

  static #hasTag(
    note: string,
    re: RegExp
  ): boolean
  {
    const g = StatePassiveAbsNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    return g.exec(note) !== null;
  }

  static #readFirstAffixWeight(note: string): number | null
  {
    const m = /<affix-weight:([1-9]\d*)>/i.exec(note);
    if (m === null)
    {
      return null;
    }
    const v = parseInt(m[ 1 ], 10);
    if (Number.isNaN(v) === true || v < 1)
    {
      return null;
    }
    return v;
  }

  static #readFirstTierHex(note: string): string
  {
    const g = StatePassiveAbsNoteParser.#ensureGlobal(StatePassiveAbsNoteParser.#RE_TIER_HEX);
    g.lastIndex = 0;
    const m = g.exec(note);
    if (m === null)
    {
      return '';
    }
    return m[ 1 ].toUpperCase();
  }

  static #isSixDigitHex(value: string): boolean
  {
    return /^#[0-9A-F]{6}$/u.test(value);
  }
}

export { StatePassiveAbsNoteParser };
