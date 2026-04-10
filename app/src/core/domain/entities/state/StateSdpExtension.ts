import { StateSdpNoteParser } from '@services/parsers/StateSdpNoteParser.ts';

/**
 * J-SDP tags on {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateSdpExtension
{
  /** Summed percent-style bonus before (base 100 + bonus) / 100. */
  public sdpMultiplierBonus: number | null = null;

  static fromStateNote(note: string): StateSdpExtension
  {
    const s = new StateSdpExtension();
    StateSdpNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StateSdpNoteParser.strip(note);
    return StateSdpNoteParser.write(this, base);
  }

  clone(patch?: Partial<StateSdpExtension>): StateSdpExtension
  {
    const s = new StateSdpExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateSdpExtension };
