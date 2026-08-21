import type { StateResourcesExtension } from '@core/domain/entities/state/StateResourcesExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

/**
 * J-Resources HP cost reduction tag {@code hrc} on state notes.
 */
class StateResourcesNoteParser
{
  static readonly #RE_HRC = /<hrc:\[([+\-*/ ().\w]+)]>/gi;

  static strip(note: string): string
  {
    const n = note.replace(StateResourcesNoteParser.#ensureGlobal(StateResourcesNoteParser.#RE_HRC), '');
    return NoteNormalizer.normalize(n);
  }

  static hydrate(
    ext: StateResourcesExtension,
    note: string
  ): void
  {
    const g = StateResourcesNoteParser.#ensureGlobal(StateResourcesNoteParser.#RE_HRC);
    g.lastIndex = 0;
    const m = g.exec(note);
    if (m === null || typeof m[ 1 ] !== 'string')
    {
      ext.hpCostReductionFormula = '';
      return;
    }
    const [ , hpCostReductionFormula ] = m;
    ext.hpCostReductionFormula = hpCostReductionFormula;
  }

  static write(
    ext: StateResourcesExtension,
    baseNote: string
  ): string
  {
    const t = ext.hpCostReductionFormula.trim();
    const parts: string[] = [];
    if (t !== '')
    {
      parts.push(`<hrc:[${t}]>`);
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

export { StateResourcesNoteParser };
