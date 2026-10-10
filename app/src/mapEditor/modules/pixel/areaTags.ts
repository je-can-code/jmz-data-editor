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
 * What a comment line must be before J-Base offers it to any plugin (J.BASE.RegExp.ParsableComment): one tag filling the
 * whole line, made only of these characters.
 */
const PARSABLE_COMMENT = /^<[[\]\w :"',.!?+\-*/\\#~%=();]+>$/i;

/**
 * The command codes of a comment's first line and of each line after it (Game_Event.matchesControlCode).
 */
const COMMENT_CODES: ReadonlySet<number> = new Set([ 108, 408 ]);

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
  // every map view reads the page of every event it draws, most of them holding no area, so the page is read from its
  // end, where the area that counts is, and a command that is no comment costs one look at its code.
  const { list } = page;
  for (let index = list.length - 1; index >= 0; index--)
  {
    const command = list[index];
    if (COMMENT_CODES.has(command.code) === false)
    {
      continue;
    }

    const [ text ] = command.parameters;
    const match = typeof text === 'string' && PARSABLE_COMMENT.test(text)
      ? AREA_EVENT_TAG.exec(text)
      : null;
    if (match !== null)
    {
      const [ , width, height ] = match;
      return { width: Number(width), height: Number(height) };
    }
  }

  return null;
};

export { AREA_EVENT_TAG, readEventArea };
