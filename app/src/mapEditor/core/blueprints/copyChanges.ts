import { rewireGroupReferences } from '../events/eventReferences.ts';
import { cloneJson, jsonEquals, type JsonValue } from '../model/json.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import {
  listLessTags,
  ownNoteOf,
  PAGE_FIELDS,
  pageKey,
  tagLinesOf,
  type CommentTagDefinition,
  type FieldKind,
  type PageTagLine,
} from './blueprintFields.ts';
import { blueprintLinkOf, blueprintLinkText, withBlueprintLink, type BlueprintLink } from './blueprintLink.ts';
import { currentLink, fieldLinksOf, valueByLink, withFieldLinks, withPagesMoved, type FieldLink } from './fieldLinks.ts';

/**
 * A change to one of a blueprint's events: the event before it and after it, and, for a change that adds pages, takes
 * them away or moves them, which page each page after it continues.
 */
type BlueprintEventChange = {
  readonly before: RmmzMapEvent;
  readonly after: RmmzMapEvent;

  /**
   * For each page after the change, in order, the page before it that it continues, counted from 0, or null for a page the
   * change added; a page before it that none continues is one the change took away. Left out, the pages pair by their
   * place, which a change leaving as many pages as there were may do, and a change adding or taking pages away may not.
   */
  readonly pages?: readonly (number | null)[];
};

/**
 * What a copy's plan reads with.
 */
type CopyChangeOptions = {
  /**
   * The tags the active modules read from comments as fields (the plugin module registry's comment tags).
   */
  readonly tags: readonly CommentTagDefinition[];

  /**
   * The ids the copies of the blueprint's events placed with this copy have on its map, by the ids the blueprint knows
   * them by, as placing them rewired every command naming one of them (see rewireGroupReferences): a command of the
   * blueprint's naming one of these is read as naming its copy. Left out, the copy alone is known, which is enough for any
   * command naming the event itself by its id; a command naming another of the blueprint's events then names it by the
   * blueprint's id, which the copy's own command does not, so such a copy's command list reads as its own choice.
   */
  readonly references?: ReadonlyMap<number, number>;
};

/**
 * What a change to a blueprint's event comes to for one copy of it: nothing at all; the copy's new event, its note holding
 * its new link, with the link itself; or that the copy has drifted from its blueprint too far for the change to reach it,
 * and why, in words for the author, such as "it has 2 pages and its blueprint had 1".
 */
type CopyChange =
  | { readonly kind: 'stays' }
  | { readonly kind: 'changes'; readonly event: RmmzMapEvent; readonly link: BlueprintLink }
  | { readonly kind: 'drifted'; readonly reason: string };

/**
 * The three pages a page's plan reads: the blueprint's page before the change and after it, and the copy's page.
 */
type PageTrio = {
  readonly before: RmmzEventPage;
  readonly after: RmmzEventPage;
  readonly copy: RmmzEventPage;
};

/**
 * What a copy's page comes to: the page, and what the link keeps now of each number field the change moved or took away,
 * by its name on the page (speed, or light1.radius), null for nothing.
 */
type PagePlan = {
  readonly page: RmmzEventPage;
  readonly links: ReadonlyMap<string, FieldLink | null>;
};

/**
 * Reads what a copy's link keeps of a number field on the page being planned, by its name on the page.
 */
type HeldLinks = (name: string) => FieldLink | null;

/**
 * A copy the change reaches nothing of.
 */
const STAYS: CopyChange = { kind: 'stays' };

/**
 * Stops a copy's plan where the copy cannot take the change, carrying why, in words for the author.
 */
class CopyDrift extends Error
{
}

/**
 * Words a number of pages.
 * @param {number} count How many.
 * @returns {string} Such as "1 page" or "2 pages".
 */
const pagesWords = (count: number): string =>
{
  return count === 1 ? '1 page' : `${count} pages`;
};

/**
 * Reads a copy's link, which must name the blueprint's event the change is to.
 * @param {BlueprintEventChange} change The change.
 * @param {RmmzMapEvent} copy The copy.
 * @returns {BlueprintLink} The copy's link.
 * @throws {Error} When the event is no copy, or a copy of some other event, or the change is to two events.
 */
const linkOf = (change: BlueprintEventChange, copy: RmmzMapEvent): BlueprintLink =>
{
  const link = blueprintLinkOf(copy.note);
  if (link === null || link.eventId !== change.before.id || change.after.id !== change.before.id)
  {
    throw new Error(`event ${copy.id} is no copy of the blueprint's event ${change.before.id}, or the change is to another`);
  }

  return link;
};

/**
 * Pairs each page after a change with the page before it that it continues: as the change says, or by their place.
 * @param {BlueprintEventChange} change The change.
 * @returns {readonly (number | null)[]} For each page after it, the page before it, or null for a page it added.
 * @throws {Error} When the change adds or takes away pages without saying how they pair, or says it otherwise than
 * {@link BlueprintEventChange.pages} allows.
 */
const pagePairing = (change: BlueprintEventChange): readonly (number | null)[] =>
{
  const { before, after, pages } = change;
  if (pages === undefined)
  {
    if (before.pages.length !== after.pages.length)
    {
      throw new Error('a change that adds pages or takes them away says which page before it each page after it continues');
    }

    return after.pages.map((_page, index) => index);
  }

  const continued = pages.filter((from): from is number => from !== null);
  const paired = pages.length === after.pages.length
    && continued.every(from => Number.isInteger(from) && from >= 0 && from < before.pages.length)
    && new Set(continued).size === continued.length;
  if (paired === false)
  {
    throw new Error(`pages ${JSON.stringify(pages)} do not pair ${before.pages.length} pages before a change with ${after.pages.length} after it`);
  }

  return pages;
};

/**
 * Reports whether a change moves any of the event's fields at all: anything but where it stands.
 * @param {BlueprintEventChange} change The change.
 * @returns {boolean} True when anything but the event's place changed.
 */
const changesFields = (change: BlueprintEventChange): boolean =>
{
  const { x: _beforeX, y: _beforeY, ...before } = change.before;
  const { x: _afterX, y: _afterY, ...after } = change.after;
  return jsonEquals(before, after) === false;
};

/**
 * Works out where each of the copy's pages goes: the place of the page after the change that continues it, or null for
 * one the change took away.
 * @param {readonly (number | null)[]} pairing For each page after the change, the page before it it continues.
 * @param {number} count How many pages there were before the change.
 * @returns {Map<number, number | null>} Where each went, by where it was.
 */
const pagesMoved = (pairing: readonly (number | null)[], count: number): Map<number, number | null> =>
{
  return new Map(Array.from({ length: count }, (_unused, from) =>
  {
    const to = pairing.indexOf(from);
    return [ from, to === -1 ? null : to ] as const;
  }));
};

/**
 * Plans one choice the change moved: a copy still holding the blueprint's old value follows it to the new one; a copy
 * holding a value of its own keeps it, which is its override.
 * @param {JsonValue} before The blueprint's value before the change.
 * @param {JsonValue} after The blueprint's value after it.
 * @param {JsonValue} copy The copy's value.
 * @returns {JsonValue} The copy's value now.
 */
const plannedChoice = (before: JsonValue, after: JsonValue, copy: JsonValue): JsonValue =>
{
  return jsonEquals(copy, before)
    ? cloneJson(after)
    : copy;
};

/**
 * Plans one field the change moved, a number by its link and a choice by whether the copy still held the old value.
 * @param {FieldKind} kind The field's kind.
 * @param {{ before: JsonValue, after: JsonValue, copy: JsonValue }} values The blueprint's value before the change and
 * after it, and the copy's.
 * @param {FieldLink | null} held What the copy's link keeps of it, for a number.
 * @returns {{ value: JsonValue, link: FieldLink | null | undefined }} The copy's value now, and for a number what its link
 * keeps of it now; undefined for a choice, of which the link keeps nothing.
 */
