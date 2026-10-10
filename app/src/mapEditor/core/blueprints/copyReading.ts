import { rewireGroupReferences } from '../events/eventReferences.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import {
  listLessTags,
  ownNoteOf,
  placedEventFields,
  tagLinesOf,
  type CommentTagDefinition,
  type FieldKind,
  type FieldPlace,
  type PlacedField,
} from './blueprintFields.ts';
import { blueprintLinkOf, type BlueprintLink } from './blueprintLink.ts';
import type { Blueprint } from './blueprints.ts';
import { pagesWords } from './copyChanges.ts';
import { currentLink, fieldLinksOf, type FieldLink } from './fieldLinks.ts';

/**
 * Where one field of a copy stands against its blueprint, as the field model would carry a change to the blueprint into
 * it:
 *
 * - **follows**: it holds what the blueprint holds, a number at an offset of 0, and takes every change the blueprint makes;
 * - **offset**: a number held by how far it sits from the blueprint's, which it keeps through every change;
 * - **pinned**: a number held at a value of its own, whatever the blueprint does;
 * - **own**: a choice the copy holds otherwise than its blueprint, set by hand, which no change to the blueprint moves;
 * - **names-group**: a page's command list that stands apart from its blueprint's only where the blueprint's commands
 *   name other events of the blueprint whose copies on this map can't be told, which nobody set by hand: placing the
 *   blueprint had the copy's commands name those events' copies, and with the copies unknown the two lists can't be
 *   matched, so the copy keeps its own, as a change to the blueprint keeps it (see planCopyChange);
 * - **copy-only** and **blueprint-only**: a field one side has and the other has not, such as a tag line the copy was given
 *   by hand, or one it lost, which only the page's command list can bring in step.
 *
 * A number's offset or pin is read as a change would read it (see fieldLinks' currentLink): from the link while the copy
 * holds what its link says, and otherwise afresh from what the copy holds, since a copy changed somewhere else, or left
 * behind by an undo, has that change taken as its own the next time the blueprint moves the field.
 */
type CopyFieldState =
  | { readonly kind: 'follows' }
  | { readonly kind: 'offset'; readonly amount: number }
  | { readonly kind: 'pinned'; readonly value: number }
  | { readonly kind: 'own' }
  | { readonly kind: 'names-group' }
  | { readonly kind: 'copy-only' }
  | { readonly kind: 'blueprint-only' };

/**
 * One field of a copy, read against its blueprint: the field's key, what kind of field it is, where it sits (in the copy,
 * or, for a field only the blueprint has, in the blueprint's event, whose pages pair with the copy's by place), what the
 * copy and the blueprint each hold of it, and where it stands.
 */
type CopyField = {
  readonly key: string;
  readonly kind: FieldKind;
  readonly place: FieldPlace;

  /**
   * The copy's value, or undefined for a field only the blueprint has.
   */
  readonly copy: JsonValue | undefined;

  /**
   * The blueprint's value, or undefined for a field only the copy has.
   */
  readonly blueprint: JsonValue | undefined;

  readonly state: CopyFieldState;
};

/**
 * What a copy is read against.
 */
type CopyContext = {
  /**
   * Finds a blueprint by its id, as the window holds the blueprints; null for one they no longer keep.
   */
  readonly blueprint: (blueprintId: string) => Blueprint | null;

  /**
   * The tags the active modules read from comments as fields (the plugin module registry's comment tags).
   */
  readonly tags: readonly CommentTagDefinition[];

  /**
   * The ids the copies of the blueprint's events placed with this copy have on its map, by the ids the blueprint knows them
   * by (see copyPlans' copyGroupOf). Left out, only the copy itself is known, as a change to the blueprint knows it then.
   */
  readonly references?: ReadonlyMap<number, number>;
};

