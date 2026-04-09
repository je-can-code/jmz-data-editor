import JsonMapper from '../../mappers/JsonMapper.ts';
import { NoteNormalizer } from './NoteNormalizer.ts';
import RPG_Base = Rmmz.Base.RPG_Base;

/**
 * A utility class for handling common database-related translations.
 */
export default class NoteReader
{
  /**
   * Gets the last instance of a string matching the regex from the given database object.
   * @param {string} databaseNote The database object to inspect.
   * @param {RegExp} structure The RegExp structure to find values for.
   * @param {boolean=} nullIfEmpty Whether or not to return null if we found nothing; defaults to false.
   * @returns {string|null} The string matching the structure, {@link String.empty} if not found, or null with the flag.
   */
  static getStringFromNoteByRegex(
    databaseNote: string,
    structure: RegExp,
    nullIfEmpty: boolean | undefined = false
  ): string | null
  {
    // validate the incoming note.
    if (!databaseNote)
    {
      // handle the return.
      return nullIfEmpty
        ? null
        : '';
    }

    // initialize the value.
    let val = '';

    // get the note data from this skill.
    const lines = NoteNormalizer.normalize(databaseNote)
      .split('\n');

    // validate the notes to ensure there even are any.
    if (lines.length === 0)
    {
      // handle the return.
      return nullIfEmpty
        ? null
        : '';
    }

    // iterate over each valid line of the note.
    lines.forEach(line =>
    {
      // reset the index for re-use on regex's with the "global" flag with .exec(line).
      structure.lastIndex = 0;

      // grab the regex execution result for this note line.
      const result = structure.exec(line);

      // skip if we somehow encounter something amiss here.
      if (result === null)
      {
        return;
      }

      // extract the captured formula.
      const [ /* skip first index */, stringResult ] = result;

      // set this to what we found.
      val = stringResult;
    });

    // validate the actual findings to evaluate return values.
    if (!val)
    {
      // handle the return.
      return nullIfEmpty
        ? null
        : '';
    }

    // return the found value.
    return val;
  }

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
  static getArraysFromNotesByRegex(
    databaseNote: string,
    structure: RegExp,
    tryParse: boolean = true
  ): any[][] | null
  {
    // get the note data from this skill.
    const lines = databaseNote.split(/[\r\n]+/);

    // initialize the value.
    let val: any[] = [];

    // default to not having a match.
    let hasMatch = false;

    // iterate the note data array.
    lines.forEach(line =>
    {
      // reset the index for re-use on regex's with the "global" flag with .exec(line).
      structure.lastIndex = 0;

      // check if this line matches the given regex structure.
      const match = structure.exec(line);
      if (match)
      {
        // extract the captured array.
        const [ , result ] = match;

        // parse the value out of the regex capture group.
        val.push(result);

        // flag that we found a match.
        hasMatch = true;
      }
    });

    // if we didn't find a match, return null instead of attempting to parse.
    if (!hasMatch)
    {
      return null;
    }

    // check if we're going to attempt to parse it, too.
    if (tryParse)
    {
      // attempt the parsing.
      val = val.map(JsonMapper.parseObject, JsonMapper);
    }

    // return the found value.
    return val;
  }

  /**
   * Gets the last numeric value based on the provided regex structure.
   *
   * This accepts a regex structure, assuming the capture group is an numeric value,
   * and adds all values together from each line in the notes that match the provided
   * regex structure.
   *
   * If the optional flag `nullIfEmpty` receives true passed in, then the result of
   * this will be `null` instead of the default 0 as an indicator we didn't find
   * anything from the notes of this skill.
   *
   * This can handle both integers and decimal numbers.
   * @param {RPG_Base} databaseData The database object to inspect.
   * @param {RegExp} structure The regular expression to filter notes by.
   * @param {boolean=} nullIfEmpty Whether or not to return 0 if not found, or null.
   * @returns {number|null} The combined value added from the notes of this object, or zero/null.
   */
  static getNumberFromNoteByRegex(
    databaseData: RPG_Base,
    structure: RegExp,
    nullIfEmpty: boolean | undefined = false
  ): number | null
  {
    // validate the incoming data object.
    if (!databaseData)
    {
      // handle the return.
      return nullIfEmpty
        ? null
        : 0;
    }

    // get the note data from this skill.
    const lines = databaseData.note?.split(/[\r\n]+/) ?? [];

    // if we have no matching notes, then short circuit.
    if (!lines.length)
    {
      // return null or 0 depending on provided options.
      return nullIfEmpty
        ? null
        : 0;
    }

    // initialize the value.
    let val = null;

    // iterate over each valid line of the note.
    lines.forEach(line =>
    {
      // reset the index for re-use on regex's with the "global" flag with .exec(line).
      structure.lastIndex = 0;

      // grab the regex execution result for this note line.
      const result = structure.exec(line);

      // skip if we somehow encounter something amiss here.
      if (result === null)
      {
        return;
      }

      // extract the captured formula.
      const [ /* skip first index */, numericResult ] = result;

      // regular parse it and add it to the running total.
      val = parseFloat(numericResult);
    });

    if (val === null)
    {
      // return null or 0 depending on provided options.
      return nullIfEmpty
        ? null
        : 0;
    }

    // return the value.
    return val;
  }
}
