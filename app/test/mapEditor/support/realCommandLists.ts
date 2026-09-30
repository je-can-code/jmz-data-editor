import type { RmmzCommonEvent, RmmzEventCommand, RmmzMap } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { listMapFiles, readDataFile } from '../../support/gameProject.ts';

/**
 * One command list the game ships: an event page's, or a common event's.
 */
type RealCommandList = {
  /**
   * Where it lives, for a failure message: {@code Map001.json#49/0} is map 1, event 49, page 1; {@code CE45} is
   * common event 45.
   */
  readonly where: string;

  /**
   * The event it belongs to, so counts can be taken per event: {@code Map001.json#49}, or {@code CE45}.
   */
  readonly event: string;

  readonly list: RmmzEventCommand[];
};

/**
 * Reads every command list in a project: every page of every event on every map, then every common event.
 * @param {string} projectRoot The project root.
 * @returns {RealCommandList[]} The lists, in map, event and page order, then common event order.
 */
const readRealCommandLists = (projectRoot: string): RealCommandList[] =>
{
  const lists: RealCommandList[] = [];
  listMapFiles(projectRoot).forEach(file =>
  {
    const map = readDataFile(projectRoot, file) as RmmzMap;
    map.events.forEach((event, eventId) =>
    {
      event?.pages.forEach((page, pageIndex) =>
      {
        lists.push({ where: `${file}#${eventId}/${pageIndex}`, event: `${file}#${eventId}`, list: page.list });
      });
    });
  });

  const commonEvents = readDataFile(projectRoot, 'CommonEvents.json') as (RmmzCommonEvent | null)[];
  commonEvents.forEach((commonEvent, id) =>
  {
    if (commonEvent !== null)
    {
      lists.push({ where: `CE${id}`, event: `CE${id}`, list: commonEvent.list });
    }
  });

  return lists;
};

export { readRealCommandLists };
export type { RealCommandList };