/**
 * What reading a copy against its blueprint came to:
 *
 * - **plain**: the event is no copy of any blueprint;
 * - **lost**: its link names a blueprint the window no longer keeps, or an event that blueprint no longer has, so there is
 *   nothing to read it against, and why, in words for the author;
 * - **drifted**: it has drifted too far for any change to the blueprint to reach it (its pages do not pair with its
 *   blueprint event's, or its note cannot be read without its link), and why, as the where-used list says it;
 * - **read**: each of its fields against the blueprint's.
 *
 * Every kind but plain carries the link; drifted and read carry the blueprint, and its event as the copy follows it: the
 * commands naming the event itself, or another of its group where the group is known, naming the copy's own (see
 * planCopyChange).
 */
type CopyReading =
  | { readonly kind: 'plain' }
  | { readonly kind: 'lost'; readonly link: BlueprintLink; readonly blueprint: Blueprint | null; readonly reason: string }
  | { readonly kind: 'drifted'; readonly link: BlueprintLink; readonly blueprint: Blueprint; readonly source: RmmzMapEvent; readonly reason: string }
  | { readonly kind: 'read'; readonly link: BlueprintLink; readonly blueprint: Blueprint; readonly source: RmmzMapEvent; readonly fields: readonly CopyField[] };

/**
 * How many of a copy's fields stand apart from its blueprint, kind by kind: choices set by hand, numbers pinned, numbers
 * held by an offset, and pages whose commands name other events of the blueprint, which the copy keeps as its own.
 */
type CopyDifferences = {
  readonly own: number;
  readonly pinned: number;
  readonly offsets: number;
  readonly group: number;
};

/**
 * An event no blueprint is linked to.
 */
const PLAIN: CopyReading = { kind: 'plain' };

/**
 * What a field that follows its blueprint stands at.
 */
const FOLLOWS: CopyFieldState = { kind: 'follows' };

/**
 * What a choice set by hand stands at.
 */
const OWN: CopyFieldState = { kind: 'own' };

/**
 * What a page's command list stands at when it stands apart only by naming other events of the blueprint whose copies
 * on this map can't be told.
 */
const NAMES_GROUP: CopyFieldState = { kind: 'names-group' };

/**
 * What a field only the copy has stands at.
 */
const COPY_ONLY: CopyFieldState = { kind: 'copy-only' };

/**
 * What a field only the blueprint has stands at.
 */
const BLUEPRINT_ONLY: CopyFieldState = { kind: 'blueprint-only' };

/**
 * Why a copy cannot be read when its blueprint is gone.
 */
const BLUEPRINT_GONE = 'its blueprint is gone';

/**
 * Why a copy cannot be read when its blueprint no longer has the event it was made from.
 */
const NO_SUCH_EVENT = 'its blueprint keeps no such event any more';

/**
 * Builds the blueprint's event as a copy of it follows it: every command naming the event by its id naming the copy, and
 * every one naming another of its group naming that one's copy, where the group is known, as placing it rewired them.
 * @param {RmmzMapEvent} event The blueprint's event.
 * @param {RmmzMapEvent} copy The copy.
 * @param {ReadonlyMap<number, number> | undefined} references The copy's group, by the blueprint's ids, when known.
 * @returns {RmmzMapEvent} The event as the copy follows it.
 */
const sourceFor = (event: RmmzMapEvent, copy: RmmzMapEvent, references: ReadonlyMap<number, number> | undefined): RmmzMapEvent =>
{
  // the copy is always its own blueprint event's copy, whatever else of its group is known.
  return rewireGroupReferences(event, new Map([ ...references ?? [], [ event.id, copy.id ] ]));
};

/**
 * Lists the blueprint's other events whose copies on this map are not known, each to an id no event has, so a command
 * naming one of them shows once rewired (see {@link namesUnknown}).
 * @param {Blueprint} blueprint The blueprint.
 * @param {RmmzMapEvent} made The event of it the copy was made from.
 * @param {ReadonlyMap<number, number> | undefined} references The copy's group, by the blueprint's ids, when known.
 * @returns {Map<number, number>} The ids, each to -1.
 */
