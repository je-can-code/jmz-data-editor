import { useEffect, useRef } from 'react';
import { appShortcutFor, type KeyTarget } from '../../core/workspace/shortcuts.ts';

/**
 * What the window's keys do: save the map, and undo and redo the event's own history.
 */
type EventWindowKeyHandlers = {
  readonly save: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
};

/**
 * Gives an event window its own keys: Ctrl+S saves the map from anywhere in the window, text boxes included, and Ctrl+Z,
 * Ctrl+Y and Ctrl+Shift+Z undo and redo the event's history anywhere a text box or the command list is not handling
 * them itself. The command list's own keys mark their events handled, so nothing here acts twice. Any other window
 * editing one thing, such as the Switches & Variables window, keys its own save and history the same way.
 * @param {EventWindowKeyHandlers} handlers What each key does; the latest handlers are always the ones called.
 */
const useEventWindowKeys = (handlers: EventWindowKeyHandlers): void =>
{
  // the listener stays put while the handlers it calls follow every render.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() =>
  {
    const onKeyDown = (event: KeyboardEvent) =>
    {
      if (event.defaultPrevented)
      {
        return;
      }

      const command = appShortcutFor(event, event.target as KeyTarget | null);
      if (command === 'save' || command === 'undo' || command === 'redo')
      {
        event.preventDefault();
        latest.current[command]();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};

export { useEventWindowKeys };
export type { EventWindowKeyHandlers };
