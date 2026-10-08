/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EventSelection } from '../../../src/mapEditor/core/events/EventSelection.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import { screenToWorld, type Camera } from '../../../src/mapEditor/core/renderer/camera.ts';
import type { MapContextMenu, OverlayState } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { MapEventTools, type EventMenuRequest } from '../../../src/mapEditor/events/MapEventTools.ts';
import { hubWithMaps, mapFileOf, mapWithEvents, spotsOf } from '../support/eventFixtures.ts';

/*
 * The event tools are the map view's hands: they turn the mouse and the keys into the event services' steps and the
 * window's selection, and hand the renderer what to show. What they owe, beyond the services' own promises: a click, a
 * box and a drag each do what the gesture says (a drag shows ghosts and its drop is one undoable step, or a refusal
 * said aloud); a double-click opens an event, or places one on the ground and opens it, acting on the spot its presses
 * landed on even where the browser reports the double-click itself in whole pixels a tile away, as it does zoomed out
 * at a device pixel ratio of 1.5; a click on the tile beside an event never picks it; the keys act only while the view
 * has focus and nudge only when something is selected, never answer a key another tool took first, and while the left
 * button is down only Esc acts, every other key (an undo included) waiting until it comes up; a right click picks the
 * event it lands on before the menu opens; standing down ignores all of it; and an event removed by an undo leaves the
 * selection. Copying, cutting and pasting are the stamp tools' (see MapStampTools.test.ts).
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
   * Builds the tools over the fixture map, in a view in the page, with a stand-in renderer that finds events by the
   * tile under a point through its camera.
   * @param {Camera} startCamera Where the view looks; left out, at zoom 1 with the map's corner at the view's.
   * @param {string | null} linkRefusal Why the map may hold no copy of a blueprint; left out, it may.
   * @returns {object} The tools and everything they were handed and said.
   */
  const setUp = (startCamera: Camera = { x: 0, y: 0, zoom: 1 }, linkRefusal: string | null = null) =>
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
      camera: startCamera,
      eventAt: (point: { x: number; y: number }) =>
      {
        const world = screenToWorld(renderer.camera, point);
        return eventOn(map, Math.floor(world.x / 48), Math.floor(world.y / 48));
      },
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
    const tools = new MapEventTools({
      renderer,
      host,
      hub,
      selection,
      openEvent: (mapId, eventId) => opened.push(`${mapId}:${eventId}`),
      notify: text => notices.push(text),
      openMenu: request => menuRequests.push(request),
      linkRefusal: () => linkRefusal,
    });
    tools.setMap(map);
    built.push(tools);
    return { hub, map, host, canvas, overlays, menus, selection, opened, notices, menuRequests, tools, moveCamera };
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
   * Sends a pointer or mouse event with the left button to the canvas at an exact spot in the view, fractions and all,
   * as Chromium reports one: pointer events at the pointer's spot, mouse events at a whole-pixel spot.
   * @param {HTMLElement} target The canvas.
   * @param {string} type The event.
   * @param {{ x: number, y: number }} spot The spot, in CSS pixels from the canvas's corner.
   */
  const pointAt = (target: HTMLElement, type: string, spot: { x: number; y: number }) =>
  {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperties(event, {
      offsetX: { value: spot.x },
      offsetY: { value: spot.y },
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

  describe('at a device pixel ratio of 1.5, zoomed out and panned', () =>
  {
    /*
     * The view looks from -2, -10 at a quarter of the game's scale, so a tile is 12 CSS pixels and event 3's tile, 4, 2,
     * spans 48.5 to 60.5 across and 26.5 to 38.5 down. The tiles left of it (3, 2) and above it (4, 1) are empty. At 1.5
     * a device pixel is two thirds of a CSS pixel, and the canvas sits at 300, 181.67 on the page, as in the workspace:
     * device pixel 523 across lands at 48.67 in the view, which pointer events report as it is and mouse events as 48
     * (page 348.67 cut to 348, less the canvas's 300); device pixel 313 down lands at 27, reported to mouse events as 26
     * (page 208.67 cut to 208, less 181.67, cut again).
     */
    const ZOOMED_OUT: Camera = { x: -2, y: -10, zoom: 0.25 };

    it('selects the event pressed just inside its tile\'s edges, and nothing pressed on the empty tile just beside each', () =>
    {
      // Arrange: inside the left edge at 48.67, then just left of it at 48 on tile 3, 2; inside the top edge at 27, then
      // just above it at 26.33 on tile 4, 1.
      const { canvas, selection } = setUp(ZOOMED_OUT);
      const seen: (readonly number[])[] = [];

      // Act.
      [ { x: 48.666666666666686, y: 32.33333333333334 }, { x: 48, y: 32.33333333333334 }, { x: 54.666666666666686, y: 27 }, { x: 54.666666666666686, y: 26.333333333333343 } ]
        .forEach(spot =>
        {
          pointAt(canvas, 'pointerdown', spot);
          pointAt(canvas, 'pointerup', spot);
          seen.push(selection.eventsOn(1));
        });

      // Assert.
      expect(seen)
        .toStrictEqual([ [ 3 ], [], [ 3 ], [] ]);
    });

    it('opens the event double-clicked just inside its tile\'s left edge, though the double-click reports a spot on the tile beside it', () =>
    {
      // Arrange: both presses at 48.67, 32.33 on event 3; the double-click they make reports 48, 32, on tile 3, 2.
      const { hub, canvas, opened } = setUp(ZOOMED_OUT);
      const press = { x: 48.666666666666686, y: 32.33333333333334 };

      // Act.
      [ 'pointerdown', 'pointerup', 'pointerdown', 'pointerup' ].forEach(type => pointAt(canvas, type, press));
      pointAt(canvas, 'dblclick', { x: 48, y: 32 });

      // Assert: event 3 opened, and nothing was placed on tile 3, 2.
      expect([ opened, spotsOf(mapFileOf(hub, 1)) ])
        .toStrictEqual([ [ '1:3' ], [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ] ] ]);
    });

    it('opens the event double-clicked just inside its tile\'s top edge, though the double-click reports a spot on the tile above', () =>
    {
      // Arrange: both presses at 54.67, 27 on event 3; the double-click they make reports 54, 26, on tile 4, 1.
      const { hub, canvas, opened } = setUp(ZOOMED_OUT);
      const press = { x: 54.666666666666686, y: 27 };

      // Act.
      [ 'pointerdown', 'pointerup', 'pointerdown', 'pointerup' ].forEach(type => pointAt(canvas, type, press));
      pointAt(canvas, 'dblclick', { x: 54, y: 26 });

      // Assert: event 3 opened, and nothing was placed on tile 4, 1.
      expect([ opened, spotsOf(mapFileOf(hub, 1)) ])
        .toStrictEqual([ [ '1:3' ], [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ] ] ]);
    });

    it('places an event on the empty tile beside, double-clicked there, and opens it', () =>
    {
      // Arrange: both presses at 48, 32.33 on tile 3, 2, just left of event 3; the double-click reports 48, 32.
      const { hub, canvas, opened, selection } = setUp(ZOOMED_OUT);
      const press = { x: 48, y: 32.33333333333334 };

      // Act.
      [ 'pointerdown', 'pointerup', 'pointerdown', 'pointerup' ].forEach(type => pointAt(canvas, type, press));
      pointAt(canvas, 'dblclick', { x: 48, y: 32 });

      // Assert: the new event takes id 4 on tile 3, 2, is selected and opened, and event 3 is where it was.
      expect([ opened, spotsOf(mapFileOf(hub, 1)), selection.eventsOn(1) ])
        .toStrictEqual([ [ '1:4' ], [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ], [ 3, 2 ] ], [ 4 ] ]);
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

    it('refuses Ctrl+D on a map that may hold no copy of a blueprint when the selection holds one, saying why', () =>
    {
      // Arrange: the map is J-ABS's action map, and event 3 is a copy of a blueprint.
      const refusal = 'this map holds J-ABS\'s action templates, which the game reads, so blueprints stay off it';
      const { hub, host, selection, notices } = setUp(undefined, refusal);
      hub.edit('Link', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'events', 3, 'note' ], '<blueprint:[k3x9q2mf, 7]>'));
      selection.select(1, [ 3 ]);

      // Act.
      key(host, 'd', { ctrlKey: true });

      // Assert: nothing was placed.
      expect([ notices, spotsOf(mapFileOf(hub, 1)) ])
        .toStrictEqual([
          [ `The selection holds copies of blueprints, which can't go here: ${refusal}.` ],
          [ null, [ 0, 0 ], [ 1, 0 ], [ 4, 2 ] ],
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

    it('leaves a key another tool took first alone, such as the Esc that put a stamp down', () =>
    {
      // Arrange: event 1 selected, and a listener ahead of the tools taking Esc, as the painting tools take it to put a
      // stamp down; a Delete nobody took acts as ever.
      const { hub, host, selection } = setUp();
      selection.select(1, [ 1 ]);
      const takeEscape = (event: KeyboardEvent) =>
      {
        if (event.key === 'Escape')
        {
          event.preventDefault();
        }
      };
      window.addEventListener('keydown', takeEscape, true);

      // Act.
      key(host, 'Escape');
      const afterEscape = selection.eventsOn(1);
      key(host, 'Delete');
      window.removeEventListener('keydown', takeEscape, true);

      // Assert: the selection survived the taken Esc, and the Delete removed event 1.
      expect([ afterEscape, spotsOf(mapFileOf(hub, 1))[1] ])
        .toStrictEqual([ [ 1 ], null ]);
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