const plannedField = (
  kind: FieldKind,
  values: { readonly before: JsonValue; readonly after: JsonValue; readonly copy: JsonValue },
  held: FieldLink | null,
): { value: JsonValue; link: FieldLink | null | undefined } =>
{
  if (kind.kind === 'choice')
  {
    return { value: plannedChoice(values.before, values.after, values.copy), link: undefined };
  }

  // the link is read afresh when the copy no longer holds what it says, and the copy then follows the new value by it.
  const link = currentLink(kind, values.before as number, values.copy as number, held);
  return { value: valueByLink(kind, values.after as number, link), link };
};

/**
 * Plans a page's own fields: every one the change moved, the rest left exactly as the copy has them.
 * @param {PageTrio} pages The blueprint's page before and after the change, and the copy's.
 * @param {HeldLinks} held What the copy's link keeps of each number field on the page.
 * @param {Map<string, FieldLink | null>} links Where each number field's link is noted, by its name on the page.
 * @returns {RmmzEventPage} The copy's page with its own fields planned, its command list as it was.
 */
const plannedOwnFields = (pages: PageTrio, held: HeldLinks, links: Map<string, FieldLink | null>): RmmzEventPage =>
{
  return PAGE_FIELDS.reduce((page, field) =>
  {
    const before = field.read(pages.before);
    const after = field.read(pages.after);
    if (jsonEquals(before, after))
    {
      return page;
    }

    const copy = field.read(pages.copy);
    const planned = plannedField(field.kind, { before, after, copy }, held(field.name));
    if (planned.link !== undefined)
    {
      links.set(field.name, planned.link);
    }

    return jsonEquals(planned.value, copy)
      ? page
      : field.write(page, planned.value);
  }, pages.copy);
};

/**
 * Finds the line on a page a module's tag line pairs with: the same tag, under the same key.
 * @param {readonly PageTagLine[]} lines The page's tag lines.
 * @param {PageTagLine} line The line to pair.
 * @returns {PageTagLine | null} Its pair, or null when the page has none.
 */
const pairOf = (lines: readonly PageTagLine[], line: PageTagLine): PageTagLine | null =>
{
  return lines.find(each => each.tag.id === line.tag.id && each.key === line.key) ?? null;
};

/**
 * Builds the command list a copy takes when it follows its blueprint's new one: the blueprint's list as it now stands,
 * but for each module tag line the copy has a pair of, which keeps the copy's own text, since its fields are fields of
 * their own, each followed one by one after.
 * @param {PageTrio} pages The blueprint's page after the change, and the copy's.
 * @param {readonly PageTagLine[]} afterLines The tag lines on the blueprint's page after the change.
 * @param {readonly PageTagLine[]} copyLines The tag lines on the copy's page.
 * @returns {RmmzEventCommand[]} The list.
 */
const followedList = (pages: PageTrio, afterLines: readonly PageTagLine[], copyLines: readonly PageTagLine[]): RmmzEventCommand[] =>
{
  return pages.after.list.map((command, index) =>
  {
    const line = afterLines.find(each => each.listIndex === index);
    const own = line === undefined ? null : pairOf(copyLines, line);
    const taken = cloneJson(command);
    return own === null
      ? taken
      : { ...taken, parameters: cloneJson(pages.copy.list[own.listIndex].parameters) };
  });
};

/**
 * Writes one field's value into a copy's tag line, through the module that reads the tag.
 * @param {PageTagLine} line The copy's line, with the tag reading it.
 * @param {string} text The line as it now stands.
 * @param {string} field The field's name.
 * @param {JsonValue} value The value.
 * @returns {string} The line holding the value.
 * @throws {CopyDrift} When the line cannot take the value, saying why, in the module's words.
 */
const writtenField = (line: PageTagLine, text: string, field: string, value: JsonValue): string =>
{
  try
  {
    return line.tag.write(text, field, value);
  }
  catch (error)
  {
    throw new CopyDrift((error as Error).message);
  }
};

