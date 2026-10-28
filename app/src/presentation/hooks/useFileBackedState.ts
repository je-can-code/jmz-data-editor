import React, { useCallback, useEffect, useRef, useState } from 'react';
import { installCloseGuard } from '@mapEditor/core/closeGuard.ts';

/**
 * A file's value as a board shows it, beside a count of the edits made to it and of how many of those the file holds.
 */
type Tracked<T> = {
  /**
   * The value as the board shows it, every edit included.
   */
  value: T;

  /**
   * How many edits had been made when the value last changed.
   */
  edits: number;

  /**
   * How many of those edits the file on disk holds. The value is unsaved while this falls short of the edits.
   */
  savedEdits: number;
};

/**
 * A value read from a file on disk, with what a provider needs to edit it, read it again and write it back.
 */
type FileBackedState<T> = {
  /**
   * The value as the board shows it, every edit included.
   */
  value: T;

  /**
   * Edits the value, which leaves it unsaved until a save carries the edit. Takes a value or an updater, as React's own
   * setters do.
   */
  edit: React.Dispatch<React.SetStateAction<T>>;

  /**
   * Leaves the value unsaved ahead of an edit a board holds back and hands over a moment later, so Save lights the
   * moment the edit is made rather than when it lands.
   */
  flagUnsavedEdits: () => void;

  /**
   * Replaces the value with what the file holds, settling every edit made so far.
   */
  loaded: (fromDisk: T) => void;

  /**
   * Marks the start of a save, before anything is written, and returns what to call once the file is written, with
   * the value as it now stands on disk.
   */
  beginSave: () => (written: T) => void;

  /**
   * True while the value holds edits the file does not.
   */
  hasUnsavedEdits: boolean;
};

/**
 * Holds a value read from a file on disk, and knows whether it holds edits the file does not.
 *
 * Every data provider keeps its file in one of these, so a board's Save lights exactly while its file has unsaved
 * edits, and stays lit when the author moves to another board and back, since the provider outlives the board. Edits
 * are counted rather than compared, so every edit counts, even one that changed the value in place, as the boards'
 * domain models often do. The count runs ahead of React, so a save knows exactly which edits it carries: an edit made
 * while the file is being written is kept rather than replaced by what the save wrote, and leaves the value unsaved.
 * While the value is unsaved, the window asks before it closes.
 * @param {T} initial The value before the file has been read.
 * @returns {FileBackedState<T>} The value, and what edits, reloads and saves it.
 */
const useFileBackedState = <T>(initial: T): FileBackedState<T> =>
{
  // count every edit the moment it is made, ahead of React applying it, so a save begun in the same breath carries it.
  const editCount = useRef(0);
  const [ tracked, setTracked ] = useState<Tracked<T>>({ value: initial, edits: 0, savedEdits: 0 });

  const edit = useCallback((next: React.SetStateAction<T>) =>
  {
    editCount.current += 1;
    const edits = editCount.current;

    setTracked(prev =>
    {
      // hand an updater the latest value, as any React setter does.
      const value = typeof next === 'function'
        ? (next as (previous: T) => T)(prev.value)
        : next;

      return { value, edits, savedEdits: prev.savedEdits };
    });
  }, []);

  const flagUnsavedEdits = useCallback(() =>
  {
    editCount.current += 1;
    const edits = editCount.current;

    setTracked(prev => ({ ...prev, edits }));
  }, []);

  const loaded = useCallback((fromDisk: T) =>
  {
    // what the file holds replaces the value outright, so every edit made so far is settled with it.
    const edits = editCount.current;
    setTracked({ value: fromDisk, edits, savedEdits: edits });
  }, []);

  const beginSave = useCallback(() =>
  {
    // the edits made by now are the ones this save carries.
    const carried = editCount.current;

    return (written: T) =>
    {
      setTracked(prev =>
      {
        // keep an edit made while the file was being written, and leave the value unsaved for it.
        if (prev.edits !== carried)
        {
          return { ...prev, savedEdits: carried };
        }

        // otherwise take what was written, which a provider may have tidied on its way to disk.
        return { value: written, edits: prev.edits, savedEdits: carried };
      });
    };
  }, []);

  const hasUnsavedEdits = tracked.edits !== tracked.savedEdits;

  // read when the window closes, so one guard serves the provider's whole life.
  const unsaved = useRef(hasUnsavedEdits);
  unsaved.current = hasUnsavedEdits;

  // ask before the window closes while anything is unsaved.
  useEffect(() => installCloseGuard(window, () => unsaved.current), []);

  return {
    value: tracked.value,
    edit,
    flagUnsavedEdits,
    loaded,
    beginSave,
    hasUnsavedEdits,
  };
};

export { useFileBackedState };
export type { FileBackedState };
