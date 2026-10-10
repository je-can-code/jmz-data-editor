import { cloneJson, type JsonValue } from '../model/json.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { metaTagsOf } from '../properties/noteText.ts';
import {
  addExactly,
  lineFieldName,
  ownNoteOf,
  pageKey,
  tagLinesOf,
  type CommentTagDefinition,
  type FieldPlace,
  type PageTagLine,
} from './blueprintFields.ts';
import {
  BLUEPRINT_LINK_KEY,
  blueprintLinkOf,
  blueprintLinkText,
  withBlueprintLink,
  withoutBlueprintLink,
  type BlueprintLink,
} from './blueprintLink.ts';
import { followedList } from './copyChanges.ts';
import { namesUnknown, unknownSiblings, type CopyField, type CopyReading } from './copyReading.ts';
import { NAMES_GROUP_WORDS } from './copyWords.ts';
import { readFieldLink, withFieldLinks, type FieldLink } from './fieldLinks.ts';

/**
 * A copy read field by field against its blueprint.
 */
type ReadCopy = Extract<CopyReading, { readonly kind: 'read' }>;

/**
 * A copy read against a blueprint it can still be put back in step with: read field by field, or drifted too far for a
 * change to reach it.
 */
type FollowableCopy = Extract<CopyReading, { readonly kind: 'read' | 'drifted' }>;

/**
 * Where a field of a tag line sits.
 */
type TagPlace = Extract<FieldPlace, { readonly kind: 'tag' }>;

/**
 * What a copy's actions read besides the copy: the tags the active modules read from comments, and the copy's group, by
 * the blueprint's ids, when it is known (see copyPlans' copyGroupOf).
 */
type ActionContext = {
  readonly tags: readonly CommentTagDefinition[];
  readonly references?: ReadonlyMap<number, number>;
};

/**
 * What one of a copy's actions comes to: the copy as the action leaves it, every other field and every other character of
 * its note exactly as it was, or why the action cannot be taken, in words for the author. A copy the action leaves as it
 * is comes back as the very event it was.
 */
type CopyPlan =
  | { readonly ok: true; readonly event: RmmzMapEvent }
  | { readonly ok: false; readonly message: string };

/**
 * What the Note box of an event's window shows: the note's own text for a copy whose note reads cleanly without its link,
 * which the box then keeps out of the author's way and writes back after whatever they type; or the whole note, for any
 * other event, or a copy whose note does not read cleanly, so the author can see what to mend.
 */
type NoteBox = {
  readonly text: string;
  readonly keepsLink: boolean;
};

/**
 * Why a field's action is refused once the field is no longer where the panel showed it, changed in another window, say.
 */
const FIELD_GONE = 'That setting has changed since; look again and try once more.';

/**
 * Why following a page's commands is refused when the blueprint's name other events of the blueprint whose copies on this
 * map are not known, since the copy would be written to name some other event of the map: in the words the commands' row
 * says them in.
 */
const COMMANDS_KEEP_OWN = `The commands can't follow: they ${NAMES_GROUP_WORDS}.`;

/**
 * Why following the blueprint again in everything is refused when its commands name other events of the blueprint whose
 * copies on this map are not known, in the same words, with what the author can still do: for a copy read field by field,
 * follow its other fields one by one.
 */
const ALL_KEEP_OWN = `It can't follow in everything: its commands ${NAMES_GROUP_WORDS}. Follow its other fields one by one.`;

/**
 * Why following the blueprint again is refused, for the same reason, for a copy drifted too far to be read field by field.
 */
const DRIFTED_KEEP_OWN = `It can't follow: its commands ${NAMES_GROUP_WORDS}.`;

/**
 * Why the Note box refuses text holding a link of its own.
 */
const SECOND_LINK = 'This event\'s link to its blueprint is kept for you, so the note can\'t hold a second one.';

/**
 * One of the actions a copy's panel offers on one field: pinning a number, unpinning it, or having the field follow the
 * blueprint again.
 */
type FieldAction = 'pin' | 'unpin' | 'follow';

