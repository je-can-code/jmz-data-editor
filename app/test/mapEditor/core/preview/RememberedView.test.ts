/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import {
  localViewStore,
  readRemembered,
  RememberedView,
  rememberedViewKey,
  writeRemembered,
  type ViewStore,
} from '../../../../src/mapEditor/core/preview/RememberedView.ts';
import { WindowPreview } from '../../../../src/mapEditor/core/preview/WindowPreview.ts';
import { WindowClock } from '../../../../src/mapEditor/core/time/WindowClock.ts';

/*
 * The clock's time and the preview are remembered between sessions, for each project on this machine, and shared live
 * by every window: a window coming up takes what its project left, every change made in one window is written for the
 * next session and for every other window, and every other window takes it at once, without writing it back, so no two
 * windows ever echo one change between them. Only what the author chose is kept: a clock still following the game's
 * starting time keeps no time, so a game whose start moves starts there. Whatever kind of state a plugin module lets the
 * preview set, such as where each quest stands, is kept and shared exactly as the module set it, unread.
 *
 * What is kept is read leniently: anything that cannot be used, from text that is no JSON to a clock time no day holds,
 * reads as nothing set and the clock following the game, never as a reason the editor will not start.
 *
 * In the page it is kept in the window's local storage under the project's own name, and another window's write arrives
 * as a storage event; storage the browser refuses keeps nothing, and the editor carries on.
 */
