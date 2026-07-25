import NoteReader from '../utils/NoteReader.ts';
import { NoteNormalizer } from '../utils/NoteNormalizer.ts';

/**
 * The domains supported by the `J-Aptitude-Typed` extension, matching {@code ApTypeKey.DomainType}
 * in `apt/ext/typed/_models/ApTypeKey.js`.
 */
type AptitudeTeachingDomain = 'element' | 'weapontype' | 'skilltype';

/**
 * A single aptitude teaching row: a skill learned once {@code requiredAp} is reached.
 * Untyped rows (`domain`/`domainId` absent) draw from the actor's shared AP pool;
 * typed rows only advance when AP is granted against the matching domain+id.
 */
type AptitudeTeachingRow = {
  skillId: number;
  requiredAp: number;
  domain?: AptitudeTeachingDomain;
  domainId?: number;
};

const VALID_DOMAINS: ReadonlySet<string> = new Set<AptitudeTeachingDomain>([ 'element', 'weapontype', 'skilltype' ]);

class AptitudeTeachableParser
{
  /**
   * Matches `<aptitude:[skillId,requiredAp]>`, mirroring `J.APT.RegExp.AptitudeTeachable`.
   */
  static #untypedRegex: RegExp = /<aptitude:[ ]?(\[\d+,[ ]?\d+])>/gi;

  /**
   * Matches `<aptitudeTyped:[skillId,requiredAp,domain,domainId]>`, mirroring
   * `J.APT.EXT.TYPED.RegExp.AptitudeTeachableTyped`.
   */
  static #typedRegex: RegExp = /<aptitudeTyped:[ ]?(\[\d+,[ ]?\d+,[ ]?[A-Za-z]+,[ ]?[A-Za-z0-9_\- ]+])>/gi;

  /**
   * Reads both untyped and typed aptitude teachings off a note, merged into one list.
   */
  static read(note: string): AptitudeTeachingRow[]
  {
    const rows: AptitudeTeachingRow[] = [];

    const untyped = NoteReader.getArraysFromNotesByRegex(note, this.#untypedRegex, true) ?? [];
    untyped.forEach(([ skillId, requiredAp ]) =>
    {
      rows.push({ skillId, requiredAp });
    });

    const typed = NoteReader.getArraysFromNotesByRegex(note, this.#typedRegex, true) ?? [];
    typed.forEach(([ skillId, requiredAp, domain, domainId ]) =>
    {
      // the editor always writes numeric domain ids; ignore hand-authored name-based rows rather
      // than silently misrepresenting them (no reliable system-list lookup at the parser layer).
      const normalizedDomain = String(domain).trim().toLowerCase();
      if (!VALID_DOMAINS.has(normalizedDomain) || typeof domainId !== 'number')
      {
        return;
      }

      rows.push({
        skillId,
        requiredAp,
        domain: normalizedDomain as AptitudeTeachingDomain,
        domainId,
      });
    });

    return rows;
  }

  /**
   * Writes the given aptitude teachings back onto the note, replacing every existing
   * `<aptitude:>`/`<aptitudeTyped:>` line while leaving the rest of the note untouched.
   */
  static write(
    originalNote: string,
    teachings: AptitudeTeachingRow[]
  ): string
  {
    const withoutUntyped = NoteNormalizer.removeLinesMatching(originalNote, this.#untypedRegex);
    const base = NoteNormalizer.removeLinesMatching(withoutUntyped, this.#typedRegex);

    const lines = teachings.map((row) =>
    {
      if (row.domain === undefined || row.domainId === undefined)
      {
        return `<aptitude:[${row.skillId},${row.requiredAp}]>`;
      }

      return `<aptitudeTyped:[${row.skillId},${row.requiredAp},${row.domain},${row.domainId}]>`;
    });

    const newBlock = lines.join('\n');
    if (!newBlock)
    {
      return base;
    }

    return NoteNormalizer.appendBlock(base, newBlock);
  }
}

export type { AptitudeTeachingRow, AptitudeTeachingDomain };
export { AptitudeTeachableParser };
