import { describe, expect, it } from 'vitest';
import { copyPatches } from '../../../../src/mapEditor/core/blueprints/copyPatches.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { applyJsonPatch, invertPatch } from '../../../../src/mapEditor/core/model/patches.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * A blueprint's change reaches each copy as patches, and taking the change back later asks whether anything changed since
 * in what those patches changed. So each patch is owed to be exactly as wide as the field it changes: a page's picture
 * whole, its speed alone, the one comment line a module's tag sits on, the name, the note. A patch wider than its field
 * (the whole event, say) would make every later edit anywhere in the copy, a speed typed into one of its comments, read as
 * a change to the picture, and the blueprint's change could never be taken back. A patch narrower than its field (one key
 * of the picture) would let an undo mix two pictures. A list that grows or shrinks is changed whole, since a set at a
 * place in it would land on whatever moved there.
 *
 * Every patch is a set at a path the copy already holds, which is all a map's file takes from a blueprint's change: the
 * server refuses anything else. Applied in order they make the planned copy exactly, and taken back newest first they give
 * the copy back exactly.
 *
 * Each copy has two pages and a command list holding a J-ABS speed and a light, so a change to one of them has siblings
 * that must stay untouched.
 */
describe('copyPatches', () =>
{
  /**
   * A comment command.
   * @param {string} text Its line.
   * @param {number} code 108 for a comment's first line, 408 for a line after it.
   * @returns {RmmzEventCommand} The command.
   */
  const comment = (text: string, code = 108): RmmzEventCommand => ({ code, indent: 0, parameters: [ text ] });

  /**
   * A battler's page: its picture, its speed, and its comments, an enemy and a speed, then a light.
   * @param {number} characterIndex Which character of the sheet it shows.
   * @returns {RmmzEventPage} The page.
   */
  const battlerPage = (characterIndex: number): RmmzEventPage => ({
    ...createEventPage(),
    image: { tileId: 0, characterName: 'm_shroomBIG', direction: 2, pattern: 1, characterIndex },
    list: [ comment('<enemyId:312>'), comment('<moveSpeed:4.2>', 408), comment('<light:[2, #bcd9ff, 10, pulse]>'), { code: 0, indent: 0, parameters: [] } ],
  });

  /**
   * A copy of a battler with two pages, as event 67.
   * @returns {RmmzMapEvent} The copy.
   */
  const battler = (): RmmzMapEvent => ({
    ...createMapEvent(67, 24, 43),
    name: 'ghastroom',
    note: '<blueprint:[555zclgm, 21]>',
    pages: [ battlerPage(7), battlerPage(7) ],
  });

  /**
   * Applies patches to a map holding the copy, in order, as a map takes a blueprint's change.
   * @param {RmmzMapEvent} copy The copy.
   * @param {readonly ReturnType<typeof copyPatches>} patches The patches.
   * @returns {RmmzMapEvent} The copy they leave.
   */
  const applied = (copy: RmmzMapEvent, patches: ReturnType<typeof copyPatches>): RmmzMapEvent =>
  {
    const map = { events: [ null, ...Array.from({ length: 66 }, () => null), structuredClone(copy) ] } as unknown as JsonValue;
    patches.forEach(patch => applyJsonPatch(map, patch));
    return (map as unknown as { events: RmmzMapEvent[] }).events[67];
  };

  it('changes nothing for a copy already as planned', () =>
  {
    // Arrange
    const copy = battler();

    // Act
    const patches = copyPatches(copy, structuredClone(copy));

    // Assert
    expect(patches)
      .toStrictEqual([]);
  });

  it('changes a new picture as the whole picture of its own page and nothing else', () =>
  {
    // Arrange: the first page shows another character; the second page, with the same picture before, keeps it.
    const copy = battler();
    const planned = structuredClone(copy);
    planned.pages[0].image = { ...planned.pages[0].image, characterIndex: 5 };

    // Act
    const patches = copyPatches(copy, planned);

    // Assert
    expect(patches)
      .toStrictEqual([
        {
          kind: 'set',
          path: [ 'events', 67, 'pages', 0, 'image' ],
          before: { tileId: 0, characterName: 'm_shroomBIG', direction: 2, pattern: 1, characterIndex: 7 },
          after: { tileId: 0, characterName: 'm_shroomBIG', direction: 2, pattern: 1, characterIndex: 5 },
        },
      ]);
  });

  it('changes a page\'s speed and its trigger each alone, on the page that changed', () =>
  {
    // Arrange
    const copy = battler();
    const planned = structuredClone(copy);
    planned.pages[1] = { ...planned.pages[1], moveSpeed: 5, trigger: 2 };

    // Act
    const patches = copyPatches(copy, planned);

    // Assert
    expect(patches.map(patch => [ patch.path, patch.before, patch.after ]))
      .toStrictEqual([
        [ [ 'events', 67, 'pages', 1, 'moveSpeed' ], 3, 5 ],
        [ [ 'events', 67, 'pages', 1, 'trigger' ], 0, 2 ],
      ]);
  });

  it('changes one comment line alone in a command list that keeps its length', () =>
  {
    // Arrange: the light's line changes; the speed line beside it, and every other command, stay.
    const copy = battler();
    const planned = structuredClone(copy);
    planned.pages[0].list[2] = comment('<light:[3.5, #bcd9ff, 10, pulse]>');

    // Act
    const patches = copyPatches(copy, planned);

    // Assert
    expect(patches)
      .toStrictEqual([
        {
          kind: 'set',
          path: [ 'events', 67, 'pages', 0, 'list', 2 ],
          before: comment('<light:[2, #bcd9ff, 10, pulse]>'),
          after: comment('<light:[3.5, #bcd9ff, 10, pulse]>'),
        },
      ]);
  });

  it('changes a command list that grows as the whole list, since every command after the new one moves', () =>
  {
    // Arrange
    const copy = battler();
    const planned = structuredClone(copy);
    planned.pages[0].list.splice(1, 0, comment('<motion:[stretch]>'));

    // Act
    const patches = copyPatches(copy, planned);

    // Assert
    expect(patches.map(patch => patch.path))
      .toStrictEqual([ [ 'events', 67, 'pages', 0, 'list' ] ]);
  });

  it('changes a page list that grows as the whole list of pages', () =>
  {
    // Arrange
    const copy = battler();
    const planned = structuredClone(copy);
    planned.pages.push(battlerPage(3));

    // Act
    const patches = copyPatches(copy, planned);

    // Assert
    expect(patches.map(patch => patch.path))
      .toStrictEqual([ [ 'events', 67, 'pages' ] ]);
  });

  it('changes the name and the note each alone', () =>
  {
    // Arrange
    const copy = battler();
    const planned = { ...structuredClone(copy), name: 'ghastroom king', note: 'boss\n<blueprint:[555zclgm, 21, p1.speed+1]>' };

    // Act
    const patches = copyPatches(copy, planned);

    // Assert
    expect(patches.map(patch => [ patch.path, patch.after ]))
      .toStrictEqual([
        [ [ 'events', 67, 'name' ], 'ghastroom king' ],
        [ [ 'events', 67, 'note' ], 'boss\n<blueprint:[555zclgm, 21, p1.speed+1]>' ],
      ]);
  });

  it('changes a page whole when the page gains a key, since no set can add one', () =>
  {
    // Arrange
    const copy = battler();
    const planned = structuredClone(copy);
    (planned.pages[0] as unknown as Record<string, JsonValue>)['extra'] = 1;
    planned.pages[0].moveSpeed = 5;

    // Act
    const patches = copyPatches(copy, planned);

    // Assert
    expect(patches.map(patch => patch.path))
      .toStrictEqual([ [ 'events', 67, 'pages', 0 ] ]);
  });

  it('changes the event whole when the event gains a key', () =>
  {
    // Arrange
    const copy = battler();
    const planned = { ...structuredClone(copy), extra: true, name: 'other' } as unknown as RmmzMapEvent;

    // Act
    const patches = copyPatches(copy, planned);

    // Assert
    expect(patches.map(patch => patch.path))
      .toStrictEqual([ [ 'events', 67 ] ]);
  });

  it('makes the planned copy exactly when applied in order, and gives the copy back when taken back newest first', () =>
  {
    // Arrange: a change to a picture, a speed, a line and the note at once.
    const copy = battler();
    const planned = structuredClone(copy);
    planned.pages[0].image = { ...planned.pages[0].image, characterIndex: 5 };
    planned.pages[1].moveSpeed = 6;
    planned.pages[1].list[1] = comment('<moveSpeed:5.2>', 408);
    planned.note = '<blueprint:[555zclgm, 21, p2.speed+1]>';
    const patches = copyPatches(copy, planned);

    // Act
    const made = applied(copy, patches);
    const takenBack = applied(made, [ ...patches ].reverse().map(patch => invertPatch(patch) as (typeof patches)[number]));

    // Assert
    expect([ patches.length, made, takenBack ])
      .toStrictEqual([ 4, planned, copy ]);
  });
});
