import type { RmmzEventPage } from '../../core/model/rmmzTypes.ts';

/**
 * The kinds of time tag a page can carry, as J-TIME's TimeMapper.ConditionalKinds names them, in the order a comment is
 * tested against them: the exact units, the time of day and the season, the two composite spans, then the unit ranges.
 * The first kind whose tag a comment holds owns it.
 */
type TimeTagKind =
  | 'Minute'
  | 'Hour'
  | 'Day'
  | 'Month'
  | 'Year'
  | 'TimeOfDay'
  | 'SeasonOfYear'
  | 'TimeRange'
  | 'FullDateRange'
  | 'MinuteRange'
  | 'HourRange'
  | 'DayRange'
  | 'MonthRange'
  | 'YearRange';

/**
 * One time tag a page carries: its kind, and what the tag's pattern captured, as written.
 */
type TimeTag = {
  readonly kind: TimeTagKind;
  readonly captures: readonly string[];
};

/**
 * J-TIME's page tags (J.TIME.RegExp's Page family), each exactly as the plugin declares it, keyed by kind in the order
 * TimeMapper.ConditionalKinds tests them. Case never matters, and one space may follow each colon.
 *
 * <pre>
 * Structure:
 *  <hourRangePage:START-END>
 *  <timeRangePage:HH:MM-HH:MM>
 *  <timeOfDayPage:TIME_OF_DAY>
 *
 * Example:
 *  <hourRangePage:18-5>
 *
 * Translation:
 *  The page shows from 18:00 until 05:00 the next morning.
 * </pre>
 */
const TIME_PAGE_TAGS: Readonly<Record<TimeTagKind, RegExp>> = {
  Minute: /<minutePage:[ ]?(\d+),? ?( )?>/i,
  Hour: /<hourPage:[ ]?(\d+)>/i,
  Day: /<dayPage:[ ]?(\d+)>/i,
  Month: /<monthPage:[ ]?(\d+)>/i,
  Year: /<yearPage:[ ]?(\d+)>/i,
  TimeOfDay: /<timeOfDayPage:[ ]?([0-5]|moontide|dawn|morning|afternoon|evening|night)>/i,
  SeasonOfYear: /<seasonOfYearPage:[ ]?([0-3]|spring|summer|autumn|winter)>/i,
  TimeRange: /<timeRangePage:[ ]?(\d{1,2}):(\d{1,2})-(\d{1,2}):(\d{1,2})>/i,
  FullDateRange: /<fullDateRangePage:[ ]?(\[\d+, ?\d+, ?\d+, ?\d+, ?\d+])-(\[\d+, ?\d+, ?\d+, ?\d+, ?\d+])>/i,
  MinuteRange: /<minuteRangePage:[ ]?(\d+)-(\d+)>/i,
  HourRange: /<hourRangePage:[ ]?(\d+)-(\d+)>/i,
  DayRange: /<dayRangePage:[ ]?(\d+)-(\d+)>/i,
  MonthRange: /<monthRangePage:[ ]?(\d+)-(\d+)>/i,
  YearRange: /<yearRangePage:[ ]?(\d+)-(\d+)>/i,
};

/**
 * Every kind, in the order a comment is tested against them.
 */
const TIME_TAG_KINDS = Object.keys(TIME_PAGE_TAGS) as TimeTagKind[];

/**
 * What a comment line must be before J-Base offers it to any plugin (J.BASE.RegExp.ParsableComment): one tag filling the
 * whole line, made only of these characters.
 */
const PARSABLE_COMMENT = /^<[[\]\w :"',.!?+\-*/\\#~%=();]+>$/i;

/**
 * The command codes of a comment's first line and of each line after it (Game_Event.matchesControlCode).
 */
const COMMENT_CODES: readonly number[] = [ 108, 408 ];

/**
 * Reads the time tag one comment line carries, as TimeMapper#toConditional reads it: the first kind whose tag the line
 * holds owns it.
 * @param {string} text The line.
 * @returns {TimeTag | null} The tag, or null when the line carries none.
 */
const readTimeTag = (text: string): TimeTag | null =>
{
  for (const kind of TIME_TAG_KINDS)
  {
    const match = TIME_PAGE_TAGS[kind].exec(text);
    if (match !== null)
    {
      const [ , ...captures ] = match;
      return { kind, captures };
    }
  }

  return null;
};

/**
 * Reads every time tag a page carries, as J-TIME's alias of Game_Event#meetsConditions gathers them: from the page's
 * comment lines, first lines and later ones alike, each of which J-Base offers only when it is one tag filling the whole
 * line, in the order they are written. A line holding words besides its tag, or a tag anywhere but a comment, gates
 * nothing.
 * @param {RmmzEventPage} page The page.
 * @returns {TimeTag[]} The tags, in order; empty for a page J-TIME lets through.
 */
const readTimeTags = (page: RmmzEventPage): TimeTag[] =>
{
  return page.list.flatMap(command =>
  {
    const [ text ] = command.parameters;
    if (COMMENT_CODES.includes(command.code) === false || typeof text !== 'string' || PARSABLE_COMMENT.test(text) === false)
    {
      return [];
    }

    const tag = readTimeTag(text);
    return tag === null ? [] : [ tag ];
  });
};

export { readTimeTag, readTimeTags, TIME_PAGE_TAGS, TIME_TAG_KINDS };
export type { TimeTag, TimeTagKind };