/**
 * Lists the actions a copy's panel offers on one field: a number the copy and its blueprint both hold can be pinned, or
 * unpinned once pinned; any field the two both hold that stands apart from the blueprint can follow it again. A field
 * only one side has offers nothing of its own: its page's command list brings the two in step. Commands naming other
 * events of the blueprint whose copies here can't be told offer nothing either, since they can't follow.
 * @param {CopyField} field The field.
 * @returns {FieldAction[]} The actions, in the order the panel shows them.
 */
const fieldActions = (field: CopyField): FieldAction[] =>
{
  if (field.copy === undefined || field.blueprint === undefined || field.state.kind === 'names-group')
  {
    return [];
  }

  const follow: FieldAction[] = field.state.kind === 'follows' ? [] : [ 'follow' ];
  if (field.kind.kind === 'choice')
  {
    return follow;
  }

  return [ field.state.kind === 'pinned' ? 'unpin' : 'pin', ...follow ];
};

/**
 * Reports whether following the blueprint again in everything would change anything of a copy: a copy drifted too far for
 * a change to reach it always has something to follow, and a copy read field by field has while any field stands apart
 * but commands it keeps for naming other events of the blueprint, which can't follow; a lost copy has nothing left to
 * follow.
 * @param {Exclude<CopyReading, { kind: 'plain' }>} reading The copy, read.
 * @returns {boolean} True when there is anything to follow.
 */
const canFollowAgain = (reading: Exclude<CopyReading, { readonly kind: 'plain' }>): boolean =>
{
  if (reading.kind === 'read')
  {
    return reading.fields.some(field => field.state.kind !== 'follows' && field.state.kind !== 'names-group');
  }

  return reading.kind === 'drifted';
};

/**
 * Hands on a planned copy.
 * @param {RmmzMapEvent} event The copy as planned.
 * @returns {CopyPlan} The plan.
 */
const planned = (event: RmmzMapEvent): CopyPlan =>
{
  return { ok: true, event };
};

/**
 * Hands on why an action is refused.
 * @param {string} message Why, in words for the author.
 * @returns {CopyPlan} The refusal.
 */
const refused = (message: string): CopyPlan =>
{
  return { ok: false, message };
};

/**
 * Reads what an event's Note box shows (see {@link NoteBox}).
 * @param {RmmzMapEvent} event The event.
 * @returns {NoteBox} The text, and whether the box keeps a link out of it.
 */
const noteBoxOf = (event: RmmzMapEvent): NoteBox =>
{
  if (blueprintLinkOf(event.note) === null)
  {
    return { text: event.note, keepsLink: false };
  }

  try
  {
    return { text: ownNoteOf(event), keepsLink: true };
  }
  catch
  {
    return { text: event.note, keepsLink: false };
  }
};

/**
 * Writes a copy's note: its own text with its link after it, through the link's own writer, which takes the old link out
 * and puts the new one on a line of its own at the end, every other character kept, and refuses a note that would read
 * otherwise. A note already holding that very text and that very link is left byte for byte, wherever its link sits.
 * @param {RmmzMapEvent} copy The copy, with whatever else the action changed.
 * @param {string} text The note's own text.
 * @param {BlueprintLink} link The link.
 * @returns {CopyPlan} The copy holding the note, or why it cannot.
 */
const withNote = (copy: RmmzMapEvent, text: string, link: BlueprintLink): CopyPlan =>
{
  const current = blueprintLinkOf(copy.note);
  const box = noteBoxOf(copy);
  if (current !== null && box.keepsLink && box.text === text && blueprintLinkText(current) === blueprintLinkText(link))
  {
    return planned(copy);
  }

  try
  {
    return planned({ ...copy, note: withBlueprintLink(text, link) });
  }
  catch (error)
  {
    return refused(`The note can't be written: ${(error as Error).message}.`);
  }
};

/**
 * Changes what a read copy's link keeps of some numbers, writing the link back after the note's own text.
 * @param {RmmzMapEvent} copy The copy, with whatever else the action changed.
 * @param {BlueprintLink} link The copy's link.
 * @param {ReadonlyMap<string, FieldLink | null>} changes What the link is to keep of each, by key; null for nothing.
 * @returns {CopyPlan} The copy, or why its note cannot take the link.
 */
const withKept = (copy: RmmzMapEvent, link: BlueprintLink, changes: ReadonlyMap<string, FieldLink | null>): CopyPlan =>
{
  // a read copy's note reads cleanly without its link, or the copy would have drifted.
  return withNote(copy, ownNoteOf(copy), withFieldLinks(link, changes));
};

