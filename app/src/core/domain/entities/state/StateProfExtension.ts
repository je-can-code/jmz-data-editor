import { StateProfNoteParser } from '@services/parsers/StateProfNoteParser.ts';

/**
 * J-Proficiency tags on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateProfExtension
{
  public proficiencyBonus: number | null = null;

  public proficiencyGivingBlock: boolean = false;

  public proficiencyGainingBlock: boolean = false;

  static fromStateNote(note: string): StateProfExtension
  {
    const s = new StateProfExtension();
    StateProfNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StateProfNoteParser.strip(note);
    return StateProfNoteParser.write(this, base);
  }

  clone(patch?: Partial<StateProfExtension>): StateProfExtension
  {
    const s = new StateProfExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateProfExtension };
