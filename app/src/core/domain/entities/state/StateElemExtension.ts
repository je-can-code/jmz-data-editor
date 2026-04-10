import type { StateElemBoostRow } from '@core/domain/entities/state/StateElemBoostRow.ts';
import { StateElemNoteParser } from '@services/parsers/StateElemNoteParser.ts';

/**
 * J-Elementalistics tags on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateElemExtension
{
  /** Comma-separated damage element ids inside {@code absorbElements:[...]}. */
  public absorbElementList: string = '';

  /** Comma-separated damage element ids inside {@code strictElements:[...]}. */
  public strictElementList: string = '';

  public elementBoosts: StateElemBoostRow[] = [];

  static fromStateNote(note: string): StateElemExtension
  {
    const s = new StateElemExtension();
    StateElemNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StateElemNoteParser.strip(note);
    return StateElemNoteParser.write(this, base);
  }

  clone(patch?: Partial<StateElemExtension>): StateElemExtension
  {
    const s = new StateElemExtension();
    Object.assign(s, this);
    s.elementBoosts = this.elementBoosts.map((r) =>
    {
      return { ...r };
    });
    if (patch !== undefined)
    {
      Object.assign(s, patch);
      if (patch.elementBoosts !== undefined)
      {
        s.elementBoosts = patch.elementBoosts.map((r) =>
        {
          return { ...r };
        });
      }
    }
    return s;
  }
}

export { StateElemExtension };