describe('RememberedView', () =>
{
  /**
   * One machine's storage for one project, shared by every window on it: each window's store hears every other's
   * writes, never its own, as storage events arrive.
   */
  class MemoryStorage
  {
    text: string | null = null;

    #listeners = new Map<ViewStore, (text: string | null) => void>();

    /**
     * Opens a window's store over it.
     * @returns {ViewStore} The store.
     */
    open(): ViewStore
    {
      const store: ViewStore = {
        read: () => this.text,
        write: text =>
        {
          this.text = text;
          [ ...this.#listeners ].filter(([ other ]) => other !== store).forEach(([ , listener ]) => listener(text));
        },
        subscribe: listener =>
        {
          this.#listeners.set(store, listener);
          return () => this.#listeners.delete(store);
        },
      };

      return store;
    }
  }

  /**
   * One window's clock and preview, kept in step with a storage.
   * @param {MemoryStorage} storage The machine's storage for the project.
   * @returns {{ clock: WindowClock, preview: WindowPreview, detach: () => void }} The window.
   */
  const buildWindow = (storage: MemoryStorage) =>
  {
    const clock = new WindowClock();
    const preview = new WindowPreview();
    const detach = new RememberedView(clock, preview).attach(storage.open());
    return { clock, preview, detach };
  };

  describe('readRemembered', () =>
  {
    it('reads back what was written', () =>
    {
      // Arrange: 22:00, switch 147 on and variable 74 at 99.
      const text = writeRemembered({ clock: 1320, preview: GamePreview.FRESH.withSwitch(147, true).withVariable(74, 99) });

      // Act.
      const state = readRemembered(text);

      // Assert.
      expect([ text, state.clock, state.preview.toJson() ])
        .toStrictEqual([
          '{"version":1,"clock":1320,"preview":{"switch":{"147":true},"variable":{"74":99}}}',
          1320,
          { switch: { 147: true }, variable: { 74: 99 } },
        ]);
    });

    it('reads nothing kept, text that is no JSON, and JSON that is no object as nothing set', () =>
    {
      // Arrange.
      const texts = [ null, '{not json', '[1,2]', '"text"' ];

      // Act.
      const states = texts.map(readRemembered);

      // Assert.
      expect(states.every(state => state.clock === null && state.preview === GamePreview.FRESH))
        .toBe(true);
    });

    it('keeps only a clock time a day holds, as a whole minute', () =>
    {
      // Arrange: midnight, the last minute of the day, a minute past it, a minute before midnight, half a minute, text.
      const clocks = [ 0, 1439, 1440, -1, 600.5, '600' ];

      // Act.
      const read = clocks.map(clock => readRemembered(JSON.stringify({ version: 1, clock, preview: {} })).clock);

      // Assert.
      expect(read)
        .toStrictEqual([ 0, 1439, null, null, null, null ]);
    });
  });

  describe('attach', () =>
  {
    it('brings back the clock and the preview the project left last session', () =>
    {
      // Arrange: a session that left 22:00 and switch 147 on, then closed.
      const storage = new MemoryStorage();
      const earlier = buildWindow(storage);
      earlier.clock.set(1320);
      earlier.preview.setSwitch(147, true);
      earlier.detach();

      // Act: the next session's first window.
      const next = buildWindow(storage);

      // Assert: the hour counts as the author's, so the game's starting time does not take it back.
      next.clock.startAt(840);
      expect([ next.clock.time(), next.clock.moved, next.preview.preview().switchesOn() ])
        .toStrictEqual([ 1320, true, [ 147 ] ]);
    });

    it('leaves the clock following the game and the preview fresh when nothing is kept, keeping nothing for it', () =>
    {
      // Arrange.
      const storage = new MemoryStorage();

      // Act.
      const window = buildWindow(storage);
      window.clock.startAt(840);

      // Assert.
      expect([ window.clock.time(), window.clock.moved, window.preview.preview(), storage.text ])
        .toStrictEqual([ 840, false, GamePreview.FRESH, null ]);
    });

    it('keeps what a window set before it knew its project, when nothing was kept yet', () =>
    {
      // Arrange: switch 24 turned on before the window's store is known.
      const storage = new MemoryStorage();
      const clock = new WindowClock();
      const preview = new WindowPreview();
      preview.setSwitch(24, true);

      // Act.
      new RememberedView(clock, preview).attach(storage.open());

      // Assert.
      expect([ preview.preview().switchesOn(), storage.text ])
        .toStrictEqual([ [ 24 ], '{"version":1,"clock":null,"preview":{"switch":{"24":true}}}' ]);
    });

    it('keeps no time for a clock following the game\'s starting time, and the time once the author moves it', () =>
    {
      // Arrange.
      const storage = new MemoryStorage();
      const window = buildWindow(storage);

      // Act: the game's start, then a switch turned on, then the author's 18:00.
      window.clock.startAt(840);
      const followed = storage.text;
      window.preview.setSwitch(24, true);
      const switched = storage.text;
      window.clock.set(1080);

      // Assert.
      expect([ followed, switched, storage.text ])
        .toStrictEqual([
          null,
          '{"version":1,"clock":null,"preview":{"switch":{"24":true}}}',
          '{"version":1,"clock":1080,"preview":{"switch":{"24":true}}}',
        ]);
    });

    it('shares every change live with every other window, which take it without writing it back', () =>
    {
      // Arrange: two windows of one session, writes into the storage counted.
      const storage = new MemoryStorage();
      const first = buildWindow(storage);
      const second = buildWindow(storage);
      let writes = 0;
      storage.open().subscribe(() =>
      {
        writes += 1;
      });

      // Act: switch 74 on and the clock at 19:00 in the first, variable 74 at 99 in the second.
      first.preview.setSwitch(74, true);
      first.clock.set(1140);
      second.preview.setVariable(74, 99);

      // Assert: each change written once, and both windows on one clock and one preview.
      expect([ writes, second.clock.time(), second.preview.preview().switchesOn(), first.preview.preview().variable(74) ])
        .toStrictEqual([ 3, 1140, [ 74 ], 99 ]);
    });

    it('keeps a module\'s kind for the next session and shares it live with every other window, as the module set it', () =>
    {
      // Arrange: two windows of one session.
      const storage = new MemoryStorage();
      const first = buildWindow(storage);
      const second = buildWindow(storage);

      // Act: objective 1 of a quest set in the first window; then the session closed, and the next one's window opened.
      first.preview.setValue('quest.states', 'cecil-001', { objectives: { 1: 'active' } });
      const shared = second.preview.preview().value('quest.states', 'cecil-001');
      first.detach();
      second.detach();
      const next = buildWindow(storage);

      // Assert.
      expect([ storage.text, shared, next.preview.preview().value('quest.states', 'cecil-001') ])
        .toStrictEqual([
          '{"version":1,"clock":null,"preview":{"quest.states":{"cecil-001":{"objectives":{"1":"active"}}}}}',
          { objectives: { 1: 'active' } },
          { objectives: { 1: 'active' } },
        ]);
    });

    it('takes back a fresh save from another window, and a preview another window cleared', () =>
    {
      // Arrange: two windows sharing switches 24 and 147.
      const storage = new MemoryStorage();
      const first = buildWindow(storage);
      const second = buildWindow(storage);
      first.preview.setSwitch(24, true);
      first.preview.setSwitch(147, true);

      // Act: back to a fresh save in the second window.
      second.preview.reset();

      // Assert.
      expect([ first.preview.preview(), second.preview.preview() ])
        .toStrictEqual([ GamePreview.FRESH, GamePreview.FRESH ]);
    });

    it('stops writing and taking once detached', () =>
    {
      // Arrange: two windows, the second detached.
      const storage = new MemoryStorage();
      const first = buildWindow(storage);
      const second = buildWindow(storage);
      second.detach();

      // Act: a change in each.
      first.preview.setSwitch(74, true);
      second.preview.setSwitch(9, true);

      // Assert.
      expect([ second.preview.preview().switchesOn(), storage.text ])
        .toStrictEqual([ [ 9 ], '{"version":1,"clock":null,"preview":{"switch":{"74":true}}}' ]);
    });
  });

  describe('localViewStore', () =>
  {
    afterEach(() =>
    {
      window.localStorage.clear();
    });

    it('keeps each project\'s state under a name of its own in the window\'s local storage', () =>
    {
      // Arrange: two projects.
      const chef = localViewStore(window, rememberedViewKey('/games/chef-adventure'));
      const other = localViewStore(window, rememberedViewKey('/games/other'));

      // Act.
      chef.write('{"version":1}');

      // Assert.
      expect([ chef.read(), other.read(), window.localStorage.getItem('jmz-map-editor:view:/games/chef-adventure') ])
        .toStrictEqual([ '{"version":1}', null, '{"version":1}' ]);
    });

    it('hears another window\'s write to its own name only, and nothing once it stops', () =>
    {
      // Arrange.
      const key = rememberedViewKey('/games/chef-adventure');
      const store = localViewStore(window, key);
      const heard: (string | null)[] = [];
      const stop = store.subscribe(text => heard.push(text));

      // Act: another window writes this project's state, then another project's, then removes this one's; then, after
      // stopping, writes it again.
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'mine' }));
      window.dispatchEvent(new StorageEvent('storage', { key: rememberedViewKey('/games/other'), newValue: 'theirs' }));
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: null }));
      stop();
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'later' }));

      // Assert.
      expect(heard)
        .toStrictEqual([ 'mine', null ]);
    });

    it('keeps nothing, and carries on, where the browser refuses storage', () =>
    {
      // Arrange: a window whose storage is turned off.
      const refusing = {
        get localStorage(): Storage
        {
          throw new Error('storage is turned off');
        },
      } as unknown as Window;
      const store = localViewStore(refusing, rememberedViewKey('/games/chef-adventure'));

      // Act.
      const write = () => store.write('{"version":1}');

      // Assert.
      expect(write)
        .not.toThrow();
      expect(store.read())
        .toBeNull();
    });
  });
});
