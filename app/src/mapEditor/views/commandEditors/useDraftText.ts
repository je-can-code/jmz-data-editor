import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a text box's text on screen while every change is also handed on. The box shows its own copy, so the
 * caret never jumps however long the change takes to come back through history; a change made anywhere else
 * (an undo, another window) replaces the copy as soon as it arrives.
 * @param {string} external The text as the command holds it.
 * @param {(text: string) => void} commit Hands a change on.
 * @returns {[string, (text: string) => void]} The text to show, and the change handler.
 */
const useDraftText = (external: string, commit: (text: string) => void): [ string, (text: string) => void ] =>
{
  const [ draft, setDraft ] = useState(external);
  const committed = useRef(external);

  // a text that is not the last one handed on came from somewhere else, so it wins.
  useEffect(() =>
  {
    if (external !== committed.current)
    {
      committed.current = external;
      setDraft(external);
    }
  }, [ external ]);

  const change = (text: string) =>
  {
    committed.current = text;
    setDraft(text);
    commit(text);
  };

  return [ draft, change ];
};

export { useDraftText };
