import { StateSksNoteParser } from '@services/parsers/StateSksNoteParser.ts';

/**
 * J-SkillSlots tags on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateSksExtension
{
  public slotCostModifier: number | null = null;

  static fromStateNote(note: string): StateSksExtension
  {
    const s = new StateSksExtension();
    StateSksNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StateSksNoteParser.strip(note);
    return StateSksNoteParser.write(this, base);
  }

  clone(patch?: Partial<StateSksExtension>): StateSksExtension
  {
    const s = new StateSksExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateSksExtension };
