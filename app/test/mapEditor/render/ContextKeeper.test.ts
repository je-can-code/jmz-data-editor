import { describe, expect, it } from 'vitest';
import { ContextBudget } from '../../../src/mapEditor/render/ContextBudget.ts';
import {
  ContextKeeper,
  FIRST_RECOVERY_DELAY_MS,
  LOSS_MEMORY_MS,
  MAX_RECOVERY_DELAY_MS,
  RESTORE_WAIT_MS,
  type ContextDriver,
  type DrawState,
  type Schedule,
} from '../../../src/mapEditor/render/ContextKeeper.ts';

/*
 * Chromium keeps a fixed number of WebGL contexts alive per renderer process, and every map panel, docked, stacked as
 * a tab or torn out into its own window, lives in that one process. Before this, every panel kept a context for as
 * long as it lived, background tabs included, so opening one map too many silently blanked the oldest for good.
 *
 * The keeper owes each view three things. A view behind another tab lets its context go at once, giving its place to
 * a view waiting for one, and asks for the context back when it shows again, drawing on it once it is back; a
 * context still being made or given back is let go of only once it lands. A view whose context the browser takes
 * anyway asks for it back on its own after a short pause, doubling each time it happens again soon after, up to a
 * limit, and asks again if the context does not come back in time; a view shown again asks at once. And a view shown
 * while every context is taken waits its turn, saying so, and takes the first context freed; a context the browser
 * hands back while the view waits goes again, so the count stays true. A browser that cannot let go of a context
 * keeps the view's place while it hides. A window that cannot make a context says so and holds no place. Nothing is
 * heard once the keeper is destroyed.
 */

/**
 * Stands in for the renderer's GPU side, recording every call in order.
 */
class FakeDriver implements ContextDriver
{
  calls: string[] = [];

  restoredAt: number[] = [];

  releasable = true;

  #now: () => number;

  #settle: { resolve: () => void; reject: (error: unknown) => void } | null = null;

  /**
   * @param {() => number} now The clock, for when each ask for the context back came.
   */
  constructor(now: () => number)
  {
    this.#now = now;
  }

  create(): Promise<void>
  {
    this.calls.push('create');
    return new Promise((resolve, reject) =>
    {
      this.#settle = { resolve, reject };
    });
  }

  /**
   * Settles the context being made, as the renderer's start does.
   * @param {boolean} made True when the context was made; false when the window cannot draw with WebGL.
   * @returns {Promise<void>} Settles once the keeper has heard.
   */
  async finishCreate(made: boolean): Promise<void>
  {
    if (made)
    {
      this.#settle?.resolve();
    }
    else
    {
      this.#settle?.reject(new Error('no WebGL'));
    }

    await Promise.resolve();
    await Promise.resolve();
  }

  release(): boolean
  {
    this.calls.push('release');
    return this.releasable;
  }

