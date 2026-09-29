import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import { StealParser } from '@services/parsers/StealParser.ts';
import RPG_Class = Rmmz.Implementations.RPG_Class;
import RPG_Trait = Rmmz.Data.RPG_Trait;
import RPG_ClassLearning = Rmmz.Data.RPG_ClassLearning;

/**
 * Domain model representing an RPG Maker MZ Class.
 */
class RPG_ClassDomainModel
  extends RPG_BaseDomainModel<RPG_Class>
{
  /**
   * What the class says about itself, shown across the top of the class scene
   * ({@link Rmmz.Implementations.RPG_Class.description}).
   */
  public description: string = '';

  /**
   * The icon the class is drawn with in the class scene ({@link Rmmz.Implementations.RPG_Class.iconIndex}).
   * Zero is no icon of its own, which the game fills in with its shared class icon.
   */
  public iconIndex: number = 0;

  public traits: RPG_Trait[];
  public learnings: RPG_ClassLearning[];
  /**
   * The vanilla per-level stat curve — 8 rows (MHP/MMP/ATK/DEF/MAT/MDF/AGI/LUK), each a 100-entry array
   * indexed by level (index 0 unused, 1-99 authored). J-LevelMaster reads this directly for levels
   * 1-99, and derives its own runtime beyond-99 extrapolation from it (average of the last 5 deltas) —
   * see `rmmz-plugins/src/plugins/level/core/objects/Game_Temp.js`.
   */
  public params: number[][];

  /** J-Resources-ABS {@code <lst:N>} — integer percent life steal; signed. */
  public lst: number;

  /** J-Resources-ABS {@code <mst:N>} — integer percent magi steal; signed. */
  public mst: number;

  /** J-Resources-ABS {@code <tst:N>} — integer percent tech steal; signed. */
  public tst: number;

  constructor(rmmz: RPG_Class)
  {
    super(rmmz);

    // RPG Maker's own editor never writes a class description or icon, so a class it saved reads as
    // undescribed, and as having no icon of its own.
    this.description = rmmz.description ?? '';
    this.iconIndex = rmmz.iconIndex ?? 0;
    this.traits = rmmz.traits.map((t) => ({ ...t }));
    this.learnings = rmmz.learnings.map((l) => ({ ...l }));
    this.params = rmmz.params.map((row) => [ ...row ]);

    const steal = StealParser.read(rmmz.note);
    this.lst = steal.lst;
    this.mst = steal.mst;
    this.tst = steal.tst;
  }

  public toRmmz(): RPG_Class
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
      description: this.description,
      iconIndex: this.iconIndex,
      traits: this.traits.map((t) => ({ ...t })),
      learnings: this.learnings.map((l) => ({ ...l })),
      params: this.params.map((row) => [ ...row ]),
    };
  }

  protected syncNote(): string
  {
    return StealParser.write(this.note, {
      lst: this.lst,
      mst: this.mst,
      tst: this.tst,
    });
  }
}

export { RPG_ClassDomainModel };
