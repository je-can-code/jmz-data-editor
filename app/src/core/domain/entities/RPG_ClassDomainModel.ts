import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Class = Rmmz.Implementations.RPG_Class;
import RPG_Trait = Rmmz.Data.RPG_Trait;
import RPG_ClassLearning = Rmmz.Data.RPG_ClassLearning;

/**
 * Domain model representing an RPG Maker MZ Class.
 */
class RPG_ClassDomainModel
  extends RPG_BaseDomainModel<RPG_Class>
{
  public traits: RPG_Trait[];
  public learnings: RPG_ClassLearning[];
  /**
   * The vanilla per-level stat curve — 8 rows (MHP/MMP/ATK/DEF/MAT/MDF/AGI/LUK), each a 100-entry array
   * indexed by level (index 0 unused, 1-99 authored). J-LevelMaster reads this directly for levels
   * 1-99, and derives its own runtime beyond-99 extrapolation from it (average of the last 5 deltas) —
   * see `rmmz-plugins/src/plugins/level/core/objects/Game_Temp.js`.
   */
  public params: number[][];

  constructor(rmmz: RPG_Class)
  {
    super(rmmz);
    this.traits = rmmz.traits.map((t) => ({ ...t }));
    this.learnings = rmmz.learnings.map((l) => ({ ...l }));
    this.params = rmmz.params.map((row) => [ ...row ]);
  }

  public toRmmz(): RPG_Class
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
      traits: this.traits.map((t) => ({ ...t })),
      learnings: this.learnings.map((l) => ({ ...l })),
      params: this.params.map((row) => [ ...row ]),
    };
  }

  protected syncNote(): string
  {
    return this.note;
  }
}

export { RPG_ClassDomainModel };
