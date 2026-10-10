import { rewireGroupReferences } from '../events/eventReferences.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import {
  ownNoteOf,
  placedEventFields,
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
 * How many of a copy's fields stand apart from its blueprint, kind by kind: choices set by hand, numbers pinned, and
 * numbers held by an offset.
 */
type CopyDifferences = {
  readonly own: number;
  readonly pinned: number;
  readonly offsets: number;
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
 * known.
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
  const fields = pairedFields(placedEventFields(copy, note.note, context.tags), placedEventFields(source, ownNoteOf(source), context.tags), fieldLinksOf(link));
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
  return { own: count('own'), pinned: count('pinned'), offsets: count('offset') };
};

export { BLUEPRINT_GONE, differencesOf, NO_SUCH_EVENT, readCopy, sourceFor };
export type { CopyContext, CopyDifferences, CopyField, CopyFieldState, CopyReading };
