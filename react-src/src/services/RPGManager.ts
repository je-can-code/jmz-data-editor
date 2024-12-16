//region RPGManager
import JsonMapper from "./JsonMapper.ts";

/**
 * A utility class for handling common database-related translations.
 */
export default class RPGManager
{
  /**
   * Gets an array of arrays based on the provided regex structure.
   *
   * This accepts a regex structure, assuming the capture group is an array of values
   * all wrapped in hard brackets [].
   *
   * If the optional flag `tryParse` is true, then it will attempt to parse out
   * the array of values as well, including translating strings to numbers/booleans
   * and keeping array structures all intact.
   * @param {string} databaseNote The database note to parse from.
   * @param {RegExp} structure The regular expression to filter notes by.
   * @param {boolean} tryParse Whether or not to attempt to parse the found array.
   * @returns {any[][]|null} The array of arrays from the notes, or null.
   */
  static getArraysFromNotesByRegex(databaseNote: string, structure: RegExp, tryParse = true)
  {
    // get the note data from this skill.
    const noteLines = databaseNote.split(/[\r\n]+/);

    // initialize the value.
    let val: any[] = [];

    // default to not having a match.
    let hasMatch = false;

    // iterate the note data array.
    noteLines.forEach(line =>
    {
      // check if this line matches the given regex structure.
      if (line.match(structure))
      {
        // extract the captured formula.
        // @ts-ignore
        const [ , result ] = structure.exec(line);

        // parse the value out of the regex capture group.
        val.push(result);

        // flag that we found a match.
        hasMatch = true;
      }
    });

    // if we didn't find a match, return null instead of attempting to parse.
    if (!hasMatch) return null;

    // check if we're going to attempt to parse it, too.
    if (tryParse)
    {
      // attempt the parsing.
      val = val.map(JsonMapper.parseObject, JsonMapper);
    }

    // return the found value.
    return val;
  }
}

//endregion RPGManager