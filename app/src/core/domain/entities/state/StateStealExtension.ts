import { StealParser } from '@services/parsers/StealParser.ts';

/**
 * J-Resources-ABS {@code lst}/{@code mst}/{@code tst} (life/magi/tech steal) on
 * {@link Rmmz.Implementations.RPG_State.note}.
 */
class StateStealExtension
{
  /** {@code <lst:N>} — integer percent (5 means 5%); signed. */
  public lst: number = 0;

  /** {@code <mst:N>} — integer percent (5 means 5%); signed. */
  public mst: number = 0;

  /** {@code <tst:N>} — integer percent (5 means 5%); signed. */
  public tst: number = 0;

  static fromStateNote(note: string): StateStealExtension
  {
    const s = new StateStealExtension();
    const rates = StealParser.read(note);
    s.lst = rates.lst;
    s.mst = rates.mst;
    s.tst = rates.tst;
    return s;
  }

  applyToNote(note: string): string
  {
    return StealParser.write(note, {
      lst: this.lst,
      mst: this.mst,
      tst: this.tst,
    });
  }

  clone(patch?: Partial<StateStealExtension>): StateStealExtension
  {
    const s = new StateStealExtension();
    Object.assign(s, this);
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StateStealExtension };
