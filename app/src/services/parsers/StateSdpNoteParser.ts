import type { StateSdpExtension } from '@core/domain/entities/state/StateSdpExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-SDP multiplier tag on state notes.
 */
class StateSdpNoteParser
{
  static readonly #RE_MULTIPLIER = /<sdpMultiplier: ?([-.\d]+)>/gi;

  static strip(note: string): string
  {
    let n = note.replace(StateSdpNoteParser.#ensureGlobal(StateSdpNoteParser.#RE_MULTIPLIER), '');
    return NoteNormalizer.normalize(n);
  }

  static hydrate(
    ext: StateSdpExtension,
    note: string
  ): void
  {
    const g = StateSdpNoteParser.#ensureGlobal(StateSdpNoteParser.#RE_MULTIPLIER);
    g.lastIndex = 0;
    let sum = 0;
    let found = false;
    let m = g.exec(note);
    while (m !== null)
    {
      const v = parseFloat(m[ 1 ]);
      if (Number.isNaN(v) === false)
      {
        sum += v;
        found = true;
      }
      m = g.exec(note);
    }
    ext.sdpMultiplierBonus = found
      ? sum
      : null;
  }

  static write(
    ext: StateSdpExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    if (ext.sdpMultiplierBonus !== null)
    {
      const n = ext.sdpMultiplierBonus;
      const s = Number.isInteger(n)
        ? String(Math.trunc(n))
        : String(n);
      parts.push(`<sdpMultiplier:${s}>`);
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
}

export { StateSdpNoteParser };
