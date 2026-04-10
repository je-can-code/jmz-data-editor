import { StateDropsNoteParser } from '@services/parsers/StateDropsNoteParser.ts';

/**
 * J-DropsControl tags on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateDropsExtension
{
  /** Percent points summed with party base before /100 (engine). */
  public dropMultiplier: number | null = null;

  /** Percent points summed with party base before /100 (engine). */
  public goldMultiplier: number | null = null;

  static fromStateNote(note: string): StateDropsExtension
  {
    const s = new StateDropsExtension();
    StateDropsNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StateDropsNoteParser.strip(note);
    return StateDropsNoteParser.write(this, base);
  }

  clone(patch?: Partial<StateDropsExtension>): StateDropsExtension
  {
    const s = new StateDropsExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateDropsExtension };
