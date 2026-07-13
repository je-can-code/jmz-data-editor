import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import { MaxTpParser } from '@services/parsers/MaxTpParser.ts';
import { StealParser } from '@services/parsers/StealParser.ts';
import RPG_Armor = Rmmz.Implementations.RPG_Armor;
import RPG_Trait = Rmmz.Data.RPG_Trait;

class RPG_ArmorDomainModel
  extends RPG_BaseDomainModel<RPG_Armor>
{
  public iconIndex: number;
  public description: string;
  public price: number;
  public atypeId: number;
  public etypeId: number;
  public params: number[];
  public traits: RPG_Trait[];
  public maxTp: number;

  /** J-Resources-ABS {@code <lst:N>} — integer percent life steal; signed. */
  public lst: number;

  /** J-Resources-ABS {@code <mst:N>} — integer percent magi steal; signed. */
  public mst: number;

  /** J-Resources-ABS {@code <tst:N>} — integer percent tech steal; signed. */
  public tst: number;

  constructor(rmmz: RPG_Armor)
  {
    super(rmmz);
    this.iconIndex = rmmz.iconIndex;
    this.description = rmmz.description;
    this.price = rmmz.price;
    this.atypeId = rmmz.atypeId;
    this.etypeId = rmmz.etypeId;
    this.params = [ ...rmmz.params ];
    this.traits = rmmz.traits.map((t) => ({ ...t }));
    this.maxTp = MaxTpParser.read(rmmz.note);

    const steal = StealParser.read(rmmz.note);
    this.lst = steal.lst;
    this.mst = steal.mst;
    this.tst = steal.tst;
  }

  public toRmmz(): RPG_Armor
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
      iconIndex: this.iconIndex,
      description: this.description,
      price: this.price,
      atypeId: this.atypeId,
      etypeId: this.etypeId,
      params: [ ...this.params ],
      traits: this.traits.map((t) => ({ ...t })),
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

export { RPG_ArmorDomainModel };
