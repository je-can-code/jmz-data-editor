import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import { StateJabsExtension } from '@core/domain/entities/jabs/StateJabsExtension.ts';
import { StateCritExtension } from '@core/domain/entities/state/StateCritExtension.ts';
import { StateDropsExtension } from '@core/domain/entities/state/StateDropsExtension.ts';
import { StateElemExtension } from '@core/domain/entities/state/StateElemExtension.ts';
import { StateLevelExtension } from '@core/domain/entities/state/StateLevelExtension.ts';
import { StateProfExtension } from '@core/domain/entities/state/StateProfExtension.ts';
import { StateResourcesExtension } from '@core/domain/entities/state/StateResourcesExtension.ts';
import { StateSdpExtension } from '@core/domain/entities/state/StateSdpExtension.ts';
import { StateSksExtension } from '@core/domain/entities/state/StateSksExtension.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';
import RPG_State = Rmmz.Implementations.RPG_State;
import RPG_Trait = Rmmz.Data.RPG_Trait;

/**
 * Domain model representing an RPG Maker MZ State.
 */
class RPG_StateDomainModel
  extends RPG_BaseDomainModel<RPG_State>
{
  /**
   * Index into {@code IconSet.png} ({@link Rmmz.Base.RPG_BaseItem.iconIndex}).
   */
  public iconIndex: number = 0;

  /**
   * Help text shown in the menu and status window ({@link Rmmz.Implementations.RPG_State.description}).
   */
  public description: string = '';

  /**
   * Action restriction while this state is active ({@link Rmmz.Implementations.RPG_State.restriction}).
   */
  public restriction: number = 0;

  /**
   * Sort key when multiple states apply ({@link Rmmz.Implementations.RPG_State.priority}).
   */
  public priority: number = 0;

  /**
   * Side-view battler motion ({@link Rmmz.Implementations.RPG_State.motion}).
   */
  public motion: number = 0;

  /**
   * Side-view state overlay graphic row ({@link Rmmz.Implementations.RPG_State.overlay}).
   */
  public overlay: number = 0;

  /**
   * Clears when battle ends ({@link Rmmz.Implementations.RPG_State.removeAtBattleEnd}).
   */
  public removeAtBattleEnd: boolean = false;

  /**
   * Clears when restriction is applied ({@link Rmmz.Implementations.RPG_State.removeByRestriction}).
   */
  public removeByRestriction: boolean = false;

  /**
   * When turn-based auto-removal runs ({@link Rmmz.Implementations.RPG_State.autoRemovalTiming}).
   */
  public autoRemovalTiming: number = 0;

  /**
   * Minimum duration in turns ({@link Rmmz.Implementations.RPG_State.minTurns}).
   */
  public minTurns: number = 1;

  /**
   * Maximum duration in turns ({@link Rmmz.Implementations.RPG_State.maxTurns}).
   */
  public maxTurns: number = 1;

  /**
   * Chance to clear on damage ({@link Rmmz.Implementations.RPG_State.removeByDamage}).
   */
  public removeByDamage: boolean = false;

  /**
   * Percent chance when {@link removeByDamage} is true ({@link Rmmz.Implementations.RPG_State.chanceByDamage}).
   */
  public chanceByDamage: number = 100;

  /**
   * Clears after walking on the map ({@link Rmmz.Implementations.RPG_State.removeByWalking}).
   */
  public removeByWalking: boolean = false;

  /**
   * Steps required when {@link removeByWalking} is true ({@link Rmmz.Implementations.RPG_State.stepsToRemove}).
   */
  public stepsToRemove: number = 100;

  /**
   * Battle log when an actor gains this state ({@link Rmmz.Implementations.RPG_State.message1}).
   */
  public message1: string = '';

  /**
   * Battle log when an enemy gains this state ({@link Rmmz.Implementations.RPG_State.message2}).
   */
  public message2: string = '';

  /**
   * Shown while the state lingers ({@link Rmmz.Implementations.RPG_State.message3}).
   */
  public message3: string = '';

  /**
   * Battle log when the state is removed ({@link Rmmz.Implementations.RPG_State.message4}).
   */
  public message4: string = '';

  /**
   * Passive effects while this state is active ({@link Rmmz.Base.RPG_Traited.traits}).
   */
  public traits: RPG_Trait[] = [];

  /**
   * J-ABS tags on {@link Rmmz.Implementations.RPG_State.note} ({@code negative}, ailment hooks).
   */
  public jabs: StateJabsExtension = new StateJabsExtension();

  public crit: StateCritExtension = new StateCritExtension();

  public drops: StateDropsExtension = new StateDropsExtension();

  public elem: StateElemExtension = new StateElemExtension();

  public level: StateLevelExtension = new StateLevelExtension();

  public prof: StateProfExtension = new StateProfExtension();

  public resources: StateResourcesExtension = new StateResourcesExtension();

  public sdp: StateSdpExtension = new StateSdpExtension();

  public sks: StateSksExtension = new StateSksExtension();

  constructor(rmmz: RPG_State)
  {
    super(rmmz);
    this.iconIndex = rmmz.iconIndex;
    this.description = rmmz.description;
    this.restriction = rmmz.restriction;
    this.priority = rmmz.priority;
    this.motion = rmmz.motion;
    this.overlay = rmmz.overlay;
    this.removeAtBattleEnd = rmmz.removeAtBattleEnd;
    this.removeByRestriction = rmmz.removeByRestriction;
    this.autoRemovalTiming = rmmz.autoRemovalTiming;
    this.minTurns = rmmz.minTurns;
    this.maxTurns = rmmz.maxTurns;
    this.removeByDamage = rmmz.removeByDamage;
    this.chanceByDamage = rmmz.chanceByDamage;
    this.removeByWalking = rmmz.removeByWalking;
    this.stepsToRemove = rmmz.stepsToRemove;
    this.message1 = rmmz.message1;
    this.message2 = rmmz.message2;
    this.message3 = rmmz.message3;
    this.message4 = rmmz.message4;
    this.traits = [ ...(rmmz.traits ?? []) ];

    const note = this.note;
    this.jabs = StateJabsExtension.fromStateNote(note);
    this.crit = StateCritExtension.fromStateNote(note);
    this.drops = StateDropsExtension.fromStateNote(note);
    this.elem = StateElemExtension.fromStateNote(note);
    this.level = StateLevelExtension.fromStateNote(note);
    this.prof = StateProfExtension.fromStateNote(note);
    this.resources = StateResourcesExtension.fromStateNote(note);
    this.sdp = StateSdpExtension.fromStateNote(note);
    this.sks = StateSksExtension.fromStateNote(note);
  }

  /**
   * Rebuilds {@link note} from all extension slices (call after mutating any slice in the editor).
   */
  public rebuildNoteFromExtensions(): void
  {
    this.note = this.syncNote();
  }

  public toRmmz(): RPG_State
  {
    return {
      ...this._original,
      id: this.id,
      name: this.name,
      note: this.syncNote(),
      iconIndex: this.iconIndex,
      description: this.description,
      restriction: this.restriction,
      priority: this.priority,
      motion: this.motion,
      overlay: this.overlay,
      removeAtBattleEnd: this.removeAtBattleEnd,
      removeByRestriction: this.removeByRestriction,
      autoRemovalTiming: this.autoRemovalTiming,
      minTurns: this.minTurns,
      maxTurns: this.maxTurns,
      removeByDamage: this.removeByDamage,
      chanceByDamage: this.chanceByDamage,
      removeByWalking: this.removeByWalking,
      stepsToRemove: this.stepsToRemove,
      message1: this.message1,
      message2: this.message2,
      message3: this.message3,
      message4: this.message4,
      traits: [ ...this.traits ],
    };
  }

  protected syncNote(): string
  {
    let n = this.note;
    n = this.crit.applyToNote(n);
    n = this.drops.applyToNote(n);
    n = this.elem.applyToNote(n);
    n = this.level.applyToNote(n);
    n = this.prof.applyToNote(n);
    n = this.resources.applyToNote(n);
    n = this.sdp.applyToNote(n);
    n = this.sks.applyToNote(n);
    n = this.jabs.applyToNote(n);
    return NoteNormalizer.normalize(n);
  }
}

export { RPG_StateDomainModel };
