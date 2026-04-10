import type { StateElemBoostRow } from '@core/domain/entities/state/StateElemBoostRow.ts';
import type { StateElemExtension } from '@core/domain/entities/state/StateElemExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-Elementalistics absorb, strict, and boost tags on state notes.
 */
class StateElemNoteParser
{
  static readonly #RE_ABSORB = /<absorbElements:[ ]?(\[[\d, ]+])>/gi;

  static readonly #RE_STRICT = /<strictElements:[ ]?(\[[\d, ]+])>/gi;

  static readonly #RE_BOOST = /<boostElement:(\d+):(-?\+?[\d]+)>/gi;

  static strip(note: string): string
  {
    let n = note;
    n = n.replace(StateElemNoteParser.#ensureGlobal(StateElemNoteParser.#RE_ABSORB), '');
    n = n.replace(StateElemNoteParser.#ensureGlobal(StateElemNoteParser.#RE_STRICT), '');
    n = n.replace(StateElemNoteParser.#ensureGlobal(StateElemNoteParser.#RE_BOOST), '');
    return NoteNormalizer.normalize(n);
  }

  static hydrate(
    ext: StateElemExtension,
    note: string
  ): void
  {
    ext.absorbElementList = StateElemNoteParser.#readFirstBracketInterior(
      note,
      StateElemNoteParser.#RE_ABSORB
    );
    ext.strictElementList = StateElemNoteParser.#readFirstBracketInterior(
      note,
      StateElemNoteParser.#RE_STRICT
    );
    ext.elementBoosts = StateElemNoteParser.#readAllBoosts(note);
  }

  static write(
    ext: StateElemExtension,
    baseNote: string
  ): string
  {
    const parts: string[] = [];
    {
      const br = StateElemNoteParser.#toBracketList(ext.absorbElementList);
      if (br !== null)
      {
        parts.push(`<absorbElements:${br}>`);
      }
    }
    {
      const br = StateElemNoteParser.#toBracketList(ext.strictElementList);
      if (br !== null)
      {
        parts.push(`<strictElements:${br}>`);
      }
    }
    for (const row of ext.elementBoosts)
    {
      parts.push(`<boostElement:${row.elementId}:${row.boost}>`);
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

  static #interiorFromBracketCapture(cap: string | undefined): string
  {
    if (cap === undefined || cap.length === 0)
    {
      return '';
    }
    const t = cap.trim();
    if (t.length >= 2 && t.startsWith('[') && t.endsWith(']'))
    {
      return t.slice(1, -1)
        .trim();
    }
    return t;
  }

  static #readFirstBracketInterior(
    note: string,
    re: RegExp
  ): string
  {
    const g = StateElemNoteParser.#ensureGlobal(re);
    g.lastIndex = 0;
    const m = g.exec(note);
    if (m === null)
    {
      return '';
    }
    return StateElemNoteParser.#interiorFromBracketCapture(m[ 1 ]);
  }

  static #readAllBoosts(note: string): StateElemBoostRow[]
  {
    const g = StateElemNoteParser.#ensureGlobal(StateElemNoteParser.#RE_BOOST);
    g.lastIndex = 0;
    const out: StateElemBoostRow[] = [];
    let m = g.exec(note);
    while (m !== null)
    {
      const id = parseInt(m[ 1 ], 10);
      const boost = parseInt(m[ 2 ].replace('+', ''), 10);
      if (Number.isNaN(id) === false && Number.isNaN(boost) === false)
      {
        out.push({
          elementId: id,
          boost
        });
      }
      m = g.exec(note);
    }
    return out;
  }

  static #toBracketList(raw: string): string | null
  {
    const t = raw.trim();
    if (t === '')
    {
      return null;
    }
    return `[${t}]`;
  }
}

export { StateElemNoteParser };
