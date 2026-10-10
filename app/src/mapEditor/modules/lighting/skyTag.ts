import type { SkyReader } from '../../core/modules/PluginModule.ts';
import type { MapPropertyField } from '../../core/properties/moduleProperties.ts';
import {
  keepsOtherMeta,
  metaTagsOf,
  noteMetaOf,
  OTHER_TAGS_MISREAD,
  withLineAdded,
  withSpanRemoved,
} from '../../core/properties/noteText.ts';

/**
 * The name J-Lighting-Time and J-Weather each read from a map's metadata to learn the map has no sky:
 * {@code $dataMap.meta['noToneChange']}, matched exactly, case and all.
 */
const NO_SKY_KEY = 'noToneChange';

/**
 * What the sky setting says last under it, whichever plugins read it.
 */
const NO_SKY_ADVICE = 'Untick it for interiors and caves, which have no sky.';

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
 *  An interior or a cave: the clock never tints it, nor darkens it, and the sky's weather never reaches it.
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
 * {@code noToneChange} that is truthy. J-Weather reads the tag the very same way to decide whether the sky's weather
 * reaches the map ({@code MapWeatherResolver.declarationFor}), which matters once J-Weather-Time drives a sky; J-Weather
 * alone has none to bring. A bare tag holds true and any written value holds its
 * text, so only a tag written with nothing after its colon leaves the sky following the clock. Everything that asks
 * whether a map has a sky asks it here: the sky the map views cast at the clock's hour, the sky setting in Map
 * Properties, and the parity check.
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

/**
 * Joins what each plugin's sky follows the way a sentence lists things: "the clock", "the clock and the weather".
 * @param {readonly string[]} parts What each follows, in order.
 * @returns {string} The list.
 */
const listed = (parts: readonly string[]): string =>
{
  const head = parts.slice(0, -1);
  const last = parts[parts.length - 1];
  return head.length === 0
    ? last
    : `${head.join(', ')} and ${last}`;
};

/**
 * The map's sky setting, for the section of the module whose plugin said first that it reads whether a map has a sky:
 * one setting, however many plugins read the tag, named for what the sky follows in each of them and saying under it
 * what it does in each, so unticking it never takes any of them by surprise nor speaks of one the game does not run.
 * Every other section, and every section while no plugin that reads the tag is on, offers none, so the setting never
 * shows twice. It reads and writes the one tag through {@link skyFollowsClock} and {@link withSkyFollowingClock}, in
 * place, whichever section shows it.
 * @param {string} note The map's note.
 * @param {SkyReader} host The plugin the asking section speaks for, as its module said it reads the sky.
 * @param {readonly SkyReader[]} readers Every plugin the active modules say reads the sky, in the order they said it.
 * @returns {MapPropertyField[]} The setting, keyed by the host's id, or none when the asking section is not the first
 * reader's.
 */
const skySettingFor = (note: string, host: SkyReader, readers: readonly SkyReader[]): MapPropertyField[] =>
{
  const [ first ] = readers;
  if (first === undefined || first.id !== host.id)
  {
    return [];
  }

  const does = readers.map(reader => reader.does);
  return [ {
    key: host.id,
    label: `Sky follows ${listed(readers.map(reader => reader.follows))}`,
    control: { kind: 'check' },
    value: skyFollowsClock(note),
    step: 'Change sky',
    hint: [ ...does, NO_SKY_ADVICE ].join(' '),
    write: value => ({ note: withSkyFollowingClock(note, value as boolean) }),
  } ];
};

export { NO_SKY_KEY, NO_SKY_TAG, SKY_MISREAD, skyFollowsClock, skySettingFor, withSkyFollowingClock };
