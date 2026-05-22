import React, { useMemo } from 'react';
import {
  Autocomplete,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';

import { useItems } from '@presentation/context/resources/items.context.tsx';
import { useWeapons } from '@presentation/context/resources/weapons.context.tsx';
import { useArmors } from '@presentation/context/resources/armors.context.tsx';
import { useEnemies } from '@presentation/context/resources/enemies.context.tsx';
import { useQuests } from '@presentation/context/resources/quests.context.tsx';
import { OmniObjectiveType } from '@core/enums/OmniObjectiveType.ts';
import OmniObjectiveFetchType from './OmniObjectiveFetchType.ts';
import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import OmniFulfillmentData = Questopedia.OmniFulfillmentData;
import IndiscriminateData = Questopedia.IndiscriminateData;
import DestinationData = Questopedia.DestinationData;
import FetchData = Questopedia.FetchData;
import SlayData = Questopedia.SlayData;
import QuestData = Questopedia.QuestData;
import RPG_Base = Rmmz.Base.RPG_Base;

type ObjectiveDataProps = {
  fulfillmentData: OmniFulfillmentData | undefined;
  fulfillmentType: OmniObjectiveType | undefined;
  updateIndiscriminateFunc: (updatedIndiscriminate: IndiscriminateData) => void;
  updateDestinationFunc: (updatedDestination: DestinationData) => void;
  updateFetchFunc: (updatedFetch: FetchData) => void;
  updateSlayFunc: (updatedSlay: SlayData) => void;
  updateQuestFunc: (updatedQuest: QuestData) => void;
};

const FETCH_TYPE_LABELS: Record<OmniObjectiveFetchType, string> = {
  [OmniObjectiveFetchType.Unset]:  'Unset',
  [OmniObjectiveFetchType.Item]:   'Item',
  [OmniObjectiveFetchType.Weapon]: 'Weapon',
  [OmniObjectiveFetchType.Armor]:  'Armor',
};

const ObjectiveFulfillmentData = (props: ObjectiveDataProps) =>
{
  const {
    fulfillmentData,
    fulfillmentType,
    updateIndiscriminateFunc,
    updateDestinationFunc,
    updateFetchFunc,
    updateSlayFunc,
    updateQuestFunc,
  } = props;

  const { data: items }   = useItems();
  const { data: weapons } = useWeapons();
  const { data: armors }  = useArmors();
  const { data: enemies } = useEnemies();
  const { quests }        = useQuests();

  const dataSource = useMemo<RPG_BaseDomainModel<RPG_Base>[]>(() =>
  {
    if (!fulfillmentData) return [];
    switch (fulfillmentData.fetch.type)
    {
      case OmniObjectiveFetchType.Item:   return items;
      case OmniObjectiveFetchType.Weapon: return weapons;
      case OmniObjectiveFetchType.Armor:  return armors;
      default:                            return [];
    }
  }, [ fulfillmentData?.fetch.type, items, weapons, armors ]);

  if (!fulfillmentData || !fulfillmentType)
  {
    return null;
  }

  switch (fulfillmentType)
  {
    case OmniObjectiveType.Indiscriminate:
      return (
        <TextField
          variant={'outlined'}
          label={'Hint'}
          value={fulfillmentData.indiscriminate.hint}
          onChange={event => updateIndiscriminateFunc({ hint: event.target.value })}
          size={'small'}
          fullWidth
        />
      );

    case OmniObjectiveType.Destination:
      return (
        <Stack direction={'row'} spacing={1.5} flexWrap={'wrap'} useFlexGap>
          <TextField
            type={'number'}
            label={'Map Id'}
            variant={'outlined'}
            size={'small'}
            value={fulfillmentData.destination.mapId ?? -1}
            onChange={event => updateDestinationFunc({
              ...fulfillmentData.destination,
              mapId: parseInt(event.target.value) || -1,
            })}
            sx={{ width: 110 }}
          />
          <TextField
            type={'number'}
            label={'X1 ↖'}
            variant={'outlined'}
            size={'small'}
            value={fulfillmentData.destination.x1 ?? -1}
            onChange={event => updateDestinationFunc({
              ...fulfillmentData.destination,
              x1: parseInt(event.target.value) || -1,
            })}
            sx={{ width: 110 }}
          />
          <TextField
            type={'number'}
            label={'X2 ↗'}
            variant={'outlined'}
            size={'small'}
            value={fulfillmentData.destination.x2 ?? -1}
            onChange={event => updateDestinationFunc({
              ...fulfillmentData.destination,
              x2: parseInt(event.target.value) || -1,
            })}
            sx={{ width: 110 }}
          />
          <TextField
            type={'number'}
            label={'Y1 ↙'}
            variant={'outlined'}
            size={'small'}
            value={fulfillmentData.destination.y1 ?? -1}
            onChange={event => updateDestinationFunc({
              ...fulfillmentData.destination,
              y1: parseInt(event.target.value) || -1,
            })}
            sx={{ width: 110 }}
          />
          <TextField
            type={'number'}
            label={'Y2 ↘'}
            variant={'outlined'}
            size={'small'}
            value={fulfillmentData.destination.y2 ?? -1}
            onChange={event => updateDestinationFunc({
              ...fulfillmentData.destination,
              y2: parseInt(event.target.value) || -1,
            })}
            sx={{ width: 110 }}
          />
        </Stack>
      );

    case OmniObjectiveType.Fetch:
      return (
        <Stack direction={'row'} spacing={1.5} alignItems={'flex-start'}>
          <FormControl size={'small'} sx={{ minWidth: 130 }}>
            <InputLabel>Fetch Type</InputLabel>
            <Select
              variant={'outlined'}
              value={fulfillmentData.fetch.type}
              label={'Fetch Type'}
              onChange={event => updateFetchFunc({
                ...fulfillmentData.fetch,
                type: Number(event.target.value) as OmniObjectiveFetchType,
                id: -1,
              })}
            >
              {Object.values(OmniObjectiveFetchType)
                .filter(v => !isNaN(Number(v)))
                .map(v => (
                  <MenuItem key={v} value={v}>
                    {FETCH_TYPE_LABELS[v as OmniObjectiveFetchType]}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          <Autocomplete
            fullWidth
            size={'small'}
            options={dataSource}
            getOptionLabel={(option) => `[${option.id}] ${option.name}`}
            value={dataSource.find(i => i.id === fulfillmentData.fetch.id) ?? null}
            onChange={(_, newValue) => updateFetchFunc({
              ...fulfillmentData.fetch,
              id: newValue?.id ?? -1,
            })}
            renderInput={(params) => (
              <TextField {...params} label={'Select Resource'} variant={'outlined'}/>
            )}
          />

          <TextField
            type={'number'}
            label={'Amount'}
            variant={'outlined'}
            size={'small'}
            value={fulfillmentData.fetch.amount}
            onChange={event => updateFetchFunc({
              ...fulfillmentData.fetch,
              amount: parseInt(event.target.value) || 0,
            })}
            sx={{ width: 110 }}
          />
        </Stack>
      );

    case OmniObjectiveType.Slay:
      return (
        <Stack direction={'row'} spacing={1.5} alignItems={'flex-start'}>
          <Autocomplete
            fullWidth
            size={'small'}
            options={enemies}
            getOptionLabel={(option) => `[${option.id}] ${option.name}`}
            value={enemies.find(e => e.id === fulfillmentData.slay.id) ?? null}
            onChange={(_, newValue) => updateSlayFunc({
              ...fulfillmentData.slay,
              id: newValue?.id ?? -1,
            })}
            renderInput={(params) => (
              <TextField {...params} label={'Select Enemy'} variant={'outlined'}/>
            )}
          />
          <TextField
            type={'number'}
            label={'Amount'}
            variant={'outlined'}
            size={'small'}
            value={fulfillmentData.slay.amount}
            onChange={event => updateSlayFunc({
              ...fulfillmentData.slay,
              amount: parseInt(event.target.value) || 0,
            })}
            sx={{ width: 110 }}
          />
        </Stack>
      );

    case OmniObjectiveType.Quest:
    {
      const availableQuests = quests.filter(q => !fulfillmentData.quest.keys.includes(q.key));
      return (
        <Stack spacing={1.5}>
          <Autocomplete
            size={'small'}
            options={availableQuests}
            getOptionLabel={(option) => `${option.name} (${option.key})`}
            onChange={(_, newValue) =>
            {
              if (newValue)
              {
                const updated = fulfillmentData.quest.keys.toSpliced(0, 0);
                updated.push(newValue.key);
                updateQuestFunc({ keys: updated });
              }
            }}
            renderInput={(params) => (
              <TextField {...params} label={'Add Quest Prerequisite'} variant={'outlined'}/>
            )}
          />
          <Stack direction={'row'} spacing={1} flexWrap={'wrap'} useFlexGap>
            {fulfillmentData.quest.keys.map(questKey => (
              <Chip
                key={questKey}
                label={questKey}
                variant={'outlined'}
                onDelete={() =>
                {
                  const idx = fulfillmentData.quest.keys.indexOf(questKey);
                  updateQuestFunc({ keys: fulfillmentData.quest.keys.toSpliced(idx, 1) });
                }}
              />
            ))}
          </Stack>
        </Stack>
      );
    }

    default:
      return null;
  }
};

export default ObjectiveFulfillmentData;
