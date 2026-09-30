import type { DocumentHub } from './history/DocumentHub.ts';
import type { DocumentKey } from './model/documentKeys.ts';

/**
 * What the close guard needs to know about the other windows.
 */
type SharedLatest = {
  /**
   * Reports whether another live window holds a document at exactly this window's latest state.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when closing this window would not lose its edits.
   */
  sharesLatest(key: DocumentKey): boolean;
};

/**
 * The part of a window the guard and the services listen on: {@code beforeunload}, where a page may ask to stay
 * open, and {@code pagehide}, when it is going for good.
 */
type CloseTarget = {
  addEventListener(type: 'beforeunload' | 'pagehide', listener: (event: Event) => void): void;
  removeEventListener(type: 'beforeunload' | 'pagehide', listener: (event: Event) => void): void;
};

/**
 * Lists the documents whose unsaved edits would be lost if this window closed now: dirty here, and not held at
 * this window's latest state by any other live window. An event window closing beside the map it edits loses
 * nothing, so it does not ask; a window that holds an older copy of the map, or has gone, is no such guarantee.
 * @param {DocumentHub} hub This window's documents.
 * @param {SharedLatest} session The other windows.
 * @returns {DocumentKey[]} The documents at risk.
 */
const unsavedOnlyHere = (hub: DocumentHub, session: SharedLatest): DocumentKey[] =>
{
  return hub.dirtyKeys().filter(key => session.sharesLatest(key) === false);
};

/**
 * Makes a window ask before it closes while it holds the only copy of unsaved edits. It is the page's own
 * {@code beforeunload}, which NW.js honours for its windows as long as the shell does not intercept their close,
 * and which a plain browser honours too.
 * @param {CloseTarget} target The window.
 * @param {() => boolean} shouldAsk Answers, at the moment of closing, whether anything would be lost.
 * @returns {() => void} Removes the guard.
 */
const installCloseGuard = (target: CloseTarget, shouldAsk: () => boolean): (() => void) =>
{
  const listener = (event: Event) =>
  {
    if (shouldAsk())
    {
      // both, since older engines only ask when a return value is set.
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = '';
    }
  };

  target.addEventListener('beforeunload', listener);
  return () => target.removeEventListener('beforeunload', listener);
};

export { installCloseGuard, unsavedOnlyHere };
export type { CloseTarget, SharedLatest };
