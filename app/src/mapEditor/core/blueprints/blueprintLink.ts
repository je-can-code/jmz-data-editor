import {
  keepsOtherMeta,
  metaTagsOf,
  noteMetaOf,
  OTHER_TAGS_MISREAD,
  withLineAdded,
  withLineTakenOut,
} from '../properties/noteText.ts';

/**
 * The name a copy's link to its blueprint is written under in the event's note, read the way the engine reads a note
 * into an event's metadata: exactly this, case and all. Nothing else in the ecosystem writes or reads a tag of this
 * name, and nothing in the game reads an event's note at all but on a map a plugin copies its events from, where no
 * link is ever written (see blueprintPlacement).
 */
const BLUEPRINT_LINK_KEY = 'blueprint';

/**
 * The shape of a blueprint's id: lowercase letters and digits, so no note, tag list or file can read its characters as
 * anything but the id.
 */
const BLUEPRINT_ID_PATTERN = /^[a-z0-9]+$/u;

/**
 * What one of the values a link keeps after its first two may hold: anything but a comma, a bracket, an angle bracket
 * or a line break, which would end it, end the list, end the tag or end the line.
 */
const DIFFERENCE_PATTERN = /^[^,[\]<>\r\n]+$/u;

/**
 * A link's value as the note writes it: a list of the blueprint's id, the id of the blueprint's event the copy was made
 * from, and after them anything the copy keeps of its own (see {@link BlueprintLink.differences}). The values are split
 * as J-Base splits a tag's list, on a comma with or without one space after it.
 *
 * <pre>
 * Structure:
 *  <blueprint:[BLUEPRINT_ID, EVENT_ID]>
 *  <blueprint:[BLUEPRINT_ID, EVENT_ID, DIFFERENCE, ...]>
 *
 * Example:
 *  <blueprint:[k3x9q2mf, 2]>
 *
 * Translation:
 *  This event is a copy of event 2 of the blueprint whose id is k3x9q2mf, and keeps nothing of its own.
 * </pre>
 */
const LINK_VALUE = /^\[([a-z0-9]+), ?([1-9][0-9]*)((?:, ?[^,[\]<>\r\n]+)*)\]$/u;

/**
 * The separator a link's values are written with: a comma and a space, as every list in the ecosystem's own examples is.
 */
const VALUE_SEPARATOR = ', ';

/**
 * Why a link was refused when the note it would write would not read back holding the link asked for: a stray opening
 * bracket earlier in the note swallowing the link's line, say, or one that would still read as a link once every link
 * was taken out.
 */
const LINK_MISREAD = 'the note would not read back with its link as asked; look for a stray < in it';

/**
 * A copy's link to its blueprint, as the copy's note holds it.
 */
type BlueprintLink = {
  /**
   * The blueprint's id, which never changes however the blueprint is renamed.
   */
  readonly blueprintId: string;

  /**
   * The id the blueprint knows the copied event by: the id that event had on the map the blueprint was saved from, which
   * tells a copy of one of the blueprint's events from a copy of another.
   */
  readonly eventId: number;

  /**
   * What the copy keeps of its own, one value each, after the two that say what it is a copy of: where a copy records
   * how it differs from its blueprint, such as a number moved by an offset, a number pinned, or a choice of its own. A
   * copy placed from a blueprint differs in nothing, so every link placing writes ends after its event's id; a link
   * holding some is read, kept and written back as it is.
   */
  readonly differences: readonly string[];
};

/**
 * Reports whether a text can be a blueprint's id.
 * @param {string} text The text.
 * @returns {boolean} True for lowercase letters and digits, at least one.
 */
const isBlueprintId = (text: string): boolean =>
{
  return BLUEPRINT_ID_PATTERN.test(text);
};

/**
 * Writes a link as the tag a note carries, on a line of its own: its values in order, a comma and a space between each.
 * @param {BlueprintLink} link The link.
 * @returns {string} The tag, such as {@code <blueprint:[k3x9q2mf, 2]>}.
 * @throws {Error} When the link holds anything a note could not read back as written.
 */
const blueprintLinkText = (link: BlueprintLink): string =>
{
  const { blueprintId, eventId, differences } = link;
  const wellFormed = isBlueprintId(blueprintId)
    && Number.isInteger(eventId)
    && eventId > 0
    && differences.every(difference => DIFFERENCE_PATTERN.test(difference));
  if (wellFormed === false)
  {
    throw new Error(`a link names a blueprint by its id and an event by a positive id, not ${JSON.stringify(link)}`);
  }

  const values = [ blueprintId, String(eventId), ...differences ];
  return `<${BLUEPRINT_LINK_KEY}:[${values.join(VALUE_SEPARATOR)}]>`;
};

/**
 * Reads a link out of the value its tag holds.
 * @param {string | true} value The tag's value, or true for a tag written with none.
 * @returns {BlueprintLink | null} The link, or null when the value is not a link's.
 */
