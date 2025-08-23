import { Game_Trait } from "./Traits";
import { TraitMapper } from "./TraitMapper.tsx";
import RPG_Trait = Rmmz.Data.RPG_Trait;

class TraitManager
{
  static read(traits: RPG_Trait[]): Game_Trait[]
  {
    return traits.map(TraitMapper.toGameTrait);
  }

  static write(gameTraits: Game_Trait[]): RPG_Trait[]
  {
    return gameTraits.map(TraitMapper.toTrait);
  }
}

export { TraitManager }