  restore(): void
  {
    this.calls.push('restore');
    this.restoredAt.push(this.#now());
  }

  resume(): void
  {
    this.calls.push('resume');
  }

  suspend(): void
  {
    this.calls.push('suspend');
  }
}

/**
 * A clock that moves only when told, running the timers it passes.
 * @returns {object} The schedule and clock to hand a keeper, and a way to move time on.
 */
const buildClock = () =>
{
  let time = 0;
  const timers: { at: number; callback: () => void; live: boolean }[] = [];
  const schedule: Schedule = (callback, delayMs) =>
  {
    const timer = { at: time + delayMs, callback, live: true };
    timers.push(timer);
    return () =>
    {
      timer.live = false;
    };
  };

  /**
   * Finds the earliest live timer due by a time.
   * @param {number} end The time.
   * @returns {object | undefined} The timer, or undefined when none is due.
   */
  const nextDue = (end: number) =>
  {
    const [ due ] = timers.filter(timer => timer.live && timer.at <= end).sort((left, right) => left.at - right.at);
    return due;
  };

  /**
   * Moves the clock on, running every timer that falls due on the way, in order.
   * @param {number} ms How far.
   */
  const advance = (ms: number) =>
  {
    const end = time + ms;
    let due = nextDue(end);
    while (due !== undefined)
    {
      time = due.at;
      due.live = false;
      due.callback();
      due = nextDue(end);
    }

    time = end;
  };

  return { schedule, now: () => time, advance };
};

/**
 * One view: its keeper over a fake driver, on a shared budget and clock, with every draw state it announced.
 * @param {ContextBudget} budget The budget it shares.
 * @param {ReturnType<typeof buildClock>} clock The clock it shares.
 * @returns {object} The keeper, its driver and its announced states.
 */
const buildView = (budget: ContextBudget, clock: ReturnType<typeof buildClock>) =>
{
  const driver = new FakeDriver(clock.now);
  const keeper = new ContextKeeper(driver, { budget, schedule: clock.schedule, now: clock.now });
  const states: DrawState[] = [];
  keeper.onStateChange(state => states.push(state));
  return { keeper, driver, states };
};

/**
 * Shows a view and lets its context be made, so it draws.
 * @param {ReturnType<typeof buildView>} view The view.
 * @returns {Promise<void>} Settles once it draws.
 */
const showAndDraw = async (view: ReturnType<typeof buildView>): Promise<void> =>
{
  view.keeper.show();
  await view.driver.finishCreate(true);
};

describe('ContextKeeper', () =>
{
  describe('showing', () =>
  {
    it('makes its context the first time it shows, and draws once the context is made', async () =>
    {
      // Arrange.
      const view = buildView(new ContextBudget(2), buildClock());

      // Act.
      view.keeper.show();
      const whileMaking = [ ...view.driver.calls ];
      await view.driver.finishCreate(true);

      // Assert.
      expect([ whileMaking, view.driver.calls, view.states, view.keeper.state ])
        .toStrictEqual([ [ 'create' ], [ 'create', 'resume' ], [ 'starting', 'drawing' ], 'drawing' ]);
    });

    it('changes nothing when told it shows while it already draws', async () =>
    {
      // Arrange: the map view tells its renderer it shows as it mounts, and again once its first render has settled.
      const view = buildView(new ContextBudget(2), buildClock());
      await showAndDraw(view);

      // Act.
      view.keeper.show();

      // Assert: drawing began once.
      expect([ view.driver.calls, view.states ])
        .toStrictEqual([ [ 'create', 'resume' ], [ 'starting', 'drawing' ] ]);
    });

    it('says the window cannot draw when no context can be made, and holds no place', async () =>
    {
      // Arrange.
      const budget = new ContextBudget(2);
      const view = buildView(budget, buildClock());
      view.keeper.show();

      // Act.
      await view.driver.finishCreate(false);
      view.keeper.hide();

      // Assert: failed whether shown or not.
      expect([ view.states, view.keeper.state, budget.grantedCount, view.driver.calls ])
        .toStrictEqual([ [ 'starting', 'failed' ], 'failed', 0, [ 'create' ] ]);
    });
  });

  describe('hiding and showing again', () =>
  {
    it('lets its context and its place go behind another tab, and a waiting view takes the place', async () =>
    {
      // Arrange: one context to share; the first view draws, the second waits.
      const budget = new ContextBudget(1);
      const clock = buildClock();
      const first = buildView(budget, clock);
      const second = buildView(budget, clock);
      await showAndDraw(first);
      second.keeper.show();

      // Act.
      first.keeper.hide();

      // Assert.
      expect([ first.driver.calls, first.keeper.state, second.driver.calls, second.states ])
        .toStrictEqual([ [ 'create', 'resume', 'suspend', 'release' ], 'hidden', [ 'create' ], [ 'waiting', 'starting' ] ]);
    });

    it('asks for its context back when shown again, and draws on it once it is back', async () =>
    {
      // Arrange: the view hid, and its context has gone.
      const view = buildView(new ContextBudget(1), buildClock());
      await showAndDraw(view);
      view.keeper.hide();
      view.keeper.contextLost();
      view.driver.calls.length = 0;

      // Act.
      view.keeper.show();
      const whileAsking = [ [ ...view.driver.calls ], view.keeper.state ];
      view.keeper.contextRestored();

      // Assert.
      expect([ whileAsking, view.driver.calls, view.keeper.state ])
        .toStrictEqual([ [ [ 'restore' ], 'starting' ], [ 'restore', 'resume' ], 'drawing' ]);
    });

    it('waits for the loss it asked for to land before asking the context back, when shown again straight away', async () =>
    {
      // Arrange.
      const view = buildView(new ContextBudget(1), buildClock());
      await showAndDraw(view);
      view.keeper.hide();
      view.driver.calls.length = 0;

      // Act: shown again before the lost event arrives.
      view.keeper.show();
      const beforeTheLoss = [ ...view.driver.calls ];
      view.keeper.contextLost();

      // Assert.
      expect([ beforeTheLoss, view.driver.calls ])
        .toStrictEqual([ [], [ 'restore' ] ]);
    });

    it('keeps its place while its context is being made, and lets both go once the context is made', async () =>
    {
      // Arrange: the first view hides before its context is made; the second waits.
      const budget = new ContextBudget(1);
      const clock = buildClock();
      const first = buildView(budget, clock);
      const second = buildView(budget, clock);
      first.keeper.show();
      first.keeper.hide();
      second.keeper.show();
      const whileMaking = [ ...second.driver.calls ];

      // Act.
      await first.driver.finishCreate(true);

      // Assert: the first never drew.
      expect([ whileMaking, first.driver.calls, second.driver.calls ])
        .toStrictEqual([ [], [ 'create', 'release' ], [ 'create' ] ]);
    });

    it('keeps its place while its context is coming back, and lets both go once the context is back', async () =>
    {
      // Arrange: the first view is shown again and asks for its context back, then hides before it is back.
      const budget = new ContextBudget(1);
      const clock = buildClock();
      const first = buildView(budget, clock);
      const second = buildView(budget, clock);
      await showAndDraw(first);
      first.keeper.hide();
      first.keeper.contextLost();
      first.keeper.show();
      first.keeper.hide();
      second.keeper.show();
      const whileComingBack = [ ...second.driver.calls ];
      first.driver.calls.length = 0;

      // Act.
      first.keeper.contextRestored();

      // Assert.
      expect([ whileComingBack, first.driver.calls, second.driver.calls ])
        .toStrictEqual([ [], [ 'release' ], [ 'create' ] ]);
    });

    it('keeps its place while hidden when the browser offers no way to let go of its context, and draws when shown', async () =>
    {
      // Arrange.
      const budget = new ContextBudget(1);
      const view = buildView(budget, buildClock());
      view.driver.releasable = false;
      await showAndDraw(view);

      // Act.
      view.keeper.hide();
      const hidden = [ view.keeper.state, budget.grantedCount ];
      view.keeper.show();

      // Assert.
      expect([ hidden, view.driver.calls, view.keeper.state ])
        .toStrictEqual([ [ 'hidden', 1 ], [ 'create', 'resume', 'suspend', 'release', 'resume' ], 'drawing' ]);
    });
  });

  describe('waiting its turn', () =>
  {
    it('says it is waiting while every context is taken, making none, and leaves the line when hidden', async () =>
    {
      // Arrange.
      const budget = new ContextBudget(1);
      const clock = buildClock();
      const first = buildView(budget, clock);
      const second = buildView(budget, clock);
      await showAndDraw(first);

      // Act.
      second.keeper.show();
      const waiting = [ second.keeper.state, budget.waitingCount ];
      second.keeper.hide();
      first.keeper.hide();

      // Assert: the freed context went to nobody.
      expect([ waiting, second.keeper.state, budget.waitingCount, budget.grantedCount, second.driver.calls ])
        .toStrictEqual([ [ 'waiting', 1 ], 'hidden', 0, 0, [] ]);
    });

    it('lets go of a context the browser gives back by itself while the view waits its turn', async () =>
    {
      // Arrange: the second view drew, hid and lost its context; the first took the only place; the second shows again.
      const budget = new ContextBudget(1);
      const clock = buildClock();
      const first = buildView(budget, clock);
      const second = buildView(budget, clock);
      await showAndDraw(second);
      second.keeper.hide();
      second.keeper.contextLost();
      await showAndDraw(first);
      second.keeper.show();
      second.driver.calls.length = 0;

      // Act.
      second.keeper.contextRestored();

      // Assert.
      expect([ second.driver.calls, second.keeper.state, first.keeper.state ])
        .toStrictEqual([ [ 'release' ], 'waiting', 'drawing' ]);
    });
  });

  describe('recovering a context the browser took', () =>
  {
    it('asks for it back after a short pause, and draws again once it is back', async () =>
    {
      // Arrange.
      const clock = buildClock();
      const view = buildView(new ContextBudget(1), clock);
      await showAndDraw(view);
      view.driver.calls.length = 0;

      // Act.
      view.keeper.contextLost();
      const lost = [ [ ...view.driver.calls ], view.keeper.state ];
      clock.advance(FIRST_RECOVERY_DELAY_MS - 1);
      const beforeThePause = [ ...view.driver.calls ];
      clock.advance(1);
      view.keeper.contextRestored();

      // Assert.
      expect([ lost, beforeThePause, view.driver.calls, view.keeper.state ])
        .toStrictEqual([ [ [ 'suspend' ], 'recovering' ], [ 'suspend' ], [ 'suspend', 'restore', 'resume' ], 'drawing' ]);
    });

    it('waits twice as long each time the browser takes it again soon after, up to a limit, and starts over after a quiet spell', async () =>
    {
      // Arrange: the context is taken seven times, each the moment it is back, then once more after a quiet spell.
      const clock = buildClock();
      const view = buildView(new ContextBudget(1), clock);
      await showAndDraw(view);
      const waits: number[] = [];

      /**
       * Loses the context, lets it be asked back, gives it back at once, and notes how long the ask took to come.
       */
      const loseAndRecover = () =>
      {
        const lostAt = clock.now();
        const asked = view.driver.restoredAt.length;
        view.keeper.contextLost();
        while (view.driver.restoredAt.length === asked)
        {
          clock.advance(1);
        }

        waits.push(view.driver.restoredAt[asked] - lostAt);
        view.keeper.contextRestored();
      };

      // Act.
      for (let loss = 0; loss < 7; loss++)
      {
        loseAndRecover();
      }

      clock.advance(LOSS_MEMORY_MS);
      loseAndRecover();

      // Assert.
      expect([ waits, view.keeper.state ])
        .toStrictEqual([ [ 100, 200, 400, 800, 1600, 3200, 3200, 100 ], 'drawing' ]);
    });

    it('asks again, after a longer pause, when a context asked back does not come back in time', async () =>
    {
      // Arrange.
      const clock = buildClock();
      const view = buildView(new ContextBudget(1), clock);
      await showAndDraw(view);
      view.keeper.contextLost();
      clock.advance(FIRST_RECOVERY_DELAY_MS);
      view.driver.calls.length = 0;

      // Act: nothing comes back.
      clock.advance(RESTORE_WAIT_MS + FIRST_RECOVERY_DELAY_MS * 2 - 1);
      const beforeTheLongerPause = [ ...view.driver.calls ];
      clock.advance(1);

      // Assert.
      expect([ beforeTheLongerPause, view.driver.calls, view.keeper.state ])
        .toStrictEqual([ [], [ 'restore' ], 'recovering' ]);
    });

    it('asks at once when shown again after hiding during its pause', async () =>
    {
      // Arrange.
      const clock = buildClock();
      const view = buildView(new ContextBudget(1), clock);
      await showAndDraw(view);
      view.keeper.contextLost();
      view.keeper.hide();
      view.driver.calls.length = 0;

      // Act.
      view.keeper.show();

      // Assert: no pause, and nothing asked while it was hidden.
      expect(view.driver.calls)
        .toStrictEqual([ 'restore' ]);
    });

    it('treats a context taken while it was being made like any other it lost', async () =>
    {
      // Arrange.
      const clock = buildClock();
      const view = buildView(new ContextBudget(1), clock);
      view.keeper.show();
      view.keeper.contextLost();

      // Act.
      await view.driver.finishCreate(true);
      const afterMaking = [ [ ...view.driver.calls ], view.keeper.state ];
      clock.advance(FIRST_RECOVERY_DELAY_MS);

      // Assert: it never drew on the lost context.
      expect([ afterMaking, view.driver.calls ])
        .toStrictEqual([ [ [ 'create' ], 'recovering' ], [ 'create', 'restore' ] ]);
    });
  });

  it('gives its place back and hears nothing more once destroyed', async () =>
  {
    // Arrange: one context, held by the first view; the second waits.
    const budget = new ContextBudget(1);
    const clock = buildClock();
    const first = buildView(budget, clock);
    const second = buildView(budget, clock);
    await showAndDraw(first);
    second.keeper.show();
    first.driver.calls.length = 0;

    // Act.
    first.keeper.destroy();
    first.keeper.contextLost();
    first.keeper.contextRestored();
    first.keeper.show();
    clock.advance(MAX_RECOVERY_DELAY_MS);

    // Assert.
    expect([ first.driver.calls, second.driver.calls, second.keeper.state ])
      .toStrictEqual([ [], [ 'create' ], 'starting' ]);
  });
});