/**
 * Plans the fields of one module tag line the change moved, writing each the copy no longer holds into the copy's line in
 * place, and noting the link of each number.
 * @param {{ before: PageTagLine, after: PageTagLine, copy: PageTagLine }} lines The line on the blueprint's page before
 * the change and after it, and its pair on the copy's page as it now stands.
 * @param {string} text The copy's line as it now stands.
 * @param {HeldLinks} held What the copy's link keeps of each number field on the page.
 * @param {Map<string, FieldLink | null>} links Where each number field's link is noted, by its name on the page.
 * @returns {string} The copy's line.
 * @throws {CopyDrift} When the copy's line cannot take a value.
 */
const plannedTagLine = (
  lines: { readonly before: PageTagLine; readonly after: PageTagLine; readonly copy: PageTagLine },
  text: string,
  held: HeldLinks,
  links: Map<string, FieldLink | null>,
): string =>
{
  return lines.before.fields.reduce((written, field) =>
  {
    const now = lines.after.fields.find(each => each.name === field.name);
    const copy = lines.copy.fields.find(each => each.name === field.name);
    if (now === undefined || copy === undefined || jsonEquals(field.value, now.value))
    {
      return written;
    }

    const name = `${lines.before.key}.${field.name}`;
    const planned = plannedField(now.kind, { before: field.value, after: now.value, copy: copy.value }, held(name));
    if (planned.link !== undefined)
    {
      links.set(name, planned.link);
    }

    return jsonEquals(planned.value, copy.value)
      ? written
      : writtenField(lines.copy, written, field.name, planned.value);
  }, text);
};

/**
 * Plans a page's command list, which is one choice less every module tag on it, whose fields are each a field of their
 * own. A copy whose list, less its tags, is still the blueprint's old one follows it to the new one, keeping its own tag
 * lines' text; a list of the copy's own stays. Either way each field of a tag the change moved is then followed on the
 * copy's own line, wherever the copy has the line; a tag line the change took away takes the link of its fields with it
 * once the copy no longer has the line.
 * @param {PageTrio} pages The blueprint's page before and after the change, and the copy's.
 * @param {readonly CommentTagDefinition[]} tags The tags the active modules read.
 * @param {HeldLinks} held What the copy's link keeps of each number field on the page.
 * @param {Map<string, FieldLink | null>} links Where each number field's link is noted, by its name on the page.
 * @returns {RmmzEventCommand[]} The copy's list; the very list when nothing on it changes.
 * @throws {CopyDrift} When a line of the copy's cannot take a value.
 */
const plannedList = (
  pages: PageTrio,
  tags: readonly CommentTagDefinition[],
  held: HeldLinks,
  links: Map<string, FieldLink | null>,
): RmmzEventCommand[] =>
{
  const beforeLines = tagLinesOf(pages.before, tags);
  const afterLines = tagLinesOf(pages.after, tags);
  const copyLines = tagLinesOf(pages.copy, tags);
  const beforeLess = listLessTags(pages.before.list, beforeLines);
  const follows = jsonEquals(beforeLess, listLessTags(pages.after.list, afterLines)) === false
    && jsonEquals(listLessTags(pages.copy.list, copyLines), beforeLess);
  const list = follows ? followedList(pages, afterLines, copyLines) : pages.copy.list;
  const lines = follows ? tagLinesOf({ ...pages.copy, list }, tags) : copyLines;

  const written = [ ...list ];
  beforeLines.forEach(line =>
  {
    const after = pairOf(afterLines, line);
    const copy = pairOf(lines, line);
    if (after === null && copy === null)
    {
      line.fields.filter(field => field.kind.kind === 'number').forEach(field => links.set(`${line.key}.${field.name}`, null));
    }

    if (after === null || copy === null)
    {
      return;
    }

    const text = written[copy.listIndex].parameters[0] as string;
    const planned = plannedTagLine({ before: line, after, copy }, text, held, links);
    if (planned !== text)
    {
      written[copy.listIndex] = { ...written[copy.listIndex], parameters: [ planned ] };
    }
  });

  return jsonEquals(written, pages.copy.list) ? pages.copy.list : written;
};

