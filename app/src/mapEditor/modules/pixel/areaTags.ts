import { parsableCommentLines } from '../../core/blueprints/blueprintFields.ts';
import type { EventArea } from '../../core/events/eventAreas.ts';
import type { RmmzEventPage } from '../../core/model/rmmzTypes.ts';

/**
 * J-Pixelistics' area tag, as J.PIXEL.RegExp.AreaEvent reads it: a page's area, so many whole tiles wide and high,
 * running right and down from the event's own tile. Both sizes are at least one, and a size written any other way is no
 * area tag at all, so the page covers its one tile. One space is allowed after the colon, and around each size.
 *
 * <pre>
 * Structure:
 *  <areaEvent:[WIDTH, HEIGHT]>
 *
 * Example:
 *  <areaEvent:[5, 1]>
 *
 * Translation:
 *  This page covers the event's own tile and the four to the right of it.
 * </pre>
 */
const AREA_EVENT_TAG = /<areaEvent: ?\[ ?([1-9]\d*) ?, ?([1-9]\d*) ?\]>/iu;

/**
 * Reads the area a page covers, as Game_Event#refreshAreaEvent reads it when the page becomes active: from the comment
 * lines J-Base offers the plugin, the first line and each later line of every comment, wherever it sits, each one tag
 * filling the whole line. Should a page declare its area twice, the last one written counts, as RPGManager keeps the last
 * match it finds.
 * @param {RmmzEventPage} page The page.
 * @returns {EventArea | null} The area, or null for a page declaring none, which covers the event's own tile alone.
 */
const readEventArea = (page: RmmzEventPage): EventArea | null =>
{
  // the last tag line holding an area is the one the plugin keeps.
  const match = parsableCommentLines(page)
    .map(({ text }) => AREA_EVENT_TAG.exec(text))
    .findLast(found => found !== null);
  if (match === undefined || match === null)
  {
    return null;
  }

  const [ , width, height ] = match;
  return { width: Number(width), height: Number(height) };
};

export { AREA_EVENT_TAG, readEventArea };
