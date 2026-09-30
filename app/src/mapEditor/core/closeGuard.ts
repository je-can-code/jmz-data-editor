import type { DocumentHub } from './history/DocumentHub.ts';
import type { DocumentKey } from './model/documentKeys.ts';

/**
 * What the close guard needs to know about the other windows.
 */
type HeldElsewhere = {
  /**
   * Reports whether another live window holds a document.
   * @param {DocumentKey} key The document.
   * @returns {boolean} True when closing this window would not lose its edits.
   */
  isHeldElsewhere(key: DocumentKey): boolean;
};

/**
 * The part of a window the guard listens on.
 */
type CloseTarget = {
  addEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
  removeEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
};

/**
 * Lists the documents whose unsaved edits would be lost if this window closed now: dirty here, and held by no
 * other live window. An event window closing beside the map it edits loses nothing, so it does not ask.
 * @param {DocumentHub} hub This window's documents.
 * @param {HeldElsewhere} session The other windows.
 * @returns {DocumentKey[]} The documents at risk.
 */
const unsavedOnlyHere = (hub: DocumentHub, session: HeldElsewhere): DocumentKey[] =>
{
  return hub.dirtyKeys().filter(key => session.isHeldElsewhere(key) === false);
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
  const listener = (event: BeforeUnloadEvent) =>
  {
    if (shouldAsk())
    {
      // both, since older engines only ask when a return value is set.
      event.preventDefault();
      event.returnValue = '';
    }
  };

  target.addEventListener('beforeunload', listener);
  return () => target.removeEventListener('beforeunload', listener);
};

export { installCloseGuard, unsavedOnlyHere };
export type { CloseTarget, HeldElsewhere };
