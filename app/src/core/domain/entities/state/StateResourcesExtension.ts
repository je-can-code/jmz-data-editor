import { StateResourcesNoteParser } from '@services/parsers/StateResourcesNoteParser.ts';

/**
 * J-Resources {@code hrc} on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateResourcesExtension
{
  /** Bracket interior for {@code <hrc:[...]>}. */
  public hpCostReductionFormula: string = '';

  static fromStateNote(note: string): StateResourcesExtension
  {
    const s = new StateResourcesExtension();
    StateResourcesNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StateResourcesNoteParser.strip(note);
    return StateResourcesNoteParser.write(this, base);
  }

  clone(patch?: Partial<StateResourcesExtension>): StateResourcesExtension
  {
    const s = new StateResourcesExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateResourcesExtension };
