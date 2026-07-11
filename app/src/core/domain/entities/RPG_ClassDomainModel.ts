import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import RPG_Class = Rmmz.Implementations.RPG_Class;
import RPG_Trait = Rmmz.Data.RPG_Trait;
import RPG_ClassLearning = Rmmz.Data.RPG_ClassLearning;

/**
 * Domain model representing an RPG Maker MZ Class.
 *
 * Intentionally omits `params`/`expParams` (the per-level stat curve) — that's the territory of
 * JE's level-cap-expansion plugin and is being revisited as its own piece of work later.
 */
class RPG_ClassDomainModel
  extends RPG_BaseDomainModel<RPG_Class>
{
  public traits: RPG_Trait[];
  public learnings: RPG_ClassLearning[];

  constructor(rmmz: RPG_Class)
  {
    super(rmmz);
    this.traits = rmmz.traits.map((t) => ({ ...t }));
    this.learnings = rmmz.learnings.map((l) => ({ ...l }));
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
    };
  }

  protected syncNote(): string
  {
    return this.note;
  }
}

export { RPG_ClassDomainModel };
