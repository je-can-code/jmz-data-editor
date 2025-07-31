import RPG_Trait = Rmmz.Data.RPG_Trait;

interface Game_Trait
  extends RPG_Trait
{
  codeName: string;
  dataName: string;
  valueString: string;
}

export { Game_Trait }