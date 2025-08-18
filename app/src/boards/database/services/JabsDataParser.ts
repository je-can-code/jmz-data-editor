class JabsDataParser
{
  static #aiTraitKey = (trait: JabsAiTrait) => `<aiTrait:${trait}>`;
  static #configKey = (config: JabsConfig) => `<jabsConfig:${config}>`;

  static #aiTraitRegex = /<aiTrait: ?(careful|executor|reckless|healer|leader|follower)>/i;
  static #configRegex = /<jabsConfig: ?(noIdle|canIdle|noHpBar|showHpBar|inanimate|notInanimate|invincible|notInvincible|noName|showName)>/i;

  static #sightRegex = /<sight: ?(\d+)>/i;
  static #pursuitRegex = /<pursuit: ?(\d+)>/i;
  static #prepareSpeedRegex = /<prepare: ?(\d+)>/i;
  static #alertDurationRegex = /<alertDuration: ?(\d+)>/i;
  static #alertSightBoostRegex = /<alertedSightBoost: ?(\d+)>/i;
  static #alertPursuitBoostRegex = /<alertedPursuitBoost: ?(\d+)>/i;

  static readAiTraits(originalNote: string): JabsAiTraits
  {
    // Initialize all traits as false by default
    const traits = {
      careful: false,
      executor: false,
      reckless: false,
      healer: false,
      leader: false,
      follower: false
    } as JabsAiTraits;

    // Get all lines from the note
    const lines = originalNote.split(/[\r\n]+/);

    // Check each line for AI traits
    lines.forEach(line =>
    {
      // Reset the regex index for reuse
      this.#aiTraitRegex.lastIndex = 0;

      // Check if this line matches the AI trait regex
      const match = this.#aiTraitRegex.exec(line);
      if (match)
      {
        // Extract the trait name from the match
        const [ , traitName ] = match;

        // Set the corresponding trait to true if it exists in our traits object
        if (traitName && traitName.toLowerCase() in traits)
        {
          traits[traitName.toLowerCase() as keyof JabsAiTraits] = true;
        }
      }
    });

    return traits;
  }

  static writeAiTraits(originalNote: string, traits: JabsAiTraits): string
  {
    // Get all lines from the note
    const lines = originalNote.split(/[\r\n]+/);

    // Reset the regex before using it
    this.#aiTraitRegex.lastIndex = 0;

    // Filter out any existing AI trait lines
    const filteredLines = lines.filter(line =>
    {
      this.#aiTraitRegex.lastIndex = 0; // Reset for each line

      return !this.#aiTraitRegex.test(line);
    });

    // Create new lines for each active trait
    const traitLines: string[] = [];

    // Add lines for each active trait
    if (traits.careful) traitLines.push(this.#aiTraitKey(JabsAiTrait.Careful));
    if (traits.executor) traitLines.push(this.#aiTraitKey(JabsAiTrait.Executor));
    if (traits.reckless) traitLines.push(this.#aiTraitKey(JabsAiTrait.Reckless));
    if (traits.healer) traitLines.push(this.#aiTraitKey(JabsAiTrait.Healer));
    if (traits.leader) traitLines.push(this.#aiTraitKey(JabsAiTrait.Leader));
    if (traits.follower) traitLines.push(this.#aiTraitKey(JabsAiTrait.Follower));

    // Combine the filtered lines with the new trait lines
    const updatedLines = [ ...filteredLines, ...traitLines ];

    // Join the lines back into a single note string
    return updatedLines.join('\n');
  }

  static readBattlerData(originalNote: string): JabsBattlerData
  {
    // Initialize battler data with default values
    const battlerData = {
      sight: 0,
      pursuit: 0,
      prepareSpeed: 0,
      alertDuration: 0,
      alertSightBoost: 0,
      alertPursuitBoost: 0,
    } as JabsBattlerData;

    // Get all lines from the note
    const lines = originalNote.split(/[\r\n]+/);

    // Check each line for battler data
    lines.forEach(line =>
    {
      // Check for sight value
      this.#sightRegex.lastIndex = 0;
      let match = this.#sightRegex.exec(line);
      if (match)
      {
        battlerData.sight = Number(match[1]);
      }

      // Check for pursuit value
      this.#pursuitRegex.lastIndex = 0;
      match = this.#pursuitRegex.exec(line);
      if (match)
      {
        battlerData.pursuit = Number(match[1]);
      }

      // Check for prepare speed value
      this.#prepareSpeedRegex.lastIndex = 0;
      match = this.#prepareSpeedRegex.exec(line);
      if (match)
      {
        battlerData.prepareSpeed = Number(match[1]);
      }

      // Check for alert duration value
      this.#alertDurationRegex.lastIndex = 0;
      match = this.#alertDurationRegex.exec(line);
      if (match)
      {
        battlerData.alertDuration = Number(match[1]);
      }

      // Check for alert sight boost value
      this.#alertSightBoostRegex.lastIndex = 0;
      match = this.#alertSightBoostRegex.exec(line);
      if (match)
      {
        battlerData.alertSightBoost = Number(match[1]);
      }

      // Check for alert pursuit boost value
      this.#alertPursuitBoostRegex.lastIndex = 0;
      match = this.#alertPursuitBoostRegex.exec(line);
      if (match)
      {
        battlerData.alertPursuitBoost = Number(match[1]);
      }
    });

    return battlerData;
  }

  static writeBattlerData(originalNote: string, jabsBattlerData: JabsBattlerData): string
  {
    // Get all lines from the note
    const lines = originalNote.split(/[\r\n]+/);

    // Filter out any existing battler data lines
    const filteredLines = lines.filter(line =>
    {
      this.#sightRegex.lastIndex = 0;
      this.#pursuitRegex.lastIndex = 0;
      this.#prepareSpeedRegex.lastIndex = 0;
      this.#alertDurationRegex.lastIndex = 0;
      this.#alertSightBoostRegex.lastIndex = 0;
      this.#alertPursuitBoostRegex.lastIndex = 0;

      return !(
        this.#sightRegex.test(line) ||
        this.#pursuitRegex.test(line) ||
        this.#prepareSpeedRegex.test(line) ||
        this.#alertDurationRegex.test(line) ||
        this.#alertSightBoostRegex.test(line) ||
        this.#alertPursuitBoostRegex.test(line)
      );
    });

    // Create new lines for battler data
    const battlerDataLines: string[] = [];

    // Add lines for each battler data property (only if value is greater than 0)
    if (jabsBattlerData.sight > 0) battlerDataLines.push(`<sight:${jabsBattlerData.sight}>`);
    if (jabsBattlerData.pursuit > 0) battlerDataLines.push(`<pursuit:${jabsBattlerData.pursuit}>`);
    if (jabsBattlerData.prepareSpeed > 0) battlerDataLines.push(`<prepare:${jabsBattlerData.prepareSpeed}>`);
    if (jabsBattlerData.alertDuration > 0) battlerDataLines.push(`<alertDuration:${jabsBattlerData.alertDuration}>`);
    if (jabsBattlerData.alertSightBoost > 0) battlerDataLines.push(`<alertedSightBoost:${jabsBattlerData.alertSightBoost}>`);
    if (jabsBattlerData.alertPursuitBoost > 0) battlerDataLines.push(`<alertedPursuitBoost:${jabsBattlerData.alertPursuitBoost}>`);

    // Combine the filtered lines with the new battler data lines
    const updatedLines = [ ...filteredLines, ...battlerDataLines ];

    // Join the lines back into a single note string
    return updatedLines.join('\n');
  }

  static readConfigs(originalNote: string): JabsConfigs
  {
    // Initialize all configs as false by default
    const configs = {
      noIdle: false,
      canIdle: false,
      noHpBar: false,
      showHpBar: false,
      inanimate: false,
      notInanimate: false,
      invincible: false,
      notInvincible: false,
      noName: false,
      showName: false
    } as JabsConfigs;

    // Get all lines from the note
    const lines = originalNote.split(/[\r\n]+/);

    // Check each line for configs
    lines.forEach(line =>
    {
      // Reset the regex index for reuse
      this.#configRegex.lastIndex = 0;

      // Check if this line matches the config regex
      const match = this.#configRegex.exec(line);
      if (match)
      {
        // Extract the config name from the match
        const [ , configName ] = match;

        // Set the corresponding config to true if it exists in our configs object
        if (configName && configName.toLowerCase() in configs)
        {
          configs[configName.toLowerCase() as keyof JabsConfigs] = true;
        }
      }
    });

    return configs;
  }

  static writeConfigs(originalNote: string, configs: JabsConfigs): string
  {
    // Get all lines from the note
    const lines = originalNote.split(/[\r\n]+/);

    // Reset the regex before using it
    this.#configRegex.lastIndex = 0;

    // Filter out any existing config lines
    const filteredLines = lines.filter(line =>
    {
      this.#configRegex.lastIndex = 0; // Reset for each line

      return !this.#configRegex.test(line);
    });

    // Create new lines for each active config
    const configLines: string[] = [];

    // Add lines for each active config
    if (configs.noIdle) configLines.push(this.#configKey(JabsConfig.NoIdle));
    if (configs.canIdle) configLines.push(this.#configKey(JabsConfig.CanIdle));
    if (configs.noHpBar) configLines.push(this.#configKey(JabsConfig.NoHpBar));
    if (configs.showHpBar) configLines.push(this.#configKey(JabsConfig.ShowHpBar));
    if (configs.inanimate) configLines.push(this.#configKey(JabsConfig.Inanimate));
    if (configs.notInanimate) configLines.push(this.#configKey(JabsConfig.NotInanimate));
    if (configs.invincible) configLines.push(this.#configKey(JabsConfig.Invincible));
    if (configs.notInvincible) configLines.push(this.#configKey(JabsConfig.NotInvincible));
    if (configs.noName) configLines.push(this.#configKey(JabsConfig.NoName));
    if (configs.showName) configLines.push(this.#configKey(JabsConfig.ShowName));

    // Combine the filtered lines with the new config lines
    const updatedLines = [ ...filteredLines, ...configLines ];

    // Join the lines back into a single note string
    return updatedLines.join('\n');
  }
}

interface JabsBattlerData
{
  sight: number;
  pursuit: number;
  prepareSpeed: number;
  alertDuration: number;
  alertSightBoost: number;
  alertPursuitBoost: number;
}

enum JabsConfig
{
  NoIdle = "noIdle",
  CanIdle = "canIdle",
  NoHpBar = "noHpBar",
  ShowHpBar = "showHpBar",
  Inanimate = "inanimate",
  NotInanimate = "notInanimate",
  Invincible = "invincible",
  NotInvincible = "notInvincible",
  NoName = "noName",
  ShowName = "showName",
}

interface JabsConfigs
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

enum JabsAiTrait
{
  Careful = "careful",
  Executor = "executor",
  Reckless = "reckless",
  Healer = "healer",
  Leader = "leader",
  Follower = "follower",
}

interface JabsAiTraits
{
  careful: boolean;
  executor: boolean;
  reckless: boolean;
  healer: boolean;
  leader: boolean;
  follower: boolean;
}

export { JabsDataParser, JabsBattlerData, JabsConfigs, JabsAiTraits, JabsConfig, JabsAiTrait }