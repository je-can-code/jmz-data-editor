import { describe, expect, it } from 'vitest';
import { eventKeyFor } from '../../../../src/mapEditor/core/events/eventKeys.ts';

/*
 * The keys a map answers for its events: bare arrows nudge the selection a tile, Ctrl (or Cmd) with A selects every
 * event, and Ctrl+D, Delete, Enter and Esc duplicate, delete, open and deselect, as everywhere in the editor. Nothing
 * else is the map's: copy, cut and paste arrive as the browser's clipboard events, undo, redo and save are the
 * workspace's, an arrow held with a modifier is left alone, and a key typed into a text field is always the field's.
 */
describe('eventKeyFor', () =>
{
  /**
   * Builds a key press.
   * @param {string} key The key.
   * @param {{ ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean }} held The modifiers held.
   * @returns {{ key: string, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean, altKey: boolean }} The press.
   */
  const press = (key: string, held: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}) =>
  {
    return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...held };
  };

  it('nudges a tile each way on the bare arrows', () =>
  {
    // Arrange.
    const keys = [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ];

    // Act.
    const actions = keys.map(key => eventKeyFor(press(key), null));

    // Assert.
    expect(actions)
      .toStrictEqual([
        { kind: 'nudge', dx: -1, dy: 0 },
        { kind: 'nudge', dx: 1, dy: 0 },
        { kind: 'nudge', dx: 0, dy: -1 },
        { kind: 'nudge', dx: 0, dy: 1 },
      ]);
  });

  it('leaves an arrow held with any modifier alone', () =>
  {
    // Arrange.
    const held = [ { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true } ];

    // Act.
    const actions = held.map(modifier => eventKeyFor(press('ArrowLeft', modifier), null));

    // Assert.
    expect(actions)
      .toStrictEqual([ null, null, null, null ]);
  });

  it('selects everything on Ctrl+A or Cmd+A, and not with Shift or Alt held too', () =>
  {
    // Arrange.
    const presses = [ press('a', { ctrlKey: true }), press('A', { metaKey: true }), press('a', { ctrlKey: true, shiftKey: true }), press('a', { ctrlKey: true, altKey: true }), press('a') ];

    // Act.
    const actions = presses.map(each => eventKeyFor(each, null));

    // Assert.
    expect(actions)
      .toStrictEqual([ { kind: 'select-all' }, { kind: 'select-all' }, null, null, null ]);
  });

  it('duplicates, deletes, opens and deselects on the editor\'s own keys', () =>
  {
    // Arrange.
    const presses = [ press('d', { ctrlKey: true }), press('Delete'), press('Enter'), press('Escape') ];

    // Act.
    const actions = presses.map(each => eventKeyFor(each, null));

    // Assert.
    expect(actions)
      .toStrictEqual([ { kind: 'duplicate' }, { kind: 'delete' }, { kind: 'open' }, { kind: 'escape' } ]);
  });

  it('leaves copy, cut, paste, undo, redo, save and rename to others', () =>
  {
    // Arrange.
    const presses = [ 'c', 'x', 'v', 'z', 'y', 's' ].map(key => press(key, { ctrlKey: true }));

    // Act.
    const actions = [ ...presses, press('F2') ].map(each => eventKeyFor(each, null));

    // Assert.
    expect(actions)
      .toStrictEqual([ null, null, null, null, null, null, null ]);
  });

  it('leaves every key typed into a text field to the field', () =>
  {
    // Arrange: a text box, then a check box, which types nothing.
    const field = { tagName: 'INPUT', type: 'text' };
    const checkbox = { tagName: 'INPUT', type: 'checkbox' };

    // Act.
    const inField = [ eventKeyFor(press('ArrowLeft'), field), eventKeyFor(press('Delete'), field) ];
    const onCheckbox = eventKeyFor(press('Delete'), checkbox);

    // Assert.
    expect([ inField, onCheckbox ])
      .toStrictEqual([ [ null, null ], { kind: 'delete' } ]);
  });
});
