/**
 * One line of a note, as the plugins cut a note into lines: the text between two line breaks, and where it starts and
 * ends in the note.
 */
type NoteLine = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

/**
 * One tag as the engine reads a note into its metadata ({@code DataManager.extractMetadata}): its name, its value (the
 * text after a colon, or true for a tag with none), and where it starts and ends in the note.
 */
type MetaTag = {
  readonly key: string;
  readonly value: string | true;
  readonly start: number;
  readonly end: number;
};

/**
 * How the plugins cut a note into lines (RPGManager): any run of line breaks ends a line, so a blank line between two
 * others is no line at all.
 */
const LINE_BREAKS = /[\r\n]+/g;

/**
 * One line break as a note writes it: Windows' pair, or either character alone.
 */
const ONE_BREAK = /\r\n|\n|\r/;

/**
 * The line breaks a note ends on, if it ends on any.
 */
const TRAILING_BREAKS = /[\r\n]*$/;

/**
 * The tag shape the engine reads into a note's metadata (DataManager.extractMetadata), searched over the whole note at
 * once: a name of anything but brackets and colons, then an optional colon and anything up to the closing bracket. A
 * tag may therefore run over a line break, and a stray opening bracket swallows the tag after it.
 */
const ENGINE_META_TAG = /<([^<>:]+)(:?)([^>]*)>/g;

/**
 * Why a change was refused when the note it would write has the engine read the rest of it otherwise, such as a stray
 * opening bracket reaching past a tag taken out to swallow the one after it, or swallowing a line added after it.
 */
const OTHER_TAGS_MISREAD = 'the game would read the rest of this note differently; look for a stray < in it';

/**
 * The line break a note writes when it has to write one: the first one it already holds, so a new line reads as
 * written by the same hand, or a plain newline, as MZ's note box writes, for a note holding none.
 * @param {string} note The note.
 * @returns {string} The line break.
 */
const lineBreakOf = (note: string): string =>
{
  const found = ONE_BREAK.exec(note);
  return found === null
    ? '\n'
    : found[0];
};

/**
 * Cuts a note into lines exactly as RPGManager does ({@code note.split(/[\r\n]+/)}), keeping where each sits, so
 * anything found on a line can be changed in place. A note starting or ending on a line break has an empty line there,
 * as the split has.
 * @param {string} note The note.
 * @returns {NoteLine[]} The lines, in order.
 */
const noteLines = (note: string): NoteLine[] =>
{
  const lines: NoteLine[] = [];
  let start = 0;
  for (const found of note.matchAll(LINE_BREAKS))
  {
    lines.push({ text: note.slice(start, found.index), start, end: found.index });
    start = found.index + found[0].length;
  }

  lines.push({ text: note.slice(start), start, end: note.length });
  return lines;
};

/**
 * Adds a line to the end of a note, after its last line of text and before any line breaks it ends on. Every character
 * the note already holds stays exactly as it was, and the line brings one line break with it, written as the note writes
 * them: before it, after the text, or in a note holding nothing but line breaks, after it, ahead of those. An empty note
 * becomes the line alone. Taking the line out again with {@link withSpanRemoved}, which takes the break after a line or,
 * on the last line, the one before it, therefore gives back the note exactly as it was.
 * @param {string} note The note.
 * @param {string} line The line to add, holding no line break.
 * @returns {string} The note with the line added.
 */
const withLineAdded = (note: string, line: string): string =>
{
  // the pattern matches at the very end whatever the note holds, if only the empty string.
  const [ trailing ] = TRAILING_BREAKS.exec(note) as RegExpExecArray;
  const body = note.slice(0, note.length - trailing.length);
  if (body !== '')
  {
    return `${body}${lineBreakOf(note)}${line}${trailing}`;
  }

  return trailing === ''
    ? line
    : `${line}${lineBreakOf(note)}${trailing}`;
};

/**
 * Measures the one line break starting at a place in a note.
 * @param {string} note The note.
 * @param {number} at Where it would start.
 * @returns {number} Its length: 2 for Windows' pair, 1 for either character alone, 0 for no line break there.
 */
const breakAfter = (note: string, at: number): number =>
{
  if (note.startsWith('\r\n', at))
  {
    return 2;
  }

  return /[\r\n]/.test(note.charAt(at))
    ? 1
    : 0;
};

/**
 * Measures the one line break ending at a place in a note.
 * @param {string} note The note.
 * @param {number} at Where it would end.
 * @returns {number} Its length: 2 for Windows' pair, 1 for either character alone, 0 for no line break there.
 */
const breakBefore = (note: string, at: number): number =>
{
  if (note.endsWith('\r\n', at))
  {
    return 2;
  }

  return /[\r\n]/.test(note.charAt(at - 1))
    ? 1
    : 0;
};

/**
 * Takes a tag out of a note cleanly, leaving every other character as it was. A tag alone on its line, give or take
 * the spaces around it, takes its line with it and one line break: the one after it, or the one before it on the note's
 * last line, so no blank line is left behind. A tag sharing its line with words takes one space beside it with it when
 * that leaves the words around it one space apart, as they would read had it never been written.
 * @param {string} note The note.
 * @param {number} start Where the tag starts.
 * @param {number} end Where it ends.
 * @returns {string} The note without the tag.
 */
