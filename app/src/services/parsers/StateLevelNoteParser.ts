import type { StateLevelExtension } from '@core/domain/entities/state/StateLevelExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-LevelMaster level and max-level boost tags on state notes.
 */
class StateLevelNoteParser
{
  static readonly #RE_LEVEL = /<(?:lv|lvl|level):[ ]?(-?\+?\d+)>/gi;

  static readonly #RE_MAX_LEVEL_BOOST = /<maxLevelBoost: ?(-?\+?\d+)>/gi;

  static strip(note: string): string
  {
    let n = note;
    n = n.replace(StateLevelNoteParser.#ensureGlobal(StateLevelNoteParser.#RE_LEVEL), '');
    n = n.replace(StateLevelNoteParser.#ensureGlobal(StateLevelNoteParser.#RE_MAX_LEVEL_BOOST), '');
    return NoteNormalizer.normalize(n);
  }

  static hydrate(
    ext: StateLevelExtension,
    note: string
  ): void
  {
    ext.levelOffset = StateLevelNoteParser.#sumSignedGroup1(note, StateLevelNoteParser.#RE_LEVEL);
    ext.maxLevelBoost = StateLevelNoteParser.#sumSignedGroup1(
      note,
      StateLevelNoteParser.#RE_MAX_LEVEL_BOOST
    );
  }

  static write(
    ext: StateLevelExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    if (ext.levelOffset !== null)
    {
      parts.push(`<level:${ext.levelOffset}>`);
    }
    if (ext.maxLevelBoost !== null)
    {
      parts.push(`<maxLevelBoost:${ext.maxLevelBoost}>`);
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

  static #normalizeSignedToken(raw: string): number | null
  {
    const t = raw.replace('+', '')
      .trim();
    const v = parseInt(t, 10);
    if (Number.isNaN(v))
    {
      return null;
    }
    return v;
  }

  static #sumSignedGroup1(
    note: string,
    re: RegExp
  ): number | null
  {
    const g = StateLevelNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    let sum = 0;
    let found = false;
    let m = g.exec(note);
    while (m !== null)
    {
      const v = StateLevelNoteParser.#normalizeSignedToken(m[ 1 ]);
      if (v !== null)
      {
        sum += v;
        found = true;
      }
      m = g.exec(note);
    }
    return found
      ? sum
      : null;
  }
}

export { StateLevelNoteParser };
