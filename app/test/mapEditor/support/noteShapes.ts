/**
 * Takes a line out of a note by hand, the way a tag is taken out: the line and the break after it, or, on the note's
 * last line, the break before it.
 * @param {string} note The note.
 * @param {string} line The line, which the note holds alone on a line.
 * @returns {string} The note without it.
 */
const lineCut = (note: string, line: string): string =>
{
  const at = note.indexOf(line);
  const after = note.slice(at + line.length);
  if (after.startsWith('\n'))
  {
    return `${note.slice(0, at)}${after.slice(1)}`;
  }

  return `${note.slice(0, Math.max(at - 1, 0))}${after}`;
};

/**
 * Says what is wrong with a line added to a note, if anything: it must sit after every line of text the note had, with
 * only line breaks after it, and taking it out with the one line break it brought, the one before it or, first in the
 * note, the one after it, must leave the note exactly as it was.
 * @param {string} before The note before.
 * @param {string} after The note after.
 * @param {string} line The line added.
 * @returns {string | null} What is wrong, or null when nothing is.
 */
const addedWrongly = (before: string, after: string, line: string): string | null =>
{
  const at = after.lastIndexOf(line);
  const rest = after.slice(at + line.length);
  const head = after.slice(0, at);
  let restored = `${head}${rest.startsWith('\n') ? rest.slice(1) : rest}`;
  if (head.endsWith('\n'))
  {
    restored = `${head.slice(0, -1)}${rest}`;
  }

  if (at === -1 || /^[\r\n]*$/u.test(rest) === false || restored !== before)
  {
    return `${JSON.stringify(before)} became ${JSON.stringify(after)}`;
  }

  return null;
};

/**
 * Says what is wrong with a line taken out of a note, if anything: the note must be exactly what taking the line out by
 * hand leaves.
 * @param {string} before The note before.
 * @param {string} after The note after.
 * @param {string} line The line taken out.
 * @returns {string | null} What is wrong, or null when nothing is.
 */
const cutWrongly = (before: string, after: string, line: string): string | null =>
{
  return after === lineCut(before, line)
    ? null
    : `${JSON.stringify(before)} became ${JSON.stringify(after)}`;
};

export { addedWrongly, cutWrongly, lineCut };
