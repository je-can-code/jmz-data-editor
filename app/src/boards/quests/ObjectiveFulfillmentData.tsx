import React, { useState } from 'react';
import {
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField
} from "@mui/material";

import { OmniObjectiveType } from "../../core/enums/OmniObjectiveType.ts";
import OmniObjectiveFetchType from "./OmniObjectiveFetchType.ts";
import OmniFulfillmentData = Questopedia.OmniFulfillmentData;
import IndiscriminateData = Questopedia.IndiscriminateData;
import DestinationData = Questopedia.DestinationData;
import FetchData = Questopedia.FetchData;
import SlayData = Questopedia.SlayData;
import QuestData = Questopedia.QuestData;

type ObjectiveDataProps = {
  fulfillmentData: OmniFulfillmentData | undefined;
  fulfillmentType: OmniObjectiveType | undefined;
  updateIndiscriminateFunc: (updatedIndiscriminate: IndiscriminateData) => void;
  updateDestinationFunc: (updatedIndiscriminate: DestinationData) => void;
  updateFetchFunc: (updatedIndiscriminate: FetchData) => void;
  updateSlayFunc: (updatedIndiscriminate: SlayData) => void;
  updateQuestFunc: (updatedIndiscriminate: QuestData) => void;
};

export default function ObjectiveFulfillmentData(
  {
    fulfillmentData,
    fulfillmentType,
    updateIndiscriminateFunc,
    updateDestinationFunc,
    updateFetchFunc,
    updateSlayFunc,
    updateQuestFunc,
  }: ObjectiveDataProps)
{
  if (fulfillmentData === null) return <></>;

  const [ newQuestKey, setNewQuestKey ] = useState<string>("");

  //region update
  //region indiscriminate
  const handleUpdateIndiscriminateHint = (newHint: string) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      hint: newHint,
    } as IndiscriminateData;

    updateIndiscriminateFunc(updatedFulfillmentData);
  };
  //endregion indiscriminate

  //region destination
  const handleUpdateDestinationMapId = (newMapId: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.destination,
      mapId: newMapId,
    } as DestinationData;

    updateDestinationFunc(updatedFulfillmentData);
  };

  const handleUpdateDestinationX1 = (newCoordinate: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.destination,
      x1: newCoordinate,
    } as DestinationData;

    updateDestinationFunc(updatedFulfillmentData);
  };

  const handleUpdateDestinationX2 = (newCoordinate: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.destination,
      x2: newCoordinate,
    } as DestinationData;

    updateDestinationFunc(updatedFulfillmentData);
  };

  const handleUpdateDestinationY1 = (newCoordinate: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.destination,
      y1: newCoordinate,
    } as DestinationData;

    updateDestinationFunc(updatedFulfillmentData);
  };

  const handleUpdateDestinationY2 = (newCoordinate: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.destination,
      y2: newCoordinate,
    } as DestinationData;

    updateDestinationFunc(updatedFulfillmentData);
  };
  //endregion destination

  //region fetch
  const handleUpdateFetchType = (newFetchType: OmniObjectiveFetchType) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.fetch,
      type: newFetchType,
    } as FetchData;

    updateFetchFunc(updatedFulfillmentData);
  };

  const handleUpdateFetchDatabaseId = (newDatabaseId: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.fetch,
      id: newDatabaseId,
    } as FetchData;

    updateFetchFunc(updatedFulfillmentData);
  };

  const handleUpdateFetchAmount = (newAmount: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.fetch,
      amount: newAmount,
    } as FetchData;

    updateFetchFunc(updatedFulfillmentData);
  };
  //endregion fetch

  //region slay
  const handleUpdateSlayEnemyId = (newEnemyId: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.slay,
      id: newEnemyId,
    } as SlayData;

    updateSlayFunc(updatedFulfillmentData);
  };

  const handleUpdateSlayAmount = (newAmount: number) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      ...fulfillmentData.slay,
      amount: newAmount,
    } as SlayData;

    updateSlayFunc(updatedFulfillmentData);
  };
  //endregion slay

  //region quest
  const handleUpdateQuestKeys = (newKeys: string[]) =>
  {
    if (!fulfillmentData) return;

    const updatedFulfillmentData = {
      keys: newKeys
    } as QuestData;

    updateQuestFunc(updatedFulfillmentData);
  };

  const addQuestToFulfillmentData = (questKey: string) =>
  {
    if (!fulfillmentData) return;

    const updatedQuestKeys = fulfillmentData.quest.keys.toSpliced(0, 0);
    updatedQuestKeys.push(questKey);
    handleUpdateQuestKeys(updatedQuestKeys);
  };

  const removeQuestFromFulfillmentData = (questKey: string) =>
  {
    if (!fulfillmentData) return;

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
    if (!fulfillmentData) return <></>;

    return <TextField
      key={"indiscriminate"}
      variant={"standard"}
      label={"Hint"}
      value={fulfillmentData?.indiscriminate.hint}
      onChange={event => handleUpdateIndiscriminateHint(event.target.value)}
      size={"small"}
      fullWidth
    />
  };

  const renderDestinationData = () =>
  {
    return <React.Fragment key={"destination"}>
      <Stack direction={"row"} spacing={2}>
        <TextField
          type={"number"}
          label={"Map Id"}
          variant={"outlined"}
          value={fulfillmentData?.destination.mapId ?? -1}
          onChange={(event) => handleUpdateDestinationMapId(parseInt(event.target.value) ?? -1)}
          sx={{ width: '120px' }}
        />
        <TextField
          type={"number"}
          label={"X1 ↖️"}
          variant={"filled"}
          value={fulfillmentData?.destination.x1 ?? -1}
          onChange={(event) => handleUpdateDestinationX1(parseInt(event.target.value) ?? -1)}
          color={"secondary"}
          sx={{ width: '140px' }}
        />
        <TextField
          type={"number"}
          label={"X2 ↗️"}
          variant={"filled"}
          value={fulfillmentData?.destination.x2 ?? -1}
          onChange={(event) => handleUpdateDestinationX2(parseInt(event.target.value) ?? -1)}
          color={"secondary"}
          sx={{ width: '140px' }}
        />
        <TextField
          type={"number"}
          label={"Y1 ↙️"}
          variant={"filled"}
          value={fulfillmentData?.destination.y1 ?? -1}
          onChange={(event) => handleUpdateDestinationY1(parseInt(event.target.value) ?? -1)}
          color={"success"}
          sx={{ width: '140px' }}
        />
        <TextField
          type={"number"}
          label={"Y2 ↘️"}
          variant={"filled"}
          value={fulfillmentData?.destination.y2 ?? -1}
          onChange={(event) => handleUpdateDestinationY2(parseInt(event.target.value) ?? -1)}
          color={"success"}
          sx={{ width: '140px' }}
        />
      </Stack>
    </React.Fragment>
  };

  const renderFetchData = () =>
  {
    // TODO: replace id number input with autocomplete list of items/weapons/armor?
    return <React.Fragment key={"fetch"}>
      <Stack direction={"row"} spacing={2}>
        <FormControl fullWidth>
          <InputLabel>Fetch Type</InputLabel>
          <Select
            variant={"filled"}
            value={fulfillmentData?.fetch.type}
            label="Fetch Type"
            onChange={event => handleUpdateFetchType(Number(event.target.value ?? -1))}
            sx={{ width: '140px' }}
          >
            {Object.values(OmniObjectiveFetchType)
              .filter(entry => !isNaN(Number(entry)))
              .map((fetchType, index) => renderFetchTypeMenuItem(fetchType, index))}
          </Select>
        </FormControl>
        <TextField
          type={"number"}
          label={"Database Id"}
          variant={"outlined"}
          value={fulfillmentData?.fetch.id ?? -1}
          onChange={(event) => handleUpdateFetchDatabaseId(parseInt(event.target.value) ?? -1)}
          sx={{ width: '120px' }}
        />
        <TextField
          type={"number"}
          label={"Amount"}
          variant={"filled"}
          value={fulfillmentData?.fetch.amount ?? -1}
          onChange={(event) => handleUpdateFetchAmount(parseInt(event.target.value) ?? -1)}
          color={"secondary"}
          sx={{ width: '120px' }}
        />
      </Stack>
    </React.Fragment>
  };

  const renderFetchTypeMenuItem = (fetchType: string | OmniObjectiveFetchType, index: number) =>
  {
    let menuName;
    switch (fetchType)
    {
      case -1:
        menuName = "Unset";
        break;
      case 0:
        menuName = "Item";
        break;
      case 1:
        menuName = "Weapon";
        break;
      case 2:
        menuName = "Armor";
        break;
    }
    return <MenuItem
      key={`${fetchType}-${index}`}
      value={fetchType}
    >
      {menuName}
    </MenuItem>
  };

  const renderSlayData = () =>
  {
    // TODO: replace enemy id number input with autocomplete list of enemies?
    return <React.Fragment key={"slay"}>
      <Stack direction={"row"} spacing={2}>
        <TextField
          type={"number"}
          label={"Enemy Id"}
          variant={"outlined"}
          value={fulfillmentData?.slay.id ?? -1}
          onChange={(event) => handleUpdateSlayEnemyId(parseInt(event.target.value) ?? -1)}
          sx={{ width: '120px' }}
        />
        <TextField
          type={"number"}
          label={"Amount"}
          variant={"filled"}
          value={fulfillmentData?.slay.amount ?? -1}
          onChange={(event) => handleUpdateSlayAmount(parseInt(event.target.value) ?? -1)}
          color={"secondary"}
          sx={{ width: '120px' }}
        />
      </Stack>
    </React.Fragment>
  };

  const renderQuestData = () =>
  {
    // TODO: use an multi-select autocomplete of the quests to choose from instead?
    return <>
      <Stack direction={"row"} spacing={2}>
        <Stack spacing={2}>
          <TextField
            label={"Add Quest Key"}
            value={newQuestKey}
            onChange={event => setNewQuestKey(event.target.value)}
            sx={{ width: '200px' }}
          />
          <Button
            onClick={() =>
            {
              addQuestToFulfillmentData(newQuestKey)
              setNewQuestKey("");
            }}
            sx={{ width: '200px' }}
          >
            Add Quest Key
          </Button>
        </Stack>

        <Stack spacing={2}>
          {fulfillmentData?.quest.keys.map(renderQuestChip)}
        </Stack>
      </Stack>

    </>
  };

  const renderQuestChip = (questKey: string) =>
  {
    return <>
      <Chip
        label={questKey}
        variant={"outlined"}
        onDelete={() => removeQuestFromFulfillmentData(questKey)}
      />
    </>
  };
  //endregion render

  return <>
    {renderFulfillmentData()}
  </>
}