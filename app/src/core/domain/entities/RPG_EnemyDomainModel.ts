import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import RPG_Trait = Rmmz.Data.RPG_Trait;
import RPG_DropItem = Rmmz.Data.RPG_DropItem;
import { LevelParser } from '@services/parsers/LevelParser.ts';
import { SdpParser } from '@services/parsers/SdpParser.ts';
import { ExtraDropManager } from '@services/parsers/ExtraDropParser.ts';
import { JabsDataParser } from '@services/parsers/JabsDataParser.ts';
import { MaxTpParser } from '@services/parsers/MaxTpParser.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';
import { EnemySdpDropModel } from '@core/domain/valueObjects/sdp-drop.ts';
import { knownLongParams } from '../../../mappers/ParameterIdMapper.ts';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import { PassiveAbsEnemyNoteParser } from '@services/parsers/PassiveAbsEnemyNoteParser.ts';
import { JabsAiTraits } from '@core/domain/valueObjects/jabs-ai-traits.ts';
import { JabsBattlerData } from '@core/domain/valueObjects/jabs-battler-data.ts';
import { JabsConfigs } from '@core/domain/valueObjects/jabs-configs.ts';
import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';

class RPG_EnemyDomainModel
  extends RPG_BaseDomainModel<RPG_Enemy>
{
  // Explicitly tracked Core properties
  public readonly id: number;
  public name: string;
  public exp: number;
  public gold: number;
  public params: number[];
  public traits: RPG_Trait[];
  public note: string;

  // Derived/Parsed properties from Note tags
  public level: number;
  public maxTp: number;
  public sdpPoints: number;
  public extraDrops: RPG_DropItem[];
  public jabsAiTraits: JabsAiTraits;
  public jabsBattlerData: JabsBattlerData;
  public jabsConfigs: JabsConfigs;
  public jabsTeamId: number | null;
  public sdpDrop: EnemySdpDropModel;
  public growths: Map<number, string> = new Map();

  /** When true, random passive prefix affixes are skipped for this enemy. */
  public noRngPassivePrefixes: boolean = false;

  /** When true, random passive suffix affixes are skipped for this enemy. */
  public noRngPassiveSuffixes: boolean = false;

  /**
   * Optional 0–100 override for the prefix affix roll gate; {@code null} means omit the tag (engine default at roll time).
   */
  public passiveAffixPrefixChance: number | null = null;

  /**
   * Optional 0–100 override for the suffix affix roll gate; {@code null} means omit the tag.
   */
  public passiveAffixSuffixChance: number | null = null;

  constructor(rmmz: RPG_Enemy)
  {
    super(rmmz);

    this.id = rmmz.id;
    this.name = rmmz.name;
    this.exp = rmmz.exp;
    this.gold = rmmz.gold;
    this.params = [ ...rmmz.params ];
    this.traits = [ ...rmmz.traits ];
    this.note = rmmz.note;

    this.note = NoteNormalizer.normalize(rmmz.note);

    // Parse note-based data upfront
    this.level = LevelParser.read({
      ...rmmz,
      note: this.note
    });
    this.maxTp = MaxTpParser.read(this.note);
    this.sdpPoints = SdpParser.readPoints(this.note) ?? 0;

    const parsedDrop = SdpParser.readDrop(this.note);
    this.sdpDrop = new EnemySdpDropModel(
      parsedDrop?.key ?? '',
      parsedDrop?.dropChance ?? 0,
      parsedDrop !== null
    );
    this.extraDrops = ExtraDropManager.read(this.note);
    this.jabsAiTraits = JabsDataParser.readAiTraits(this.note);
    this.jabsBattlerData = JabsDataParser.readBattlerData(this.note);
    this.jabsConfigs = JabsDataParser.readConfigs(this.note);
    this.jabsTeamId = JabsDataParser.readTeamId(this.note);

    const passiveAbsFlags = PassiveAbsEnemyNoteParser.read(this.note);
    this.noRngPassivePrefixes = passiveAbsFlags.noRngPassivePrefixes;
    this.noRngPassiveSuffixes = passiveAbsFlags.noRngPassiveSuffixes;
    this.passiveAffixPrefixChance = passiveAbsFlags.passiveAffixPrefixChance;
    this.passiveAffixSuffixChance = passiveAbsFlags.passiveAffixSuffixChance;

    this.rehydrateGrowthsFromNote();
  }

  /**
   * Refills {@link growths} from {@link note} via {@link GrowthParser} (BuffPlus / reward Plus lines).
   */
  public rehydrateGrowthsFromNote(): void
  {
    knownLongParams()
      .forEach((param) =>
      {
        const formula = GrowthParser.read(this.note, param);
        this.growths.set(param.longParamId, formula);
      });
  }

  /**
   * Converts the domain model back into the Rmmz format for saving.
   * Leverages the original object to fill in fields not explicitly handled by the editor.
   */
  public toRmmz(): RPG_Enemy
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      exp: this.exp,
      gold: this.gold,
      params: [ ...this.params ],
      traits: [ ...this.traits ],
      note: this.syncNote(),
    };
  }

  protected syncNote(): string
  {
    let updatedNote = this.note; // Start with the normalized note

    // Pass the note through each specialized parser to update its tags
    updatedNote = LevelParser.write(updatedNote, this.level);
    updatedNote = MaxTpParser.write(updatedNote, this.maxTp);

    if (this.sdpPoints > 0)
    {
      updatedNote = SdpParser.writePoints(updatedNote, this.sdpPoints);
    }
    else
    {
      updatedNote = SdpParser.deletePoints(updatedNote);
    }

    if (this.sdpDrop.key.trim() !== '')
    {
      updatedNote = SdpParser.writeDrop(updatedNote, this.sdpDrop);
    }

    updatedNote = ExtraDropManager.write(updatedNote, this.extraDrops);
    updatedNote = JabsDataParser.writeAiTraits(updatedNote, this.jabsAiTraits);
    updatedNote = JabsDataParser.writeBattlerData(updatedNote, this.jabsBattlerData);
    updatedNote = JabsDataParser.writeTeamId(updatedNote, this.jabsTeamId);
    updatedNote = JabsDataParser.writeConfigs(updatedNote, this.jabsConfigs);

    updatedNote = PassiveAbsEnemyNoteParser.write(updatedNote, {
      noRngPassivePrefixes: this.noRngPassivePrefixes,
      noRngPassiveSuffixes: this.noRngPassiveSuffixes,
      passiveAffixPrefixChance: this.passiveAffixPrefixChance,
      passiveAffixSuffixChance: this.passiveAffixSuffixChance,
    });

    // Sync formulas for each parameter
    knownLongParams()
      .forEach(param =>
      {
        const formula = this.growths.get(param.longParamId) ?? '';
        updatedNote = GrowthParser.write(updatedNote, param, formula);
      });

    return updatedNote;
  }
}

export { RPG_EnemyDomainModel };
