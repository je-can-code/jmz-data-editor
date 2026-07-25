import { useMemo } from 'react';
import { Autocomplete, Button, Grid, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import RPG_ClassLearning = Rmmz.Data.RPG_ClassLearning;

type ClassLearningsEditorProps = {
  learnings: RPG_ClassLearning[];
  onChange: (learnings: RPG_ClassLearning[]) => void;
  /**
   * Controlled expanded state for the section card, so a host board can persist it across tab
   * switches / re-selections instead of it resetting on every remount. Omit for uncontrolled
   * (defaults expanded).
   */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

/**
 * Editor for the native RMMZ `RPG_Class.learnings` array — the vanilla "learn skill X at level Y"
 * table, distinct from the note-tag-driven aptitude system ({@link AptitudeTeachingsEditor}).
 */
function ClassLearningsEditor({ learnings, onChange, expanded, onExpandedChange }: ClassLearningsEditorProps)
{
  const { skills, loading: skillsLoading } = useSkills();

  const skillOptions = useMemo(
    () => [ ...skills ].sort((a, b) => a.id - b.id),
    [ skills ],
  );

  const handleMove = (
    index: number,
    delta: number
  ) =>
  {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= learnings.length)
    {
      return;
    }
    const copy = [ ...learnings ];
    const [ row ] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, row);
    onChange(copy);
  };

  const handleAdd = () =>
  {
    const defaultSkillId = skillOptions[ 0 ]?.id ?? 1;
    onChange([ ...learnings, { level: 1, skillId: defaultSkillId, note: '' } ]);
  };

  const handleDelete = (originalIndex: number) =>
  {
    onChange(learnings.toSpliced(originalIndex, 1));
  };

  const patchLearning = (
    originalIndex: number,
    partial: Partial<RPG_ClassLearning>
  ) =>
  {
    onChange(learnings.map((learning, i) => i === originalIndex
      ? { ...learning, ...partial }
      : learning));
  };

  const renderRow = (
    learning: RPG_ClassLearning,
    index: number
  ) =>
  {
    const selectedSkill = skillOptions.find((s) => s.id === learning.skillId) ?? null;

    return (
      <Grid container spacing={1.5} key={index} alignItems={'center'} sx={{ mb: 1.5 }}>
        <Grid size={'auto'}>
          <Stack direction={'row'} spacing={0}>
            <Tooltip title={'Move up'}>
              <span>
                <IconButton size={'small'} disabled={index === 0} onClick={() => handleMove(index, -1)}>
                  <ArrowUpward fontSize={'inherit'}/>
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={'Move down'}>
              <span>
                <IconButton size={'small'} disabled={index >= learnings.length - 1} onClick={() => handleMove(index, 1)}>
                  <ArrowDownward fontSize={'inherit'}/>
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Grid>
        <Grid size={2}>
          <TextField
            size={'small'}
            type={'number'}
            label={'Level'}
            fullWidth
            value={learning.level}
            onChange={(e) => patchLearning(index, { level: parseInt(e.target.value, 10) || 0 })}
          />
        </Grid>
        <Grid size={4}>
          <Autocomplete
            size={'small'}
            options={skillOptions}
            getOptionKey={(o) => o?.id ?? 'no-key'}
            getOptionLabel={(o) => o
              ? `${o.id}: ${o.name}`
              : ''}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            value={selectedSkill}
            onChange={(_, o) => patchLearning(index, { skillId: o?.id ?? 0 })}
            renderInput={(params) => <TextField {...params} label={'Skill'}/>}
          />
        </Grid>
        <Grid size={"grow"}>
          <TextField
            size={'small'}
            label={'Note'}
            fullWidth
            value={learning.note}
            onChange={(e) => patchLearning(index, { note: e.target.value })}
          />
        </Grid>
        <Grid size={'auto'}>
          <IconButton onClick={() => handleDelete(index)}>
            <Delete/>
          </IconButton>
        </Grid>
      </Grid>
    );
  };

  if (skillsLoading)
  {
    return <Typography>Loading skills...</Typography>;
  }

  return (
    <BoardSectionCard
      title={'Learnings'}
      subtitle={learnings.length === 0
        ? 'No skills learned by level'
        : `${learnings.length} learning${learnings.length === 1
          ? ''
          : 's'}`}
      collapsible
      defaultExpanded
      expanded={expanded}
      onExpandedChange={onExpandedChange}
    >
      <Stack spacing={1}>
        {learnings.map(renderRow)}
        <Button startIcon={<Add/>} onClick={handleAdd} variant={'outlined'} sx={{ alignSelf: 'flex-start' }}>
          Add Learning
        </Button>
      </Stack>
    </BoardSectionCard>
  );
}

export type { ClassLearningsEditorProps };
export { ClassLearningsEditor };