const unknownSiblings = (blueprint: Blueprint, made: RmmzMapEvent, references: ReadonlyMap<number, number> | undefined): Map<number, number> =>
{
  const known = references ?? new Map<number, number>();
  return new Map(blueprint.stamp.events.filter(event => event.id !== made.id && known.has(event.id) === false).map(event => [ event.id, -1 ]));
};

/**
 * Reports whether a command on some of an event's pages names one of the events given, as rewiring them shows.
 * @param {RmmzMapEvent} event The event, as its blueprint holds it.
 * @param {readonly RmmzEventPage[]} pages The pages to look at.
 * @param {ReadonlyMap<number, number>} unknown The events, by id.
 * @returns {boolean} True when a command names one.
 */
const namesUnknown = (event: RmmzMapEvent, pages: readonly RmmzEventPage[], unknown: ReadonlyMap<number, number>): boolean =>
{
  const looked = { ...event, pages: [ ...pages ] };
  return unknown.size > 0 && jsonEquals(rewireGroupReferences(looked, unknown), looked) === false;
};

/**
 * Finds where one page of the blueprint's event names another of the blueprint's events whose copy on this map is not
 * known, as rewiring them shows: for each command naming one, by its place in the list, the places among its parameters
 * that do. Read off the blueprint's own ids, so a command naming a known event's copy is never taken for one of these.
 * @param {RmmzMapEvent} made The blueprint's event, its commands naming the blueprint's own ids.
 * @param {number} pageIndex The page, counted from 0.
 * @param {ReadonlyMap<number, number>} unknown The events whose copies are not known, by id (see {@link unknownSiblings}).
 * @returns {Map<number, number[]>} The places, by command; empty when the page names none.
 */
const unknownPlaces = (made: RmmzMapEvent, pageIndex: number, unknown: ReadonlyMap<number, number>): Map<number, number[]> =>
{
  const page = made.pages[pageIndex];
  const [ rewired ] = rewireGroupReferences({ ...made, pages: [ page ] }, unknown).pages;
  const places = new Map<number, number[]>();
  page.list.forEach((command, index) =>
  {
    // rewiring moves nothing but the parameters naming an event, so whatever it moved names one of these.
    const named = command.parameters.flatMap((value, at) => (jsonEquals(value, rewired.list[index].parameters[at]) ? [] : [ at ]));
    if (named.length > 0)
    {
      places.set(index, named);
    }
  });

  return places;
};

/**
 * Blanks the parameters at the places given in a command list, so two lists can be held side by side but for the events
 * those places name.
 * @param {readonly RmmzEventCommand[]} list The list.
 * @param {ReadonlyMap<number, readonly number[]>} places The places, by command (see {@link unknownPlaces}).
 * @returns {RmmzEventCommand[]} The list, each of those parameters null.
 */
const withPlacesBlank = (list: readonly RmmzEventCommand[], places: ReadonlyMap<number, readonly number[]>): RmmzEventCommand[] =>
{
  return list.map((command, index) =>
  {
    const blank = places.get(index);
    return blank === undefined
      ? command
      : { ...command, parameters: command.parameters.map((value, at) => (blank.includes(at) ? null : value)) };
  });
};

/**
 * Reports whether a copy's command list on one page stands apart from its blueprint's only where the blueprint's commands
 * name other events of the blueprint whose copies on this map can't be told: placing the blueprint had the copy's commands
 * name those events' copies, the blueprint's name them by the blueprint's own ids, and with the copies unknown the two
 * can't be matched. Held side by side but for those places, less every tag line as the command list is read, the two
 * lists are then the same; a list changed in any other way was changed by hand.
 * @param {RmmzMapEvent} made The blueprint's event, its commands naming the blueprint's own ids.
 * @param {RmmzMapEvent} source The blueprint's event as the copy follows it (see {@link sourceFor}).
 * @param {RmmzMapEvent} copy The copy, whose pages pair with the blueprint's.
 * @param {number} pageIndex The page, counted from 0.
 * @param {{ unknown: ReadonlyMap<number, number>, tags: readonly CommentTagDefinition[] }} reading The events whose
 * copies are not known, by id, and the tags the active modules read.
 * @returns {boolean} True when the list stands apart for that alone.
 */
