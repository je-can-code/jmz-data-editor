import { describe, expect, it, vi, } from 'vitest';
import {
  emptyNaturalQuadFormulas,
  NATURAL_GROWTH_QUADRANT_ORDER,
  NaturalGrowthQuadrant,
  type NaturalQuadFormulas,
} from '@core/domain/valueObjects/NaturalQuadFormulas.ts';
import { knownLongParams, knownParamByLongId } from '@mappers/ParameterIdMapper.ts';
import {
  NATURAL_GROWTH_LONG_PARAM_ORDER,
  NaturalGrowthQuadrantsParser,
  REWARD_LONG_IDS,
} from '@services/parsers/NaturalGrowthQuadrantsParser.ts';

type ManagedTagCase = {
  longId: number;
  q: NaturalGrowthQuadrant;
  tag: string;
};

const buildManagedTagCases = (): ManagedTagCase[] =>
{
  const out: ManagedTagCase[] = [];
  for (const p of knownLongParams())
  {
    for (const q of NATURAL_GROWTH_QUADRANT_ORDER)
    {
      const tag = NaturalGrowthQuadrantsParser.tagFragment(p, q);
      if (tag === null)
      {
        continue;
      }
      out.push({
        longId: p.longParamId,
        q,
        tag,
      });
    }
  }
  return out;
};

const managedTagCases = buildManagedTagCases();

const expectedManagedLinesFromMap = (map: Map<number, NaturalQuadFormulas>): string[] =>
{
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
        continue;
      }
      lines.push(`<${tag}:[${formula}]>`);
    }
  }
  return lines;
};

describe('NaturalGrowthQuadrantsParser.tagFragment', () =>
{
  it('uses expPlus, goldPlus, sdpPlus only on BuffPlus (reward long ids)', () =>
  {
    const rewardKeys = new Map<number, string>([
      [ 31, 'expPlus' ],
      [ 32, 'goldPlus' ],
      [ 33, 'sdpPlus' ],
    ]);
    for (const p of knownLongParams())
    {
      if (REWARD_LONG_IDS.has(p.longParamId) === false)
      {
        continue;
      }
      expect(NaturalGrowthQuadrantsParser.tagFragment(p, NaturalGrowthQuadrant.BuffPlus))
        .toBe(rewardKeys.get(p.longParamId) ?? null);
      expect(NaturalGrowthQuadrantsParser.tagFragment(p, NaturalGrowthQuadrant.BuffRate))
        .toBeNull();
      expect(NaturalGrowthQuadrantsParser.tagFragment(p, NaturalGrowthQuadrant.GrowthPlus))
        .toBeNull();
      expect(NaturalGrowthQuadrantsParser.tagFragment(p, NaturalGrowthQuadrant.GrowthRate))
        .toBeNull();
    }
  });

  it('uses quad suffixes for mtp (long 30)', () =>
  {
    const mtp = knownParamByLongId(30);
    expect(NaturalGrowthQuadrantsParser.tagFragment(mtp, NaturalGrowthQuadrant.BuffPlus))
      .toBe('mtpBuffPlus');
    expect(NaturalGrowthQuadrantsParser.tagFragment(mtp, NaturalGrowthQuadrant.GrowthRate))
      .toBe('mtpGrowthRate');
  });

  it('uses quad suffixes for crit natural cdm / ctr (long 28, 29)', () =>
  {
    const cdm = knownParamByLongId(28);
    const ctr = knownParamByLongId(29);
    expect(NaturalGrowthQuadrantsParser.tagFragment(cdm, NaturalGrowthQuadrant.BuffPlus))
      .toBe('cdmBuffPlus');
    expect(NaturalGrowthQuadrantsParser.tagFragment(ctr, NaturalGrowthQuadrant.GrowthPlus))
      .toBe('ctrGrowthPlus');
  });

  it('covers every known long param with at least one tag', () =>
  {
    const longIdsWithTag = new Set(managedTagCases.map(c => c.longId));
    for (const p of knownLongParams())
    {
      expect(longIdsWithTag.has(p.longParamId))
        .toBe(true);
    }
  });
});