const withSpanRemoved = (note: string, start: number, end: number): string =>
{
  // the line holding the tag runs from the line break before its start to the one after its end.
  const lineStart = Math.max(note.lastIndexOf('\n', start - 1), note.lastIndexOf('\r', start - 1)) + 1;
  const afterEnd = note.slice(end).search(/[\r\n]/);
  const lineEnd = afterEnd === -1
    ? note.length
    : end + afterEnd;
  const before = note.slice(lineStart, start);
  const after = note.slice(end, lineEnd);
  const cut = (from: number, to: number) => `${note.slice(0, from)}${note.slice(to)}`;

  // nothing else on its line, so the line goes, with the break after it or, on the last line, the one before it.
  if (before.trim() === '' && after.trim() === '')
  {
    const following = breakAfter(note, lineEnd);
    return following > 0
      ? cut(lineStart, lineEnd + following)
      : cut(lineStart - breakBefore(note, lineStart), lineEnd);
  }

  // a space either side, or a space before it at the end of its line, so the space before it goes too.
  if (before.endsWith(' ') && (after.startsWith(' ') || after === ''))
  {
    return cut(start - 1, end);
  }

  // the line's first word, so the space after it goes too.
  if (before === '' && after.startsWith(' '))
  {
    return cut(start, end + 1);
  }

  return cut(start, end);
};

/**
 * Takes a tag out of a note the way {@link withLineAdded} put it in, undoing it exactly. A tag alone on its line, give
 * or take the spaces around it, takes its line with it and the one line break the line came with: the one before it,
 * which is where a line added after a note's text brings its break, or, on a note's first line, the one after it, as a
 * line added to a note of nothing but line breaks brings it. Adding a line and taking it out again therefore gives back
 * the note byte for byte, whatever line breaks it mixes, where taking the break after the line could leave a Windows
 * pair where a plain newline was, or the other way about. A tag sharing its line with words is taken out by
 * {@link withSpanRemoved}, which tidies the spaces around it.
 * @param {string} note The note.
 * @param {number} start Where the tag starts.
 * @param {number} end Where it ends.
 * @returns {string} The note without the tag.
 */
const withLineTakenOut = (note: string, start: number, end: number): string =>
{
  // the line holding the tag runs from the line break before its start to the one after its end.
  const lineStart = Math.max(note.lastIndexOf('\n', start - 1), note.lastIndexOf('\r', start - 1)) + 1;
  const afterEnd = note.slice(end).search(/[\r\n]/);
  const lineEnd = afterEnd === -1
    ? note.length
    : end + afterEnd;
  if (note.slice(lineStart, start).trim() !== '' || note.slice(end, lineEnd).trim() !== '')
  {
    return withSpanRemoved(note, start, end);
  }

  // the line goes with the break before it, or, first in the note, the break after it.
  const preceding = breakBefore(note, lineStart);
  return preceding > 0
    ? `${note.slice(0, lineStart - preceding)}${note.slice(lineEnd)}`
    : `${note.slice(0, lineStart)}${note.slice(lineEnd + breakAfter(note, lineEnd))}`;
};

/**
 * Reads every tag the engine reads into a note's metadata, in order, as DataManager.extractMetadata reads them: one
 * search over the whole note, each tag taken whole before the search moves past it.
 * @param {string} note The note.
 * @returns {MetaTag[]} The tags, in the order written.
 */
const metaTagsOf = (note: string): MetaTag[] =>
{
  return [ ...note.matchAll(ENGINE_META_TAG) ].map(found =>
  {
    const [ whole, key, colon, value ] = found;
    return {
      key,
      value: colon === ':' ? value : true,
      start: found.index,
      end: found.index + whole.length,
    };
  });
};

/**
 * Reads a note's metadata as the engine holds it in {@code meta}: each tag's value by its name as written, case and all,
 * a later tag of a name replacing an earlier one. A plugin reading {@code meta} rather than the note itself, as
 * J-Lighting-Time reads {@code noToneChange}, sees exactly this.
 * @param {string} note The note.
 * @returns {Map<string, string | true>} The values, by name.
 */
const noteMetaOf = (note: string): Map<string, string | true> =>
{
  return new Map(metaTagsOf(note).map(tag => [ tag.key, tag.value ]));
};

/**
 * Reports whether a written note gives the engine's metadata every name the note gave before, each holding the same
 * value, and no name it did not, leaving aside the names the change is about. The engine reads a note in one search, so
 * a stray opening bracket swallows the tag after it: taking a tag out can leave such a bracket reaching on to the next
 * tag, and a line added after one is swallowed whole. Either way a tag the change never touched reads otherwise, and
 * this is how a writer finds out before handing the note on.
 * @param {string} before The note as it was.
 * @param {string} after The note as written.
 * @param {(key: string) => boolean} isAbout Whether a name is one the change is about, which may read otherwise.
 * @returns {boolean} True when every other name reads exactly as it did.
 */
const keepsOtherMeta = (before: string, after: string, isAbout: (key: string) => boolean): boolean =>
{
  const others = (note: string) => [ ...noteMetaOf(note) ].filter(([ key ]) => isAbout(key) === false);
  const was = others(before);
  const now = new Map(others(after));

  // a value is a word or true, never undefined, so a name gone from the note can never read as one kept.
  return was.length === now.size && was.every(([ key, value ]) => now.get(key) === value);
};

export {
  keepsOtherMeta,
  lineBreakOf,
  metaTagsOf,
  noteLines,
  noteMetaOf,
  OTHER_TAGS_MISREAD,
  withLineAdded,
  withLineTakenOut,
  withSpanRemoved,
};
export type { MetaTag, NoteLine };
