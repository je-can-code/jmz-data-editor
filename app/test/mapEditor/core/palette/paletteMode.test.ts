import { describe, expect, it } from 'vitest';
import { PaletteModeStore, type PaletteModeState } from '../../../../src/mapEditor/core/palette/paletteMode.ts';

/*
 * The palette's mode: picking tiles, or editing the tileset's passability, and which flags that editor shows.
 *
 * The map views follow it to show the passability overlay while the editor is open, so a listener must hear each real
 * change once, and nothing when the mode chosen is already on; the flags chosen survive switching back and forth.
 */
const listening = () =>
{
  const store = new PaletteModeStore();
  const heard: PaletteModeState[] = [];
  const stop = store.subscribe(state => heard.push(state));
  return { store, heard, stop };
};

describe('PaletteModeStore', () =>
{
  it('starts picking tiles, with passage chosen for the editor', () =>
  {
    // Arrange.
    const store = new PaletteModeStore();

    // Act.
    const state = store.getState();

    // Assert.
    expect(state)
      .toStrictEqual({ editing: 'tiles', flagMode: 'passage' });
  });

  it('tells listeners when the editor opens, and keeps the flags chosen', () =>
  {
    // Arrange.
    const { store, heard } = listening();
    store.setFlagMode('bush');

    // Act.
    store.setEditing('passability');

    // Assert.
    expect(heard)
      .toStrictEqual([ { editing: 'tiles', flagMode: 'bush' }, { editing: 'passability', flagMode: 'bush' } ]);
  });

  it('tells no one when the mode or flags chosen are already on', () =>
  {
    // Arrange.
    const { store, heard } = listening();

    // Act.
    store.setEditing('tiles');
    store.setFlagMode('passage');

    // Assert.
    expect(heard)
      .toStrictEqual([]);
  });

  it('stops telling a listener once it stops listening', () =>
  {
    // Arrange.
    const { store, heard, stop } = listening();

    // Act.
    stop();
    store.setEditing('passability');

    // Assert.
    expect([ heard, store.getState().editing ])
      .toStrictEqual([ [], 'passability' ]);
  });
});
