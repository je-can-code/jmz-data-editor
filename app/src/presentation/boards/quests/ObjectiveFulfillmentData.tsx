import React, { useMemo, useState } from 'react';
import {
  Autocomplete,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
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
  updateDestinationFunc: (updatedIndiscriminate: DestinationData) => void;
  updateFetchFunc: (updatedIndiscriminate: FetchData) => void;
  updateSlayFunc: (updatedIndiscriminate: SlayData) => void;
  updateQuestFunc: (updatedIndiscriminate: QuestData) => void;
};

const ObjectiveFulfillmentData = (props: ObjectiveDataProps) =>
{
  //region state
  const {
    fulfillmentData,
    fulfillmentType,
    updateIndiscriminateFunc,
    updateDestinationFunc,
    updateFetchFunc,
    updateSlayFunc,
    updateQuestFunc,
  } = props;

  const {
    data: items,
    loading: itemsLoading
  } = useItems();
  const {
    data: weapons,
    loading: weaponsLoading
  } = useWeapons();
  const {
    data: armors,
    loading: armorsLoading
  } = useArmors();
  const {
    data: enemies,
    loading: enemiesLoading
  } = useEnemies();
  const {
    quests,
    loading: questsLoading
  } = useQuests();

  const [ newQuestKey, setNewQuestKey ] = useState<string>('');
  //endregion state

  //region update
  //region indiscriminate
  const handleUpdateIndiscriminateHint = (newHint: string) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    const updatedFulfillmentData = {
      hint: newHint,
    } as IndiscriminateData;

    updateIndiscriminateFunc(updatedFulfillmentData);
  };
  //endregion indiscriminate

  //region destination
  const handleUpdateDestinationMapId = (newMapId: number) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    const updatedFulfillmentData = {
      ...fulfillmentData.destination,
      mapId: newMapId,
    } as DestinationData;

    updateDestinationFunc(updatedFulfillmentData);
  };

  /**
   * Centralized handler for updating destination coordinates.
   * @param {keyof DestinationData} key The coordinate key to update.
   * @param {number} value The new coordinate value.
   */
  const handleUpdateDestinationCoordinate = (
    key: keyof DestinationData,
    value: number
  ) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    const updatedFulfillmentData = {
      ...fulfillmentData.destination,
      [ key ]: value,
    } as DestinationData;

    updateDestinationFunc(updatedFulfillmentData);
  };
  //endregion destination

  //region fetch
  const handleUpdateFetchType = (newFetchType: OmniObjectiveFetchType) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    updateFetchFunc({
      ...fulfillmentData.fetch,
      type: newFetchType,
      // Reset ID when type changes to avoid cross-contamination
      id: -1
    });
  };

  const handleUpdateFetchDatabaseId = (newDatabaseId: number) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    updateFetchFunc({
      ...fulfillmentData.fetch,
      id: newDatabaseId,
    });
  };

  const handleUpdateFetchAmount = (newAmount: number) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    updateFetchFunc({
      ...fulfillmentData.fetch,
      amount: newAmount,
    });
  };
  //endregion fetch

  //region slay
  const handleUpdateSlayEnemyId = (newEnemyId: number) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    props.updateSlayFunc({
      ...fulfillmentData.slay,
      id: newEnemyId,
    });
  };

  const handleUpdateSlayAmount = (newAmount: number) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    updateSlayFunc({
      ...fulfillmentData.slay,
      amount: newAmount,
    });
  };
  //endregion slay

  //region quest
  const handleUpdateQuestKeys = (newKeys: string[]) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    const updatedFulfillmentData = {
      keys: newKeys
    } as QuestData;

    updateQuestFunc(updatedFulfillmentData);
  };

  const addQuestToFulfillmentData = (questKey: string) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    const updatedQuestKeys = fulfillmentData.quest.keys.toSpliced(0, 0);
    updatedQuestKeys.push(questKey);
    handleUpdateQuestKeys(updatedQuestKeys);
  };

  const removeQuestFromFulfillmentData = (questKey: string) =>
  {
    if (!fulfillmentData)
    {
      return;
    }

    const targetQuestKeyIndex = fulfillmentData.quest.keys.indexOf(questKey);
    const updatedQuestKeys = fulfillmentData.quest.keys.toSpliced(targetQuestKeyIndex, 1);

    handleUpdateQuestKeys(updatedQuestKeys);
  };
  //endregion quest
  //endregion update

  //region render
  const renderFulfillmentData = () =>
  {
    switch (fulfillmentType)
    {
      case OmniObjectiveType.Indiscriminate:
        return renderIndiscriminateData();
      case OmniObjectiveType.Destination:
        return renderDestinationData();
      case OmniObjectiveType.Fetch:
        return renderFetchData();
      case OmniObjectiveType.Slay:
        return renderSlayData();
      case OmniObjectiveType.Quest:
        return renderQuestData();
      default:
        return <></>;
    }
  };

  const renderIndiscriminateData = () =>
  {
    if (!fulfillmentData)
    {
      return <></>;
    }

    return <TextField
      key={'indiscriminate'}
      variant={'standard'}
      label={'Hint'}
      value={fulfillmentData?.indiscriminate.hint}
      onChange={event => handleUpdateIndiscriminateHint(event.target.value)}
      size={'small'}
      fullWidth
    />;
  };

  const renderDestinationData = () =>
  {
    return <React.Fragment key={'destination'}>
      <Stack direction={'row'} spacing={2}>
        <TextField
          type={'number'}
          label={'Map Id'}
          variant={'outlined'}
          value={fulfillmentData?.destination.mapId ?? -1}
          onChange={(event) => handleUpdateDestinationMapId(parseInt(event.target.value) ?? -1)}
          sx={{ width: '120px' }}
        />
        <TextField
          type={'number'}
          label={'X1 ↖️'}
          variant={'filled'}
          value={fulfillmentData?.destination.x1 ?? -1}
          onChange={(event) => handleUpdateDestinationCoordinate('x1', parseInt(event.target.value) || -1)}
          color={'secondary'}
          sx={{ width: '140px' }}
        />
        <TextField
          type={'number'}
          label={'X2 ↗️'}
          variant={'filled'}
          value={fulfillmentData?.destination.x2 ?? -1}
          onChange={(event) => handleUpdateDestinationCoordinate('x2', parseInt(event.target.value) || -1)}
          color={'secondary'}
          sx={{ width: '140px' }}
        />
        <TextField
          type={'number'}
          label={'Y1 ↙️'}
          variant={'filled'}
          value={fulfillmentData?.destination.y1 ?? -1}
          onChange={(event) => handleUpdateDestinationCoordinate('y1', parseInt(event.target.value) || -1)}
          color={'success'}
          sx={{ width: '140px' }}
        />
        <TextField
          type={'number'}
          label={'Y2 ↘️'}
          variant={'filled'}
          value={fulfillmentData?.destination.y2 ?? -1}
          onChange={(event) => handleUpdateDestinationCoordinate('y2', parseInt(event.target.value) || -1)}
          color={'success'}
          sx={{ width: '140px' }}
        />
      </Stack>
    </React.Fragment>;
  };

  /**
   * Memoizes the data source for fetch objectives.
   * This prevents recalculating the list reference unless the fetch type
   * or the underlying database resources change.
   */
  const dataSource = useMemo<RPG_BaseDomainModel<RPG_Base>[]>(() =>
  {
    if (!fulfillmentData)
    {
      return [];
    }

    switch (fulfillmentData.fetch.type)
    {
      case OmniObjectiveFetchType.Item:
        return items;
      case OmniObjectiveFetchType.Weapon:
        return weapons;
      case OmniObjectiveFetchType.Armor:
        return armors;
      default:
        return [];
    }
  }, [ fulfillmentData?.fetch.type, items, weapons, armors ]);

  const renderFetchData = () =>
  {
    if (!fulfillmentData)
    {
      return <></>;
    }

    return (
      <React.Fragment key={'fetch'}>
        <Stack direction={'row'} spacing={2}>
          <FormControl sx={{ minWidth: '140px' }}>
            <InputLabel>Fetch Type</InputLabel>
            <Select
              variant={'filled'}
              value={fulfillmentData.fetch.type}
              label="Fetch Type"
              onChange={event => handleUpdateFetchType(Number(event.target.value))}
            >
              {Object.values(OmniObjectiveFetchType)
                .filter(entry => !isNaN(Number(entry)))
                .map((
                  type,
                  idx
                ) => renderFetchTypeMenuItem(type, idx))}
            </Select>
          </FormControl>

          <Autocomplete
            fullWidth
            options={dataSource}
            getOptionLabel={(option) => `${option.id}: ${option.name}`}
            value={dataSource.find(i => i.id === fulfillmentData.fetch.id) ?? null}
            onChange={(
              _,
              newValue
            ) => handleUpdateFetchDatabaseId(newValue?.id ?? -1)}
            renderInput={(params) => <TextField {...params} label="Select Resource" variant="outlined"/>}
          />

          <TextField
            type={'number'}
            label={'Amount'}
            variant={'filled'}
            value={fulfillmentData.fetch.amount}
            onChange={(event) => handleUpdateFetchAmount(parseInt(event.target.value) || 0)}
            sx={{ width: '120px' }}
          />
        </Stack>
      </React.Fragment>
    );
  };

  const renderFetchTypeMenuItem = (
    fetchType: string | OmniObjectiveFetchType,
    index: number
  ) =>
  {
    let menuName;
    switch (fetchType)
    {
      case -1:
        menuName = 'Unset';
        break;
      case 0:
        menuName = 'Item';
        break;
      case 1:
        menuName = 'Weapon';
        break;
      case 2:
        menuName = 'Armor';
        break;
    }
    return <MenuItem
      key={`${fetchType}-${index}`}
      value={fetchType}
    >
      {menuName}
    </MenuItem>;
  };

  const renderSlayData = () =>
  {
    if (!fulfillmentData)
    {
      return <></>;
    }

    return (
      <React.Fragment key={'slay'}>
        <Stack direction={'row'} spacing={2} sx={{ width: '100%' }}>
          <Autocomplete
            fullWidth
            options={enemies}
            getOptionLabel={(option) => `${option.id}: ${option.name}`}
            value={enemies.find(e => e.id === fulfillmentData.slay.id) ?? null}
            onChange={(
              _,
              newValue
            ) => handleUpdateSlayEnemyId(newValue?.id ?? -1)}
            renderInput={(params) => <TextField {...params} label="Select Enemy" variant="outlined"/>}
          />
          <TextField
            type={'number'}
            label={'Amount'}
            variant={'filled'}
            value={fulfillmentData.slay.amount}
            onChange={(event) => handleUpdateSlayAmount(parseInt(event.target.value) || 0)}
            sx={{ width: '120px' }}
          />
        </Stack>
      </React.Fragment>
    );
  };

  const renderQuestData = () =>
  {
    if (!fulfillmentData)
    {
      return <></>;
    }

    // Filter out quests that are already in the fulfillment list
    const availableQuests = quests.filter(q => !fulfillmentData.quest.keys.includes(q.key));

    return (
      <Stack direction={'row'} spacing={2}>
        <Stack spacing={2} sx={{ width: '300px' }}>
          <Autocomplete
            options={availableQuests}
            getOptionLabel={(option) => `${option.name} (${option.key})`}
            onChange={(
              _,
              newValue
            ) =>
            {
              if (newValue)
              {
                addQuestToFulfillmentData(newValue.key);
              }
            }}
            renderInput={(params) => <TextField {...params} label="Add Quest Prerequisite" variant="outlined"/>}
          />
        </Stack>

        <Stack spacing={1} direction="row" useFlexGap flexWrap="wrap">
          {fulfillmentData.quest.keys.map(renderQuestChip)}
        </Stack>
      </Stack>
    );
  };

  const renderQuestChip = (questKey: string) =>
  {
    return <>
      <Chip
        label={questKey}
        variant={'outlined'}
        onDelete={() => removeQuestFromFulfillmentData(questKey)}
      />
    </>;
  };
  //endregion render

  if (itemsLoading || weaponsLoading || armorsLoading || enemiesLoading || questsLoading)
  {
    return <Typography variant="caption">Loading database resources...</Typography>;
  }

  if (fulfillmentData === null)
  {
    return <></>;
  }

  return <>
    {renderFulfillmentData()}
  </>;
};

export default ObjectiveFulfillmentData;
