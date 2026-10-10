import { eventPath, locatePage, pageWords, recordEventStep, targetDocument, type EventWindowTarget, type PageOutcome } from '../../core/eventWindow/eventWindowTarget.ts';
import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../core/history/historyKeys.ts';
import type { HistoryStep } from '../../core/history/HistoryStep.ts';
import { mapDocumentKey } from '../../core/model/documentKeys.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { planBattlerChange, type BattlerChange, type BattlerContext } from './battlerEdits.ts';
import { applyBattlerEdits, battlerStepName } from './battlerSetup.ts';

/**
 * One picked battler a quick panel changes: the event, by id, and the page of it the panel shows.
 */
type BattlerTarget = {
  readonly eventId: number;
  readonly pageIndex: number;
};

/**
 * Makes one change on every picked battler of a map, as one step in the map's own history, so it undoes from the map
 * like any other edit to its events. Every battler's edits are worked out from the map as it stands, each on the page the
 * panel shows of it, before any is made, so a change any one battler refuses changes none of them; a battler gone from
 * the map, or a page gone from it, is left out.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {(event: RmmzMapEvent) => number | null} pageOf The page the panel shows of a battler, worked out afresh from the
 * event as it stands, or null for one with no battler page now.
 * @param {readonly number[]} eventIds The picked battlers.
 * @param {BattlerChange} change The change.
 * @param {BattlerContext} context The enemies and defaults.
 * @returns {HistoryStep | null} The step, or null when every battler already reads as asked.
 * @throws {Error} When a battler cannot take the change; the message says why, for the author.
 */
const changeBattlers = (
  hub: DocumentHub,
  mapId: number,
  pageOf: (event: RmmzMapEvent) => number | null,
  eventIds: readonly number[],
  change: BattlerChange,
  context: BattlerContext,
): HistoryStep | null =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  const targets: BattlerTarget[] = eventIds.flatMap(eventId =>
  {
    const event = map.event(eventId);
    const pageIndex = event === null ? null : pageOf(event);
    return pageIndex === null ? [] : [ { eventId, pageIndex } ];
  });
  const planned = targets.map(target =>
  {
    const page = (map.event(target.eventId) as RmmzMapEvent).pages[target.pageIndex];
    return { ...target, edits: planBattlerChange(page, target.pageIndex, change, context) };
  });
  if (planned.every(each => each.edits.length === 0))
  {
    return null;
  }

  return hub.edit(battlerStepName(change), [ mapHistoryKey(mapId) ], tx =>
  {
    planned.forEach(each => applyBattlerEdits(tx, key, [ 'events', each.eventId ], each.edits));
  });
};

/**
 * Makes one change on the battler an event window edits, on the page it shows, as one step in the event's own history.
 * @param {DocumentHub} hub The window's documents; the event's map must be held.
 * @param {EventWindowTarget} target The event.
 * @param {number} pageIndex The page.
 * @param {BattlerChange} change The change.
 * @param {BattlerContext} context The enemies and defaults.
 * @returns {PageOutcome} The step (null when the page already reads as asked), with the same page to show, or why
 * nothing changed.
 * @throws {Error} When the page cannot take the change; the message says why, for the author.
 */
const changeBattlerPage = (hub: DocumentHub, target: EventWindowTarget, pageIndex: number, change: BattlerChange, context: BattlerContext): PageOutcome =>
{
  const found = locatePage(hub, target, pageIndex);
  if (found.ok === false)
  {
    return found;
  }

  const edits = planBattlerChange(found.page, pageIndex, change, context);
  if (edits.length === 0)
  {
    return { ok: true, step: null, page: pageIndex };
  }

  const step = recordEventStep(hub, target, `${battlerStepName(change)} (${pageWords(pageIndex)})`, tx =>
  {
    applyBattlerEdits(tx, targetDocument(target), eventPath(target), edits);
  });
  return { ok: true, step, page: pageIndex };
};

export { changeBattlerPage, changeBattlers };
export type { BattlerTarget };