/**
 * Plans one of a copy's pages: its own fields, then its command list and the fields of every module tag on it.
 * @param {PageTrio} pages The blueprint's page before and after the change, and the copy's.
 * @param {readonly CommentTagDefinition[]} tags The tags the active modules read.
 * @param {HeldLinks} held What the copy's link keeps of each number field on the page.
 * @param {number} pageIndex Where the copy's page sits among its pages, counted from 0, for the words of a refusal.
 * @returns {PagePlan} The page, and what the link keeps now of each number field the change moved.
 * @throws {CopyDrift} When a line of the copy's cannot take a value.
 */
const plannedPage = (pages: PageTrio, tags: readonly CommentTagDefinition[], held: HeldLinks, pageIndex: number): PagePlan =>
{
  const links = new Map<string, FieldLink | null>();
  const page = plannedOwnFields(pages, held, links);
  try
  {
    const list = plannedList(pages, tags, held, links);
    return { page: list === pages.copy.list ? page : { ...page, list }, links };
  }
  catch (error)
  {
    // only a line refusing a value is the copy's to answer for; anything else is a mistake, and stays loud.
    if (error instanceof CopyDrift)
    {
      throw new CopyDrift(`on page ${pageIndex + 1}, ${error.message}`);
    }

    throw error;
  }
};

/**
 * Reads an event's note's own text, outside its link.
 * @param {RmmzMapEvent} event The event.
 * @returns {string} The text.
 * @throws {CopyDrift} When the note would read otherwise without its link.
 */
const noteTextOf = (event: RmmzMapEvent): string =>
{
  try
  {
    return ownNoteOf(event);
  }
  catch (error)
  {
    throw new CopyDrift(`in its note, ${(error as Error).message}`);
  }
};

/**
 * Plans a copy's note: its own text, a choice like any other, with its link after it. A note whose text and link both
 * stand as they were is the very note it was, byte for byte; otherwise the link is written through the link's own writer,
 * which takes the old one out and puts the new one on a line of its own at the end.
 * @param {{ before: RmmzMapEvent, after: RmmzMapEvent, copy: RmmzMapEvent }} events The blueprint's event before and
 * after the change, and the copy.
 * @param {BlueprintLink} link The copy's link as it was.
 * @param {BlueprintLink} next The copy's link now.
 * @returns {string} The copy's note.
 * @throws {CopyDrift} When the note would read otherwise with or without its link.
 */
const plannedNote = (
  events: { readonly before: RmmzMapEvent; readonly after: RmmzMapEvent; readonly copy: RmmzMapEvent },
  link: BlueprintLink,
  next: BlueprintLink,
): string =>
{
  const own = noteTextOf(events.copy);
  const text = plannedChoice(noteTextOf(events.before), noteTextOf(events.after), own) as string;
  if (text === own && blueprintLinkText(next) === blueprintLinkText(link))
  {
    return events.copy.note;
  }

  try
  {
    return withBlueprintLink(text, next);
  }
  catch (error)
  {
    throw new CopyDrift(`in its note, ${(error as Error).message}`);
  }
};

/**
 * Plans a copy whose pages pair with its blueprint's, page for page: the change's pages read as naming the copy's group
 * where the blueprint's events name one another, every page planned, the link's values moved with their pages and then
 * changed for every number field the change moved, and the name and the note planned last.
 * @param {BlueprintEventChange} change The change.
 * @param {RmmzMapEvent} copy The copy.
 * @param {BlueprintLink} link The copy's link.
 * @param {readonly (number | null)[]} pairing For each page after the change, the page before it it continues.
 * @param {CopyChangeOptions} options The tags the active modules read, and the copy's group.
 * @returns {CopyChange} What the copy comes to.
 * @throws {CopyDrift} When the copy cannot take the change.
 */
