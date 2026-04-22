import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

type PassiveAbsEnemyFlags = {
  noRngPassivePrefixes: boolean;
  noRngPassiveSuffixes: boolean;
  /** When set, writes {@code passive-affix-prefix-chance}; {@code null} omits the tag (engine default at roll time). */
  passiveAffixPrefixChance: number | null;
  /** When set, writes {@code passive-affix-suffix-chance}; {@code null} omits the tag. */
  passiveAffixSuffixChance: number | null;
};

/**
 * J-Passive-ABS enemy note tags that gate random passive affix rolls and optional per-enemy roll odds.
 */
class PassiveAbsEnemyNoteParser
{
  static readonly #RE_NO_PREFIX = /<no-rng-passive-prefixes>/gi;

  static readonly #RE_NO_SUFFIX = /<no-rng-passive-suffixes>/gi;

  static readonly #RE_PREFIX_CHANCE_STRIP = /<passive-affix-prefix-chance:[ ]?[+-]?\d+(?:\.\d+)?>/gi;

  static readonly #RE_SUFFIX_CHANCE_STRIP = /<passive-affix-suffix-chance:[ ]?[+-]?\d+(?:\.\d+)?>/gi;

  static readonly #RE_PREFIX_CHANCE_READ = /<passive-affix-prefix-chance:[ ]?([+-]?\d+(?:\.\d+)?)>/i;

  static readonly #RE_SUFFIX_CHANCE_READ = /<passive-affix-suffix-chance:[ ]?([+-]?\d+(?:\.\d+)?)>/i;

  /**
   * Removes Passive-ABS enemy tags so a clean note can be re-written.
   *
   * @param note Raw note text.
   * @returns Note with those tags stripped.
   */
  static strip(note: string): string
  {
    let n = note;
    n = n.replace(PassiveAbsEnemyNoteParser.#ensureGlobal(PassiveAbsEnemyNoteParser.#RE_NO_PREFIX), '');
    n = n.replace(PassiveAbsEnemyNoteParser.#ensureGlobal(PassiveAbsEnemyNoteParser.#RE_NO_SUFFIX), '');
    n = n.replace(PassiveAbsEnemyNoteParser.#RE_PREFIX_CHANCE_STRIP, '');
    n = n.replace(PassiveAbsEnemyNoteParser.#RE_SUFFIX_CHANCE_STRIP, '');
    return NoteNormalizer.normalize(n);
  }

  /**
   * Reads {@link PassiveAbsEnemyFlags} from the enemy note.
   *
   * @param note Raw note text.
   * @returns Parsed flag values.
   */
  static read(note: string): PassiveAbsEnemyFlags
  {
    return {
      noRngPassivePrefixes: PassiveAbsEnemyNoteParser.#hasTag(
        note,
        PassiveAbsEnemyNoteParser.#RE_NO_PREFIX
      ),
      noRngPassiveSuffixes: PassiveAbsEnemyNoteParser.#hasTag(
        note,
        PassiveAbsEnemyNoteParser.#RE_NO_SUFFIX
      ),
      passiveAffixPrefixChance: PassiveAbsEnemyNoteParser.#readLastChance(
        note,
        PassiveAbsEnemyNoteParser.#RE_PREFIX_CHANCE_READ
      ),
      passiveAffixSuffixChance: PassiveAbsEnemyNoteParser.#readLastChance(
        note,
        PassiveAbsEnemyNoteParser.#RE_SUFFIX_CHANCE_READ
      ),
    };
  }

  /**
   * Re-applies Passive-ABS enemy tags after stripping prior copies.
   *
   * @param baseNote Current full note (other parsers may have run).
   * @param flags Whether each blocking tag should be present, and optional chance overrides.
   * @returns Note with Passive-ABS enemy tags at the top.
   */
  static write(
    baseNote: string,
    flags: PassiveAbsEnemyFlags
  ): string
  {
    const stripped = PassiveAbsEnemyNoteParser.strip(baseNote);
    const parts: string[] = [];
    if (flags.noRngPassivePrefixes === true)
    {
      parts.push('<no-rng-passive-prefixes>');
    }
    if (flags.noRngPassiveSuffixes === true)
    {
      parts.push('<no-rng-passive-suffixes>');
    }
    if (flags.passiveAffixPrefixChance !== null)
    {
      parts.push(
        `<passive-affix-prefix-chance:${PassiveAbsEnemyNoteParser.#formatChanceForNote(flags.passiveAffixPrefixChance)}>`
      );
    }
    if (flags.passiveAffixSuffixChance !== null)
    {
      parts.push(
        `<passive-affix-suffix-chance:${PassiveAbsEnemyNoteParser.#formatChanceForNote(flags.passiveAffixSuffixChance)}>`
      );
    }
    const head = parts.length > 0
      ? `${parts.join('\n')}\n`
      : '';
    return NoteNormalizer.normalize(head + stripped);
  }

  static #clampChancePercent(raw: number): number
  {
    const rounded = Math.round(raw);

    if (rounded < 0)
    {
      return 0;
    }

    if (rounded > 100)
    {
      return 100;
    }

    return rounded;
  }

  static #formatChanceForNote(value: number): string
  {
    return String(PassiveAbsEnemyNoteParser.#clampChancePercent(value));
  }

  /**
   * Last numeric assignment wins, matching {@link RPGManager.getNumberFromNoteByRegex} line order.
   */
  static #readLastChance(
    note: string,
    lineRegex: RegExp
  ): number | null
  {
    const scan = new RegExp(
      lineRegex.source,
      lineRegex.flags
        .replace('g', '')
        .replace('y', '')
    );
    const lines = note.split(/[\r\n]+/);
    let val: number | null = null;

    lines.forEach((line) =>
    {
      scan.lastIndex = 0;
      const result = scan.exec(line);

      if (result === null)
      {
        return;
      }

      const n = parseFloat(result[ 1 ]);

      if (Number.isNaN(n) === false)
      {
        val = PassiveAbsEnemyNoteParser.#clampChancePercent(n);
      }
    });

    return val;
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
    const g = PassiveAbsEnemyNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    return g.exec(note) !== null;
  }
}

export { PassiveAbsEnemyNoteParser };
export type { PassiveAbsEnemyFlags };
