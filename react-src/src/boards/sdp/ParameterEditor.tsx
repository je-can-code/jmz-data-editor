import { SdpParameterEditorProps } from "../../../types/local/BoardProps";
import React, { ChangeEvent, ReactNode, useRef, useState } from "react";
import { debounce, FormControl, InputLabel, ListSubheader, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import PanelParameter = Sdp.PanelParameter;
import { fromLongParameterIdToName } from "../../services/ParameterIdMapper.ts";

export default function ParameterEditor(props: SdpParameterEditorProps)
{
  if (!props.parameter) return <></>;

  const updateParameters = props.updateParameter;
  const fromParameterIdToIconElement = props.parameterIdToIconElement;

  const [ thisParameterId, setThisParameterId ] = useState<number>(props.parameter.parameterId);
  const [ parameterPerRank, setParameterPerRank ] = useState<number>(props.parameter.perRank);
  const [ parameterIsFlat, setParameterIsFlat ] = useState<boolean>(props.parameter.isFlat);
  const [ parameterIsCore, setParameterIsCore ] = useState<boolean>(props.parameter.isCore);

  const debouncedUpdateParameter = useRef(debounce(() =>
    {
      // derive the panel parameter.
      const updatedParameter = {
        parameterId: thisParameterId,
        perRank: parameterPerRank,
        isFlat: parameterIsFlat,
        isCore: parameterIsCore,
      } as PanelParameter;

      // update panel parameter.
      updateParameters(updatedParameter);
    }, 1000)
  ).current;

  const handleChange = (event: SelectChangeEvent<number>, child: ReactNode) =>
  {
    const newId = event.target.value as number
    setThisParameterId(newId);
    console.log(`new select option: ${newId}`);
    debouncedUpdateParameter();
  };

  const mapParametersToSelectMenuItems = () =>
  {
    const parameterItems = [];
    const bParamIds = [ 0, 1, 2, 3, 4, 5, 6, 7 ];
    const exParamIds = [ 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 ];
    const spParamIds = [ 18, 19, 20, 21, 22, 23, 24, 25, 26, 27 ];
    const cParamIds = [ 28, 29, 30 ];

    parameterItems.push(<ListSubheader>Base Parameters</ListSubheader>)
    bParamIds.map(parameterId =>
    {
      parameterItems.push(
        <MenuItem value={parameterId}>
          {fromParameterIdToIconElement(parameterId)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      )
    });

    parameterItems.push(<ListSubheader>Ex Parameters</ListSubheader>)
    exParamIds.map(parameterId =>
    {
      parameterItems.push(
        <MenuItem value={parameterId}>
          {fromParameterIdToIconElement(parameterId)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      )
    });

    parameterItems.push(<ListSubheader>Sp Parameters</ListSubheader>)
    spParamIds.map(parameterId =>
    {
      parameterItems.push(
        <MenuItem value={parameterId}>
          {fromParameterIdToIconElement(parameterId)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      )
    });

    parameterItems.push(<ListSubheader>Custom Parameters</ListSubheader>)
    cParamIds.map(parameterId =>
    {
      parameterItems.push(
        <MenuItem value={parameterId}>
          {fromParameterIdToIconElement(parameterId)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      )
    });

    return parameterItems;
  };

  return <>
    <FormControl
      sx={{ float: 'left', display: 'inline' }}
    >
      <InputLabel>Parameter Type</InputLabel>
      <Select
        value={thisParameterId}
        label="Parameter Type"
        onChange={handleChange}
      >
        {mapParametersToSelectMenuItems()}
      </Select>
    </FormControl>
  </>
}