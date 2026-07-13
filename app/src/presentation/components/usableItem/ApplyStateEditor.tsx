import React, { type ChangeEvent } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DeleteOutline } from '@mui/icons-material';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { type RPG_ApplyStateRow } from '@services/parsers/ApplyStateParser.ts';
import { type IdLabelRow } from './UsableEffectsEditor.tsx';

type ApplyStateEditorProps = {
  value: RPG_ApplyStateRow[];
  onChange: (next: RPG_ApplyStateRow[]) => void;
  stateRows: IdLabelRow[];
};

const APPLY_STATE_NUMBER_INPUT_PX = 128;

const DEFAULT_ROW: RPG_ApplyStateRow = {
  stateId: 0,
  chance: 100,
  duration: null,
  stacks: null,
  thisSkillOnly: false,
};

function replaceAt(
  list: RPG_ApplyStateRow[],
  index: number,
  row: RPG_ApplyStateRow
): RPG_ApplyStateRow[]
{
  return list.map((
    item,
    i
  ) => (i === index
    ? { ...row }
    : item));
}

/**
 * Dense table editor for J-Extend {@code <applyState:[...]>} / {@code <thisApplyState:[...]>} rows: each row
 * applies a state on hit with its own chance, and optionally overrides that state's duration/stack count.
 */
function ApplyStateEditor(props: ApplyStateEditorProps)
{
  const {
    value,
    onChange,
    stateRows,
  } = props;

  const handleAdd = () =>
  {
    onChange([ ...value, { ...DEFAULT_ROW } ]);
  };

  const handleRemove = (index: number) =>
  {
    onChange(value.filter((
      _,
      i
    ) => i !== index));
  };

  const patchRow = (
    index: number,
    patch: Partial<RPG_ApplyStateRow>
  ) =>
  {
    const cur = value[ index ];
    if (!cur)
    {
      return;
    }
    onChange(replaceAt(value, index, {
      ...cur,
      ...patch,
    }));
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant={'caption'} color={'text.secondary'}>
        Applies a state on hit, independent of the vanilla Effects list. Duration/stacks left blank inherit the
        target state&apos;s own database defaults. &quot;This skill only&quot; reads just this skill&apos;s note
        ({'<thisApplyState>'}); unchecked reads any of the caster&apos;s notes ({'<applyState>'}) — skill, equips,
        states, class, or enemy.
      </Typography>

      <Button
        variant={'outlined'}
        size={'small'}
        sx={{ alignSelf: 'flex-start' }}
        onClick={handleAdd}
      >
        Add apply-state
      </Button>

      {value.length === 0
        ? (
          <Typography variant={'body2'} color={'text.secondary'}>
            No on-hit state applications configured.
          </Typography>
        )
        : (
          <Stack spacing={1}>
            {value.map((
              row,
              index
            ) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1.5,
                  alignItems: 'center',
                  pb: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:last-of-type': { borderBottom: 0 },
                }}
              >
                <Autocomplete
                  size={'small'}
                  sx={{ minWidth: 220 }}
                  options={stateRows}
                  value={
                    stateRows.find((r) => r.id === row.stateId) ?? {
                      id: row.stateId,
                      label: `${row.stateId}: (unset)`,
                    }
                  }
                  onChange={(
                    _e,
                    opt
                  ) =>
                  {
                    if (opt === null)
                    {
                      return;
                    }
                    patchRow(index, { stateId: opt.id });
                  }}
                  getOptionLabel={(o) => o.label}
                  isOptionEqualToValue={(
                    a,
                    b
                  ) => a.id === b.id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      margin={'dense'}
                      label={'State'}
                    />
                  )}
                />

                <NumberInputWithLabel
                  label={'Chance %'}
                  variant={'outlined'}
                  size={'small'}
                  value={row.chance}
                  sx={{ width: APPLY_STATE_NUMBER_INPUT_PX }}
                  htmlInput={{
                    min: 0,
                    max: 100,
                    step: 1,
                  }}
                  onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n))
                    {
                      return;
                    }
                    patchRow(index, { chance: Math.min(100, Math.max(0, Math.trunc(n))) });
                  }}
                />

                <TextField
                  type={'number'}
                  variant={'outlined'}
                  size={'small'}
                  label={'Duration (frames)'}
                  placeholder={'Inherit'}
                  value={row.duration ?? ''}
                  sx={{ width: APPLY_STATE_NUMBER_INPUT_PX }}
                  slotProps={{ htmlInput: { min: 1, step: 1 } }}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  {
                    const raw = e.target.value.trim();
                    if (raw === '')
                    {
                      patchRow(index, {
                        duration: null,
                        stacks: null,
                      });
                      return;
                    }
                    const n = Number(raw);
                    if (!Number.isFinite(n))
                    {
                      return;
                    }
                    patchRow(index, { duration: Math.max(1, Math.trunc(n)) });
                  }}
                />

                <TextField
                  type={'number'}
                  variant={'outlined'}
                  size={'small'}
                  label={'Stacks'}
                  placeholder={'Inherit'}
                  disabled={row.duration === null}
                  value={row.stacks ?? ''}
                  sx={{ width: APPLY_STATE_NUMBER_INPUT_PX }}
                  slotProps={{ htmlInput: { min: 1, step: 1 } }}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  {
                    const raw = e.target.value.trim();
                    if (raw === '')
                    {
                      patchRow(index, { stacks: null });
                      return;
                    }
                    const n = Number(raw);
                    if (!Number.isFinite(n))
                    {
                      return;
                    }
                    patchRow(index, { stacks: Math.max(1, Math.trunc(n)) });
                  }}
                />

                <FormControlLabel
                  control={(
                    <Checkbox
                      size={'small'}
                      checked={row.thisSkillOnly}
                      onChange={(
                        _e,
                        checked
                      ) =>
                      {
                        patchRow(index, { thisSkillOnly: checked });
                      }}
                    />
                  )}
                  label={'This skill only'}
                />

                <Tooltip title={'Remove'}>
                  <IconButton
                    size={'small'}
                    color={'error'}
                    onClick={() =>
                    {
                      handleRemove(index);
                    }}
                  >
                    <DeleteOutline fontSize={'small'}/>
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Stack>
        )}
    </Stack>
  );
}

export { ApplyStateEditor };
