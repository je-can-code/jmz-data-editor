enum EnemyBaseParam
{
  MaxHp = 0,
  MaxMp = 1,
  Attack = 2,
  Defense = 3,
  MAttack = 4,
  MDefense = 5,
  Speed = 6,
  Luck = 7,
}

enum EnemySpParam
{
  Aggro = 0,
  Parry = 1,
  RecoveryRate = 2,
  PharmacyRate = 3,
  MagicCostRate = 4,
  TechCostRate = 5,
  PhysicalDamageRate = 6,
  MagicalDamageRate = 7,
  FloorDamageRate = 8,
  ExperienceRate = 9,
}

enum EnemyExParam
{
  HitRate = 0,
  EvadeRate = 1,
  CritRate = 2,
  CritEvadeRate = 3,
  MagicEvadeRate = 4,
  MagicReflectRate = 5,
  Counter = 6,
  HpRegen = 7,
  MpRegen = 8,
  TpRegen = 9,
}

export {
  EnemyBaseParam,
  EnemySpParam,
  EnemyExParam
};
