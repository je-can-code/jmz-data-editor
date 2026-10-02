import type { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { NO_OVERLAY_STATE, type OverlayState } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { drawPointerOverlays, drawSelection, OverlayColour } from '../../../../src/mapEditor/render/scene/pointerOverlays.ts';

/*
 * The pointer overlays are drawn in two parts, because a selection can hold every event on a map (600 on Map361)
 * while the pointer moves every frame. The selection part draws the selected events' tiles and the selected tile area,
 * and nothing else, so it is redrawn only when the selection changes. The pointer part draws the box, every ghost
 * event's landing tile (an event with no picture has only that to show where it would land), the blocked tiles in red,
 * and the hover on top. Each part clears before drawing and draws nothing its switch has turned off.
 */
describe('pointerOverlays', () =>
{
  /**
   * Stands in for pixi's Graphics, recording each rectangle with how it was filled or stroked, and each clear.
   * @returns {{ graphics: Graphics, log: string[] }} The stand-in and its record.
   */
  const recorder = (): { graphics: Graphics; log: string[] } =>
  {
    const log: string[] = [];
    let last = '';
    const graphics = {
      clear: () =>
      {
        log.push('clear');
        return graphics;
      },
      rect: (x: number, y: number, width: number, height: number) =>
      {
        last = `${x},${y} ${width}x${height}`;
        return graphics;
      },
      fill: (style: { color: number }) =>
      {
        log.push(`fill ${last} #${style.color.toString(16)}`);
        return graphics;
      },
      stroke: (style: { color: number }) =>
      {
        log.push(`stroke ${last} #${style.color.toString(16)}`);
        return graphics;
      },
    };

    return { graphics: graphics as unknown as Graphics, log };
  };

  const everything = { hover: true, selection: true, ghost: true };
  const events: Readonly<Record<number, { x: number; y: number }>> = { 4: { x: 1, y: 2 }, 7: { x: 3, y: 0 } };
  const eventCell = (id: number) => events[id] ?? null;
  const selection = OverlayColour.selection.toString(16);
  const blocked = OverlayColour.blocked.toString(16);

  describe('drawSelection', () =>
  {
    it('draws the selected events\' tiles and the selected area, and passes over an event it cannot find', () =>
    {
      // Arrange: event 9 is not on the map; a box and a hover are about, which this part never draws.
      const { graphics, log } = recorder();
      const state: OverlayState = {
        ...NO_OVERLAY_STATE,
        selectedEvents: [ 4, 9, 7 ],
        selectedCells: { x: 0, y: 0, width: 2, height: 1 },
        selectionBox: { x: 0, y: 0, width: 96, height: 96 },
        hover: { x: 2, y: 2, width: 1, height: 1 },
      };

      // Act.
      drawSelection(graphics, state, everything, eventCell, 10);

      // Assert.
      expect(log)
        .toStrictEqual([
          'clear',
          `fill 10,20 10x10 #${selection}`,
          `stroke 10,20 10x10 #${selection}`,
          `fill 30,0 10x10 #${selection}`,
          `stroke 30,0 10x10 #${selection}`,
          `fill 0,0 20x10 #${OverlayColour.cells.toString(16)}`,
          `stroke 0,0 20x10 #${OverlayColour.cells.toString(16)}`,
        ]);
    });

    it('only clears while the selection overlay is off', () =>
    {
      // Arrange.
      const { graphics, log } = recorder();

      // Act.
      drawSelection(graphics, { ...NO_OVERLAY_STATE, selectedEvents: [ 4 ] }, { ...everything, selection: false }, eventCell, 10);

      // Assert.
      expect(log)
        .toStrictEqual([ 'clear' ]);
    });
  });

  describe('drawPointerOverlays', () =>
  {
    const image = { tileId: 0, characterName: '', direction: 2, pattern: 0, characterIndex: 0 };

    it('draws the box, each ghost\'s landing tile, the blocked tiles in red, then the hover, never the selection', () =>
    {
      // Arrange.
      const { graphics, log } = recorder();
      const state: OverlayState = {
        ...NO_OVERLAY_STATE,
        selectedEvents: [ 4 ],
        selectionBox: { x: 0, y: 0, width: 30, height: 20 },
        ghostEvents: [ { x: 1, y: 1, image, priorityType: 0 }, { x: 2, y: 1, image, priorityType: 0 } ],
        blockedCells: [ { x: 2, y: 1 } ],
        hover: { x: 4, y: 4, width: 1, height: 1 },
      };

      // Act.
      drawPointerOverlays(graphics, state, everything, 10);

      // Assert.
      expect(log)
        .toStrictEqual([
          'clear',
          `fill 0,0 30x20 #${selection}`,
          `stroke 0,0 30x20 #${selection}`,
          `stroke 10,10 10x10 #${selection}`,
          `stroke 20,10 10x10 #${selection}`,
          `fill 20,10 10x10 #${blocked}`,
          `stroke 20,10 10x10 #${blocked}`,
          'fill 40,40 10x10 #ffffff',
          'stroke 40,40 10x10 #ffffff',
        ]);
    });

    it('draws nothing its switch has turned off', () =>
    {
      // Arrange: the box, ghosts and hover all about, with every switch off.
      const { graphics, log } = recorder();
      const state: OverlayState = {
        ...NO_OVERLAY_STATE,
        selectionBox: { x: 0, y: 0, width: 30, height: 20 },
        ghostEvents: [ { x: 1, y: 1, image, priorityType: 0 } ],
        blockedCells: [ { x: 1, y: 1 } ],
        hover: { x: 4, y: 4, width: 1, height: 1 },
      };

      // Act.
      drawPointerOverlays(graphics, state, { hover: false, selection: false, ghost: false }, 10);

      // Assert.
      expect(log)
        .toStrictEqual([ 'clear' ]);
    });
  });
});
