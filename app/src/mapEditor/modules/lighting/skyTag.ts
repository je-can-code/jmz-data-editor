import {
  keepsOtherMeta,
  metaTagsOf,
  noteMetaOf,
  OTHER_TAGS_MISREAD,
  withLineAdded,
  withSpanRemoved,
} from '../../core/properties/noteText.ts';

/**
 * The name J-Lighting-Time reads from a map's metadata to learn the map has no sky: {@code $dataMap.meta['noToneChange']},
 * matched exactly, case and all.
 */
const NO_SKY_KEY = 'noToneChange';

/**
 * The tag that says a map has no sky, written as the game's maps write it.
 *
 * <pre>
 * Structure:
 *  <noToneChange>
 *
 * Example:
 *  <noToneChange>
 *
 * Translation:
 *  An interior or a cave: the clock never tints it, nor darkens it.
 * </pre>
 */
const NO_SKY_TAG = '<noToneChange>';

/**
 * Why a change was refused when the note it would write reads back otherwise, such as a stray bracket earlier in the note
 * swallowing the new tag.
 */
const SKY_MISREAD = 'the game would not read this map\'s sky back as written';

/**
 * Reports whether a map's sky follows the clock, as J-Lighting-Time decides on arrival
 * ({@code TimeLightingCoordinator.refreshMapSuppression}): it does unless the map's metadata holds a value under
 * {@code noToneChange} that is truthy. A bare tag holds true and any written value holds its text, so only a tag written
 * with nothing after its colon leaves the sky following the clock. Everything that asks whether a map has a sky asks it
 * here: the sky the map views cast at the clock's hour, the sky setting in Map Properties, and the parity check.
 * @param {string} note The map's note.
 * @returns {boolean} True when the sky follows the clock.
 */
const skyFollowsClock = (note: string): boolean =>
{
  const value = noteMetaOf(note).get(NO_SKY_KEY);
  return value === undefined || value === '';
};

/**
 * Takes every tag the engine reads under the sky's name out of a note, the last first so each one still sits where it
 * was read, since a tag the engine reads later replaces one it read earlier and any of them could keep the sky still.
 * @param {string} note The map's note.
 * @returns {string} The note without them.
 */
const withoutNoSkyTags = (note: string): string =>
{
  return metaTagsOf(note)
    .filter(tag => tag.key === NO_SKY_KEY)
    .reduceRight((text, tag) => withSpanRemoved(text, tag.start, tag.end), note);
};

/**
 * Says whether a map's sky follows the clock, by writing its note in place: a map whose sky stays put gains the tag on a
 * line of its own at the end of the note, and a map whose sky follows the clock again loses every such tag, each taken
 * out cleanly. Every other character of the note stays as it was, and the note is read back as the game reads it before
 * it is handed on, so a note the game would read otherwise is refused: one whose sky reads otherwise than asked, and one
 * where a stray bracket would swallow some other tag once the sky's is added or taken out, such as the one stopping
 * time on the map.
 * @param {string} note The map's note.
 * @param {boolean} follows Whether the sky follows the clock.
 * @returns {string} The note, unchanged when the sky already does as asked.
 */
const withSkyFollowingClock = (note: string, follows: boolean): string =>
{
  if (skyFollowsClock(note) === follows)
  {
    return note;
  }

  const written = follows
    ? withoutNoSkyTags(note)
    : withLineAdded(note, NO_SKY_TAG);
  if (skyFollowsClock(written) !== follows)
  {
    throw new Error(SKY_MISREAD);
  }

  // the sky's own tag is the only one the change is about; every other must read as it did.
  if (keepsOtherMeta(note, written, key => key === NO_SKY_KEY) === false)
  {
    throw new Error(OTHER_TAGS_MISREAD);
  }

  return written;
};

export { NO_SKY_KEY, NO_SKY_TAG, SKY_MISREAD, skyFollowsClock, withSkyFollowingClock };
