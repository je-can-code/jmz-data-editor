import { describe, expect, it } from 'vitest';
import { noteBoxOf } from '../../../../src/mapEditor/core/blueprints/copyActions.ts';
import { parseEventMovement } from '../../../../src/mapEditor/core/eventPage/eventMovement.ts';
import {
  readTargetEvent,
  renameEvent,
  setEventNote,
  targetHistory,
  type EditOutcome,
  type EventWindowTarget,
  type PageOutcome,
} from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import { readPageConditions, setPageCondition } from '../../../../src/mapEditor/core/eventWindow/pageConditions.ts';
import {
  addPage,
  clearPage,
  copyPages,
  decodePageClipboard,
  deletePage,
  duplicatePage,
  encodePageClipboard,
  movePage,
  pastePages,
} from '../../../../src/mapEditor/core/eventWindow/pageOperations.ts';
import {
  PAGE_OPTIONS,
  readPageOptions,
  setPageImage,
  setPageMovement,
  setPageOption,
  setPagePriority,
  setPageTrigger,
} from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import type { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { cloneJson, jsonEquals } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { eventsOf, hubHolding, mapIdOf } from '../../support/shippedEvents.ts';

/*
 * Every edit the event window offers works on every event the game ships, and undoes exactly.
 *
 * Each edit is one step in the event's own history, so this walks every event on every shipped map, not a fixture, and
 * makes every edit there is through the window's own services: a new name and note; on every page, every condition and
 * option turned over, and a new priority, trigger, facing and speed; and a duplicate, move, add, clear, delete and paste
 * of pages. Each edit must record a step. Each run of them (the name and note, one page, the page operations) must
 * undo back to exactly how the event stood before it and redo back to exactly what it made, and once every run has,
 * the whole history must undo back to the file.
 *
 * Each event runs against a map holding that event alone, so one event's history never weighs on another's. That the
 * window opens every shipped event and saves it back unchanged is held beside this, in shippedEventsRoundTrip.test.ts.
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();
const mapFiles = project === null
  ? []
  : listMapFiles(project);

/**
 * Checks one edit recorded a step.
 */
type ExpectStep = (what: string, outcome: EditOutcome | PageOutcome) => void;

/**
 * Runs a run of edits on one event and holds it to undo and redo: undoing back past the run brings the event back
 * exactly as it stood before it, and redoing brings back exactly what the run made.
 * @param {DocumentHub} hub The hub holding the map.
 * @param {EventWindowTarget} target The event.
 * @param {string} where Names the run, for failures.
 * @param {(expectStep: ExpectStep) => void} edits Makes the edits, handing each outcome to the check that it recorded a
 * step.
 * @returns {string[]} What went wrong; empty when every edit recorded a step and the run undid and redid exactly.
 */
const editRun = (hub: DocumentHub, target: EventWindowTarget, where: string, edits: (expectStep: ExpectStep) => void): string[] =>
{
  const problems: string[] = [];
  const history = targetHistory(target);
  const before = cloneJson(readTargetEvent(hub, target));
  const start = hub.history(history).rows.at(-1)?.id ?? null;
  edits((what, outcome) =>
  {
    if (outcome.ok === false || outcome.step === null)
    {
      problems.push(`${where} ${what}: ${outcome.ok ? 'recorded nothing' : outcome.message}`);
    }
  });

  const edited = cloneJson(readTargetEvent(hub, target));
  const end = hub.history(history).rows.at(-1)?.id ?? null;
  const undone = hub.jumpTo(history, start);
  if (undone.ok === false || jsonEquals(readTargetEvent(hub, target), before) === false)
  {
    problems.push(`${where} did not undo back to how it stood`);
  }

  const redone = hub.jumpTo(history, end);
  if (redone.ok === false || jsonEquals(readTargetEvent(hub, target), edited) === false)
  {
    problems.push(`${where} did not redo back to its edits`);
  }

  return problems;
};

/**
 * Makes every edit the window offers on one event, a run at a time, and reports every edit that was refused or recorded
 * nothing, and every run that did not undo and redo exactly.
 * @param {DocumentHub} hub The hub holding the map.
 * @param {EventWindowTarget} target The event.
 * @returns {string[]} What went wrong; empty when every edit recorded a step and every run undid and redid exactly.
 */
const editEverything = (hub: DocumentHub, target: EventWindowTarget): string[] =>
{
  const live = (): RmmzMapEvent => readTargetEvent(hub, target) as RmmzMapEvent;
  const problems = editRun(hub, target, 'name and note', expectStep =>
  {
    expectStep('rename', renameEvent(hub, target, `${live().name} (edited)`));

    // a line typed after what the Note box shows, which for a copy of a blueprint is its note's own text.
    expectStep('note', setEventNote(hub, target, `${noteBoxOf(live()).text}\nedited`));
  });

  live().pages.forEach((page, index) => problems.push(...editRun(hub, target, `page ${index + 1}`, expectStep =>
  {
    // the page is live, so each read below sees every edit before it.
    readPageConditions(page.conditions).forEach(row => expectStep(row.kind, setPageCondition(hub, target, index, { kind: row.kind, part: 'enabled', value: row.enabled === false })));
    PAGE_OPTIONS.forEach(option => expectStep(option, setPageOption(hub, target, index, option, readPageOptions(page)[option] === false)));
    expectStep('priority', setPagePriority(hub, target, index, (page.priorityType + 1) % 3));
    expectStep('trigger', setPageTrigger(hub, target, index, (page.trigger + 1) % 5));
    expectStep('graphic', setPageImage(hub, target, index, { ...page.image, direction: page.image.direction === 2 ? 8 : 2 }));
    expectStep('movement', setPageMovement(hub, target, index, { ...parseEventMovement(page), moveSpeed: page.moveSpeed === 6 ? 1 : page.moveSpeed + 1 }));
  })));

  problems.push(...editRun(hub, target, 'pages', expectStep =>
  {
    const clipboard = decodePageClipboard(encodePageClipboard(copyPages(live(), [ 0 ]) as NonNullable<ReturnType<typeof copyPages>>));
    expectStep('duplicate', duplicatePage(hub, target, 0));
    expectStep('move', movePage(hub, target, 0, live().pages.length - 1));
    expectStep('add', addPage(hub, target, 0));
    expectStep('clear', clearPage(hub, target, 0));
    expectStep('delete', deletePage(hub, target, 1));
    expectStep('paste', clipboard === null ? { ok: false, message: 'the first page did not read back from the clipboard' } : pastePages(hub, target, live().pages.length - 1, clipboard));
  }));

  return problems;
};

describe.skipIf(project === null)('every edit the event window offers, on every shipped event', () =>
{
  it.each(mapFiles.length > 0 ? mapFiles : [ 'no project' ])('%s: every edit records a step on every event, and undoes and redoes exactly', (file) =>
  {
    // Arrange.
    const original = readDataFile(project as string, file) as RmmzMap;
    const mapId = mapIdOf(file);
    const failures: string[] = [];

    // Act: each event on a map holding it alone; once every run has undone and redone, the whole history undoes back
    // to the file.
    eventsOf(original).forEach(event =>
    {
      const alone: RmmzMap = { ...original, width: 1, height: 1, data: [ 0, 0, 0, 0, 0, 0 ], events: Array.from({ length: event.id + 1 }, (_, id) => (id === event.id ? cloneJson(event) : null)) };
      const { hub } = hubHolding(mapId, alone);
      const target = { mapId, eventId: event.id };
      failures.push(...editEverything(hub, target).map(problem => `event ${event.id} ${problem}`));
      const undone = hub.jumpTo(targetHistory(target), null);
      if (undone.ok === false || jsonEquals(readTargetEvent(hub, target), event) === false)
      {
        failures.push(`event ${event.id} did not undo all the way back to the file`);
      }
    });

    // Assert.
    expect(failures)
      .toStrictEqual([]);
  });
});
