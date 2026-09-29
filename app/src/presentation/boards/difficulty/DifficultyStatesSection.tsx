import { useMemo } from 'react';
import { Autocomplete, Stack, TextField } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { type IdLabelRow } from '@presentation/components/usableItem/UsableEffectsEditor.tsx';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { NO_STATE } from '@core/domain/valueObjects/difficulty-config.ts';
import type { DifficultyLayer } from '@core/domain/valueObjects/difficulty-config.ts';

type DifficultyStatesSectionProps = {
  layer: DifficultyLayer;
  onChange: (partial: Partial<DifficultyLayer>) => void;
};

/**
 * Finds the picker row for a stored state id, or none when the layer names no state.
 * An id the database no longer holds still gets a row, so the picker shows what the file says rather
 * than silently reading as empty.
 * @param {number} stateId The stored state id, 0 when the layer grants that side nothing.
 * @param {IdLabelRow[]} rows The picker rows for every state in the database.
 * @returns {IdLabelRow|null} The row to show as selected.
 */
const rowForStateId = (stateId: number, rows: IdLabelRow[]): IdLabelRow | null =>
{
  if (stateId === NO_STATE)
  {
    return null;
  }

  const found = rows.find(row => row.id === stateId);
  if (found !== undefined)
  {
    return found;
  }

  return {
    id: stateId,
    label: `#${stateId} (not in database)`,
  };
};

/**
 * The two states a difficulty layer hands out while the player keeps it enabled: one every party
 * member carries and one every enemy carries. Everything the layer does lives on those two states.
 * @param {DifficultyStatesSectionProps} props The selected layer and how to change it.
 * @returns {JSX.Element}
 */
const DifficultyStatesSection = ({ layer, onChange }: DifficultyStatesSectionProps) =>
{
  const { states } = useStates();

  // offer every state in the database, by id and name.
  const stateRows = useMemo((): IdLabelRow[] =>
  {
    return states.map(state => (
      {
        id: state.id,
        label: `${state.id}: ${state.name}`,
      }));
  }, [ states ]);

  return (
    <BoardSectionCard title={'Difficulty states'} subtitle={'Carried by everyone while this layer is on'}>
      <Stack spacing={2}>
        <Autocomplete<IdLabelRow, false, false, false>
          fullWidth
          size={'small'}
          options={stateRows}
          getOptionLabel={option => option.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          value={rowForStateId(layer.actorStateId, stateRows)}
          onChange={(_event, option) =>
          {
            onChange({ actorStateId: option === null ? NO_STATE : option.id });
          }}
          renderInput={params => (
            <TextField
              {...params}
              variant={'outlined'}
              label={'Party state'}
              placeholder={'None'}
              helperText={'Every party member carries this state.'}
            />
          )}
        />
        <Autocomplete<IdLabelRow, false, false, false>
          fullWidth
          size={'small'}
          options={stateRows}
          getOptionLabel={option => option.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          value={rowForStateId(layer.enemyStateId, stateRows)}
          onChange={(_event, option) =>
          {
            onChange({ enemyStateId: option === null ? NO_STATE : option.id });
          }}
          renderInput={params => (
            <TextField
              {...params}
              variant={'outlined'}
              label={'Enemy state'}
              placeholder={'None'}
              helperText={'Every enemy carries this state.'}
            />
          )}
        />
      </Stack>
    </BoardSectionCard>
  );
};

export default DifficultyStatesSection;
