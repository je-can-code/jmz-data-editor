import type { ContextBudget, ContextClaim } from './ContextBudget.ts';

/**
 * What a keeper drives: the renderer's GPU side, which it makes once, lets go of while the view is hidden, and asks
 * back for when the view shows again or the browser took it.
 */
type ContextDriver = {
  /**
   * Makes the context and starts the renderer on it, the first time the view shows.
   * @returns {Promise<void>} Settles once it can draw; rejects when this window cannot draw with WebGL at all.
   */
  create(): Promise<void>;

  /**
   * Lets go of the live context on purpose, which frees its place in the process at once. The canvas's context-lost
   * event follows, and {@link ContextKeeper.contextLost} must hear it.
   * @returns {boolean} True when the context is on its way out; false when the browser offers no way to let go of it.
   */
  release(): boolean;

  /**
   * Asks the browser for the lost context back. The canvas's context-restored event follows once it is back, and
   * {@link ContextKeeper.contextRestored} must hear it.
   */
  restore(): void;

  /**
   * Starts drawing on a context that has just come up, drawing everything afresh.
   */
  resume(): void;

  /**
   * Stops drawing, as the context goes.
   */
  suspend(): void;
};

/**
 * Where a view's drawing stands, for whatever shows the view:
 * - hidden: not on screen, and holding no context;
 * - starting: on screen, its context being made, or given back after the view was hidden;
 * - drawing: on screen and drawing;
 * - waiting: on screen, but every context the window may keep is taken by other views on screen;
 * - recovering: on screen, its context taken by the browser and on its way back;
 * - failed: this window cannot draw with WebGL at all.
 */
type DrawState = 'hidden' | 'starting' | 'drawing' | 'waiting' | 'recovering' | 'failed';

/**
 * Where the context itself is: never made, being made, live, let go of and not yet gone, gone, being given back, or
 * never to be had.
 */
type ContextStage = 'none' | 'creating' | 'live' | 'losing' | 'lost' | 'restoring' | 'failed';

/**
 * Runs a callback after a delay.
 * @param {() => void} callback What to run.
 * @param {number} delayMs How long to wait, in milliseconds.
 * @returns {() => void} Cancels it.
 */
type Schedule = (callback: () => void, delayMs: number) => () => void;

/**
 * What a keeper needs besides its driver.
 */
type ContextKeeperOptions = {
  /**
   * The contexts this view shares with every other view of the window.
   */
  readonly budget: ContextBudget;

  /**
   * Runs a callback after a delay; the window's timers in the renderer.
   */
  readonly schedule: Schedule;

  /**
   * The clock, in milliseconds.
   */
  readonly now: () => number;
};

/**
 * How long a context the browser took waits before it is asked back, the first time.
 */
const FIRST_RECOVERY_DELAY_MS = 100;

/**
 * The longest a context the browser keeps taking waits before it is asked back again.
 */
const MAX_RECOVERY_DELAY_MS = 3200;

/**
 * How long a loss is remembered: one within this long of the last waits twice as long as the last did.
 */
const LOSS_MEMORY_MS = 10_000;

/**
 * How long a context asked back may take to come back before it is asked again.
 */
const RESTORE_WAIT_MS = 2000;

/**
 * Keeps one map view's WebGL context, so that any number of maps can be open while only the ones on screen hold a
 * context: Chromium keeps a fixed number alive per process and takes the oldest away past it (see
 * {@link ContextBudget}). A view that goes behind another tab lets its context go at once and asks for it back when it
 * shows again, keeping everything else it holds, the camera included. A view whose context the browser takes anyway
 * (too many contexts in the process, or the GPU resetting) asks for it back on its own after a short pause, which
 * doubles while the losses keep coming, so views never fight over the last contexts in a loop. And a view shown when
 * every context is taken waits its turn, saying so through its draw state, rather than taking one from a view still
 * on screen.
 *
 * Nothing here touches the GPU. The renderer hands it a driver, tells it when the view shows and hides, and passes on
 * the canvas's context-lost and context-restored events once the browser has finished dispatching them, since a lost
 * context can be asked back only after its lost event has been handled.
 */
class ContextKeeper
{
  #driver: ContextDriver;

  #budget: ContextBudget;

  #schedule: Schedule;

  #now: () => number;

  #visible = false;

  #destroyed = false;

  #claim: ContextClaim | null = null;

