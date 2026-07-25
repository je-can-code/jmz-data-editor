import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import { MaxTpParser } from '@services/parsers/MaxTpParser.ts';
import { StealParser } from '@services/parsers/StealParser.ts';
import RPG_Weapon = Rmmz.Implementations.RPG_Weapon;
import RPG_Trait = Rmmz.Data.RPG_Trait;

class RPG_WeaponDomainModel
  extends RPG_BaseDomainModel<RPG_Weapon>
{
  public iconIndex: number;
  public description: string;
  public price: number;
  public wtypeId: number;
  public animationId: number;
  public params: number[];
  public traits: RPG_Trait[];
  public maxTp: number;
  public etypeId: number;

  /** J-Resources-ABS {@code <lst:N>} — integer percent life steal; signed. */
  public lst: number;

  /** J-Resources-ABS {@code <mst:N>} — integer percent magi steal; signed. */
  public mst: number;

  /** J-Resources-ABS {@code <tst:N>} — integer percent tech steal; signed. */
  public tst: number;

  constructor(rmmz: RPG_Weapon)
  {
    super(rmmz);
    this.iconIndex = rmmz.iconIndex;
    this.description = rmmz.description;
    this.price = rmmz.price;
    this.wtypeId = rmmz.wtypeId;
    this.animationId = rmmz.animationId;
    this.params = [ ...rmmz.params ];
    this.traits = rmmz.traits.map((t) => ({ ...t }));
    this.maxTp = MaxTpParser.read(rmmz.note);
    this.etypeId = rmmz.etypeId;

    const steal = StealParser.read(rmmz.note);
    this.lst = steal.lst;
    this.mst = steal.mst;
    this.tst = steal.tst;
  }

  public toRmmz(): RPG_Weapon
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
      iconIndex: this.iconIndex,
      description: this.description,
      price: this.price,
      wtypeId: this.wtypeId,
      animationId: this.animationId,
      params: [ ...this.params ],
      traits: this.traits.map((t) => ({ ...t })),
      etypeId: this.etypeId,
    };
  }

  protected syncNote(): string
  {
    let n = MaxTpParser.write(this.note, this.maxTp);
    n = StealParser.write(n, {
      lst: this.lst,
      mst: this.mst,
      tst: this.tst,
    });
    return n;
  }
}

export { RPG_WeaponDomainModel };