const namesGroupAlone = (
  made: RmmzMapEvent,
  source: RmmzMapEvent,
  copy: RmmzMapEvent,
  pageIndex: number,
  reading: { readonly unknown: ReadonlyMap<number, number>; readonly tags: readonly CommentTagDefinition[] },
): boolean =>
{
  const places = unknownPlaces(made, pageIndex, reading.unknown);
  if (places.size === 0)
  {
    return false;
  }

  // the tag lines are read off the lists as they stand, the places blanked naming events, never a comment.
  const theirs = source.pages[pageIndex];
  const ours = copy.pages[pageIndex];
  const theirList = listLessTags(withPlacesBlank(theirs.list, places), tagLinesOf(theirs, reading.tags));
  const ourList = listLessTags(withPlacesBlank(ours.list, places), tagLinesOf(ours, reading.tags));
  return jsonEquals(theirList, ourList);
};

/**
 * Works out where one field the copy and its blueprint both have stands: a choice follows while the two hold the same and
 * is the copy's own otherwise; a number stands as its link stands now, read afresh when the copy holds otherwise than the
 * link says.
 * @param {FieldKind} kind The field's kind.
 * @param {JsonValue} copy The copy's value.
 * @param {JsonValue} blueprint The blueprint's value.
 * @param {FieldLink | null} held What the copy's link keeps of the field, or null for nothing.
 * @returns {CopyFieldState} Where it stands.
 */
const stateOf = (kind: FieldKind, copy: JsonValue, blueprint: JsonValue, held: FieldLink | null): CopyFieldState =>
{
  if (kind.kind === 'choice')
  {
    return jsonEquals(copy, blueprint) ? FOLLOWS : OWN;
  }

  // a number's link is read as the next change to the blueprint would read it.
  const link = currentLink(kind, blueprint as number, copy as number, held);
  if (link === null)
  {
    return FOLLOWS;
  }

  return link.kind === 'pin'
    ? { kind: 'pinned', value: link.value }
    : { kind: 'offset', amount: link.amount };
};

/**
 * Pairs a copy's fields with its blueprint's by their keys, which pair pages by their place and tag lines by their tag and
 * key, as a change to the blueprint pairs them: every field of the copy in its order, each with where it stands, then
 * every field only the blueprint has, in the blueprint's order.
 * @param {readonly PlacedField[]} copyFields The copy's fields.
 * @param {readonly PlacedField[]} blueprintFields The blueprint event's fields.
 * @param {ReadonlyMap<string, FieldLink>} held What the copy's link keeps of each number field, by key.
 * @returns {CopyField[]} The fields.
 */
const pairedFields = (copyFields: readonly PlacedField[], blueprintFields: readonly PlacedField[], held: ReadonlyMap<string, FieldLink>): CopyField[] =>
{
  const theirs = new Map(blueprintFields.map(field => [ field.key, field ]));
  const ours = new Set(copyFields.map(field => field.key));
  const paired = copyFields.map((field): CopyField =>
  {
    const { key, kind, place, value } = field;
    const other = theirs.get(key);
    return other === undefined
      ? { key, kind, place, copy: value, blueprint: undefined, state: COPY_ONLY }
      : { key, kind, place, copy: value, blueprint: other.value, state: stateOf(kind, value, other.value, held.get(key) ?? null) };
  });

  // a field only the blueprint has sits where the blueprint has it, its page paired with the copy's by place.
  const missing = blueprintFields
    .filter(field => ours.has(field.key) === false)
    .map(({ key, kind, place, value }): CopyField => ({ key, kind, place, copy: undefined, blueprint: value, state: BLUEPRINT_ONLY }));
  return [ ...paired, ...missing ];
};

/**
 * Reads the note's own text of a copy, or why it cannot be read without its link.
 * @param {RmmzMapEvent} copy The copy.
 * @returns {{ ok: true, note: string } | { ok: false, reason: string }} The text, or why not, in words for the author.
 */