/**
 * Finds one field of a read copy by its key.
 * @param {ReadCopy} reading The copy, read.
 * @param {string} key The field's key.
 * @returns {CopyField | null} The field, or null when the copy has no such field any more.
 */
const fieldAt = (reading: ReadCopy, key: string): CopyField | null =>
{
  return reading.fields.find(field => field.key === key) ?? null;
};

/**
 * Plans pinning one of a copy's numbers at the value it holds now, so it keeps that value whatever the blueprint does:
 * the link keeps the value, and the copy itself changes in nothing else. A number already pinned, or one only one side
 * has, cannot be pinned.
 * @param {RmmzMapEvent} copy The copy, as it stands.
 * @param {ReadCopy} reading The copy, read against its blueprint.
 * @param {string} key The number's key.
 * @returns {CopyPlan} The copy, or why not.
 */
const pinPlan = (copy: RmmzMapEvent, reading: ReadCopy, key: string): CopyPlan =>
{
  const field = fieldAt(reading, key);
  if (field === null || field.kind.kind !== 'number' || field.blueprint === undefined || field.copy === undefined || field.state.kind === 'pinned')
  {
    return refused(FIELD_GONE);
  }

  return withKept(copy, reading.link, new Map([ [ key, { kind: 'pin', value: field.copy as number } ] ]));
};

/**
 * Plans unpinning one of a copy's numbers: it keeps the value it holds, and follows the blueprint from then on by the
 * offset that value gives, nothing at all when it sits right at the blueprint's.
 * @param {RmmzMapEvent} copy The copy, as it stands.
 * @param {ReadCopy} reading The copy, read against its blueprint.
 * @param {string} key The number's key.
 * @returns {CopyPlan} The copy, or why not.
 */
const unpinPlan = (copy: RmmzMapEvent, reading: ReadCopy, key: string): CopyPlan =>
{
  const field = fieldAt(reading, key);
  if (field === null || field.state.kind !== 'pinned')
  {
    return refused(FIELD_GONE);
  }

  // a pinned number is one both sides hold, so both values are numbers.
  const amount = addExactly(field.copy as number, -(field.blueprint as number));
  return withKept(copy, reading.link, new Map([ [ key, amount === 0 ? null : { kind: 'offset', amount } ] ]));
};

/**
 * Finds the event of its blueprint a copy was made from, as the blueprint holds it, its commands naming the blueprint's
 * own ids.
 * @param {FollowableCopy} reading The copy, read.
 * @returns {RmmzMapEvent} The event.
 */
const madeFrom = (reading: FollowableCopy): RmmzMapEvent =>
{
  // a copy read or drifted was read against this very event.
  return reading.blueprint.stamp.events.find(event => event.id === reading.link.eventId) as RmmzMapEvent;
};

/**
 * Plans following the blueprint's command list on one page: the copy's list, less its tag lines, becomes the blueprint's,
 * each tag line the copy has a pair of keeping the copy's own text, since its fields are fields of their own, as a change
 * to the blueprint's list carries it (see copyChanges' followedList). A tag line of the copy's the blueprint has no pair
 * of goes, and whatever the link kept of its numbers goes with it.
 * @param {RmmzMapEvent} copy The copy.
 * @param {ReadCopy} reading The copy, read.
 * @param {number} page The page, counted from 0.
 * @param {ActionContext} context The tags the modules read, and the copy's group.
 * @returns {CopyPlan} The copy, or why not.
 */
const followCommands = (copy: RmmzMapEvent, reading: ReadCopy, page: number, context: ActionContext): CopyPlan =>
{
  const made = madeFrom(reading);
  if (namesUnknown(made, [ made.pages[page] ], unknownSiblings(reading.blueprint, made, context.references)))
  {
    return refused(COMMANDS_KEEP_OWN);
  }

  const theirs = reading.source.pages[page];
  const ours = copy.pages[page];
  const before = tagLinesOf(ours, context.tags);
  const list = followedList({ before: theirs, after: theirs, copy: ours }, tagLinesOf(theirs, context.tags), before);
  const after = tagLinesOf({ ...ours, list }, context.tags);

  // each number of a tag line that went takes whatever the link kept of it along.
  const gone = before.filter(line => after.some(each => each.tag.id === line.tag.id && each.key === line.key) === false);
  const changes = new Map(gone.flatMap(line => line.fields
    .filter(field => field.kind.kind === 'number')
    .map(field => [ `${pageKey(page)}.${lineFieldName(line.key, field.name)}`, null ] as const)));
  const pages = copy.pages.map((each, index) => (index === page ? { ...each, list } : each));
  return withKept({ ...copy, pages }, reading.link, changes);
};

