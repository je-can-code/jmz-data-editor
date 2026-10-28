/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFileBackedState } from '@presentation/hooks/useFileBackedState.ts';

/**
 * `useFileBackedState` is where every data provider keeps the file it reads and writes, and it decides one thing the
 * author sees on every board: whether Save is lit. It must be lit exactly while the value holds edits the file does
 * not. Landing on a board, reading the file again and saving it all leave it dark; any edit lights it, including one
 * that changed the value in place and handed back the very same object, since the boards' domain models are often
 * changed that way. A save carries only the edits made before it began: an edit made while the file is being written
 * is kept, never replaced by what the save wrote, and Save stays lit for it. While anything is unsaved, the window asks
 * before it closes, and it stops asking once nothing is.
 */
describe('useFileBackedState', () =>
{
  /**
   * A file's value: a short list, so an edit and what a save wrote can each be told apart from it.
   */
  const ON_DISK = [ 'Slime', 'Bat' ];

  /**
   * Runs the hook over a file that has been read.
   * @returns The hook's result.
   */
  const renderLoaded = () =>
  {
    const rendered = renderHook(() => useFileBackedState<string[]>([]));
    act(() =>
    {
      rendered.result.current.loaded(ON_DISK);
    });

    return rendered;
  };

  /**
   * Fires the event a window sends just before it closes.
   * @returns {boolean} True when something asked the window to stay open.
   */
  const closeWindow = (): boolean =>
  {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('holds the file\'s value with nothing unsaved once the file is read', () =>
  {
    // Arrange: nothing beyond the hook itself.

    // Act.
    const { result } = renderLoaded();

    // Assert.
    expect([ result.current.value, result.current.hasUnsavedEdits ])
      .toStrictEqual([ [ 'Slime', 'Bat' ], false ]);
  });

  it('takes an edit given as a value, and leaves it unsaved', () =>
  {
    // Arrange.
    const { result } = renderLoaded();

    // Act.
    act(() =>
    {
      result.current.edit([ 'Slime', 'Bat', 'Golem' ]);
    });

    // Assert.
    expect([ result.current.value, result.current.hasUnsavedEdits ])
      .toStrictEqual([ [ 'Slime', 'Bat', 'Golem' ], true ]);
  });

  it('hands an updater the latest value, and leaves the edit unsaved', () =>
  {
    // Arrange: one edit already made, so the updater must see it rather than the file's value.
    const { result } = renderLoaded();
    act(() =>
    {
      result.current.edit([ 'Slime', 'Bat', 'Golem' ]);
    });

    // Act.
    act(() =>
    {
      result.current.edit(previous => previous.with(0, 'King Slime'));
    });

    // Assert.
    expect([ result.current.value, result.current.hasUnsavedEdits ])
      .toStrictEqual([ [ 'King Slime', 'Bat', 'Golem' ], true ]);
  });

  it('counts an edit that hands back the very same value, as an edit made in place does', () =>
  {
    // Arrange: the list is changed where it stands, then handed back as itself.
    const { result } = renderLoaded();
    const sameList = result.current.value;

    // Act.
    act(() =>
    {
      result.current.edit(previous => previous);
    });

    // Assert.
    expect([ result.current.value === sameList, result.current.hasUnsavedEdits ])
      .toStrictEqual([ true, true ]);
  });

  it('leaves the value unsaved ahead of a held-back edit, without changing it', () =>
  {
    // Arrange.
    const { result } = renderLoaded();

    // Act.
    act(() =>
    {
      result.current.flagUnsavedEdits();
    });

    // Assert.
    expect([ result.current.value, result.current.hasUnsavedEdits ])
      .toStrictEqual([ [ 'Slime', 'Bat' ], true ]);
  });

  it('settles every edit when the file is read again, taking what it holds', () =>
  {
    // Arrange.
    const { result } = renderLoaded();
    act(() =>
    {
      result.current.edit([ 'Golem' ]);
    });

    // Act.
    act(() =>
    {
      result.current.loaded([ 'Slime', 'Bat', 'Wisp' ]);
    });

    // Assert.
    expect([ result.current.value, result.current.hasUnsavedEdits ])
      .toStrictEqual([ [ 'Slime', 'Bat', 'Wisp' ], false ]);
  });

  it('settles the edits a save carries, taking the value as it was written', () =>
  {
    // Arrange: an edit, and a save that writes it tidied.
    const { result } = renderLoaded();
    act(() =>
    {
      result.current.edit([ 'slime', 'bat' ]);
    });
    const saved = result.current.beginSave();

    // Act.
    act(() =>
    {
      saved([ 'Slime', 'Bat' ]);
    });

    // Assert.
    expect([ result.current.value, result.current.hasUnsavedEdits ])
      .toStrictEqual([ [ 'Slime', 'Bat' ], false ]);
  });

  it('keeps an edit made while the file was being written, and leaves it unsaved', () =>
  {
    // Arrange: a save begins, and another edit lands before the file is written.
    const { result } = renderLoaded();
    act(() =>
    {
      result.current.edit([ 'Slime', 'Bat', 'Golem' ]);
    });
    const saved = result.current.beginSave();
    act(() =>
    {
      result.current.edit([ 'Slime', 'Bat', 'Golem', 'Wisp' ]);
    });

    // Act.
    act(() =>
    {
      saved([ 'Slime', 'Bat', 'Golem' ]);
    });

    // Assert.
    expect([ result.current.value, result.current.hasUnsavedEdits ])
      .toStrictEqual([ [ 'Slime', 'Bat', 'Golem', 'Wisp' ], true ]);
  });

  it('asks before the window closes only while something is unsaved', () =>
  {
    // Arrange.
    const { result } = renderLoaded();
    const asked: boolean[] = [ closeWindow() ];

    // Act: an edit, then a save that carries it.
    act(() =>
    {
      result.current.edit([ 'Golem' ]);
    });
    asked.push(closeWindow());
    const saved = result.current.beginSave();
    act(() =>
    {
      saved([ 'Golem' ]);
    });
    asked.push(closeWindow());

    // Assert: read, then edited, then saved.
    expect(asked)
      .toStrictEqual([ false, true, false ]);
  });

  it('stops asking once the provider holding the file is gone', () =>
  {
    // Arrange: an unsaved edit.
    const { result, unmount } = renderLoaded();
    act(() =>
    {
      result.current.edit([ 'Golem' ]);
    });

    // Act.
    unmount();

    // Assert.
    expect(closeWindow())
      .toBe(false);
  });
});
