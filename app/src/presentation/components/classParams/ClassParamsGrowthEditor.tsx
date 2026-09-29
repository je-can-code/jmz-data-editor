import { useState } from 'react';
import { Stack, Typography } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { useLevelConfig } from '@presentation/context/resources/level.context.tsx';
import { ClassParamRows } from '@presentation/components/classParams/ClassParamRows.tsx';
import {
  type ClassGrowthSource,
  ClassGrowthCloneControl,
} from '@presentation/components/classParams/ClassGrowthCloneControl.tsx';
import { type ClassGrowth, ClassGrowthCloner } from '@services/classes/ClassGrowthCloner.ts';

type ClassParamsGrowthEditorProps = {
  /**
   * The id of the class being edited. Every row belongs to it, so switching classes starts every row over
   * from that class's own saved formulas.
   */
  classId: number;
  /** The class's growth as it stands: its growth-curve formulas, and the levels baked from them. */
  growth: ClassGrowth;
  /** Every class in the database, any of which the class being edited can clone its growth from. */
  cloneSources: ClassGrowthSource[];
  /** Replaces the class's growth, once per Apply, Apply all or Clone. */
  onGrowthChange: (growth: ClassGrowth) => void;
};

/**
 * The Classes board's Parameter Growth card: one row per base stat (MHP/MMP/ATK/DEF/MAT/MDF/AGI/LUK) plus
 * MTP, each a formula that generates and overwrites `params[paramId]` for levels 1-99 (MTP excepted — it has
 * no `params[]` slot). Applying a formula also persists it as a `<paramGrowthCurve:[formula]>` note tag, read
 * by J-LevelMaster at runtime to derive growth past what's baked into the database — beyond level 99 for the
 * 8 base params, or the entire curve for MTP since it has no per-level array to defer to.
 *
 * Above the rows, another class's growth can be cloned in wholesale; beneath them, Apply all applies every
 * edited row at once. Pulls `trueMaxLevel` from {@link useLevelConfig} so each row's graph can preview
 * J-LevelMaster's actual beyond-99 runtime extrapolation before anything gets applied.
 */
function ClassParamsGrowthEditor({ classId, growth, cloneSources, onGrowthChange }: ClassParamsGrowthEditorProps)
{
  const { levelConfig } = useLevelConfig();

  // how many clones have landed, which is part of the rows' key alongside the class: a clone replaces every
  // formula under the rows at once, and the rows only start from the saved formulas when they mount.
  const [ cloneCount, setCloneCount ] = useState(0);

  /**
   * Clones another class's growth onto this one, then starts every row over from the cloned formulas.
   * @param {ClassGrowthSource} source The class being cloned from.
   */
  const handleClone = (source: ClassGrowthSource) =>
  {
    onGrowthChange(ClassGrowthCloner.clone(growth, source));
    setCloneCount((count) => count + 1);
  };

  return (
    <BoardSectionCard
      title={'Parameter Growth'}
      subtitle={'Type a formula per stat, preview it, then Apply to overwrite levels 1-99 and save the formula as a growth-curve tag for beyond-99 runtime use.'}
      collapsible
      defaultExpanded={false}
    >
      <Stack spacing={2}>
        <ClassGrowthCloneControl
          classId={classId}
          sources={cloneSources}
          onClone={handleClone}
        />

        <ClassParamRows
          key={`${classId}:${cloneCount}`}
          growth={growth}
          trueMaxLevel={levelConfig?.trueMaxLevel}
          onGrowthChange={onGrowthChange}
        />
      </Stack>

      {growth.params.length === 0 && (
        <Typography variant={'caption'} color={'text.secondary'} sx={{ mt: 1, display: 'block' }}>
          This class has no params rows yet — applying a formula will create them.
        </Typography>
      )}
    </BoardSectionCard>
  );
}

export { ClassParamsGrowthEditor };
