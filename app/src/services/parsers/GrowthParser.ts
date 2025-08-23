import NoteReader from "../utils/NoteReader.ts";
import { KnownParameter } from "../../mappers/ParameterIdMapper.ts";
import { NoteNormalizer } from "../utils/NoteNormalizer.ts";

class GrowthParser
{
  static #defaultRegexPattern = "BuffPlus";
  static #validFormulaChars = /^[+\-*/ ().\w]*$/;

  static read(growableNote: string, knownParam: KnownParameter): string
  {
    // build the regex from the template.
    const parameterizedRegex = this.#regex(knownParam.key, knownParam.regex);

    // grab the value from the note.
    return NoteReader.getStringFromNoteByRegex(growableNote, parameterizedRegex) ?? '';
  }

  static write(originalNote: string, knownParam: KnownParameter, newFormula: string): string
  {
    // Check if the formula contains invalid characters
    if (newFormula && !this.#validFormulaChars.test(newFormula))
    {
      console.error(`Formula contains invalid characters: ${newFormula}`);
      return originalNote; // Return unchanged note if invalid
    }

    // build the regex from the parameter key.
    const parameterizedRegex = this.#regex(knownParam.key, knownParam.regex);
    const regexPattern = knownParam.regex || this.#defaultRegexPattern;

    // Format the value using the custom formatter if provided, otherwise use the formula directly
    const formattedValue = knownParam.formatValue
      ? knownParam.formatValue(newFormula)
      : newFormula;

    // create the new tag with the formula.
    const newTag = newFormula
      ? `<${knownParam.key}${regexPattern}:[${formattedValue}]>`
      : "";

    // handle removal if new formula is empty
    if (!newFormula)
    {
      return NoteNormalizer.removeLinesMatching(originalNote, parameterizedRegex);
    }

    // replace existing tag inline if present
    if (originalNote.match(parameterizedRegex))
    {
      const replaced = originalNote.replace(parameterizedRegex, newTag);
      return NoteNormalizer.normalize(replaced);
    }

    // append as a new block if not present
    return NoteNormalizer.appendBlock(originalNote, newTag);
  }

  static evaluateFormula(formula: string, level: number): number
  {
    if (!formula) return 0;

    try
    {
      // Create a mock battler object with level
      const a = { level };

      // Use Function constructor to safely evaluate the formula
      // This creates a function with 'a' as a parameter
      const evaluator = new Function('a', `return ${formula}`);

      return evaluator(a);
    }
    catch (error)
    {
      console.error(`Error evaluating formula: ${formula}`, error);
      return 0;
    }
  }

  static generateDataPoints(formula: string, maxLevel: number = 100, step: number = 5)
    : Array<{
    level: number,
    value: number
  }>
  {
    const dataPoints = [];

    for (let level = 0; level <= maxLevel; level += step)
    {
      const value = GrowthParser.evaluateFormula(formula, level);
      dataPoints.push({
        level,
        value
      });
    }

    // Add the maxLevel as the final point if it's not already included.
    const lastPoint = dataPoints[dataPoints.length - 1];
    if (lastPoint.level !== maxLevel)
    {
      const value = GrowthParser.evaluateFormula(formula, maxLevel);
      dataPoints.push({
        level: maxLevel,
        value
      });
    }

    return dataPoints;
  }

  static #regex = (paramKey: string, regexPattern?: string) =>
    new RegExp(`<${paramKey}${regexPattern || this.#defaultRegexPattern}:\\[([+\\-*/ ().\\w]+)]>`, 'gi');
}

export { GrowthParser }