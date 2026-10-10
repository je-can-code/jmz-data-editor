import type { DocumentHub } from '../history/DocumentHub.ts';
import { homeDocumentOf, type HistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep, StepEntry } from '../history/HistoryStep.ts';
import { parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import { readAt, type Patch, type PatchPath } from '../model/patches.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { blueprintContentOf, mapFileGrid, type BlueprintContent } from './blueprintMaps.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from './blueprints.ts';
import type { BlueprintEventChange } from './copyChanges.ts';
import { blueprintCellChanges, type BlueprintCellChange } from './copyTiles.ts';

/**
 * What one step did to a blueprint opened as a map, in the words of the field model, which carries a change to every copy
 * (see copyChanges and copyTiles): the blueprint's content before the step and after it; every value of its tiles the
 * step changed; and every event it changed, each before and after, and, where the step added pages to it, took them away,
 * copied them or moved them, which page before the step each page after it continues.
 *
 * The second half of linked changes turns each such step into one change across every map. It reads a step the moment it
 * is made: a commit check (see DocumentHub's addCommitCheck) sees every edit of every tool while it is still open, its
 * patches in the blueprint's map, so {@link blueprintChangesIn} reads it there, and the check can add each copy's change to
 * the very same step, which one undo then takes back whole. The blueprint's new stamp, to keep in the blueprints, is read
 * off its map at that moment too (see blueprintMaps' blueprintStampOf).
 */
type BlueprintStepChange = {
  /**
   * The blueprint.
   */
  readonly blueprintId: string;

  /**
   * Its tiles and events just before the step.
   */
  readonly before: BlueprintContent;

  /**
   * Its tiles and events just after the step.
   */
  readonly after: BlueprintContent;

  /**
   * Every value of its tiles the step changed, layer by layer, row by row; none for a step that changed no tile, or a
   * blueprint of events alone.
   */
  readonly cells: readonly BlueprintCellChange[];

  /**
   * Every event the step changed, in id order, as the copy planner takes a change (see planCopyChange), moved ones among
   * them, since where a copy stands is never linked and a move reaches no copy.
   */
  readonly events: readonly BlueprintEventChange[];
};

/**
 * Where an event's page list sits in its map.
 * @param {number} eventId The event.
 * @returns {PatchPath} The path, such as {@code ['events', 5, 'pages']}.
 */
const pagesPathOf = (eventId: number): PatchPath =>
{
  return [ 'events', eventId, 'pages' ];
};

/**
 * Reports whether one path begins with another, segment for segment.
 * @param {PatchPath} prefix The shorter path.
 * @param {PatchPath} path The longer one.
 * @returns {boolean} True when the path starts with every segment of the prefix.
 */
const startsWith = (prefix: PatchPath, path: PatchPath): boolean =>
{
  return prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);
};

/**
 * Follows which page before a step each page of one event continues, patch by patch, as the step's patches went in.
 *
 * - {@code origins} holds, for each page the event has at this point of the step, the page before the step it continues,
 *   or null for one the step put in.
 * - {@code takenOut} holds every page the step has taken out so far with the page before the step it continued, until a
 *   page exactly like it goes back in: a move takes a page out and puts the same page back elsewhere, and the page it puts
 *   back continues the page it took out. One left there when the step ends is a page the step took away.
 */
type PageTrail = {
  origins: (number | null)[];
  takenOut: { readonly page: JsonValue; readonly origin: number }[];
};

/**
 * Finds the page a page put back continues: the first page taken out earlier in the step that is exactly the same,
 * which it then claims, so no two pages continue one; or none, for a page the step adds.
 * @param {PageTrail} trail The pages followed so far.
 * @param {JsonValue} page The page put in.
 * @returns {number | null} The page before the step it continues, or null for none.
 */
const claimTakenOut = (trail: PageTrail, page: JsonValue): number | null =>
{
  const at = trail.takenOut.findIndex(taken => jsonEquals(taken.page, page));
  if (at < 0)
  {
    return null;
  }

  const [ claimed ] = trail.takenOut.splice(at, 1);
  return claimed.origin;
};

/**
 * Takes pages out of the trail, keeping each one a page before the step continued, so a page put back the same continues
 * it.
 * @param {PageTrail} trail The pages followed so far.
 * @param {number} index Where the pages start.
 * @param {readonly JsonValue[]} pages The pages taken out.
 */
const takeOut = (trail: PageTrail, index: number, pages: readonly JsonValue[]): void =>
{
  trail.origins.splice(index, pages.length).forEach((origin, offset) =>
  {
    if (origin !== null)
    {
      trail.takenOut.push({ page: pages[offset], origin });
    }
  });
};

/**
 * Puts pages into the trail, each continuing a page taken out earlier in the step exactly like it, or none.
 * @param {PageTrail} trail The pages followed so far.
 * @param {number} index Where they go.
 * @param {readonly JsonValue[]} pages The pages put in.
 */
const putIn = (trail: PageTrail, index: number, pages: readonly JsonValue[]): void =>
{
  trail.origins.splice(index, 0, ...pages.map(page => claimTakenOut(trail, page)));
};

/**
 * Follows a whole page list replaced at once, as a set of the list, or of the whole event, does: with as many pages as
 * before, each continues the page in its place; with another count, each continues the first page exactly like it that
 * the list held, or none, and every other page is taken away. No edit the editor makes replaces a whole list this way, so
 * this is the nearest reading of one that does.
 * @param {PageTrail} trail The pages followed so far.
 * @param {readonly JsonValue[]} was The list before.
 * @param {readonly JsonValue[]} now The list after.
 */
const replaceAll = (trail: PageTrail, was: readonly JsonValue[], now: readonly JsonValue[]): void =>
{
  if (was.length === now.length)
  {
    return;
  }

  takeOut(trail, 0, was);
  putIn(trail, 0, now);
};

/**
 * Reads the page list a value a patch carried holds, the value sitting above the list at a path.
 * @param {JsonValue | undefined} value The value.
 * @param {PatchPath} rest The rest of the way down from the value to the list.
 * @returns {JsonValue[]} The list, or none when the value holds no list there.
 */
const listWithin = (value: JsonValue | undefined, rest: PatchPath): JsonValue[] =>
{
  const list = readAt(value, rest);
  return Array.isArray(list) ? list : [];
};

/**
 * Follows one patch of a step through an event's pages: a splice of the list takes pages out and puts pages in; a set of a
 * place in the list puts one on its end or takes the last off, or replaces one in its place, which still continues it; a
 * set of the whole list, or of the event, replaces the list (see {@link replaceAll}); and anything deeper changes a page
 * where it stands, and the page still continues itself. A patch reaching another event, or the tiles, changes nothing here.
 * @param {PageTrail} trail The pages followed so far.
 * @param {PatchPath} pagesPath Where the event's page list sits.
 * @param {Patch} patch The patch.
 * @throws {Error} When the patch moves the event to another slot, which no step on a blueprint may.
 */
const follow = (trail: PageTrail, pagesPath: PatchPath, patch: Patch): void =>
{
  if (patch.kind === 'tiles' || patch.kind === 'resize')
  {
    return;
  }

  const { path } = patch;
  if (startsWith(path, pagesPath) && path.length < pagesPath.length)
  {
    // a value above the list: the whole event, or the events themselves, set or spliced.
    const rest = pagesPath.slice(path.length);
    if (patch.kind === 'set')
    {
      replaceAll(trail, listWithin(patch.before, rest), listWithin(patch.after, rest));
      return;
    }

    // a splice of the events themselves: after this event it leaves it be, and before it, it moves it unless it puts back
    // as many slots as it takes.
    const slot = rest[0] as number;
    const end = patch.index + patch.removed.length;
    const keepsCount = patch.inserted.length === patch.removed.length;
    if (slot < patch.index || (slot >= end && keepsCount))
    {
      return;
    }

    if (slot >= end || keepsCount === false)
    {
      throw new Error('a step on a blueprint moved one of its events to another slot');
    }

    replaceAll(trail, listWithin(patch.removed[slot - patch.index], rest.slice(1)), listWithin(patch.inserted[slot - patch.index], rest.slice(1)));
    return;
  }

  if (jsonEquals(path, pagesPath) && patch.kind === 'splice')
  {
    takeOut(trail, patch.index, patch.removed);
    putIn(trail, patch.index, patch.inserted);
    return;
  }

  // a set of one place in the list: on its end, off its end, or in its place.
  if (patch.kind === 'set' && path.length === pagesPath.length + 1 && startsWith(pagesPath, path))
  {
    const place = path[pagesPath.length] as number;
    if (patch.before === undefined && patch.after !== undefined)
    {
      putIn(trail, place, [ patch.after ]);
    }
    else if (patch.before !== undefined && patch.after === undefined)
    {
      takeOut(trail, place, [ patch.before ]);
    }
  }
};

/**
 * Works out which page before a step each page of one of a blueprint's events after it continues, from the step's own
 * patches, in the order they went in. A page added, pasted or duplicated continues none, a copy being a new page; a page
 * taken away is continued by none; a page moved continues itself, since a move takes it out and puts the same page back;
 * and a page changed where it stands continues itself too, however much changed. The copy planner moves each copy's pages,
 * and whatever its link keeps of them, the same way (see BlueprintEventChange.pages).
 * @param {RmmzMapEvent} before The event before the step.
 * @param {RmmzMapEvent} after The event after it.
 * @param {readonly Patch[]} patches The step's patches on the blueprint's map, in order.
 * @returns {readonly (number | null)[] | undefined} For each page after the step, the page before it that it continues, or
 * null for a page the step added; undefined when every page continues the page in its own place, as when the step left
 * the pages where they were.
 */
const pageLineage = (before: RmmzMapEvent, after: RmmzMapEvent, patches: readonly Patch[]): readonly (number | null)[] | undefined =>
{
  const pagesPath = pagesPathOf(before.id);
  const trail: PageTrail = { origins: before.pages.map((_page, index) => index), takenOut: [] };
  patches.forEach(patch => follow(trail, pagesPath, patch));

  // a trail that lost count of the pages, which no patch the editor makes can do, falls back to pairing the lists whole.
  if (trail.origins.length !== after.pages.length)
  {
    const whole: PageTrail = { origins: before.pages.map((_page, index) => index), takenOut: [] };
    replaceAll(whole, before.pages as unknown as JsonValue[], after.pages as unknown as JsonValue[]);
    trail.origins = whole.origins;
  }

  const inPlace = trail.origins.length === before.pages.length && trail.origins.every((origin, index) => origin === index);
  return inPlace
    ? undefined
    : trail.origins;
};

/**
 * Lists every event a step changed, in id order: each before and after, and the pages' lineage where the step moved them
 * about (see {@link pageLineage}).
 * @param {readonly RmmzMapEvent[]} before The blueprint's events before the step, in id order.
 * @param {readonly RmmzMapEvent[]} after Its events after it, in id order.
 * @param {readonly Patch[]} patches The step's patches on the blueprint's map, in order.
 * @returns {BlueprintEventChange[]} The changes.
 * @throws {Error} When the step added or took away an event, which no step on a blueprint may.
 */
const eventChanges = (before: readonly RmmzMapEvent[], after: readonly RmmzMapEvent[], patches: readonly Patch[]): BlueprintEventChange[] =>
{
  const sameEvents = before.length === after.length && before.every((event, index) => event.id === after[index].id);
  if (sameEvents === false)
  {
    throw new Error('a step on a blueprint added or took away one of its events');
  }

  return after.flatMap((now, index) =>
  {
    const was = before[index];
    if (jsonEquals(was, now))
    {
      return [];
    }

    const pages = pageLineage(was, now, patches);
    return [ pages === undefined ? { before: was, after: now } : { before: was, after: now, pages } ];
  });
};

/**
 * Reads what one step did to a blueprint opened as a map (see {@link BlueprintStepChange}): its content just before the
 * step, read off the map with the step's patches taken back out, and just after, as the map stands; the tile values it
 * changed; and the events it changed, with their pages' lineage. It reads the map as the step left it, so it is read the
 * moment the step is made, before anything else changes the map.
 * @param {MapDocument} map The blueprint opened as a map, as the step left it.
 * @param {readonly Patch[]} patches The step's patches on the map, in the order they went in.
 * @param {readonly number[] | null} carried The layers the blueprint carries, or null for a blueprint of events alone.
 * @returns {BlueprintStepChange} What the step did.
 * @throws {Error} When the map is no blueprint opened as a map, or the step added or took away an event.
 */
