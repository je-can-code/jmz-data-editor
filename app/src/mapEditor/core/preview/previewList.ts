/**
 * One option a choice in a module's list offers: the value handed back when it is picked, and its words.
 */
type PreviewOption = {
  readonly value: string;
  readonly label: string;
};

/**
 * One choice the author makes in a module's list, such as the state one objective is shown in: its options, the one
 * standing now, and whether the author set it, so a set choice stands out as a switch turned on does.
 */
type PreviewChoice = {
  /**
   * Names the choice within its entry, handed back when it changes, such as {@code quest} or an objective's id.
   */
  readonly id: string;

  /**
   * Names the choice for whoever cannot see the row, as a screen reader says it, such as "Show quest cecil-001 as".
   */
  readonly label: string;

  readonly options: readonly PreviewOption[];

  /**
   * The value of the option standing now.
   */
  readonly value: string;

  /**
   * Whether the author set it, rather than leaving it as a fresh save holds it.
   */
  readonly set: boolean;
};

/**
 * One line beneath an entry, such as one of a quest's objectives: its number or short name, a line about it, and its
 * choice.
 */
type PreviewRow = {
  readonly label: string;
  readonly detail: string;
  readonly choice: PreviewChoice;
};

/**
 * One thing of a module's kind in its list, such as a quest: what it is called and its key, its own choice, and the
 * lines beneath it, which show while it is opened.
 */
type PreviewEntry = {
  /**
   * The thing's key within its kind, which the preview keeps whatever is set of it under.
   */
  readonly key: string;

  readonly title: string;

  readonly detail: string;

  readonly choice: PreviewChoice;

  readonly rows: readonly PreviewRow[];
};

/**
 * Finds the entries a search names, as a list's search box finds them: each whose title or detail holds what was typed,
 * in any case, such as a quest by its name or its key. A search of nothing but spaces finds every entry.
 * @param {readonly PreviewEntry[]} entries The entries, in the list's order.
 * @param {string} search What was typed.
 * @returns {readonly PreviewEntry[]} The entries it names, in the same order.
 */
const entriesMatching = (entries: readonly PreviewEntry[], search: string): readonly PreviewEntry[] =>
{
  const wanted = search.trim().toLowerCase();
  if (wanted === '')
  {
    return entries;
  }

  return entries.filter(entry => entry.title.toLowerCase().includes(wanted) || entry.detail.toLowerCase().includes(wanted));
};

export { entriesMatching };
export type { PreviewChoice, PreviewEntry, PreviewOption, PreviewRow };
