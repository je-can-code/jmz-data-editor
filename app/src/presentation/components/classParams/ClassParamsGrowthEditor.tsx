import { useState } from 'react';
import { Stack, Typography } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { useLevelConfig } from '@presentation/context/resources/level.context.tsx';
import { knownBaseParams } from '../../../mappers/ParameterIdMapper.ts';
import { ClassParamRow } from '@presentation/components/classParams/ClassParamRow.tsx';

type ClassParamsGrowthEditorProps = {
  params: number[][];
  onParamsChange: (paramId: number, values: number[]) => void;
};

/**
 * The Classes board's "Parameters" tab: one row per base stat (MHP/MMP/ATK/DEF/MAT/MDF/AGI/LUK), each a
 * scratch formula that generates and overwrites `params[paramId]` for levels 1-99. Deliberately one-shot
 * — the formula itself is never stored, only the resulting numbers (matching how the raw `params` array
 * has always worked; there's no note-tag-backed provenance to round-trip here, unlike Natural Growth).
 *
 * Pulls `trueMaxLevel` from {@link useLevelConfig} so each row's graph can preview J-LevelMaster's actual
 * beyond-99 runtime extrapolation before anything gets applied.
 */
function ClassParamsGrowthEditor({ params, onParamsChange }: ClassParamsGrowthEditorProps)
{
  const { levelConfig } = useLevelConfig();
  const [ appliedParamIds, setAppliedParamIds ] = useState<Set<number>>(new Set());

  const handleApply = (paramId: number, values: number[]) =>
  {
    onParamsChange(paramId, values);
    setAppliedParamIds((prev) => new Set(prev).add(paramId));
  };

  return (
    <BoardSectionCard
      title={'Parameter Growth'}
      subtitle={'Type a formula per stat, preview it, then Apply to overwrite levels 1-99. Formulas are scratch input only — they are not saved.'}
      collapsible
      defaultExpanded={false}
    >
      <Stack spacing={2}>
        {knownBaseParams().map((param) => (
          <ClassParamRow
            key={param.id}
            param={param}
            applied={appliedParamIds.has(param.id)}
            trueMaxLevel={levelConfig?.trueMaxLevel}
            onApply={(values) => handleApply(param.id, values)}
          />
        ))}
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
