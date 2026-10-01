import { describe, expect, it } from 'vitest';
import { CellInspector, sameCell, type InspectorState } from '../../../../src/mapEditor/core/palette/cellInspector.ts';

/*
 * Which cell the stack view shows.
 *
 * The view follows the pointer over any map and keeps the last cell when the pointer leaves, so it can be read after.
 * A middle click holds a cell, so the pointer can cross other cells on its way to the view without the view following
 * it; clicking the held cell again lets it go. The view listens here, so a listener must hear every real change once
 * and nothing when the cell under the pointer has not changed, since the pointer reports every pixel it moves.
 */
const listening = () =>
{
  const inspector = new CellInspector();
  const heard: InspectorState[] = [];
  const stop = inspector.subscribe(state => heard.push(state));
  return { inspector, heard, stop };
};

describe('sameCell', () =>
{
  it('matches the same cell of the same map, and nothing else', () =>
  {
    // Arrange.
    const cell = { mapId: 3, x: 4, y: 5 };

    // Act.
    const matches = [
      sameCell(cell, { mapId: 3, x: 4, y: 5 }),
      sameCell(cell, { mapId: 2, x: 4, y: 5 }),
      sameCell(cell, { mapId: 3, x: 5, y: 5 }),
      sameCell(cell, { mapId: 3, x: 4, y: 6 }),
      sameCell(cell, null),
      sameCell(null, null),
    ];

    // Assert.
    expect(matches)
      .toStrictEqual([ true, false, false, false, false, true ]);
  });
});

describe('CellInspector', () =>
{
  it('starts showing no cell, unheld', () =>
  {
    // Arrange.
    const inspector = new CellInspector();

    // Act.
    const state = inspector.getState();

    // Assert.
    expect(state)
      .toStrictEqual({ cell: null, held: false });
  });

  it('follows the pointer from cell to cell, telling listeners only when the cell changes', () =>
  {
    // Arrange.
    const { inspector, heard } = listening();

    // Act: two moves within one cell, then onto the next.
    inspector.hover({ mapId: 1, x: 2, y: 2 });
    inspector.hover({ mapId: 1, x: 2, y: 2 });
    inspector.hover({ mapId: 1, x: 3, y: 2 });

    // Assert.
    expect(heard.map(state => state.cell))
      .toStrictEqual([ { mapId: 1, x: 2, y: 2 }, { mapId: 1, x: 3, y: 2 } ]);
  });

  it('holds a middle-clicked cell while the pointer crosses others', () =>
  {
    // Arrange.
    const { inspector } = listening();
    inspector.hover({ mapId: 1, x: 2, y: 2 });

    // Act.
    inspector.toggleHold({ mapId: 1, x: 2, y: 2 });
    inspector.hover({ mapId: 1, x: 7, y: 7 });

    // Assert.
    expect(inspector.getState())
      .toStrictEqual({ cell: { mapId: 1, x: 2, y: 2 }, held: true });
  });

  it('lets the held cell go when it is clicked again, and follows the pointer after', () =>
  {
    // Arrange.
    const { inspector } = listening();
    inspector.toggleHold({ mapId: 1, x: 2, y: 2 });

    // Act.
    inspector.toggleHold({ mapId: 1, x: 2, y: 2 });
    inspector.hover({ mapId: 1, x: 7, y: 7 });

    // Assert.
    expect(inspector.getState())
      .toStrictEqual({ cell: { mapId: 1, x: 7, y: 7 }, held: false });
  });

  it('holds another cell clicked while one is held, even on another map', () =>
  {
    // Arrange.
    const { inspector } = listening();
    inspector.toggleHold({ mapId: 1, x: 2, y: 2 });

    // Act.
    inspector.toggleHold({ mapId: 4, x: 2, y: 2 });

    // Assert.
    expect(inspector.getState())
      .toStrictEqual({ cell: { mapId: 4, x: 2, y: 2 }, held: true });
  });

  it('holds and lets go of the cell on show from the view itself, but holds nothing when none shows', () =>
  {
    // Arrange: one inspector showing nothing, another showing a cell.
    const empty = new CellInspector();
    const showing = new CellInspector();
    showing.hover({ mapId: 1, x: 0, y: 0 });

    // Act.
    empty.setHeld(true);
    showing.setHeld(true);
    const { held } = showing.getState();
    showing.setHeld(false);

    // Assert.
    expect([ empty.getState().held, held, showing.getState() ])
      .toStrictEqual([ false, true, { cell: { mapId: 1, x: 0, y: 0 }, held: false } ]);
  });

  it('tells no one when holding what is already held', () =>
  {
    // Arrange.
    const { inspector, heard } = listening();
    inspector.toggleHold({ mapId: 1, x: 2, y: 2 });

    // Act.
    inspector.setHeld(true);

    // Assert.
    expect(heard.length)
      .toBe(1);
  });

  it('forgets the cell when its map goes, and only then', () =>
  {
    // Arrange: a cell held on map 1.
    const { inspector } = listening();
    inspector.toggleHold({ mapId: 1, x: 2, y: 2 });

    // Act.
    inspector.forgetMap(2);
    const afterOther = inspector.getState();
    inspector.forgetMap(1);

    // Assert.
    expect([ afterOther.cell, inspector.getState() ])
      .toStrictEqual([ { mapId: 1, x: 2, y: 2 }, { cell: null, held: false } ]);
  });

  it('stops telling a listener once it stops listening', () =>
  {
    // Arrange.
    const { inspector, heard, stop } = listening();

    // Act.
    stop();
    inspector.hover({ mapId: 1, x: 2, y: 2 });

    // Assert.
    expect([ heard, inspector.getState().cell ])
      .toStrictEqual([ [], { mapId: 1, x: 2, y: 2 } ]);
  });
});
