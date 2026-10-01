/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { decodeEventClipboard, encodeEventClipboard, copyEvents } from '../../../src/mapEditor/core/events/eventClipboard.ts';
import { EventSelection } from '../../../src/mapEditor/core/events/EventSelection.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import type { Camera } from '../../../src/mapEditor/core/renderer/camera.ts';
import type { MapContextMenu, OverlayState } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { MapEventTools, type EventMenuRequest } from '../../../src/mapEditor/events/MapEventTools.ts';
import { hubWithMaps, mapFileOf, mapWithEvents, spotsOf } from '../support/eventFixtures.ts';

/*
 * The event tools are the map view's hands: they turn the mouse, the keys and the clipboard into the event services'
 * steps and the window's selection, and hand the renderer what to show. What they owe, beyond the services' own
 * promises: a click, a box and a drag each do what the gesture says (a drag shows ghosts and its drop is one undoable
 * step, or a refusal said aloud); a double-click opens an event, or places one on the ground and opens it; the keys act
 * only while the view has focus and nudge only when something is selected, and while the left button is down only Esc
 * acts, every other key (an undo included) waiting until it comes up; copy and paste go through the browser's
 * clipboard events with the map editor's marker, pasting under the pointer with fresh ids and leaving plain text
 * alone, the tile under the pointer following the camera as it zooms; a right click picks the event it lands on
 * before the menu opens; standing down ignores all of it; and an event removed by an undo leaves the selection.
 *
 * The view is at zoom 1 with the map's corner at the view's, so a tile is 48 pixels. The 6x4 map holds event 1 at
 * 0, 0, event 2 at 1, 0, and event 3 at 4, 2.
 */
