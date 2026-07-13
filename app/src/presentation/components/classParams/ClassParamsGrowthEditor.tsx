import { useState } from 'react';
import { Stack, Typography } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { useLevelConfig } from '@presentation/context/resources/level.context.tsx';
import { knownGrowthCurveParams } from '../../../mappers/ParameterIdMapper.ts';
import { ClassParamRow } from '@presentation/components/classParams/ClassParamRow.tsx';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';

type ClassParamsGrowthEditorProps = {
  params: number[][];
  note: string;
  onParamsChange: (paramId: number, values: number[]) => void;
  onNoteChange: (note: string) => void;
};

/**
 * The Classes board's "Parameters" tab: one row per base stat (MHP/MMP/ATK/DEF/MAT/MDF/AGI/LUK) plus
 * MTP, each a formula that generates and overwrites `params[paramId]` for levels 1-99 (MTP excepted —
 * it has no `params[]` slot, see below). Applying a formula also persists it as a
 * `<paramGrowthCurve:[formula]>` note tag, read by J-LevelMaster (base params) and J-Base (MTP) at
 * runtime to derive growth past what's baked into the database — beyond level 99 for the 8 base params,
 * or the entire curve for MTP since it has no per-level array to defer to for levels 1-99 either.
 *
 * Pulls `trueMaxLevel` from {@link useLevelConfig} so each row's graph can preview J-LevelMaster's actual
 * beyond-99 runtime extrapolation before anything gets applied.
 */
function ClassParamsGrowthEditor({ params, note, onParamsChange, onNoteChange }: ClassParamsGrowthEditorProps)
{
  const { levelConfig } = useLevelConfig();
  const [ appliedParamIds, setAppliedParamIds ] = useState<Set<number>>(new Set());

  const handleApplyValues = (paramId: number, values: number[]) =>
  {
    onParamsChange(paramId, values);
    setAppliedParamIds((prev) => new Set(prev).add(paramId));
  };

  return (
    <BoardSectionCard
      title={'Parameter Growth'}
      subtitle={'Type a formula per stat, preview it, then Apply to overwrite levels 1-99 and save the formula as a growth-curve tag for beyond-99 runtime use.'}
      collapsible
      defaultExpanded={false}
    >
      <Stack spacing={2}>
        {knownGrowthCurveParams().map((param) =>
        {
          // MTP has no params[paramId] slot in Classes.json — it's a note-tag-only stat (J-Base/J-
          // NaturalGrowth), so its "currently saved" curve is whatever the saved formula evaluates to,
          // not baked array numbers.
          const hasParamsArray = param.key !== 'mtp';
          const savedFormula = GrowthParser.read(note, param);

          let currentValues: number[];
          if (hasParamsArray)
          {
            currentValues = params[ param.id ] ?? [];
          }
          else if (savedFormula)
          {
            const points = GrowthParser.generateDataPoints(savedFormula, 99, 1);
            currentValues = [];
            for (const point of points)
            {
              if (point.level >= 1 && point.level <= 99)
              {
                currentValues[ point.level ] = Math.round(point.value);
              }
            }
          }
          else
          {
            currentValues = [];
          }

          return (
            <ClassParamRow
              key={param.key}
              param={param}
              applied={appliedParamIds.has(param.id)}
              trueMaxLevel={levelConfig?.trueMaxLevel}
              currentValues={currentValues}
              savedFormula={savedFormula}
              hasParamsArray={hasParamsArray}
              onApplyValues={(values) => handleApplyValues(param.id, values)}
              onSaveFormula={(formula) => onNoteChange(GrowthParser.write(note, param, formula))}
            />
          );
        })}
      </Stack>

      {params.length === 0 && (
        <Typography variant={'caption'} color={'text.secondary'} sx={{ mt: 1, display: 'block' }}>
          This class has no params rows yet — applying a formula will create them.
        </Typography>
      )}
    </BoardSectionCard>
  );
}

export { ClassParamsGrowthEditor };
