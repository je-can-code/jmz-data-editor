import type { EventWindowTarget } from '../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapDocumentKey } from '../../../src/mapEditor/core/model/documentKeys.ts';
import { createEventPage } from '../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { mapWithEvents } from './eventFixtures.ts';

/**
 * The event every event window test edits: event 2 on map 1.
 */
const TARGET: EventWindowTarget = { mapId: 1, eventId: 2 };

/**
 * Builds a page told apart from every other by a mark: its first switch, its variable's value, its sheet, its trigger
 * and a comment all carry it, and its options differ from a fresh page's, so a write landing on the wrong page, or a
 * page put back in the wrong place, shows.
 * @param {number} mark The page's mark, from 1.
 * @returns {RmmzEventPage} The page.
 */
const markedPage = (mark: number): RmmzEventPage =>
{
  const fresh = createEventPage();
  return {
    ...fresh,
    conditions: { ...fresh.conditions, switch1Id: mark, switch2Id: mark + 10, variableId: mark, variableValue: mark * 3, itemId: mark, actorId: mark },
    image: { ...fresh.image, characterName: `Sheet${mark}`, characterIndex: mark % 8 },
    list: [ { code: 108, indent: 0, parameters: [ `page ${mark}` ] }, { code: 0, indent: 0, parameters: [] } ],
    trigger: mark % 5,
    priorityType: mark % 3,
    walkAnime: false,
    directionFix: true,
  };
};

/**
 * Builds the fixture map: a 4x3 map whose events 1, 2 and 3 stand side by side, each holding pages marked 1, 2 and 3.
 * Event 2 is the one edited; events 1 and 3 hold exactly the same pages, so an edit that reached the wrong event
 * would show on a neighbour. Slot 4 is empty, as a deleted event's would be.
 * @returns {RmmzMap} A fresh map file.
 */
const eventWindowMap = (): RmmzMap =>
{
  const file = mapWithEvents(4, 3, [ null, [ 0, 0 ], [ 1, 0 ], [ 2, 0 ], null ]);
  file.events.forEach(event =>
  {
    if (event !== null)
    {
      event.pages = [ markedPage(1), markedPage(2), markedPage(3) ];
    }
  });

  return file;
};

/**
 * Builds a hub holding the fixture map, clean, with empty histories.
 * @param {RmmzMap} file The map's file; the fixture map unless another is given.
 * @returns {DocumentHub} The hub.
 */
const eventWindowHub = (file: RmmzMap = eventWindowMap()): DocumentHub =>
{
  const hub = new DocumentHub({ clientId: 'event-window' });
  hub.adopt(mapDocumentKey(TARGET.mapId), file as unknown as JsonValue);
  return hub;
};

/**
 * Reads the map file the hub holds now.
 * @param {DocumentHub} hub The hub.
 * @returns {RmmzMap} The file.
 */
const heldMap = (hub: DocumentHub): RmmzMap =>
{
  return hub.document(mapDocumentKey(TARGET.mapId)).toJson() as unknown as RmmzMap;
};

/**
 * Reads the edited event as the hub holds it now.
 * @param {DocumentHub} hub The hub.
 * @returns {RmmzMapEvent} The event.
 */
const heldEvent = (hub: DocumentHub): RmmzMapEvent =>
{
  return heldMap(hub).events[TARGET.eventId] as RmmzMapEvent;
};

/**
 * Builds the fixture map as it would be after a change to the edited event alone, for comparing a whole file.
 * @param {(event: RmmzMapEvent) => void} change Changes the edited event in place.
 * @returns {RmmzMap} The expected file.
 */
const expectedMap = (change: (event: RmmzMapEvent) => void): RmmzMap =>
{
  const file = eventWindowMap();
  change(file.events[TARGET.eventId] as RmmzMapEvent);
  return file;
};

export { eventWindowHub, eventWindowMap, expectedMap, heldEvent, heldMap, markedPage, TARGET };