describe('MapEventTools', () =>
{
  const built: MapEventTools[] = [];

  afterEach(() =>
  {
    built.splice(0).forEach(tools => tools.destroy());
    document.body.innerHTML = '';
  });

  /**
   * Builds the tools over the fixture map, in a view in the page, with a stand-in renderer that finds events by tile.
   * @returns {object} The tools and everything they were handed and said.
   */
  const setUp = () =>
  {
    const hub = hubWithMaps({ 1: mapWithEvents(6, 4, [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ] ]) });
    const map = hub.map('map:1');
    const host = document.createElement('div');
    host.tabIndex = 0;
    const canvas = document.createElement('canvas');
    Object.assign(canvas, { setPointerCapture: () => undefined });
    host.appendChild(canvas);
    document.body.appendChild(host);

    const overlays: OverlayState[] = [];
    const menus: ((menu: MapContextMenu) => void)[] = [];
    const cameraListeners: ((camera: Camera) => void)[] = [];
    const renderer = {
      canvas,
      camera: { x: 0, y: 0, zoom: 1 },
      eventAt: (point: { x: number; y: number }) => eventOn(map, Math.floor(point.x / 48), Math.floor(point.y / 48)),
      setOverlayState: (state: OverlayState) => overlays.push(state),
      onContextMenu: (listener: (menu: MapContextMenu) => void) =>
      {
        menus.push(listener);
        return () => undefined;
      },
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
    const opened: string[] = [];
    const notices: string[] = [];
    const menuRequests: EventMenuRequest[] = [];
    const clipboard: { text: string | null } = { text: null };
    const tools = new MapEventTools({
      renderer,
      host,
      hub,
      selection,
      openEvent: (mapId, eventId) => opened.push(`${mapId}:${eventId}`),
      readClipboard: async () => clipboard.text,
      notify: text => notices.push(text),
      openMenu: request => menuRequests.push(request),
    });
    tools.setMap(map);
    built.push(tools);
    return { hub, map, host, canvas, overlays, menus, selection, opened, notices, menuRequests, tools, clipboard, moveCamera };
  };

  /**
   * Finds the event standing on a tile.
   * @param {MapDocument} map The map.
   * @param {number} x The column.
   * @param {number} y The row.
   * @returns {number | null} The event, or null.
   */
  const eventOn = (map: MapDocument, x: number, y: number): number | null =>
  {
    return map.eventIds().find(id => map.event(id)?.x === x && map.event(id)?.y === y) ?? null;
  };

  /**
   * Sends a pointer event to the canvas at the middle of a tile, or at a point inside it.
   * @param {HTMLElement} target The canvas.
   * @param {string} type The event.
   * @param {{ x: number, y: number }} cell The tile.
   * @param {{ button?: number, shiftKey?: boolean, ctrlKey?: boolean, dx?: number }} options The button, the modifiers,
   * and how far right of the tile's middle the point is.
   */
  const point = (
    target: HTMLElement, type: string, cell: { x: number; y: number }, options: { button?: number; shiftKey?: boolean; ctrlKey?: boolean; dx?: number } = {}) =>
  {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: options.button ?? 0, shiftKey: options.shiftKey, ctrlKey: options.ctrlKey });
    Object.defineProperties(event, {
      offsetX: { value: cell.x * 48 + 24 + (options.dx ?? 0) },
      offsetY: { value: cell.y * 48 + 24 },
      pointerId: { value: 1 },
    });
    target.dispatchEvent(event);
  };

  /**
   * Clicks a tile: presses and releases there.
   * @param {HTMLElement} canvas The canvas.
   * @param {{ x: number, y: number }} cell The tile.
   * @param {{ shiftKey?: boolean, ctrlKey?: boolean }} held The modifiers held.
   */
  const click = (canvas: HTMLElement, cell: { x: number; y: number }, held: { shiftKey?: boolean; ctrlKey?: boolean } = {}) =>
  {
    point(canvas, 'pointerdown', cell, held);
    point(canvas, 'pointerup', cell, held);
  };

  /**
   * Presses a key on an element.
   * @param {HTMLElement} target The element.
   * @param {string} name The key.
   * @param {{ ctrlKey?: boolean }} held The modifiers held.
   * @returns {KeyboardEvent} The event, to see whether it was taken.
   */
  const key = (target: HTMLElement, name: string, held: { ctrlKey?: boolean } = {}): KeyboardEvent =>
  {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ctrlKey: held.ctrlKey ?? false });
    target.dispatchEvent(event);
    return event;
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

  describe('clicks and boxes', () =>
  {
    it('selects the clicked event, adds with Shift, toggles with Ctrl, and clears on a click on the ground', () =>
    {
      // Arrange.
      const { canvas, selection } = setUp();
      const seen: (readonly number[])[] = [];

      // Act.
      click(canvas, { x: 0, y: 0 });
      seen.push(selection.eventsOn(1));
      click(canvas, { x: 4, y: 2 }, { shiftKey: true });
      seen.push(selection.eventsOn(1));
      click(canvas, { x: 0, y: 0 }, { ctrlKey: true });
      seen.push(selection.eventsOn(1));
      click(canvas, { x: 3, y: 3 });
      seen.push(selection.eventsOn(1));

      // Assert.
      expect(seen)
        .toStrictEqual([ [ 1 ], [ 1, 3 ], [ 3 ], [] ]);
    });

    it('selects the events inside a box drawn from the ground, showing the box and its catch while it is drawn', () =>
    {
      // Arrange: a box from 0, 1 up to 2, 0 holds events 1 and 2, and not event 3.
      const { canvas, selection, overlays } = setUp();

      // Act.
      point(canvas, 'pointerdown', { x: 2, y: 1 });
      point(canvas, 'pointermove', { x: 0, y: 0 });
      const drawing = overlays[overlays.length - 1];
      point(canvas, 'pointerup', { x: 0, y: 0 });

      // Assert.
      expect([ drawing.selectionBox, drawing.selectedEvents, selection.eventsOn(1), overlays[overlays.length - 1].selectionBox ])
        .toStrictEqual([ { x: 0, y: 0, width: 144, height: 96 }, [ 1, 2 ], [ 1, 2 ], null ]);
    });

    it('asks for the menu where a right click landed, picking the event there first', () =>
    {
      // Arrange: event 1 is selected; the right click lands on event 3.
      const { menus, selection, menuRequests } = setUp();
      selection.select(1, [ 1 ]);

      // Act.
      menus.forEach(listener => listener({ point: { x: 216, y: 120 }, cell: { x: 4, y: 2 }, eventId: 3 }));

      // Assert: jsdom lays the canvas out at the page's corner.
      expect([ selection.eventsOn(1), menuRequests ])
        .toStrictEqual([ [ 3 ], [ { x: 216, y: 120, cell: { x: 4, y: 2 }, eventId: 3 } ] ]);
    });
  });

  describe('dragging', () =>
  {
    it('shows ghosts while dragging and moves the selection by the tiles dragged on the drop, as one undoable step', () =>
    {
      // Arrange: events 1 and 2 selected, dragged by event 2 two tiles down.
      const { hub, canvas, selection, overlays } = setUp();
      selection.select(1, [ 1, 2 ]);

      // Act.
      point(canvas, 'pointerdown', { x: 1, y: 0 });
      point(canvas, 'pointermove', { x: 1, y: 2 });
      const dragging = overlays[overlays.length - 1];
      point(canvas, 'pointerup', { x: 1, y: 2 });
      const moved = spotsOf(mapFileOf(hub, 1));
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ dragging.ghostEvents.map(ghost => [ ghost.x, ghost.y ]), moved, spotsOf(mapFileOf(hub, 1)), selection.eventsOn(1) ])
        .toStrictEqual([ [ [ 0, 2 ], [ 1, 2 ] ], [ null, [ 0, 2 ], [ 1, 2 ], [ 4, 2 ] ], [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ] ], [ 1, 2 ] ]);
    });

    it('marks the tiles other events hold while dragging over them, and refuses that drop aloud, changing nothing', () =>
    {
      // Arrange: event 1 alone, dragged onto event 2.
      const { hub, canvas, overlays, notices, tools } = setUp();
      click(canvas, { x: 0, y: 0 });

      // Act.
      point(canvas, 'pointerdown', { x: 0, y: 0 });
      point(canvas, 'pointermove', { x: 1, y: 0 });
      const blocked = overlays[overlays.length - 1].blockedCells;
      point(canvas, 'pointerup', { x: 1, y: 0 });

      // Assert.
      expect([ blocked, notices, spotsOf(mapFileOf(hub, 1)), tools.state().refusedDrops ])
        .toStrictEqual([ [ { x: 1, y: 0 } ], [ 'Another event is in the way.' ], [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ] ], 1 ]);
    });

    it('holds nudges, deletes and undo while the left button is down, and takes keys again once it comes up', () =>
    {
      // Arrange: event 3 is selected, and an undo pressed before any drag is the workspace's to take.
      const { hub, canvas, host, selection } = setUp();
      selection.select(1, [ 3 ]);
      const undoBefore = key(host, 'z', { ctrlKey: true }).defaultPrevented;
      point(canvas, 'pointerdown', { x: 4, y: 2 });
      point(canvas, 'pointermove', { x: 4, y: 3 });

      // Act: an arrow, Delete and Ctrl+Z mid-drag; then the drop, and an arrow once the button is up.
      const held = [ key(host, 'ArrowUp'), key(host, 'Delete'), key(host, 'z', { ctrlKey: true }) ].map(event => event.defaultPrevented);
      const midDrag = spotsOf(mapFileOf(hub, 1));
      point(canvas, 'pointerup', { x: 4, y: 3 });
      const [ , , , dropped ] = spotsOf(mapFileOf(hub, 1));
      key(host, 'ArrowUp');

      // Assert: nothing changed mid-drag, the drop landed whole, and the arrow nudged afterwards.
      expect([ undoBefore, held, midDrag, dropped, spotsOf(mapFileOf(hub, 1))[3] ])
        .toStrictEqual([ false, [ true, true, true ], [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ] ], [ 4, 3 ], [ 4, 2 ] ]);
    });

    it('moves the ghosts of a drag in hand with the camera when a zoom puts another tile under the still pointer', () =>
    {
      // Arrange: event 3 dragged one tile down; at zoom 2 the pointer's spot lies over tile 2, 1.
      const { canvas, selection, overlays, moveCamera } = setUp();
      selection.select(1, [ 3 ]);
      point(canvas, 'pointerdown', { x: 4, y: 2 });
      point(canvas, 'pointermove', { x: 4, y: 3 });
      const beforeTheZoom = overlays[overlays.length - 1].ghostEvents.map(ghost => [ ghost.x, ghost.y ]);

      // Act.
      moveCamera({ x: 0, y: 0, zoom: 2 });

      // Assert.
      expect([ beforeTheZoom, overlays[overlays.length - 1].ghostEvents.map(ghost => [ ghost.x, ghost.y ]) ])
        .toStrictEqual([ [ [ 4, 3 ] ], [ [ 2, 1 ] ] ]);
    });

    it('drops a drag without moving anything on Esc', () =>
    {
      // Arrange.
      const { hub, canvas, host, overlays } = setUp();
      click(canvas, { x: 4, y: 2 });
      point(canvas, 'pointerdown', { x: 4, y: 2 });
      point(canvas, 'pointermove', { x: 4, y: 3 });

      // Act.
      key(host, 'Escape');
      point(canvas, 'pointerup', { x: 4, y: 3 });

      // Assert.
      expect([ overlays[overlays.length - 1].ghostEvents, spotsOf(mapFileOf(hub, 1))[3] ])
        .toStrictEqual([ [], [ 4, 2 ] ]);
    });
  });

  describe('double-clicks', () =>
  {
    it('opens a double-clicked event, and places an event on double-clicked ground and opens that', () =>
    {
      // Arrange.
      const { hub, canvas, opened, selection } = setUp();

      // Act.
      point(canvas, 'dblclick', { x: 1, y: 0 });
      point(canvas, 'dblclick', { x: 2, y: 3 });

      // Assert: the new event takes id 4, and is selected.
      expect([ opened, spotsOf(mapFileOf(hub, 1))[4], selection.eventsOn(1) ])
        .toStrictEqual([ [ '1:2', '1:4' ], [ 2, 3 ], [ 4 ] ]);
    });
  });

  describe('keys', () =>
  {
    it('nudges, duplicates, selects all, opens, deletes and deselects the selection, taking each key', () =>
    {
      // Arrange: event 3 selected.
      const { hub, host, selection, opened } = setUp();
      selection.select(1, [ 3 ]);

      // Act.
      const taken = [ key(host, 'ArrowUp'), key(host, 'd', { ctrlKey: true }) ].map(event => event.defaultPrevented);
      const afterDuplicate = spotsOf(mapFileOf(hub, 1));
      key(host, 'a', { ctrlKey: true });
      const all = selection.eventsOn(1);
      key(host, 'Enter');
      key(host, 'Delete');
      const afterDelete = spotsOf(mapFileOf(hub, 1));
      selection.select(1, [ 1 ]);
      key(host, 'Escape');

      // Assert: the nudge took event 3 up to 4, 1, and its copy went right of it, to 5, 1, as id 4.
      expect([ taken, afterDuplicate, all, opened, afterDelete, selection.eventsOn(1) ])
        .toStrictEqual([
          [ true, true ],
          [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 1 ], [ 5, 1 ] ],
          [ 1, 2, 3, 4 ],
          [ '1:4' ],
          [ null, null, null, null, null ],
          [],
        ]);
    });

    it('leaves the arrows to the page with nothing selected', () =>
    {
      // Arrange.
      const { host } = setUp();

      // Act.
      const event = key(host, 'ArrowDown');

      // Assert.
      expect(event.defaultPrevented)
        .toBe(false);
    });
  });

  describe('clipboard', () =>
  {
    it('copies the selection with the marker while the view has focus, and leaves a copy elsewhere alone', () =>
    {
      // Arrange: event 2 selected.
      const { host, map, selection, notices } = setUp();
      selection.select(1, [ 2 ]);

      // Act: once with the focus elsewhere, then with the view focused.
      const elsewhere = clipboardEvent('copy');
      host.focus();
      const focused = clipboardEvent('copy');

      // Assert.
      expect([ elsewhere.event.defaultPrevented, focused.event.defaultPrevented, decodeEventClipboard(focused.written()), notices ])
        .toStrictEqual([ false, true, copyEvents(map, 1, [ 2 ]), [ 'Copied event.' ] ]);
    });

    it('cuts the selection to the clipboard, removing it as one undoable step', () =>
    {
      // Arrange.
      const { hub, host, map, selection } = setUp();
      selection.select(1, [ 1 ]);
      const copy = copyEvents(map, 1, [ 1 ]);
      host.focus();

      // Act.
      const cut = clipboardEvent('cut');

      // Assert.
      expect([ cut.event.defaultPrevented, decodeEventClipboard(cut.written()), spotsOf(mapFileOf(hub, 1))[1], hub.history(mapHistoryKey(1)).rows.map(row => row.label) ])
        .toStrictEqual([ true, copy, null, [ 'Cut event' ] ]);
    });

    it('pastes copied events with their corner on the tile under the pointer, with fresh ids, selecting them', () =>
    {
      // Arrange: events 1 and 2 copied, the pointer resting on 2, 2.
      const { hub, host, map, canvas, selection } = setUp();
      const text = encodeEventClipboard(copyEvents(map, 1, [ 1, 2 ]) as NonNullable<ReturnType<typeof copyEvents>>);
      point(canvas, 'pointermove', { x: 2, y: 2 });
      host.focus();

      // Act.
      const paste = clipboardEvent('paste', text);

      // Assert.
      expect([ paste.event.defaultPrevented, spotsOf(mapFileOf(hub, 1)), selection.eventsOn(1) ])
        .toStrictEqual([ true, [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ], [ 2, 2 ], [ 3, 2 ] ], [ 4, 5 ] ]);
    });

    it('lands a paste on the tile a zoom puts under the still pointer, not the one it rested on before', () =>
    {
      // Arrange: event 3 copied, the pointer resting over 2, 2; at zoom 2 that spot lies over tile 1, 1.
      const { hub, host, map, canvas, moveCamera } = setUp();
      const text = encodeEventClipboard(copyEvents(map, 1, [ 3 ]) as NonNullable<ReturnType<typeof copyEvents>>);
      point(canvas, 'pointermove', { x: 2, y: 2 });
      host.focus();
      moveCamera({ x: 0, y: 0, zoom: 2 });

      // Act.
      clipboardEvent('paste', text);

      // Assert.
      expect(spotsOf(mapFileOf(hub, 1))[4])
        .toStrictEqual([ 1, 1 ]);
    });

    it('pastes from the menu what the clipboard read hands over, with the corner on the right-clicked tile', async () =>
    {
      // Arrange: event 3 copied; the read answers with it.
      const { hub, map, tools, clipboard, selection } = setUp();
      clipboard.text = encodeEventClipboard(copyEvents(map, 1, [ 3 ]) as NonNullable<ReturnType<typeof copyEvents>>);

      // Act.
      await tools.pasteFromClipboard({ x: 2, y: 3 });

      // Assert.
      expect([ spotsOf(mapFileOf(hub, 1))[4], selection.eventsOn(1) ])
        .toStrictEqual([ [ 2, 3 ], [ 4 ] ]);
    });

    it('says why the menu pasted nothing: a clipboard it could not read, or one holding no events', async () =>
    {
      // Arrange.
      const { hub, tools, clipboard, notices } = setUp();

      // Act.
      await tools.pasteFromClipboard({ x: 2, y: 3 });
      clipboard.text = 'Welcome to Nimbus!';
      await tools.pasteFromClipboard({ x: 2, y: 3 });

      // Assert.
      expect([ notices, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ [ 'The clipboard could not be read here; press Ctrl+V to paste instead.', 'The clipboard holds no events to paste.' ], 0 ]);
    });

    it('leaves a paste of anything but copied events to the page, changing nothing', () =>
    {
      // Arrange.
      const { hub, host } = setUp();
      host.focus();

      // Act.
      const paste = clipboardEvent('paste', 'Welcome to Nimbus!');

      // Assert.
      expect([ paste.event.defaultPrevented, hub.history(mapHistoryKey(1)).rows.length ])
        .toStrictEqual([ false, 0 ]);
    });
  });

  describe('standing down and following the map', () =>
  {
    it('ignores clicks and keys while stood down, and answers them again once back', () =>
    {
      // Arrange.
      const { canvas, host, selection, tools } = setUp();
      tools.setEnabled(false);

      // Act.
      click(canvas, { x: 0, y: 0 });
      const whileDown = [ selection.eventsOn(1), key(host, 'a', { ctrlKey: true }).defaultPrevented ];
      tools.setEnabled(true);
      click(canvas, { x: 0, y: 0 });

      // Assert.
      expect([ whileDown, selection.eventsOn(1) ])
        .toStrictEqual([ [ [], false ], [ 1 ] ]);
    });

    it('drops from the selection an event an undo removes, once the undo is done', async () =>
    {
      // Arrange: a new event placed and selected with event 1.
      const { hub, canvas, selection, tools } = setUp();
      point(canvas, 'dblclick', { x: 2, y: 3 });
      selection.select(1, [ 1, 4 ]);

      // Act.
      hub.undo(mapHistoryKey(1));
      await Promise.resolve();

      // Assert.
      expect([ selection.eventsOn(1), tools.state().selected ])
        .toStrictEqual([ [ 1 ], 1 ]);
    });

    it('picks out an event it holds, selecting it and saying where it stands, and nothing for one it does not', () =>
    {
      // Arrange.
      const { selection, tools } = setUp();

      // Act.
      const found = tools.pick(3);
      const missing = tools.pick(9);

      // Assert.
      expect([ found, missing, selection.eventsOn(1) ])
        .toStrictEqual([ { x: 4, y: 2 }, null, [ 3 ] ]);
    });
  });
});
