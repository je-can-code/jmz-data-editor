/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EventSelection } from '../../../src/mapEditor/core/events/EventSelection.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { Camera } from '../../../src/mapEditor/core/renderer/camera.ts';
import type { CellRect } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { captureEventsStamp, type Stamp } from '../../../src/mapEditor/core/stamps/stamp.ts';
import { decodeStampClipboard, encodeStampClipboard } from '../../../src/mapEditor/core/stamps/stampClipboard.ts';
import { StampHistory } from '../../../src/mapEditor/core/stamps/StampHistory.ts';
import { TilesetMode } from '../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { makeAutotileId } from '../../../src/mapEditor/core/tiles/tileIds.ts';
import { PaintState } from '../../../src/mapEditor/core/tools/PaintState.ts';
import { MapStampTools } from '../../../src/mapEditor/stamps/MapStampTools.ts';
import { fill } from '../core/tiles/support/tileGridBuilder.ts';
import { hubWithMaps, mapFileOf, spotsOf } from '../support/eventFixtures.ts';
import { stampOf, tiledMap } from '../support/stampFixtures.ts';

/*
 * The stamp tools are the map view's clipboard: whatever is copied off the map becomes a stamp, kept in the window's
 * stamps and written to the system clipboard with the stamp marker, and a paste places the newest stamp. What they owe:
 * a copy takes the select tool's area while that tool is in hand and holds one (every layer and its events under
 * automatic layering, the chosen layer alone under manual layering), and the selected events otherwise, whatever tool
 * is in hand; a cut copies the same and takes it away as one step; a paste places the newest stamp with its corner on
 * the tile under the pointer, the tile following the camera as it zooms, or where the stamp was copied from with the
 * pointer off the map, its events taking fresh ids and the selection, as one step; a stamp copied in another window,
 * read off the clipboard, joins the window's stamps as the newest before it is placed; plain text with no stamp kept is
 * left to the page; each answers only while the view has focus outside a text field, and a cut or a paste waits while
 * anything is in hand. The menu's actions do the same through the clipboard API, a stamp kept even where the clipboard
 * cannot be written or read; and the author hears what a placement left out, and why one was refused.
 *
 * The view is at zoom 1 with the map's corner at the view's, so a tile is 48 pixels. The 6x4 map holds grass at 0, 0 to
 * 1, 0, event 1 at 0, 0, event 2 at 1, 0 and event 3 at 4, 2.
 */
