import { useEffect, useRef, useState } from 'react';
import { TypingBurst } from './TypingBurst.ts';

/**
 * Keeps a text box's text on screen while the author types, and hands it on once per burst of typing, so a word or a
 * line typed lands in history as one step rather than one per key, the way the event's Name box does. A burst ends
 * when the typing pauses, when the box is left (the third thing handed back, for the box's blur), and when the editor
 * holding the box closes. The box shows its own copy, so the caret never jumps however long the change takes to come
 * back through history; a change made anywhere else (an undo, another window) replaces the copy as soon as it arrives,
 * along with anything typed and not yet handed on.
 * @param {string} external The text as the command holds it.
 * @param {(text: string) => void} commit Hands a finished burst on.
 * @returns {[string, (text: string) => void, () => void]} The text to show, the change handler, and what ends the burst
 * as the box is left.
 */
const useDraftText = (external: string, commit: (text: string) => void): [ string, (text: string) => void, () => void ] =>
{
  const [ draft, setDraft ] = useState(external);
  const committed = useRef(external);

  // a burst ending after a pause hands its text to the newest commit, which knows the command as it now stands.
  const handOn = useRef(commit);
  useEffect(() =>
  {
    handOn.current = commit;
  }, [ commit ]);
  const [ burst ] = useState(() => new TypingBurst<string>(text => handOn.current(text)));

  // a text that is not the last one typed came from somewhere else, so it wins, over anything still held too.
  useEffect(() =>
  {
    if (external !== committed.current)
    {
      committed.current = external;
      burst.drop();
      setDraft(external);
    }
  }, [ external, burst ]);

  // an editor closing mid-burst keeps what was typed in it.
  useEffect(() => () => burst.finish(), [ burst ]);

  const change = (text: string) =>
  {
    committed.current = text;
    setDraft(text);
    burst.type(text);
  };

  return [ draft, change, burst.finish ];
};

export { useDraftText };
