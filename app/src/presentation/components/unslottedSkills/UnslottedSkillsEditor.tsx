import { useMemo } from 'react';
import { Autocomplete, Button, Grid, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { UnslottedSkillsParser } from '@services/parsers/UnslottedSkillsParser.ts';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';

type UnslottedSkillsEditorProps = {
  note: string;
  onNoteChange: (note: string) => void;
  /**
   * Controlled expanded state for the section card, so a host board can persist it across tab
   * switches / re-selections instead of it resetting on every remount. Omit for uncontrolled
   * (defaults collapsed).
   */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

/**
 * Shared, reusable editor for the `<unslottedSkills:[...]>` note tag (`J-SkillSlots`). Any database
 * object's note can host this tag- drop this component into any board's detail form, wired to that
 * object's `note`/`onNoteChange`, same as {@link AptitudeTeachingsEditor}. Currently used on the
 * Classes board; the weapons/armor boards can adopt it later with no changes needed.
 *
 * Listed skills are exempted from J-SkillSlots's slot requirement for whatever battler this note
 * source applies to, without making the skill globally unslotted for every other battler that
 * has to learn-then-equip it through the normal pipeline.
 */
function UnslottedSkillsEditor({ note, onNoteChange, expanded, onExpandedChange }: UnslottedSkillsEditorProps)
{
  const { skills, loading: skillsLoading } = useSkills();

  const skillIds = useMemo(() => UnslottedSkillsParser.read(note), [ note ]);

  const skillOptions = useMemo(
    () => [ ...skills ].sort((a, b) => a.id - b.id),
    [ skills ],
  );

  const commit = (next: number[]) =>
  {
    onNoteChange(UnslottedSkillsParser.write(note, next));
  };

  const handleAdd = () =>
  {
    const defaultSkillId = skillOptions[ 0 ]?.id ?? 1;
    commit([ ...skillIds, defaultSkillId ]);
  };

  const handleDelete = (index: number) =>
  {
    commit(skillIds.toSpliced(index, 1));
  };

  const handleMove = (
    index: number,
    delta: number
  ) =>
  {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= skillIds.length)
    {
      return;
    }
    const copy = [ ...skillIds ];
    const [ id ] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, id);
    commit(copy);
  };

  const patchRow = (
    index: number,
    skillId: number
  ) =>
  {
    const next = skillIds.map((id, i) => i === index
      ? skillId
      : id);
    commit(next);
  };

  const renderRow = (
    skillId: number,
    index: number
  ) =>
  {
    const selectedSkill = skillOptions.find((s) => s.id === skillId) ?? null;

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
                <IconButton size={'small'} disabled={index >= skillIds.length - 1} onClick={() => handleMove(index, 1)}>
                  <ArrowDownward fontSize={'inherit'}/>
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Grid>
        <Grid size={5}>
          <Autocomplete
            size={'small'}
            options={skillOptions}
            getOptionKey={(o) => o?.id ?? 'no-key'}
            getOptionLabel={(o) => o
              ? `${o.id}: ${o.name}`
              : ''}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            value={selectedSkill}
            onChange={(_, o) => patchRow(index, o?.id ?? 0)}
            renderInput={(params) => <TextField {...params} label={'Skill'}/>}
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
      title={'Unslotted Skills'}
      subtitle={skillIds.length === 0
        ? 'No unslotted skills configured'
        : `${skillIds.length} skill${skillIds.length === 1
          ? ''
          : 's'}`}
      collapsible
      defaultExpanded={false}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
    >
      <Typography variant={'caption'} color={'text.secondary'} sx={{
        display: 'block',
        mb: 1.5
      }}>
        Skills listed here are always active for this class/battler without spending an SKS slot,
        even though the skill still costs a slot for anyone else who has to learn-then-equip it.
      </Typography>
      <Stack spacing={1}>
        {skillIds.map(renderRow)}
        <Button startIcon={<Add/>} onClick={handleAdd} variant={'outlined'} sx={{ alignSelf: 'flex-start' }}>
          Add Unslotted Skill
        </Button>
      </Stack>
    </BoardSectionCard>
  );
}

export type { UnslottedSkillsEditorProps };
export { UnslottedSkillsEditor };
