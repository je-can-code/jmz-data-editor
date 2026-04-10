interface SdpDropData
{
  key: string;
  dropChance: number;
  isForcedOpen?: boolean;
}

class EnemySdpDropModel
  implements SdpDropData
{
  public key: string;
  public dropChance: number;
  public isForcedOpen: boolean;

  constructor(
    key: string = '',
    dropChance: number = 0,
    isForcedOpen: boolean = false
  )
  {
    this.key = key;
    this.dropChance = dropChance;
    this.isForcedOpen = isForcedOpen;
  }
}

export {
  EnemySdpDropModel,
  SdpDropData
};
