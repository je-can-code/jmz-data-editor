import {
  emptyNaturalQuadFormulas,
  NATURAL_GROWTH_QUADRANT_ORDER,
  NaturalGrowthQuadrant,
  type NaturalQuadFormulas,
} from '@core/domain/valueObjects/NaturalQuadFormulas.ts';
import { knownLongParams, knownParamByLongId, type KnownParameter, } from '../../mappers/ParameterIdMapper.ts';
import NoteReader from '@services/utils/NoteReader.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

const QUAD_SUFFIX: Record<NaturalGrowthQuadrant, string> = {
  [ NaturalGrowthQuadrant.BuffPlus ]: 'BuffPlus',
  [ NaturalGrowthQuadrant.BuffRate ]: 'BuffRate',
  [ NaturalGrowthQuadrant.GrowthPlus ]: 'GrowthPlus',
  [ NaturalGrowthQuadrant.GrowthRate ]: 'GrowthRate',
};

const REWARD_LONG_IDS = new Set<number>([ 31, 32, 33 ]);

/**
 * Display / serialization order: base (mhp, mmp, mtp, then atk…luk), ex, sp, crit natural, rewards.
 */
const NATURAL_GROWTH_LONG_PARAM_ORDER: number[] = [
  0,
  1,
  30,
  2,
  3,
  4,
  5,
  6,
  7,
  ...Array.from(
    { length: 10 },
    (
      _v,
      i
    ) => 8 + i
  ),
  ...Array.from(
    { length: 10 },
    (
      _v,
      i
    ) => 18 + i
  ),
  28,
  29,
  31,
  32,
  33,
];

const VALID_FORMULA = /^[+\-*/ ().\w]*$/;

class NaturalGrowthQuadrantsParser
{
  static readonly #stripRegexes: RegExp[] =
    NaturalGrowthQuadrantsParser.#buildStripRegexes();

  /**
   * Tag name inside {@code <tag:[...]>} for this parameter and quadrant.
   */
  static tagFragment(
    param: KnownParameter,
    q: NaturalGrowthQuadrant
  ): string | null
  {
    if (REWARD_LONG_IDS.has(param.longParamId))
    {
      if (q !== NaturalGrowthQuadrant.BuffPlus)
      {
        return null;
      }
      return `${param.key}Plus`;
    }
    return `${param.key}${QUAD_SUFFIX[ q ]}`;
  }

  static stripManagedTags(note: string): string
  {
    let n = note;
    for (const re of NaturalGrowthQuadrantsParser.#stripRegexes)
    {
      n = NoteNormalizer.removeLinesMatching(n, re);
    }
    return NoteNormalizer.normalize(n);
  }

  static parse(note: string): Map<number, NaturalQuadFormulas>
  {
    const map = new Map<number, NaturalQuadFormulas>();
    for (const p of knownLongParams())
    {
      const quad = emptyNaturalQuadFormulas();
      for (const q of NATURAL_GROWTH_QUADRANT_ORDER)
      {
        const tag = NaturalGrowthQuadrantsParser.tagFragment(p, q);
        if (tag === null)
        {
          continue;
        }
        const re = NaturalGrowthQuadrantsParser.#readRegexForTag(tag);
        const raw = NoteReader.getStringFromNoteByRegex(note, re);
        quad[ q ] = raw === null || raw === ''
          ? ''
          : raw;
      }
      map.set(p.longParamId, quad);
    }
    return map;
  }

  static isValidFormula(formula: string): boolean
  {
    if (formula.trim() === '')
    {
      return true;
    }
    return VALID_FORMULA.test(formula);
  }

  /**
   * Removes all managed natural-growth lines, then appends tags from {@code map} in stable order.
   */
  static serialize(
    note: string,
    map: Map<number, NaturalQuadFormulas>
  ): string
  {
    const base = NaturalGrowthQuadrantsParser.stripManagedTags(note);
    const lines: string[] = [];
    for (const longId of NATURAL_GROWTH_LONG_PARAM_ORDER)
    {
      const param = knownParamByLongId(longId);
      const quad = map.get(longId) ?? emptyNaturalQuadFormulas();
      for (const q of NATURAL_GROWTH_QUADRANT_ORDER)
      {
        const tag = NaturalGrowthQuadrantsParser.tagFragment(param, q);
        if (tag === null)
        {
          continue;
        }
        const formula = quad[ q ].trim();
        if (formula === '')
        {
          continue;
        }
        if (NaturalGrowthQuadrantsParser.isValidFormula(formula) === false)
        {
          console.warn(
            `[NaturalGrowthQuadrantsParser] Skipping invalid formula for ${tag}: ${formula}`
          );
          continue;
        }
        lines.push(`<${tag}:[${formula}]>`);
      }
    }
    if (lines.length === 0)
    {
      return base;
    }
    return NoteNormalizer.appendBlock(base, lines.join('\n'));
  }

  /**
   * Merges one quadrant value and returns the full serialized note.
   */
  static withQuadrant(
    note: string,
    longParamId: number,
    q: NaturalGrowthQuadrant,
    formula: string
  ): string
  {
    const map = NaturalGrowthQuadrantsParser.parse(note);
    const prev = map.get(longParamId) ?? emptyNaturalQuadFormulas();
    const next: NaturalQuadFormulas = {
      ...prev,
      [ q ]: formula,
    };
    map.set(longParamId, next);
    return NaturalGrowthQuadrantsParser.serialize(note, map);
  }

  static #buildStripRegexes(): RegExp[]
  {
    const out: RegExp[] = [];
    for (const p of knownLongParams())
    {
      for (const q of NATURAL_GROWTH_QUADRANT_ORDER)
      {
        const tag = NaturalGrowthQuadrantsParser.tagFragment(p, q);
        if (tag === null)
        {
          continue;
        }
        out.push(NaturalGrowthQuadrantsParser.#stripRegexForTag(tag));
      }
    }
    return out;
  }

  static #readRegexForTag(tag: string): RegExp
  {
    return new RegExp(`<${tag}:\\[([+\\-*/ ().\\w]+)]>`, 'gi');
  }

  static #stripRegexForTag(tag: string): RegExp
  {
    return new RegExp(`^<${tag}:\\[([+\\-*/ ().\\w]+)]>$`, 'i');
  }
}

export {
  NaturalGrowthQuadrantsParser,
  NATURAL_GROWTH_LONG_PARAM_ORDER,
  NATURAL_GROWTH_QUADRANT_ORDER,
  REWARD_LONG_IDS,
};
