import { isTextEntry } from '../core/workspace/shortcuts.ts';

/**
 * Commits whatever the author is typing before a save, so Ctrl+S in the middle of a name or a line of dialogue saves
 * what they typed: the field hands its value over as it loses focus, and gets focus straight back. A field that commits
 * only once left would otherwise be passed over by the save, and the window would then read as saved, so closing it
 * would lose what was typed without a word.
 */
const commitTyping = (): void =>
{
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTextEntry(active))
  {
    active.blur();
    active.focus();
  }
};

export { commitTyping };
