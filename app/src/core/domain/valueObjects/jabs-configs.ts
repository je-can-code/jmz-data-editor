enum JabsConfig
{
  NoIdle = 'noIdle',
  CanIdle = 'canIdle',
  NoHpBar = 'noHpBar',
  ShowHpBar = 'showHpBar',
  Inanimate = 'inanimate',
  NotInanimate = 'notInanimate',
  Invincible = 'invincible',
  NotInvincible = 'notInvincible',
  NoName = 'noName',
  ShowName = 'showName',
}

interface JabsConfigsData
{
  noIdle: boolean;
  canIdle: boolean;
  noHpBar: boolean;
  showHpBar: boolean;
  inanimate: boolean;
  notInanimate: boolean;
  invincible: boolean;
  notInvincible: boolean;
  noName: boolean;
  showName: boolean;
}

const configExclusions: Partial<Record<keyof JabsConfigsData, keyof JabsConfigsData>> = {
  noIdle: 'canIdle',
  canIdle: 'noIdle',
  noHpBar: 'showHpBar',
  showHpBar: 'noHpBar',
  inanimate: 'notInanimate',
  notInanimate: 'inanimate',
  invincible: 'notInvincible',
  notInvincible: 'invincible',
  noName: 'showName',
  showName: 'noName',
};

class JabsConfigs
  implements JabsConfigsData
{
  public noIdle: boolean = false;
  public canIdle: boolean = false;
  public noHpBar: boolean = false;
  public showHpBar: boolean = false;
  public inanimate: boolean = false;
  public notInanimate: boolean = false;
  public invincible: boolean = false;
  public notInvincible: boolean = false;
  public noName: boolean = false;
  public showName: boolean = false;

  constructor(data?: Partial<JabsConfigsData>)
  {
    if (data)
    {
      Object.assign(this, data);
    }
  }

  /**
   * Business Logic: Updates a specific config and enforces mutual exclusivity rules.
   */
  public updateConfig(
    configName: keyof JabsConfigsData,
    checked: boolean
  ): void
  {
    this[ configName ] = checked;

    if (checked)
    {
      const exclusivePartner = configExclusions[ configName ];
      if (exclusivePartner)
      {
        this[ exclusivePartner ] = false;
      }
    }
  }
}

export {
  JabsConfig,
  JabsConfigsData,
  JabsConfigs
};