const readLinkValue = (value: string | true): BlueprintLink | null =>
{
  const match = value === true ? null : LINK_VALUE.exec(value);
  if (match === null)
  {
    return null;
  }

  // the values after the event's id each follow a comma, so the first piece of the split is the empty one before it.
  const [ , blueprintId, eventId, rest ] = match;
  const differences = rest === '' ? [] : rest.split(/, ?/u).slice(1);
  return { blueprintId, eventId: Number(eventId), differences };
};

/**
 * Reads an event's link to its blueprint from its note, as the engine reads the note into the event's metadata: the
 * value of the last tag of the link's name, which holds the link when it is a link's list and nothing otherwise.
 * @param {string} note The event's note.
 * @returns {BlueprintLink | null} The link, or null when the event is no copy of a blueprint.
 */
const blueprintLinkOf = (note: string): BlueprintLink | null =>
{
  const value = noteMetaOf(note).get(BLUEPRINT_LINK_KEY);
  return value === undefined
    ? null
    : readLinkValue(value);
};

/**
 * Reports whether two links say the same: the same blueprint, the same event, and the same differences in order.
 * @param {BlueprintLink} left One link.
 * @param {BlueprintLink} right The other.
 * @returns {boolean} True when they are the same link.
 */
const sameLink = (left: BlueprintLink, right: BlueprintLink): boolean =>
{
  return left.blueprintId === right.blueprintId
    && left.eventId === right.eventId
    && left.differences.length === right.differences.length
    && left.differences.every((difference, index) => difference === right.differences[index]);
};

/**
 * Takes every tag of the link's name out of a note, the last first so each one still sits where it was read: a note
 * holds one link at most, and with the last one gone the engine would read the one before it.
 * @param {string} note The note.
 * @returns {string} The note without them; the very same note when it held none.
 */
const withoutLinkTags = (note: string): string =>
{
  return metaTagsOf(note)
    .filter(tag => tag.key === BLUEPRINT_LINK_KEY)
    .reduceRight((text, tag) => withLineTakenOut(text, tag.start, tag.end), note);
};

/**
 * Reports whether a name in a note's metadata is the link's: the only name a change to the link writes, adds or takes
 * away.
 * @param {string} key The name.
 * @returns {boolean} True for the link's name.
 */
const isLinkKey = (key: string): boolean =>
{
  return key === BLUEPRINT_LINK_KEY;
};

/**
 * Hands on a note with its link changed only when the engine reads it back holding exactly the link meant, or none
 * when none is meant, and reads every other tag in it exactly as it did before the change. This is the rule every note
 * the editor writes in place keeps: a change that would have any other tag read otherwise is refused rather than
 * written.
 * @param {string} note The note as it was.
 * @param {string} written The note as it would be written.
 * @param {BlueprintLink | null} meant The link it must hold, or null for none.
 * @returns {string} The written note.
 * @throws {Error} When the written note would read back otherwise.
 */
const checkedLinkChange = (note: string, written: string, meant: BlueprintLink | null): string =>
{
  const read = blueprintLinkOf(written);
  const holdsMeant = meant === null
    ? noteMetaOf(written).has(BLUEPRINT_LINK_KEY) === false
    : read !== null && sameLink(read, meant);
  if (holdsMeant === false)
  {
    throw new Error(LINK_MISREAD);
  }

  if (keepsOtherMeta(note, written, isLinkKey) === false)
  {
    throw new Error(OTHER_TAGS_MISREAD);
  }

  return written;
};

/**
 * Links an event to its blueprint by writing its note in place: the link goes on a line of its own after everything
 * the note already says, with the one line break the note writes, and every other character stays as it was. A note
 * already holding a link has it taken out first, so a note holds one link at most. The note is read back before it is
 * handed on, the link and every other tag in it alike, and refused when anything in it would read otherwise.
 * @param {string} note The event's note.
 * @param {BlueprintLink} link The link.
 * @returns {string} The note holding the link.
 * @throws {Error} When the note would read back otherwise; the message says why, for the author.
 */
const withBlueprintLink = (note: string, link: BlueprintLink): string =>
{
  const written = withLineAdded(withoutLinkTags(note), blueprintLinkText(link));
  return checkedLinkChange(note, written, link);
};

/**
 * Takes an event's link to its blueprint out of its note in place, undoing exactly what {@link withBlueprintLink} wrote:
 * the link's line goes with the line break it brought, so a note linked and unlinked again is the very note it was,
 * byte for byte. Every tag of the link's name goes, and the note is read back before it is handed on, holding no link
 * and every other tag reading as it did, or refused.
 * @param {string} note The event's note.
 * @returns {string} The note without its link; the very same note when it held none.
 * @throws {Error} When the note would read back otherwise; the message says why, for the author.
 */
const withoutBlueprintLink = (note: string): string =>
{
  return checkedLinkChange(note, withoutLinkTags(note), null);
};

export {
  BLUEPRINT_LINK_KEY,
  blueprintLinkOf,
  blueprintLinkText,
  isBlueprintId,
  LINK_MISREAD,
  withBlueprintLink,
  withoutBlueprintLink,
};
export type { BlueprintLink };
