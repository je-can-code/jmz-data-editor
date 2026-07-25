import { useMemo } from 'react';
import { Autocomplete, Button, Grid, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import {
  AptitudeTeachableParser,
  type AptitudeTeachingDomain,
  type AptitudeTeachingRow,
} from '@services/parsers/AptitudeTeachableParser.ts';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { weaponTypeAutocompleteOptions, weaponTypeOptionForValue } from '@core/enums/RmmzWeaponType.ts';
import { skillStypeAutocompleteOptions, skillStypeOptionForValue } from '@core/enums/RmmzSkillStype.ts';
import { SystemService } from '@services/SystemService.ts';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';

type AptitudeTeachingsEditorProps = {
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

type DomainOption = {
  value: AptitudeTeachingDomain | 'none';
  label: string;
};

const DOMAIN_OPTIONS: DomainOption[] = [
  { value: 'none', label: 'None (shared AP pool)' },
  { value: 'element', label: 'Element' },
  { value: 'weapontype', label: 'Weapon Type' },
  { value: 'skilltype', label: 'Skill Type' },
];

/**
 * Builds Autocomplete rows for elements, mirroring the shape of
 * {@link weaponTypeAutocompleteOptions}/{@link skillStypeAutocompleteOptions}, since no
 * dedicated element-option helper exists yet.
 */
function elementAutocompleteOptions(names: readonly string[] | undefined): { value: number; label: string }[]
{
  const list = names === undefined || names.length === 0
    ? [ 'Normal' ]
    : [ ...names ];
  return list.map((
    label,
    index
  ) => ({
    value: index,
    label: label.trim() === ''
      ? `Element ${index}`
      : label,
  }));
}

/**
 * Shared, reusable editor for the `<aptitude:>`/`<aptitudeTyped:>` note tags (`J-Aptitude` /
 * `J-Aptitude-Typed`). Any database object's note can host these tags — drop this component into
 * any board's detail form, wired to that object's `note`/`onNoteChange`.
 */
function AptitudeTeachingsEditor({ note, onNoteChange, expanded, onExpandedChange }: AptitudeTeachingsEditorProps)
{
  const { skills, loading: skillsLoading } = useSkills();

  const teachings = useMemo(() => AptitudeTeachableParser.read(note), [ note ]);

  const skillOptions = useMemo(
    () => [ ...skills ].sort((a, b) => a.id - b.id),
    [ skills ],
  );

  const elementOptions = useMemo(
    () => elementAutocompleteOptions(SystemService.elements),
    [],
  );

  const commit = (next: AptitudeTeachingRow[]) =>
  {
    onNoteChange(AptitudeTeachableParser.write(note, next));
  };

  const handleAdd = () =>
  {
    const defaultSkillId = skillOptions[ 0 ]?.id ?? 1;
    commit([ ...teachings, { skillId: defaultSkillId, requiredAp: 100 } ]);
  };

  const handleDelete = (index: number) =>
  {
    commit(teachings.toSpliced(index, 1));
  };

  const handleMove = (
    index: number,
    delta: number
  ) =>
  {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= teachings.length)
    {
      return;
    }
    const copy = [ ...teachings ];
    const [ row ] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, row);
    commit(copy);
  };

  const patchRow = (
    index: number,
    partial: Partial<AptitudeTeachingRow>
  ) =>
  {
    const next = teachings.map((row, i) => i === index
      ? { ...row, ...partial }
      : row);
    commit(next);
  };

  const handleDomainChange = (
    index: number,
    domain: AptitudeTeachingDomain | 'none'
  ) =>
  {
    if (domain === 'none')
    {
      const next = teachings.map((row, i) =>
      {
        if (i !== index)
        {
          return row;
        }
        const { domain: _domain, domainId: _domainId, ...rest } = row;
        return rest;
      });
      commit(next);
      return;
    }

    patchRow(index, { domain, domainId: 0 });
  };

  const renderDomainIdField = (
    row: AptitudeTeachingRow,
    index: number
  ) =>
  {
    if (row.domain === undefined)
    {
      return null;
    }

    if (row.domain === 'element')
    {
      const value = elementOptions.find((o) => o.value === row.domainId) ?? elementOptions[ 0 ];
      return (
        <Autocomplete
          size={'small'}
          options={elementOptions}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.value === b.value}
          value={value}
          onChange={(_, o) => patchRow(index, { domainId: o?.value ?? 0 })}
          renderInput={(params) => <TextField {...params} label={'Element'}/>}
        />
      );
    }

    if (row.domain === 'weapontype')
    {
      const options = weaponTypeAutocompleteOptions(row.domainId ?? 0, SystemService.weaponTypes);
      const value = weaponTypeOptionForValue(row.domainId ?? 0, SystemService.weaponTypes);
      return (
        <Autocomplete
          size={'small'}
          options={options}
          groupBy={(o) => o.group}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.value === b.value}
          value={value}
          onChange={(_, o) => patchRow(index, { domainId: o?.value ?? 0 })}
          renderInput={(params) => <TextField {...params} label={'Weapon Type'}/>}
        />
      );
    }

    const options = skillStypeAutocompleteOptions(row.domainId ?? 0, SystemService.skillTypes);
    const value = skillStypeOptionForValue(row.domainId ?? 0, SystemService.skillTypes);
    return (
      <Autocomplete
        size={'small'}
        options={options}
        groupBy={(o) => o.group}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.value === b.value}
        value={value}
        onChange={(_, o) => patchRow(index, { domainId: o?.value ?? 0 })}
        renderInput={(params) => <TextField {...params} label={'Skill Type'}/>}
      />
    );
  };

  const renderRow = (
    row: AptitudeTeachingRow,
    index: number
  ) =>
  {
    const selectedSkill = skillOptions.find((s) => s.id === row.skillId) ?? null;
    const selectedDomainOption = DOMAIN_OPTIONS.find((o) => o.value === (row.domain ?? 'none'))
      ?? DOMAIN_OPTIONS[ 0 ];

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
                <IconButton size={'small'} disabled={index >= teachings.length - 1} onClick={() => handleMove(index, 1)}>
                  <ArrowDownward fontSize={'inherit'}/>
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Grid>
        <Grid size={3.5}>
          <Autocomplete
            size={'small'}
            options={skillOptions}
            getOptionKey={(o) => o?.id ?? 'no-key'}
            getOptionLabel={(o) => o
              ? `${o.id}: ${o.name}`
              : ''}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            value={selectedSkill}
            onChange={(_, o) => patchRow(index, { skillId: o?.id ?? 0 })}
            renderInput={(params) => <TextField {...params} label={'Skill'}/>}
          />
        </Grid>
        <Grid size={1.5}>
          <TextField
            size={'small'}
            type={'number'}
            label={'Required AP'}
            fullWidth
            value={row.requiredAp}
            onChange={(e) => patchRow(index, { requiredAp: parseInt(e.target.value, 10) || 0 })}
          />
        </Grid>
        <Grid size={2.5}>
          <Autocomplete
            size={'small'}
            options={DOMAIN_OPTIONS}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.value === b.value}
            value={selectedDomainOption}
            disableClearable
            onChange={(_, o) => handleDomainChange(index, o.value)}
            renderInput={(params) => <TextField {...params} label={'AP Type'}/>}
          />
        </Grid>
        <Grid size={2.5}>
          {renderDomainIdField(row, index)}
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
      title={'Aptitude Learnings'}
      subtitle={teachings.length === 0
        ? 'No aptitude learnings configured'
        : `${teachings.length} learning${teachings.length === 1
          ? ''
          : 's'}`}
      collapsible
      defaultExpanded={false}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
    >
      <Stack spacing={1}>
        {teachings.map(renderRow)}
        <Button startIcon={<Add/>} onClick={handleAdd} variant={'outlined'} sx={{ alignSelf: 'flex-start' }}>
          Add Learning
        </Button>
      </Stack>
    </BoardSectionCard>
  );
}

export type { AptitudeTeachingsEditorProps };
export { AptitudeTeachingsEditor };
