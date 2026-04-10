import { StateLevelNoteParser } from '@services/parsers/StateLevelNoteParser.ts';

/**
 * J-LevelMaster tags on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateLevelExtension
{
  /** Added to battler level while this state applies (written as {@code level}). */
  public levelOffset: number | null = null;

  /** Summed into actor max level from {@code getAllNotes}. */
  public maxLevelBoost: number | null = null;

  static fromStateNote(note: string): StateLevelExtension
  {
    const s = new StateLevelExtension();
    StateLevelNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StateLevelNoteParser.strip(note);
    return StateLevelNoteParser.write(this, base);
  }

  clone(patch?: Partial<StateLevelExtension>): StateLevelExtension
  {
    const s = new StateLevelExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateLevelExtension };
