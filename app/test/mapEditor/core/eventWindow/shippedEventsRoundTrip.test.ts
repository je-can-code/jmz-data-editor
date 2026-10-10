import { describe, expect, it } from 'vitest';
import { noteBoxOf } from '../../../../src/mapEditor/core/blueprints/copyActions.ts';
import { parseEventImage, writeEventImage } from '../../../../src/mapEditor/core/eventPage/eventImage.ts';
import { parseEventMovement, writeEventMovement } from '../../../../src/mapEditor/core/eventPage/eventMovement.ts';
import {
  pageListPath,
  readTargetEvent,
  renameEvent,
  setEventNote,
  targetDocument,
  type EditOutcome,
  type EventWindowTarget,
  type PageOutcome,
} from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import { readPageConditions, setPageCondition, type ConditionChange } from '../../../../src/mapEditor/core/eventWindow/pageConditions.ts';
import { copyPages, decodePageClipboard, encodePageClipboard } from '../../../../src/mapEditor/core/eventWindow/pageOperations.ts';
import {
  PAGE_OPTIONS,
  readPageOptions,
  setPageImage,
  setPageMovement,
  setPageOption,
  setPagePriority,
  setPageTrigger,
} from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import { describePageTab } from '../../../../src/mapEditor/core/eventWindow/pageSummaries.ts';
import type { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { cloneJson, jsonEquals } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { eventsOf, hubHolding, mapIdOf } from '../../support/shippedEvents.ts';

/*
 * Every event the game ships opens in the event window and saves back with nothing lost.
 *
 * The window reads each page into the groups it shows (six conditions, four options, priority, trigger, the picture,
 * the movement, the commands) and writes each group back through its own service. So this walks every event on every
 * shipped map, not a fixture, and holds the window to two promises:
 *
 * - Opening loses nothing: every value the window reads, written straight back through the window's own services,
 *   changes nothing and records nothing, so nothing the window shows differs from what the file holds; every page's
 *   commands sit where the command list looks for them; every page reads into its tab's summary; and every page goes
 *   through the page clipboard and back whole, so any shipped page can be copied and pasted.
 * - Saving loses nothing: once every event has been opened and written back, the map is the file, field for field,
 *   and saving writes exactly that.
 *
 * That every edit the window offers works on every shipped event, and undoes exactly, is held beside this, in
 * shippedEventsEdits.test.ts. It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips
 * when neither is there.
 */
const project = locateGameProject();
const mapFiles = project === null
  ? []
  : listMapFiles(project);

/**
 * Lists the condition changes that write a page's conditions back exactly as the window reads them.
 * @param {RmmzEventPage} page The page.
 * @returns {ConditionChange[]} One change per part of every condition.
 */
const conditionsAsRead = (page: RmmzEventPage): ConditionChange[] =>
{
  return readPageConditions(page.conditions).flatMap((row): ConditionChange[] =>
  {
    switch (row.kind)
    {
      case 'variable':
        return [ { kind: row.kind, part: 'enabled', value: row.enabled }, { kind: row.kind, part: 'id', value: row.id }, { kind: row.kind, part: 'value', value: row.value } ];
      case 'selfSwitch':
        return [ { kind: row.kind, part: 'enabled', value: row.enabled }, { kind: row.kind, part: 'letter', value: row.letter } ];
      default:
        return [ { kind: row.kind, part: 'enabled', value: row.enabled }, { kind: row.kind, part: 'id', value: row.id } ];
    }
  });
};

/**
 * Writes every value the window reads from one page straight back through the window's own services, and reports
 * every write that changed anything or was refused.
 * @param {DocumentHub} hub The hub holding the map.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {RmmzEventPage} page The page, as the window reads it.
 * @returns {string[]} What went wrong; empty when every write left the page alone.
 */
const writePageBack = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, page: RmmzEventPage): string[] =>
{
  const options = readPageOptions(page);
  const writes: [ string, PageOutcome ][] = [
    ...conditionsAsRead(page).map((change): [ string, PageOutcome ] => [ `condition ${change.kind} ${change.part}`, setPageCondition(hub, target, pageIndex, change) ]),
    ...PAGE_OPTIONS.map((option): [ string, PageOutcome ] => [ `option ${option}`, setPageOption(hub, target, pageIndex, option, options[option]) ]),
    [ 'priority', setPagePriority(hub, target, pageIndex, page.priorityType) ],
    [ 'trigger', setPageTrigger(hub, target, pageIndex, page.trigger) ],
    [ 'graphic', setPageImage(hub, target, pageIndex, writeEventImage(parseEventImage(page.image))) ],
    [ 'movement', setPageMovement(hub, target, pageIndex, writeEventMovement(parseEventMovement(page))) ],
  ];

  return writes
    .filter(([ , outcome ]) => outcome.ok === false || outcome.step !== null)
    .map(([ what, outcome ]) => `page ${pageIndex + 1} ${what}: ${outcome.ok ? 'changed the page' : outcome.message}`);
};

/**
 * Opens one event the way the window does and writes everything back, reporting anything the window could not read or
 * write back unchanged: its name and note, the note as its Note box shows it (a copy of a blueprint's own text, its link
 * kept out of the box), every page's groups, every page's commands where the command list looks, its tab's summary, and
 * a trip through the page clipboard.
 * @param {DocumentHub} hub The hub holding the map.
 * @param {EventWindowTarget} target The event.
 * @returns {string[]} What went wrong; empty when the event came through untouched.
 */
const openAndWriteBack = (hub: DocumentHub, target: EventWindowTarget): string[] =>
{
  const event = readTargetEvent(hub, target) as RmmzMapEvent;
  const named: [ string, EditOutcome ][] = [ [ 'name', renameEvent(hub, target, event.name) ], [ 'note', setEventNote(hub, target, noteBoxOf(event).text) ] ];
  const problems = named
    .filter(([ , outcome ]) => outcome.ok === false || outcome.step !== null)
    .map(([ what ]) => `${what} did not write back unchanged`);

  event.pages.forEach((page, pageIndex) =>
  {
    problems.push(...writePageBack(hub, target, pageIndex, page));
    if (Array.isArray(hub.document(targetDocument(target)).valueAt(pageListPath(target, pageIndex))) === false)
    {
      problems.push(`page ${pageIndex + 1} has no command list where the command list looks`);
    }

    if (describePageTab(page, () => null).length === 0)
    {
      problems.push(`page ${pageIndex + 1} has no tab summary`);
    }

    const copied = copyPages(event, [ pageIndex ]);
    const pasted = copied === null ? null : decodePageClipboard(encodePageClipboard(copied));
    if (pasted === null || jsonEquals(pasted.pages, [ page ]) === false)
    {
      problems.push(`page ${pageIndex + 1} did not come back whole through the page clipboard`);
    }
  });

  return problems;
};

describe.skipIf(project === null)('every shipped event opens in the event window and saves back', () =>
{
  it('finds the shipped events to check', () =>
  {
    // Arrange: the maps located above.

    // Act.
    const events = mapFiles.reduce((sum, file) => sum + eventsOf(readDataFile(project as string, file) as RmmzMap).length, 0);

    // Assert: a wrong folder would otherwise pass by checking nothing.
    expect([ mapFiles.length > 300, events > 7000 ])
      .toStrictEqual([ true, true ]);
  });

  it.each(mapFiles.length > 0 ? mapFiles : [ 'no project' ])('%s: every event opens and writes back unchanged, and the map saves exactly as it was', async (file) =>
  {
    // Arrange.
    const original = readDataFile(project as string, file) as RmmzMap;
    const mapId = mapIdOf(file);
    const { hub, saved } = hubHolding(mapId, cloneJson(original));

    // Act.
    const problems = eventsOf(original).flatMap(event => openAndWriteBack(hub, { mapId, eventId: event.id }).map(problem => `event ${event.id} ${problem}`));
    await hub.save(mapDocumentKey(mapId));

    // Assert: nothing was recorded, the map is the file, and the save wrote the file.
    expect([ problems, hub.dirtyKeys(), hub.document(mapDocumentKey(mapId)).toJson(), saved() ])
      .toStrictEqual([ [], [], original, original ]);
  });
});
