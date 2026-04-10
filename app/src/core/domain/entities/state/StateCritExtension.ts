import { StateCritNoteParser } from '@services/parsers/StateCritNoteParser.ts';

/**
 * J-CriticalFactors base tags on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateCritExtension
{
  public critReductionBase: number | null = null;

  public critReduction: number | null = null;

  public critMultiplierBase: number | null = null;

  public critMultiplier: number | null = null;

  static fromStateNote(note: string): StateCritExtension
  {
    const s = new StateCritExtension();
    StateCritNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StateCritNoteParser.strip(note);
    return StateCritNoteParser.write(this, base);
  }

  clone(patch?: Partial<StateCritExtension>): StateCritExtension
  {
    const s = new StateCritExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateCritExtension };
