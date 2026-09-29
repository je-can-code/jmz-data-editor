import { useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import { DoneAll } from '@mui/icons-material';
import { knownGrowthCurveParams, type KnownParameter } from '../../../mappers/ParameterIdMapper.ts';
import { ClassParamRow } from '@presentation/components/classParams/ClassParamRow.tsx';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import { ClassGrowthApplier, type GrowthFormula } from '@services/classes/ClassGrowthApplier.ts';
import type { ClassGrowth } from '@services/classes/ClassGrowthCloner.ts';

type ClassParamRowsProps = {
  /** The class's growth as it stands: its growth-curve formulas, and the levels baked from them. */
  growth: ClassGrowth;
  trueMaxLevel?: number;
  /** Replaces the class's growth, once per click however many rows it applies. */
  onGrowthChange: (growth: ClassGrowth) => void;
};

/**
 * The Parameter Growth card's rows, one per stat, with Apply all beneath them.
 *
 * Whatever is typed into a row is kept here until it is applied, rather than in the row itself, so Apply all
 * can gather every edited row and apply them as one change. The card keys this by class, and again after
 * every clone, so it starts over from the class's own saved formulas whenever the growth under it is replaced.
 */
function ClassParamRows({ growth, trueMaxLevel, onGrowthChange }: ClassParamRowsProps)
{
  // what has been typed into each row since it was last applied, by stat.
  const [ drafts, setDrafts ] = useState<Record<string, string>>({});

  // the stats applied since these rows started over, for their checkmarks.
  const [ appliedKeys, setAppliedKeys ] = useState<Set<string>>(new Set());

  const params = knownGrowthCurveParams();

  /**
   * What a row's input shows: whatever has been typed into it, or else the class's saved formula.
   * @param {KnownParameter} param The row's stat.
   * @returns {string}
   */
  const formulaFor = (param: KnownParameter): string => drafts[ param.key ] ?? GrowthParser.read(growth.note, param);

  // every row typed into since it was last applied, holding something new to apply.
  const editedFormulas: GrowthFormula[] = params
    .map((param) => ({ param, formula: formulaFor(param).trim() }))
    .filter(({ param, formula }) => formula.length > 0 && formula !== GrowthParser.read(growth.note, param));

  /**
   * Applies formulas to the class as one change, then marks their rows applied.
   * @param {GrowthFormula[]} formulas The formulas to apply, one per stat.
   */
  const applyFormulas = (formulas: GrowthFormula[]) =>
  {
    onGrowthChange(ClassGrowthApplier.apply(growth, formulas));

    // an applied row shows the saved formula again, and its checkmark.
    const appliedStats = formulas.map(({ param }) => param.key);
    setDrafts((previous) => Object.fromEntries(Object.entries(previous)
      .filter(([ key ]) => appliedStats.includes(key) === false)));
    setAppliedKeys((previous) => new Set([ ...previous, ...appliedStats ]));
  };

  /**
   * The saved curve a row draws beside its input.
   * @param {KnownParameter} param The row's stat.
   * @returns {number[]}
   */
  const currentValuesFor = (param: KnownParameter): number[] =>
  {
    // a base parameter draws its baked levels.
    if (ClassGrowthApplier.hasBakedLevels(param))
    {
      return growth.params[ param.id ] ?? [];
    }

    // Max Tech has no baked levels, so it draws what its saved formula evaluates to, if it has one.
    const savedFormula = GrowthParser.read(growth.note, param);
    return savedFormula.length > 0
      ? ClassGrowthApplier.bake(savedFormula)
      : [];
  };

  return (
    <Stack spacing={2}>
      {params.map((param) => (
        <ClassParamRow
          key={param.key}
          param={param}
          trueMaxLevel={trueMaxLevel}
          currentValues={currentValuesFor(param)}
          formula={formulaFor(param)}
          applied={appliedKeys.has(param.key)}
          onFormulaChange={(formula) => setDrafts((previous) => ({ ...previous, [ param.key ]: formula }))}
          onApply={() => applyFormulas([ { param, formula: formulaFor(param).trim() } ])}
        />
      ))}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant={'contained'}
          color={'success'}
          startIcon={<DoneAll/>}
          disabled={editedFormulas.length === 0}
          onClick={() => applyFormulas(editedFormulas)}
        >
          {editedFormulas.length === 0
            ? 'Apply all'
            : `Apply all (${editedFormulas.length})`}
        </Button>
      </Box>
    </Stack>
  );
}

export { ClassParamRows };