const ownNoteRead = (copy: RmmzMapEvent): { readonly ok: true; readonly note: string } | { readonly ok: false; readonly reason: string } =>
{
  try
  {
    return { ok: true, note: ownNoteOf(copy) };
  }
  catch (error)
  {
    return { ok: false, reason: `in its note, ${(error as Error).message}` };
  }
};

/**
 * Reads a copy against its blueprint, field by field, as the field model would carry a change to the blueprint into it
 * (see planCopyChange): its name and its note's own text, then each page's own fields, its command list less every tag
 * line, and each field of each tag line on it, by the same keys and the same tags. Nothing is written.
 *
 * A copy whose blueprint is gone, or no longer has its event, is lost; one whose pages do not pair with its blueprint
 * event's, or whose note cannot be read without its link, has drifted, in the very words the where-used list uses. The
 * blueprint's event is read as the copy follows it, its commands naming its group as the copy's do where the group is
 * known; where it is not, a command list standing apart only by naming the others of the group names its group, rather
 * than reading as set by hand, since nobody set it.
 * @param {RmmzMapEvent} copy The event, a copy of a blueprint or not.
 * @param {CopyContext} context The blueprints, the tags the modules read, and the copy's group.
 * @returns {CopyReading} What reading it came to.
 */
const readCopy = (copy: RmmzMapEvent, context: CopyContext): CopyReading =>
{
  const link = blueprintLinkOf(copy.note);
  if (link === null)
  {
    return PLAIN;
  }

  const blueprint = context.blueprint(link.blueprintId);
  const made = blueprint === null ? undefined : blueprint.stamp.events.find(event => event.id === link.eventId);
  if (blueprint === null || made === undefined)
  {
    return { kind: 'lost', link, blueprint, reason: blueprint === null ? BLUEPRINT_GONE : NO_SUCH_EVENT };
  }

  const source = sourceFor(made, copy, context.references);
  if (copy.pages.length !== source.pages.length)
  {
    return { kind: 'drifted', link, blueprint, source, reason: `it has ${pagesWords(copy.pages.length)} and its blueprint has ${pagesWords(source.pages.length)}` };
  }

  const note = ownNoteRead(copy);
  if (note.ok === false)
  {
    return { kind: 'drifted', link, blueprint, source, reason: note.reason };
  }

  // a blueprint's events carry no links, so the blueprint's own text is its whole note.
  const paired = pairedFields(placedEventFields(copy, note.note, context.tags), placedEventFields(source, ownNoteOf(source), context.tags), fieldLinksOf(link));

  // a command list apart only by naming the others of a group nobody knows was never set by hand.
  const group = { unknown: unknownSiblings(blueprint, made, context.references), tags: context.tags };
  const fields = paired.map((field): CopyField =>
  {
    const groupAlone = field.place.kind === 'commands' && field.state.kind === 'own' && namesGroupAlone(made, source, copy, field.place.page, group);
    return groupAlone
      ? { ...field, state: NAMES_GROUP }
      : field;
  });
  return { kind: 'read', link, blueprint, source, fields };
};

/**
 * Counts how many of a copy's fields stand apart from its blueprint, kind by kind. A field one side has and the other has
 * not is counted where it shows, in its page's command list, which is set by hand whenever a tag line comes or goes.
 * @param {readonly CopyField[]} fields The copy's fields.
 * @returns {CopyDifferences} The counts.
 */
const differencesOf = (fields: readonly CopyField[]): CopyDifferences =>
{
  const count = (kind: CopyFieldState['kind']) => fields.filter(field => field.state.kind === kind).length;
  return { own: count('own'), pinned: count('pinned'), offsets: count('offset'), group: count('names-group') };
};

export { BLUEPRINT_GONE, differencesOf, namesUnknown, NO_SUCH_EVENT, readCopy, unknownSiblings };
export type { CopyContext, CopyDifferences, CopyField, CopyFieldState, CopyReading };