describe('NaturalGrowthQuadrantsParser.parse', () =>
{
  it('returns empty quadrants for an empty note for every long id', () =>
  {
    const map = NaturalGrowthQuadrantsParser.parse('');
    for (const p of knownLongParams())
    {
      const quad = map.get(p.longParamId);
      expect(quad)
        .toBeDefined();
      for (const q of NATURAL_GROWTH_QUADRANT_ORDER)
      {
        expect(quad![ q ])
          .toBe('');
      }
    }
  });

  it('reads each managed tag into the correct long id and quadrant', () =>
  {
    const lines = managedTagCases.map(c =>
    {
      const formula = `F_${c.longId}_${c.q}`;
      return `<${c.tag}:[${formula}]>`;
    });
    const note = lines.join('\n');
    const map = NaturalGrowthQuadrantsParser.parse(note);
    for (const c of managedTagCases)
    {
      const formula = `F_${c.longId}_${c.q}`;
      expect(map.get(c.longId)![ c.q ])
        .toBe(formula);
    }
  });

  it('uses the last duplicate line for the same tag (case-insensitive match)', () =>
  {
    const note = [
      '<mhpBuffPlus:[first]>',
      '<mhpBuffPlus:[second]>',
    ].join('\n');
    const map = NaturalGrowthQuadrantsParser.parse(note);
    expect(map.get(0)![ NaturalGrowthQuadrant.BuffPlus ])
      .toBe('second');
  });
});

describe('NaturalGrowthQuadrantsParser.serialize', () =>
{
  it('appends managed lines in NATURAL_GROWTH_LONG_PARAM_ORDER after stripping prior managed tags', () =>
  {
    const lines = managedTagCases.map(c =>
    {
      const formula = `S_${c.longId}_${c.q}`;
      return `<${c.tag}:[${formula}]>`;
    });
    const shuffled = [ ...lines ].reverse();
    const note = [ '<!-- keep me -->', ...shuffled ].join('\n');
    const map = NaturalGrowthQuadrantsParser.parse(note);
    const out = NaturalGrowthQuadrantsParser.serialize(note, map);
    expect(out)
      .toContain('<!-- keep me -->');
    const expected = expectedManagedLinesFromMap(map);
    for (const line of expected)
    {
      expect(out)
        .toContain(line);
    }
    const managedLineRe = /^<\w+:\[[^\]]*]>$/;
    const managedSlice = out.split('\n')
      .map(l => l.trim())
      .filter(l => managedLineRe.test(l));
    expect(managedSlice)
      .toEqual(expected);
  });

  it('drops invalid formulas and warns once per skipped tag', () =>
  {
    const warnSpy = vi.spyOn(console, 'warn')
      .mockImplementation(() =>
      {
      });

    const map = NaturalGrowthQuadrantsParser.parse('');
    const quad0 = map.get(0)!;
    map.set(0, {
      ...quad0,
      [ NaturalGrowthQuadrant.BuffPlus ]: 'bad$formula',
    });
    const quad28 = map.get(28)!;
    map.set(28, {
      ...quad28,
      [ NaturalGrowthQuadrant.BuffRate ]: 'x;y',
    });

    const out = NaturalGrowthQuadrantsParser.serialize('', map);
    expect(out)
      .not
      .toContain('bad$formula');
    expect(out)
      .not
      .toContain('x;y');
    expect(warnSpy.mock.calls.length)
      .toBe(2);

    warnSpy.mockRestore();
  });

  it('returns base unchanged when the map has only empty formulas', () =>
  {
    const base = '<!-- only -->';
    const map = NaturalGrowthQuadrantsParser.parse('');
    const out = NaturalGrowthQuadrantsParser.serialize(base, map);
    expect(out)
      .toBe(base);
  });
});

describe('NaturalGrowthQuadrantsParser.stripManagedTags', () =>
{
  it('removes every managed line and preserves unrelated note lines', () =>
  {
    const managed = managedTagCases.slice(0, 5)
      .map(c => `<${c.tag}:[1]>`)
      .join('\n');
    const note = [
      '<jabsRadius:[4]>',
      managed,
      '<mhpCustom:[not-managed]>',
      'plain line',
    ].join('\n');
    const stripped = NaturalGrowthQuadrantsParser.stripManagedTags(note);
    expect(stripped)
      .toContain('<jabsRadius:[4]>');
    expect(stripped)
      .toContain('<mhpCustom:[not-managed]>');
    expect(stripped)
      .toContain('plain line');
    for (const c of managedTagCases.slice(0, 5))
    {
      expect(stripped)
        .not
        .toContain(`<${c.tag}:`);
    }
  });

  it('clears a note that contains only managed tags', () =>
  {
    const lines = managedTagCases.map(c => `<${c.tag}:[z]>`);
    const stripped = NaturalGrowthQuadrantsParser.stripManagedTags(lines.join('\n'));
    expect(stripped)
      .toBe('');
  });
});

describe('NaturalGrowthQuadrantsParser.withQuadrant', () =>
{
  it.each(managedTagCases)(
    'add, modify, and clear $tag (long $longId, $q)',
    ({
      longId,
      q,
      tag
    }) =>
    {
      let note = '';
      note = NaturalGrowthQuadrantsParser.withQuadrant(note, longId, q, 'seed');
      expect(note)
        .toContain(`<${tag}:[seed]>`);

      note = NaturalGrowthQuadrantsParser.withQuadrant(note, longId, q, 'replaced');
      expect(note)
        .toContain(`<${tag}:[replaced]>`);
      expect(note)
        .not
        .toContain(`<${tag}:[seed]>`);

      note = NaturalGrowthQuadrantsParser.withQuadrant(note, longId, q, '');
      expect(note)
        .not
        .toContain(`<${tag}:`);

      const map = NaturalGrowthQuadrantsParser.parse(note);
      expect(map.get(longId)![ q ])
        .toBe('');
    }
  );

  it('updates one quadrant without clobbering another on the same parameter', () =>
  {
    let note = NaturalGrowthQuadrantsParser.withQuadrant(
      '',
      28,
      NaturalGrowthQuadrant.BuffPlus,
      'a'
    );
    note = NaturalGrowthQuadrantsParser.withQuadrant(
      note,
      28,
      NaturalGrowthQuadrant.GrowthRate,
      'b'
    );
    const map = NaturalGrowthQuadrantsParser.parse(note);
    expect(map.get(28)![ NaturalGrowthQuadrant.BuffPlus ])
      .toBe('a');
    expect(map.get(28)![ NaturalGrowthQuadrant.GrowthRate ])
      .toBe('b');
  });
});

describe('NaturalGrowthQuadrantsParser.isValidFormula', () =>
{
  it('treats empty and whitespace-only strings as valid', () =>
  {
    expect(NaturalGrowthQuadrantsParser.isValidFormula(''))
      .toBe(true);
    expect(NaturalGrowthQuadrantsParser.isValidFormula('   '))
      .toBe(true);
  });

  it('accepts typical formula characters', () =>
  {
    expect(NaturalGrowthQuadrantsParser.isValidFormula('a.level * 2 + (b.mhp / 3)'))
      .toBe(true);
  });

  it('rejects characters outside the allowed set', () =>
  {
    expect(NaturalGrowthQuadrantsParser.isValidFormula('1;2'))
      .toBe(false);
    expect(NaturalGrowthQuadrantsParser.isValidFormula('a&b'))
      .toBe(false);
  });
});

describe('NaturalGrowthQuadrantsParser exports', () =>
{
  it('keeps reward long ids aligned with ParameterIdMapper rewards', () =>
  {
    expect([ ...REWARD_LONG_IDS ].sort((
      a,
      b
    ) => a - b))
      .toEqual([ 31, 32, 33 ]);
  });

  it('lists each known long id exactly once in NATURAL_GROWTH_LONG_PARAM_ORDER', () =>
  {
    const knownIds = knownLongParams()
      .map(p => p.longParamId)
      .sort((
        a,
        b
      ) => a - b);
    const orderSorted = [ ...NATURAL_GROWTH_LONG_PARAM_ORDER ].sort((
      a,
      b
    ) => a - b);
    expect(NATURAL_GROWTH_LONG_PARAM_ORDER.length)
      .toBe(knownIds.length);
    expect(orderSorted)
      .toEqual(knownIds);
    expect(new Set(NATURAL_GROWTH_LONG_PARAM_ORDER).size)
      .toBe(knownIds.length);
  });
});