/**
 * Plans writing the blueprint's value into one field of a tag line on the copy: into the copy's own line, in place,
 * through the module reading the tag, which refuses a value the line cannot hold as the game would read it.
 * @param {RmmzMapEvent} copy The copy.
 * @param {TagPlace} place Where the field sits, on a line the copy has.
 * @param {JsonValue} value The blueprint's value.
 * @param {readonly CommentTagDefinition[]} tags The tags the modules read.
 * @returns {CopyPlan} The copy, or why not.
 */
const withTagValue = (copy: RmmzMapEvent, place: TagPlace, value: JsonValue, tags: readonly CommentTagDefinition[]): CopyPlan =>
{
  // the field was read off this very line of the copy's, so the line is there.
  const line = tagLinesOf(copy.pages[place.page], tags).find(each => each.tag.id === place.tag.id && each.key === place.line) as PageTagLine;

  // the copy's own line takes the value, every other character of it kept.
  const { list } = copy.pages[place.page];
  const command = list[line.listIndex];
  let text = '';
  try
  {
    text = place.tag.write(command.parameters[0] as string, place.field, cloneJson(value));
  }
  catch (error)
  {
    return refused(`It can't follow: ${(error as Error).message}.`);
  }

  const written = list.map((entry, index) => (index === line.listIndex ? { ...command, parameters: [ text ] } : entry));
  return planned({ ...copy, pages: copy.pages.map((each, index) => (index === place.page ? { ...each, list: written } : each)) });
};

/**
 * Plans writing the blueprint's value into a field of the copy that holds one value: the name, one of a page's own fields,
 * or a field of a tag line.
 * @param {RmmzMapEvent} copy The copy.
 * @param {FieldPlace} place Where the field sits: anywhere but the note and a command list.
 * @param {JsonValue} value The blueprint's value.
 * @param {readonly CommentTagDefinition[]} tags The tags the modules read.
 * @returns {CopyPlan} The copy, or why not.
 */
const withValue = (copy: RmmzMapEvent, place: Exclude<FieldPlace, { readonly kind: 'note' | 'commands' }>, value: JsonValue, tags: readonly CommentTagDefinition[]): CopyPlan =>
{
  if (place.kind === 'name')
  {
    return planned({ ...copy, name: value as string });
  }

  if (place.kind === 'page')
  {
    return planned({ ...copy, pages: copy.pages.map((each, index) => (index === place.page ? place.field.write(each, cloneJson(value)) : each)) });
  }

  return withTagValue(copy, place, value, tags);
};

/**
 * Plans following the blueprint in one field of a copy, which takes the blueprint's value now: the name or the note's own
 * text, one of a page's own fields, a page's command list, or one field of a tag line. A number follows at an offset of 0,
 * its link keeping nothing of it any more; a choice simply takes the blueprint's. A field already following leaves the
 * copy as it is, and a field only one side has has nothing to follow but its page's command list.
 * @param {RmmzMapEvent} copy The copy, as it stands.
 * @param {ReadCopy} reading The copy, read against its blueprint.
 * @param {string} key The field's key.
 * @param {ActionContext} context The tags the modules read, and the copy's group.
 * @returns {CopyPlan} The copy, or why not.
 */
const followPlan = (copy: RmmzMapEvent, reading: ReadCopy, key: string, context: ActionContext): CopyPlan =>
{
  const field = fieldAt(reading, key);
  if (field === null || field.copy === undefined || field.blueprint === undefined)
  {
    return refused(FIELD_GONE);
  }

  if (field.state.kind === 'follows')
  {
    return planned(copy);
  }

  const { place, blueprint } = field;
  if (place.kind === 'commands')
  {
    return followCommands(copy, reading, place.page, context);
  }

  // the note's own text follows with the link after it, kept exactly as it is.
  if (place.kind === 'note')
  {
    return withNote(copy, blueprint as string, reading.link);
  }

  // every other field takes the blueprint's value, and a number then follows at an offset of 0.
  const followed = withValue(copy, place, blueprint, context.tags);
  return followed.ok === false || field.kind.kind === 'choice'
    ? followed
    : withKept(followed.event, reading.link, new Map([ [ key, null ] ]));
};

