import { StatePassiveAbsNoteParser } from '@services/parsers/StatePassiveAbsNoteParser.ts';

/**
 * J-Passive-ABS tags on {@link Rmmz.Implementations.RPG_State.note} (enemy affix pools, tier HUD).
 */
class StatePassiveAbsExtension
{
  /** When true, the note includes {@code <enemy-prefix>}. */
  public enemyPrefix: boolean = false;

  /** When true, the note includes {@code <enemy-suffix>}. */
  public enemySuffix: boolean = false;

  /**
   * Affix lottery weight when set ({@code N} &gt;= 1). {@code null} omits the tag so the game uses its default (100).
   */
  public affixWeight: number | null = null;

  /**
   * Tier stripe color ({@code #RRGGBB}). Empty string omits the tag. HUD label tint follows this in-game.
   */
  public tierColorHex: string = '';

  static fromStateNote(note: string): StatePassiveAbsExtension
  {
    const s = new StatePassiveAbsExtension();
    StatePassiveAbsNoteParser.hydrate(s, note);
    return s;
  }

  applyToNote(note: string): string
  {
    const base = StatePassiveAbsNoteParser.strip(note);
    return StatePassiveAbsNoteParser.write(this, base);
  }

  clone(patch?: Partial<StatePassiveAbsExtension>): StatePassiveAbsExtension
  {
    const s = new StatePassiveAbsExtension();
    s.enemyPrefix = this.enemyPrefix;
    s.enemySuffix = this.enemySuffix;
    s.affixWeight = this.affixWeight;
    s.tierColorHex = this.tierColorHex;
    if (patch !== undefined)
    {
      Object.assign(s, patch);
    }
    return s;
  }
}

export { StatePassiveAbsExtension };