const plannedCopy = (
  change: BlueprintEventChange,
  copy: RmmzMapEvent,
  link: BlueprintLink,
  pairing: readonly (number | null)[],
  options: CopyChangeOptions,
): CopyChange =>
{
  const references = options.references ?? new Map([ [ change.before.id, copy.id ] ]);
  const before = rewireGroupReferences(change.before, references);
  const after = rewireGroupReferences(change.after, references);
  const held = fieldLinksOf(link);
  const links = new Map<string, FieldLink | null>();
  const pages = after.pages.map((page, index) =>
  {
    // a page the change added comes as the blueprint has it.
    const from = pairing[index];
    if (from === null)
    {
      return cloneJson(page);
    }

    const trio = { before: before.pages[from], after: page, copy: copy.pages[from] };
    const planned = plannedPage(trio, options.tags, name => held.get(`${pageKey(from)}.${name}`) ?? null, from);
    planned.links.forEach((value, name) => links.set(`${pageKey(index)}.${name}`, value));
    return planned.page;
  });

  const next = withFieldLinks(withPagesMoved(link, pagesMoved(pairing, before.pages.length)), links);
  const note = plannedNote({ before, after, copy }, link, next);
  const name = plannedChoice(before.name, after.name, copy.name) as string;
  const event = { ...copy, name, note, pages };
  return jsonEquals(event, copy)
    ? STAYS
    : { kind: 'changes', event, link: next };
};

/**
 * Plans what a change to one of a blueprint's events comes to for one copy of it, field by field (see the field model):
 *
 * - a field the change did not move stays exactly as the copy has it, in the event and in its link, so a copy changed
 *   somewhere else keeps every such change until the blueprint moves that field;
 * - a choice the change moved follows when the copy still holds the blueprint's old value, and otherwise is the copy's
 *   override, and stays;
 * - a number the change moved follows by what the copy's link keeps of it: the blueprint's new value moved by the offset,
 *   or the pin, held to the field's range, the offset kept whole however far it was held; a copy no longer holding what
 *   its link says has the link read afresh from what it holds first, and the link keeps what it comes to;
 * - a page's command list, less every module tag, is one choice; each module tag's fields are fields of their own, written
 *   into the copy's own line in place; a tag no module reads is part of the command list, and never a number.
 *
 * Where the copy stands is never linked. The copy's id and position, and every key of every object, stay where the copy
 * has them, so a plan writes back only what it changed.
 *
 * The structural rule: pages pair by their place, the copy's with its blueprint's before the change, and the change's with
 * one another as it says (see {@link BlueprintEventChange.pages}). A copy with more or fewer pages than its blueprint had
 * has drifted, and the change reaches nothing of it; so has a copy whose note would read otherwise without or with its
 * link, or whose module tag line cannot take a value it must follow to. A page the change adds goes to every copy that
 * pairs, as the blueprint has it, and a page it takes away goes from each, with whatever the link kept of it. A change
 * that moves nothing but where the event stands reaches no copy at all.
 * @param {BlueprintEventChange} change The change to the blueprint's event.
 * @param {RmmzMapEvent} copy The copy, whose note holds its link to that event.
 * @param {CopyChangeOptions} options The tags the active modules read, and the copy's group.
 * @returns {CopyChange} Nothing, the copy's new event and link, or why it has drifted too far.
 * @throws {Error} When the event is no copy of the blueprint's event, or the change says how its pages pair otherwise than
 * it may.
 */
const planCopyChange = (change: BlueprintEventChange, copy: RmmzMapEvent, options: CopyChangeOptions): CopyChange =>
{
  const link = linkOf(change, copy);
  const pairing = pagePairing(change);
  if (changesFields(change) === false)
  {
    return STAYS;
  }

  const { before } = change;
  if (copy.pages.length !== before.pages.length)
  {
    return { kind: 'drifted', reason: `it has ${pagesWords(copy.pages.length)} and its blueprint had ${pagesWords(before.pages.length)}` };
  }

  try
  {
    return plannedCopy(change, copy, link, pairing, options);
  }
  catch (error)
  {
    if (error instanceof CopyDrift)
    {
      return { kind: 'drifted', reason: error.message };
    }

    throw error;
  }
};

export { planCopyChange };
export type { BlueprintEventChange, CopyChange, CopyChangeOptions };