/**
 * Plans following the blueprint again in everything: the copy becomes its blueprint's event, as placing it would put it
 * down, its commands naming its group's copies, keeping only its own id, where it stands, and its link, which keeps no
 * offset or pin any more, every value of no shape the field model knows staying as written. It is how a copy drifted
 * too far for a change to reach it, or left behind by an undo, comes back in step. A copy whose blueprint's commands name
 * other events of the blueprint whose copies here can't be told keeps its own commands, so it can't follow in everything,
 * and is refused, in the words its commands' row says it in.
 * @param {RmmzMapEvent} copy The copy, as it stands.
 * @param {FollowableCopy} reading The copy, read against its blueprint, or drifted from it.
 * @param {ReadonlyMap<number, number> | undefined} references The copy's group, by the blueprint's ids, when known.
 * @returns {CopyPlan} The copy, or why not.
 */
const followAllPlan = (copy: RmmzMapEvent, reading: FollowableCopy, references: ReadonlyMap<number, number> | undefined): CopyPlan =>
{
  const made = madeFrom(reading);
  if (namesUnknown(made, made.pages, unknownSiblings(reading.blueprint, made, references)))
  {
    return refused(reading.kind === 'read' ? ALL_KEEP_OWN : DRIFTED_KEEP_OWN);
  }

  // a blueprint's events carry no links, so the blueprint's own text is its whole note.
  const { link, source } = reading;
  const next = { ...link, differences: link.differences.filter(text => readFieldLink(text) === null) };
  return withNote({ ...copy, name: source.name, pages: cloneJson(source.pages) }, ownNoteOf(source), next);
};

/**
 * Plans unlinking a copy from its blueprint: its link comes out of its note, the line it sat on with it, so it becomes a
 * plain event, every other character of the note and every other field exactly as it was. A note that would read
 * otherwise without its link is refused, with why.
 * @param {RmmzMapEvent} copy The copy, as it stands.
 * @returns {CopyPlan} The event, or why not.
 */
const unlinkPlan = (copy: RmmzMapEvent): CopyPlan =>
{
  try
  {
    return planned({ ...copy, note: withoutBlueprintLink(copy.note) });
  }
  catch (error)
  {
    return refused(`It can't be unlinked: ${(error as Error).message}.`);
  }
};

/**
 * Plans writing what the author typed in an event's Note box: for a copy whose box keeps its link out of the way, the text
 * becomes the note's own text, with the link written after it by the link's own writer, kept exactly; text holding a link
 * of its own is refused, since the box never loses the one the copy has, and text the same as the note's own leaves the
 * note as it is, wherever its link sits. For any other event the text becomes the whole note, as written.
 * @param {RmmzMapEvent} event The event, as it stands.
 * @param {string} text What the author typed.
 * @returns {CopyPlan} The event, or why not.
 */
const noteTextPlan = (event: RmmzMapEvent, text: string): CopyPlan =>
{
  const box = noteBoxOf(event);
  if (box.keepsLink === false)
  {
    return planned({ ...event, note: text });
  }

  if (metaTagsOf(text).some(tag => tag.key === BLUEPRINT_LINK_KEY))
  {
    return refused(SECOND_LINK);
  }

  // a box kept out of the way reads a link, so the event's note holds one.
  return withNote(event, text, blueprintLinkOf(event.note) as BlueprintLink);
};

export {
  ALL_KEEP_OWN,
  canFollowAgain,
  COMMANDS_KEEP_OWN,
  DRIFTED_KEEP_OWN,
  FIELD_GONE,
  fieldActions,
  followAllPlan,
  followPlan,
  noteBoxOf,
  noteTextPlan,
  pinPlan,
  SECOND_LINK,
  unlinkPlan,
  unpinPlan,
};
export type { ActionContext, CopyPlan, FieldAction, FollowableCopy, NoteBox, ReadCopy };