  #context: ContextStage = 'none';

  #drawing = false;

  #unexpected = false;

  #recoveryDelay = FIRST_RECOVERY_DELAY_MS;

  #lastLossAt = Number.NEGATIVE_INFINITY;

  #heldUntil = 0;

  #cancelTimer: (() => void) | null = null;

  #state: DrawState = 'hidden';

  #listeners = new Set<(state: DrawState) => void>();

  /**
   * @param {ContextDriver} driver The renderer's GPU side.
   * @param {ContextKeeperOptions} options The shared budget, the timers and the clock.
   */
  constructor(driver: ContextDriver, options: ContextKeeperOptions)
  {
    this.#driver = driver;
    this.#budget = options.budget;
    this.#schedule = options.schedule;
    this.#now = options.now;
  }

  /**
   * Where the view's drawing stands.
   * @returns {DrawState} The state.
   */
  get state(): DrawState
  {
    return this.#state;
  }

  /**
   * Listens for the draw state changing.
   * @param {(state: DrawState) => void} listener Called with each new state.
   * @returns {() => void} Stops listening.
   */
  onStateChange(listener: (state: DrawState) => void): () => void
  {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * The view is on screen: it takes a context when one is free, making it the first time and asking for it back
   * after that, and waits its turn otherwise.
   */
  show(): void
  {
    this.#visible = true;
    this.#reconcile();
  }

  /**
   * The view is off screen, behind another tab: it lets its context go and gives its place to a view waiting for one.
   */
  hide(): void
  {
    this.#visible = false;
    this.#reconcile();
  }

  /**
   * Hears the canvas's context-lost event, once the browser has finished dispatching it: either the loss this keeper
   * asked for, or the browser taking the context.
   */
  contextLost(): void
  {
    if (this.#destroyed)
    {
      return;
    }

    this.#stopDrawing();
    const asked = this.#context === 'losing';
    this.#context = 'lost';
    if (asked === false)
    {
      // the browser took it: asked back after a pause, while the view shows.
      this.#unexpected = true;
      this.#holdRecovery();
    }

    this.#reconcile();
  }

  /**
   * Hears the canvas's context-restored event: the context is back, fresh and empty, for the renderer to draw on
   * again, or to let go of again if the view hid meanwhile.
   */
  contextRestored(): void
  {
    if (this.#destroyed)
    {
      return;
    }

    this.#clearTimer();
    this.#context = 'live';
    this.#reconcile();
  }

  /**
   * Stops keeping the context, giving back the view's place. The renderer lets go of the context itself.
   */
  destroy(): void
  {
    this.#destroyed = true;
    this.#clearTimer();
    this.#releaseClaim();
    this.#listeners.clear();
  }

  /**
   * Brings the context in line with whether the view shows, then tells the listeners where the drawing stands.
   */
  #reconcile(): void
  {
    if (this.#destroyed)
    {
      return;
    }

    if (this.#visible && this.#context !== 'failed')
    {
      this.#pursue();
    }
    else
    {
      this.#retreat();
    }

    this.#announce();
  }

  /**
   * Works toward drawing: a place in the budget first, then the context, made or asked back, then drawing on it.
   */
  #pursue(): void
  {
    if (this.#claim === null)
    {
      this.#claim = this.#budget.request(() => this.#reconcile());
    }

    if (this.#claim.isGranted === false)
    {
      // a context the browser gave back by itself while the view waits its turn goes again, keeping the count true.
      this.#dropContext();
      return;
    }

    switch (this.#context)
    {
      case 'none':
        this.#create();
        break;
      case 'lost':
        // a context the browser took waits out its pause first.
        if (this.#now() >= this.#heldUntil)
        {
          this.#restore();
        }

        break;
      case 'live':
        this.#startDrawing();
        break;
      default:
        // being made, let go of, or given back: the event that ends it carries on from here.
        break;
    }
  }

  /**
   * Works toward holding nothing: lets the context go, then gives back the place in the budget once nothing of the
   * context is left in the process or on its way back into it.
   */
  #retreat(): void
  {
    if (this.#context === 'lost')
    {
      // a view shown again asks for its context back at once.
      this.#clearTimer();
      this.#heldUntil = 0;
    }

    this.#dropContext();
    const occupying = this.#context === 'creating' || this.#context === 'restoring' || this.#context === 'live';
    if (occupying === false)
    {
      this.#releaseClaim();
    }
  }

  /**
   * Makes the context for the first time.
   */
  #create(): void
  {
    this.#context = 'creating';
    this.#driver.create().then(
      () =>
      {
        // a context the browser took while it was being made stays lost, to be asked back like any other.
        if (this.#context === 'creating')
        {
          this.#context = 'live';
        }

        this.#reconcile();
      },
      () =>
      {
        this.#context = 'failed';
        this.#reconcile();
      },
    );
  }

  /**
   * Asks for a lost context back, and asks again, after a pause, if it has not come back in time.
   */
  #restore(): void
  {
    // the wait starts first, so a context that comes back before the driver returns finds it there to cancel.
    this.#context = 'restoring';
    this.#setTimer(RESTORE_WAIT_MS, () =>
    {
      this.#context = 'lost';
      this.#unexpected = true;
      this.#holdRecovery();
      this.#reconcile();
    });
    this.#driver.restore();
  }

  /**
   * Starts drawing on the live context, unless already drawing.
   */
  #startDrawing(): void
  {
    if (this.#drawing)
    {
      return;
    }

    this.#drawing = true;
    this.#unexpected = false;
    this.#driver.resume();
  }

  /**
   * Stops drawing, unless already stopped.
   */
  #stopDrawing(): void
  {
    if (this.#drawing === false)
    {
      return;
    }

    this.#drawing = false;
    this.#driver.suspend();
  }

  /**
   * Lets go of a live context. A browser that offers no way to let go of one leaves it live, still counted.
   */
  #dropContext(): void
  {
    if (this.#context !== 'live')
    {
      return;
    }

    this.#stopDrawing();
    if (this.#driver.release())
    {
      this.#context = 'losing';
    }
  }

  /**
   * Holds back asking for a context the browser took: a short pause the first time, twice as long as the last each
   * time it happens again soon after, up to a limit.
   */
  #holdRecovery(): void
  {
    const now = this.#now();
    this.#recoveryDelay = now - this.#lastLossAt < LOSS_MEMORY_MS
      ? Math.min(MAX_RECOVERY_DELAY_MS, this.#recoveryDelay * 2)
      : FIRST_RECOVERY_DELAY_MS;
    this.#lastLossAt = now;
    this.#heldUntil = now + this.#recoveryDelay;

    // the timer ends the pause itself, so a timer that fires a hair early still asks.
    this.#setTimer(this.#recoveryDelay, () =>
    {
      this.#heldUntil = 0;
      this.#reconcile();
    });
  }

  /**
   * Gives back the view's place in the budget, or its place in line.
   */
  #releaseClaim(): void
  {
    this.#claim?.release();
    this.#claim = null;
  }

  /**
   * Runs a callback after a delay, in place of any timer already running.
   * @param {number} delayMs How long to wait.
   * @param {() => void} callback What to run.
   */
  #setTimer(delayMs: number, callback: () => void): void
  {
    this.#clearTimer();
    this.#cancelTimer = this.#schedule(() =>
    {
      this.#cancelTimer = null;
      callback();
    }, delayMs);
  }

  /**
   * Cancels the running timer, if any.
   */
  #clearTimer(): void
  {
    this.#cancelTimer?.();
    this.#cancelTimer = null;
  }

  /**
   * Works out where the drawing stands, and tells the listeners when that changed.
   */
  #announce(): void
  {
    const next = this.#drawState();
    if (next === this.#state)
    {
      return;
    }

    this.#state = next;
    this.#listeners.forEach(listener => listener(next));
  }

  /**
   * Works out where the drawing stands from where the view, its claim and its context are.
   * @returns {DrawState} The state.
   */
  #drawState(): DrawState
  {
    if (this.#context === 'failed')
    {
      return 'failed';
    }

    if (this.#visible === false)
    {
      return 'hidden';
    }

    if (this.#claim === null || this.#claim.isGranted === false)
    {
      return 'waiting';
    }

    if (this.#context === 'live')
    {
      return 'drawing';
    }

    return this.#unexpected
      ? 'recovering'
      : 'starting';
  }
}

export {
  ContextKeeper,
  FIRST_RECOVERY_DELAY_MS,
  LOSS_MEMORY_MS,
  MAX_RECOVERY_DELAY_MS,
  RESTORE_WAIT_MS,
};
export type { ContextDriver, ContextKeeperOptions, DrawState, Schedule };
