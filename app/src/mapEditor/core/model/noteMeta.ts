/**
 * What the engine reads a note's tags with (DataManager.extractMetadata): a name, then either nothing or a colon and
 * whatever follows up to the closing bracket. It runs over the whole note at once, line breaks and all.
 */
const META_TAG = /<([^<>:]+)(:?)([^>]*)>/g;

/**
 * Reads a note's tags exactly as the engine fills an object's {@code meta} when its file loads: every tag, by its name
 * as written, case and all; a bare tag such as {@code <noToneChange>} holding true, a tag with a colon holding the text
 * after it, which may be empty; and a name written twice keeping the last value. Plugins that read {@code meta} rather
 * than the note itself, such as J-Lighting-Time reading {@code noToneChange}, see exactly this.
 * @param {string} note The note.
 * @returns {Map<string, string | true>} The tags, by name.
 */
const noteMetaOf = (note: string): Map<string, string | true> =>
{
  const meta = new Map<string, string | true>();
  for (const match of note.matchAll(META_TAG))
  {
    const [ , name, colon, value ] = match;
    meta.set(name, colon === ':' ? value : true);
  }

  return meta;
};

/**
 * Reports whether a tag in a note's {@code meta} reads as on, as a plugin testing {@code Boolean(meta[name])} reads it:
 * a bare tag, or one whose text after the colon is not empty, whatever that text says, so even {@code <tag:false>}
 * counts; an empty value, or no such tag, does not.
 * @param {string} note The note.
 * @param {string} name The tag's name, case and all.
 * @returns {boolean} True when the tag reads as on.
 */
const hasMetaFlag = (note: string, name: string): boolean =>
{
  return Boolean(noteMetaOf(note).get(name));
};

export { hasMetaFlag, META_TAG, noteMetaOf };