const blueprintStepChange = (map: MapDocument, patches: readonly Patch[], carried: readonly number[] | null): BlueprintStepChange =>
{
  const parsed = parseDocumentKey(map.key);
  if (parsed.kind !== 'blueprint-map')
  {
    throw new Error(`${map.key} is no blueprint opened as a map`);
  }

  const before = blueprintContentOf(mapFileGrid(map.toJsonWithout(patches)), carried);
  const after = blueprintContentOf(map, carried);
  const cells = before.tiles === null || after.tiles === null
    ? []
    : blueprintCellChanges(before.tiles, after.tiles, map);

  return { blueprintId: parsed.blueprintId, before, after, cells, events: eventChanges(before.events, after.events, patches) };
};

/**
 * Reads what a step, or an edit still open, did to every blueprint opened as a map it changes, in the order it first
 * changed them (see {@link blueprintStepChange}), each blueprint's layers read from the window's blueprints. Read it the
 * moment the step is made: from a commit check, while the edit is open, or as the hub announces it committed.
 * @param {Pick<DocumentHub, 'document'>} hub The window's documents; the blueprints must be held, and every blueprint the
 * step changes with them.
 * @param {readonly StepEntry[]} entries The step's patches, by document, in order.
 * @returns {BlueprintStepChange[]} What it did to each blueprint; none for a step changing none.
 * @throws {Error} When the blueprints hold no blueprint the step changed, which no step on a blueprint gone can.
 */
const blueprintChangesIn = (hub: Pick<DocumentHub, 'document'>, entries: readonly StepEntry[]): BlueprintStepChange[] =>
{
  const keys = [ ...new Set(entries.map(entry => entry.document)) ];
  return keys.flatMap(key =>
  {
    const parsed = parseDocumentKey(key);
    if (parsed.kind !== 'blueprint-map')
    {
      return [];
    }

    const blueprint = blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), parsed.blueprintId);
    if (blueprint === null)
    {
      throw new Error(`the blueprints hold no blueprint ${parsed.blueprintId}, which a step changed`);
    }

    const patches = entries.filter(entry => entry.document === key).map(entry => entry.patch);
    const carried = blueprint.stamp.tiles === null ? null : blueprint.stamp.tiles.layers;
    return [ blueprintStepChange(hub.document(key) as MapDocument, patches, carried) ];
  });
};

/**
 * Names a step as a row of a history lists it. A change to a blueprint is listed in the history of every map it reached,
 * where its own label, a stroke or an edit made in the blueprint's tab or its event's window, would read as though it
 * were made on that map; there it is named for its blueprint: "Blueprint 'Needler nest': Paint tiles". In the blueprint's
 * own history, and any other but a map's, the label stands as it is.
 * @param {HistoryStep} step The step.
 * @param {HistoryKey} history The history whose row it is.
 * @param {(blueprintId: string) => string} blueprintName Names a blueprint as the author knows it.
 * @returns {string} The row's words.
 */
const stepLabelIn = (step: HistoryStep, history: HistoryKey, blueprintName: (blueprintId: string) => string): string =>
{
  const changed = step.entries.map(entry => parseDocumentKey(entry.document)).find(parsed => parsed.kind === 'blueprint-map');

  // a map's own history goes by the map's own key, where an event's history lives on its map under a key of its own.
  const home: DocumentKey = homeDocumentOf(history);
  const onMap = home === history && parseDocumentKey(home).kind === 'map';
  return changed === undefined || changed.kind !== 'blueprint-map' || onMap === false
    ? step.label
    : `Blueprint '${blueprintName(changed.blueprintId)}': ${step.label}`;
};

export { blueprintChangesIn, blueprintStepChange, pageLineage, stepLabelIn };
export type { BlueprintStepChange };
