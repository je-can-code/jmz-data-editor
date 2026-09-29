/**
 * The shape of `data/config.notetag-lines.json`, and the decisions the board makes about what gets written.
 *
 * Each entry is the sentence one effect is described with, wherever a screen lists what a state does. The words
 * are the author's and the numbers are the game's: the game fills in every token when it draws the line, so a
 * rebalance never leaves a sentence quoting a number that is no longer true. The board therefore edits nothing but
 * a key and its words, and the decisions worth testing are the ones that change the file: what a hand-edited entry
 * becomes when it is read, and which key a brand-new line is given.
 */

/**
 * One line: the key an effect asks for its sentence by, and the sentence itself. A sentence left empty says, on
 * purpose, that the effect says nothing.
 */
type NotetagLineTemplate = {
  key: string;
  template: string;
};

/**
 * The file is a bare array of lines, with no wrapping object.
 */
type NotetagLinesConfigRoot = NotetagLineTemplate[];

/**
 * The key a new line starts from, before it is told apart from any line already using it.
 */
const NEW_LINE_KEY = 'newLine';

/**
 * Fills out one line so both of its fields are present in memory.
 * @param {unknown} source One authored line.
 * @param {number} index Its position in the file, used to name a line that has no key.
 * @returns {NotetagLineTemplate} A fully populated line.
 */
const hydrateNotetagLine = (source: unknown, index: number): NotetagLineTemplate =>
{
  const authored = (source ?? {}) as Partial<NotetagLineTemplate>;

  return {
    key: String(authored.key ?? `line_${String(index)}`),
    template: String(authored.template ?? ''),
  };
};

/**
 * Fills out the whole file, so the board never has to ask whether a field was written.
 * @param {unknown} source The parsed contents of the configuration file.
 * @returns {NotetagLinesConfigRoot} Every line, fully populated.
 */
const hydrateNotetagLinesConfig = (source: unknown): NotetagLinesConfigRoot =>
{
  if (!Array.isArray(source))
  {
    return [];
  }

  return source.map(hydrateNotetagLine);
};

/**
 * A new, empty line whose key no existing line uses, so adding one can never shadow a sentence already written.
 * @param {NotetagLinesConfigRoot} lines The lines already in the file.
 * @returns {NotetagLineTemplate} The new line.
 */
const createNotetagLine = (lines: NotetagLinesConfigRoot): NotetagLineTemplate =>
{
  // every key already taken.
  const taken = new Set(lines.map(line => line.key));

  // the plain key when it is free, or else the first numbered one that is.
  let key = NEW_LINE_KEY;
  let suffix = 2;
  while (taken.has(key))
  {
    key = `${NEW_LINE_KEY}${String(suffix)}`;
    suffix += 1;
  }

  return {
    key,
    template: '',
  };
};

export {
  createNotetagLine,
  hydrateNotetagLine,
  hydrateNotetagLinesConfig,
  NEW_LINE_KEY,
};
export type {
  NotetagLinesConfigRoot,
  NotetagLineTemplate,
};