describe('MapStampTools', () =>
{
  const built: MapStampTools[] = [];

  afterEach(() =>
  {
    built.splice(0).forEach(tools => tools.destroy());
    document.body.innerHTML = '';
    Reflect.deleteProperty(window.navigator, 'clipboard');
  });

  /**
   * Gives the page's navigator a clipboard whose writes go where the test says, as the browser's own would.
   * @param {(text: string) => Promise<void>} writeText What a write does.
   */
  const stubClipboard = (writeText: (text: string) => Promise<void>) =>
  {
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
  };

  /**
   * Builds the tools over the fixture map, in a view in the page.
   * @returns {object} The tools and everything they were handed and said.
   */
  const setUp = () =>
  {
    const hub = hubWithMaps({ 1: tiledMap(6, 4, grid => fill(grid, 0, 0, 1, 0, 0, makeAutotileId(16, 0)), [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ] ]) });
    const map = hub.map('map:1');
    const host = document.createElement('div');
    host.tabIndex = 0;
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    document.body.appendChild(host);
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    const cameraListeners: ((camera: Camera) => void)[] = [];
    const renderer = {
      canvas,
      camera: { x: 0, y: 0, zoom: 1 } as Camera,
      onCameraChange: (listener: (camera: Camera) => void) =>
      {
        cameraListeners.push(listener);
        return () => undefined;
      },
    };

    /**
     * Moves the camera, as a wheel zoom or a pan does, and tells whoever listens.
     * @param {Camera} camera The new camera.
     */
    const moveCamera = (camera: Camera) =>
    {
      renderer.camera = camera;
      cameraListeners.forEach(listener => listener(camera));
    };

    const selection = new EventSelection();
    const painting = new PaintState();
    const stamps = new StampHistory('window-a');
    const notices: string[] = [];
    const state: { area: CellRect | null; busy: boolean; clipboard: string | null } = { area: null, busy: false, clipboard: null };
    const tools = new MapStampTools({
      renderer,
      host,
      hub,
      stamps,
      selection,
      painting,
      tileArea: () => state.area,
      busy: () => state.busy,
      tilesetMode: () => TilesetMode.area,
      readClipboard: async () => state.clipboard,
      notify: text => notices.push(text),
    });
    tools.setMap(map);
    built.push(tools);
    return { hub, map, host, canvas, outside, selection, painting, stamps, notices, state, tools, moveCamera };
  };

  /**
   * Sends the canvas a pointer move over the middle of a tile.
   * @param {HTMLElement} canvas The canvas.
   * @param {{ x: number, y: number }} cell The tile.
   */
  const pointAt = (canvas: HTMLElement, cell: { x: number; y: number }) =>
  {
    const event = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperties(event, { offsetX: { value: cell.x * 48 + 24 }, offsetY: { value: cell.y * 48 + 24 } });
    canvas.dispatchEvent(event);
  };

  /**
   * Fires a clipboard event on the page, as the browser does on Ctrl+C, X or V, with a clipboard holding some text.
   * @param {string} type copy, cut or paste.
   * @param {string} text What the clipboard holds.
   * @returns {{ event: Event, written: () => string }} The event, and what was written to the clipboard.
   */
  const clipboardEvent = (type: string, text = ''): { event: Event; written: () => string } =>
  {
    let written = '';
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: () => text,
        setData: (_format: string, value: string) =>
        {
          written = value;
        },
      },
    });
    document.body.dispatchEvent(event);
    return { event, written: () => written };
  };

  describe('copying', () =>
  {
    it('copies the events selected into a stamp, kept and on the clipboard, while the view has focus, and leaves a copy elsewhere alone', () =>
    {
      // Arrange: event 2 selected, the pen in hand.
      const { host, outside, map, selection, painting, stamps, notices } = setUp();
      selection.select(1, [ 2 ]);
      painting.setTool('pen');

      // Act: once with the focus on a button outside the view, then with the view focused.
      outside.focus();
      const elsewhere = clipboardEvent('copy');
      host.focus();
      const focused = clipboardEvent('copy');

      // Assert.
      const expected = { ...captureEventsStamp(map, [ 2 ], 'window-a:1') as Stamp };
      expect([ elsewhere.event.defaultPrevented, focused.event.defaultPrevented, decodeStampClipboard(focused.written()), stamps.stamps, notices ])
        .toStrictEqual([ false, true, expected, [ expected ], [ 'Copied event.' ] ]);
    });

    it('copies the select tool\'s area with every layer and its events under automatic layering, and one layer alone under manual', () =>
    {
      // Arrange: the select tool holding the top row's first two cells; event 3 is selected, and is not in it.
      const { host, selection, painting, stamps, state, notices } = setUp();
      selection.select(1, [ 3 ]);
      painting.setTool('select');
      state.area = { x: 0, y: 0, width: 2, height: 1 };
      host.focus();

      // Act: once under automatic layering, then with layer 1 picked on the strip.
      clipboardEvent('copy');
      const whole = stamps.newest() as Stamp;
      painting.setStrip(0);
      clipboardEvent('copy');
      const ground = stamps.newest() as Stamp;

      // Assert.
      expect([ whole.tiles?.layers, whole.events.map(event => event.id), ground.tiles?.layers, ground.events, notices ])
        .toStrictEqual([ [ 0, 1, 2, 3, 4, 5 ], [ 1, 2 ], [ 0 ], [], [ 'Copied 2 by 1 tiles and 2 events.', 'Copied 2 by 1 tiles.' ] ]);
    });

    it('copies the events selected while the select tool holds no area, and leaves a copy of nothing to the page', () =>
    {
      // Arrange: the select tool in hand, holding nothing.
      const { host, selection, painting, stamps } = setUp();
      painting.setTool('select');
      host.focus();

      // Act: with nothing selected, then with event 3 selected.
      const nothing = clipboardEvent('copy');
      selection.select(1, [ 3 ]);
      const events = clipboardEvent('copy');

      // Assert.
      expect([ nothing.event.defaultPrevented, events.event.defaultPrevented, stamps.stamps.map(stamp => stamp.events.map(event => event.id)) ])
        .toStrictEqual([ false, true, [ [ 3 ] ] ]);
    });
  });

  describe('cutting', () =>
  {
    it('cuts the events selected into a stamp, taking them away as one step', () =>
    {
      // Arrange.
      const { hub, host, selection, stamps } = setUp();
      selection.select(1, [ 1 ]);
      host.focus();

      // Act.
      const cut = clipboardEvent('cut');

      // Assert.
      expect([ cut.event.defaultPrevented, decodeStampClipboard(cut.written())?.events.map(event => event.id), stamps.stamps.length, spotsOf(mapFileOf(hub, 1))[1], hub.history(mapHistoryKey(1)).rows.map(row => row.label) ])
        .toStrictEqual([ true, [ 1 ], 1, null, [ 'Cut event' ] ]);
    });

    it('cuts the select tool\'s area, emptying its layers and taking its events away as one step', () =>
    {
      // Arrange.
      const { hub, host, painting, state } = setUp();
      painting.setTool('select');
      state.area = { x: 0, y: 0, width: 2, height: 1 };
      host.focus();

      // Act.
      clipboardEvent('cut');

      // Assert: the grass gone, events 1 and 2 gone, event 3 kept.
      const file = mapFileOf(hub, 1);
      expect([ file.data.slice(0, 2), spotsOf(file), hub.history(mapHistoryKey(1)).rows.map(row => row.label) ])
        .toStrictEqual([ [ 0, 0 ], [ null, null, null, [ 4, 2 ] ], [ 'Cut 2 by 1 tiles and 2 events' ] ]);
    });

    it('waits with a cut while anything is in hand, changing nothing', () =>
    {
      // Arrange: a drag in hand.
      const { hub, host, selection, state } = setUp();
      selection.select(1, [ 1 ]);
      state.busy = true;
      host.focus();

      // Act.
      const cut = clipboardEvent('cut');

      // Assert.
      expect([ cut.event.defaultPrevented, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ false, 0 ]);
    });
  });

  describe('pasting', () =>
  {
    it('places the newest stamp with its corner on the tile under the pointer, with fresh ids, selecting them', () =>
    {
      // Arrange: events 1 and 2 copied, then event 3, the pointer resting on 2, 2.
      const { hub, host, canvas, selection } = setUp();
      selection.select(1, [ 1, 2 ]);
      host.focus();
      clipboardEvent('copy');
      selection.select(1, [ 3 ]);
      clipboardEvent('copy');
      pointAt(canvas, { x: 2, y: 3 });

      // Act: the clipboard holds plain text by now.
      const paste = clipboardEvent('paste', 'Welcome to Nimbus!');

      // Assert: event 3's copy, the newest stamp, at 2, 3 as event 4.
      expect([ paste.event.defaultPrevented, spotsOf(mapFileOf(hub, 1)), selection.eventsOn(1), hub.history(mapHistoryKey(1)).rows.map(row => row.label) ])
        .toStrictEqual([ true, [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ], [ 2, 3 ] ], [ 4 ], [ 'Paste event' ] ]);
    });

    it('lands a paste on the tile a zoom puts under the still pointer, not the one it rested on before', () =>
    {
      // Arrange: event 3 copied, the pointer resting over 2, 2; at zoom 2 that spot lies over tile 1, 1.
      const { hub, host, canvas, selection, moveCamera } = setUp();
      selection.select(1, [ 3 ]);
      host.focus();
      clipboardEvent('copy');
      pointAt(canvas, { x: 2, y: 2 });
      moveCamera({ x: 0, y: 0, zoom: 2 });

      // Act.
      clipboardEvent('paste');

      // Assert.
      expect(spotsOf(mapFileOf(hub, 1))[4])
        .toStrictEqual([ 1, 1 ]);
    });

    it('places a stamp where it was copied from with the pointer off the map', () =>
    {
      // Arrange: event 3 copied and then deleted, so its own tile is free; the pointer left the canvas.
      const { hub, host, canvas, selection, map } = setUp();
      selection.select(1, [ 3 ]);
      host.focus();
      clipboardEvent('cut');
      pointAt(canvas, { x: 2, y: 2 });
      canvas.dispatchEvent(new MouseEvent('pointerleave'));

      // Act.
      clipboardEvent('paste');

      // Assert.
      expect([ map.event(4)?.x, map.event(4)?.y, hub.history(mapHistoryKey(1)).rows.map(row => row.label) ])
        .toStrictEqual([ 4, 2, [ 'Cut event', 'Paste event' ] ]);
    });

    it('takes a stamp copied in another window off the clipboard as the newest, and places it', () =>
    {
      // Arrange: this window has copied event 1; another window's stamp of one event is on the clipboard.
      const { hub, host, canvas, selection, stamps } = setUp();
      selection.select(1, [ 1 ]);
      host.focus();
      clipboardEvent('copy');
      const theirs = stampOf({ id: 'window-b:1', mapId: 7, events: [ { ...stampOf().events[0], name: 'Theirs' } ] });
      pointAt(canvas, { x: 3, y: 3 });

      // Act.
      clipboardEvent('paste', encodeStampClipboard(theirs));

      // Assert.
      expect([ stamps.stamps.map(stamp => stamp.id), hub.map('map:1').event(4)?.name, spotsOf(mapFileOf(hub, 1))[4] ])
        .toStrictEqual([ [ 'window-b:1', 'window-a:1' ], 'Theirs', [ 3, 3 ] ]);
    });

    it('leaves a paste to the page while the window holds no stamp and the clipboard none, or the view has no focus', () =>
    {
      // Arrange.
      const { hub, host, outside, selection } = setUp();
      host.focus();

      // Act: plain text with no stamp kept; then a stamp kept, with the focus outside the view.
      const empty = clipboardEvent('paste', 'Welcome to Nimbus!');
      selection.select(1, [ 3 ]);
      clipboardEvent('copy');
      outside.focus();
      const unfocused = clipboardEvent('paste');

      // Assert.
      expect([ empty.event.defaultPrevented, unfocused.event.defaultPrevented, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ false, false, 0 ]);
    });

    it('waits with a paste while anything is in hand', () =>
    {
      // Arrange.
      const { hub, host, selection, state } = setUp();
      selection.select(1, [ 3 ]);
      host.focus();
      clipboardEvent('copy');
      state.busy = true;

      // Act.
      const paste = clipboardEvent('paste');

      // Assert.
      expect([ paste.event.defaultPrevented, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ false, 0 ]);
    });

    it('says why a paste was refused, and what one left out', () =>
    {
      // Arrange: events 1 and 2 copied; the pointer over event 3's tile, then over the bottom-right corner.
      const { host, canvas, selection, notices } = setUp();
      selection.select(1, [ 1, 2 ]);
      host.focus();
      clipboardEvent('copy');

      // Act.
      pointAt(canvas, { x: 4, y: 2 });
      clipboardEvent('paste');
      pointAt(canvas, { x: 5, y: 3 });
      clipboardEvent('paste');

      // Assert: at 4, 2 event 1's copy would land on event 3; at 5, 3 event 2's copy falls past the right edge.
      expect(notices)
        .toStrictEqual([
          'Copied 2 events.',
          '1 of the stamp\'s 2 events would land on other events.',
          'One of the stamp\'s events fell past the map\'s edge and was left out.',
        ]);
    });
  });

  describe('the menu', () =>
  {
    it('copies to the clipboard, saying so, and keeps the stamp where the clipboard cannot be written, saying how to copy for other windows', async () =>
    {
      // Arrange: event 2 selected; first a clipboard that takes the text, then one that refuses.
      const { tools, selection, stamps, notices } = setUp();
      selection.select(1, [ 2 ]);
      let written = '';
      stubClipboard(async text =>
      {
        written = text;
      });

      // Act.
      await tools.copyToClipboard();
      stubClipboard(async () => Promise.reject(new Error('not allowed')));
      selection.select(1, [ 3 ]);
      await tools.copyToClipboard();

      // Assert.
      expect([ decodeStampClipboard(written)?.events.map(event => event.id), stamps.stamps.length, notices ])
        .toStrictEqual([ [ 2 ], 2, [ 'Copied event.', 'Copied event as a stamp; press Ctrl+C to copy it for other windows too.' ] ]);
    });

    it('cuts as one step once the stamp is kept, whether or not the clipboard could be written', async () =>
    {
      // Arrange: event 1 selected, and no clipboard at all.
      const { hub, tools, selection, stamps } = setUp();
      selection.select(1, [ 1 ]);

      // Act.
      await tools.cutToClipboard();

      // Assert.
      expect([ stamps.stamps.length, spotsOf(mapFileOf(hub, 1))[1], hub.history(mapHistoryKey(1)).rows.map(row => row.label) ])
        .toStrictEqual([ 1, null, [ 'Cut event' ] ]);
    });

    it('pastes what the clipboard read hands over at the right-clicked tile, or the newest stamp when it cannot be read', async () =>
    {
      // Arrange: another window's stamp on the clipboard; then a read that fails, with that stamp kept.
      const { hub, tools, state, selection } = setUp();
      state.clipboard = encodeStampClipboard(stampOf({ id: 'window-b:1', events: [ { ...stampOf().events[0], name: 'Theirs' } ] }));

      // Act.
      await tools.pasteFromClipboard({ x: 2, y: 3 });
      state.clipboard = null;
      await tools.pasteFromClipboard({ x: 3, y: 3 });

      // Assert.
      expect([ spotsOf(mapFileOf(hub, 1)).slice(4), hub.map('map:1').event(5)?.name, selection.eventsOn(1) ])
        .toStrictEqual([ [ [ 2, 3 ], [ 3, 3 ] ], 'Theirs', [ 5 ] ]);
    });

    it('says there is nothing to paste before anything is copied', async () =>
    {
      // Arrange.
      const { hub, tools, state, notices } = setUp();
      state.clipboard = 'Welcome to Nimbus!';

      // Act.
      await tools.pasteFromClipboard({ x: 2, y: 3 });

      // Assert.
      expect([ notices, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ [ 'There is nothing to paste yet; copy part of a map first.' ], 0 ]);
    });

    it('copies, cuts and pastes nothing with no map held', async () =>
    {
      // Arrange: the tools let go of the map, as a view does before one opens; another window's stamp on the clipboard.
      const { hub, tools, selection, stamps, notices, state } = setUp();
      selection.select(1, [ 1 ]);
      tools.setMap(null);
      stubClipboard(async () => undefined);
      state.clipboard = encodeStampClipboard(stampOf({ id: 'window-b:1' }));

      // Act.
      await tools.copyToClipboard();
      await tools.cutToClipboard();
      await tools.pasteFromClipboard({ x: 2, y: 2 });
      tools.settle({ ok: true, step: null, eventIds: [ 9 ], notes: [] });

      // Assert: the stamp read off the clipboard is kept, and nothing reached the map.
      expect([ stamps.stamps.map(stamp => stamp.id), notices, selection.eventsOn(1), tools.hover, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ [ 'window-b:1' ], [], [ 1 ], null, 0 ]);
    });
  });
});
