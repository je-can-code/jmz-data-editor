import React, { ChangeEvent, useEffect, useState } from "react";
import { JabsBattlerData, JabsDataParser } from "../services/JabsDataParser.ts";
import NumberInputWithLabel from "../../../components/NumberInputWithLabel.tsx";
import { Box, Divider, Stack, Typography } from "@mui/material";
import { AccessAlarm, DirectionsRun, Speed, TrendingUp, Visibility } from "@mui/icons-material";

type EnemyJabsBattlerDataProps = {
  note: string;
  updateNote: (value: string) => void;
};

const EnemyJabsBattlerData = ({
  note,
  updateNote,
}: EnemyJabsBattlerDataProps) =>
{
  //region state
  const [ sight, setSight ] = useState<number>(0);
  const [ pursuit, setPursuit ] = useState<number>(0);
  const [ prepareSpeed, setPrepareSpeed ] = useState<number>(0);

  const [ alertDuration, setAlertDuration ] = useState<number>(0);
  const [ alertSightBoost, setAlertSightBoost ] = useState<number>(0);
  const [ alertPursuitBoost, setAlertPursuitBoost ] = useState<number>(0);
  //endregion state

  useEffect(() =>
  {
    refreshBattlerDataFromNote();
  }, [ note ]);

  const refreshBattlerDataFromNote = () =>
  {
    const battlerData = JabsDataParser.readBattlerData(note);
    setSight(battlerData.sight);
    setPursuit(battlerData.pursuit);
    setPrepareSpeed(battlerData.prepareSpeed);
    setAlertDuration(battlerData.alertDuration);
    setAlertSightBoost(battlerData.alertSightBoost);
    setAlertPursuitBoost(battlerData.alertPursuitBoost);
  };

  const handleBattlerDataUpdate = (updatedData: JabsBattlerData) =>
  {
    const updatedNote = JabsDataParser.writeBattlerData(note, updatedData);
    updateNote(updatedNote);
  };

  const handleSightChange = (newValue: number) =>
  {
    setSight(newValue);
    handleBattlerDataUpdate({
      sight: newValue,
      pursuit,
      prepareSpeed,
      alertDuration,
      alertSightBoost,
      alertPursuitBoost
    });
  };

  const handlePursuitChange = (newValue: number) =>
  {
    setPursuit(newValue);
    handleBattlerDataUpdate({
      sight,
      pursuit: newValue,
      prepareSpeed,
      alertDuration,
      alertSightBoost,
      alertPursuitBoost
    });
  };

  const handlePrepareSpeedChange = (newValue: number) =>
  {
    setPrepareSpeed(newValue);
    handleBattlerDataUpdate({
      sight,
      pursuit,
      prepareSpeed: newValue,
      alertDuration,
      alertSightBoost,
      alertPursuitBoost
    });
  };

  const handleAlertDurationChange = (newValue: number) =>
  {
    setAlertDuration(newValue);
    handleBattlerDataUpdate({
      sight,
      pursuit,
      prepareSpeed,
      alertDuration: newValue,
      alertSightBoost,
      alertPursuitBoost
    });
  };

  const handleAlertSightBoostChange = (newValue: number) =>
  {
    setAlertSightBoost(newValue);
    handleBattlerDataUpdate({
      sight,
      pursuit,
      prepareSpeed,
      alertDuration,
      alertSightBoost: newValue,
      alertPursuitBoost
    });
  };

  const handleAlertPursuitBoostChange = (newValue: number) =>
  {
    setAlertPursuitBoost(newValue);
    handleBattlerDataUpdate({
      sight,
      pursuit,
      prepareSpeed,
      alertDuration,
      alertSightBoost,
      alertPursuitBoost: newValue
    });
  };

  return <>
    <Typography
      variant={"h4"}
      gutterBottom={true}
      color={"primary"}
      align={"center"}
      sx={{ paddingTop: 2 }}
    >
      JABS Battler Data
    </Typography>

    {/* Main container for vertical layout */}
    <Stack
      spacing={2}
      direction={"column"}
    >
      {/* Basic battler data section */}
      <Stack spacing={1}>
        <Typography variant="subtitle1" color="primary">Basic Parameters</Typography>
        <NumberInputWithLabel
          label="Sight Range"
          value={sight}
          onChangeEventHandler={(event) => handleSightChange(Number(event.target.value))}
          endAdornment={<Visibility color={"info"} />} // Blue color for vision/sight
        />
        <NumberInputWithLabel
          label="Pursuit Range"
          value={pursuit}
          onChangeEventHandler={(event) => handlePursuitChange(Number(event.target.value))}
          endAdornment={<DirectionsRun color={"success"} />} // Green color for movement/action
        />
        {/*<NumberInputWithLabel*/}
        {/*  label="Prepare Speed"*/}
        {/*  value={prepareSpeed}*/}
        {/*  onChangeEventHandler={(event) => handlePrepareSpeedChange(Number(event.target.value))}*/}
        {/*/>*/}
      </Stack>

      <Divider />

      {/* Alert-related data section */}
      <Stack spacing={1}>
        <Typography variant="subtitle1" color="primary">Alert Parameters</Typography>
        <NumberInputWithLabel
          label="Alert Duration"
          value={alertDuration}
          onChangeEventHandler={(event) => handleAlertDurationChange(Number(event.target.value))}
          endAdornment={<AccessAlarm color={"warning"} />} // Orange/yellow for caution/alert
        />
        <NumberInputWithLabel
          label="Alert Sight Boost"
          value={alertSightBoost}
          onChangeEventHandler={(event) => handleAlertSightBoostChange(Number(event.target.value))}
          endAdornment={<TrendingUp color={"secondary"} />} // Purple for enhancement
        />
        <NumberInputWithLabel
          label="Alert Pursuit Boost"
          value={alertPursuitBoost}
          onChangeEventHandler={(event) => handleAlertPursuitBoostChange(Number(event.target.value))}
          endAdornment={<Speed color={"error"} />} // Red for speed/intensity
        />
      </Stack>
    </Stack>
  </>;
};

export { EnemyJabsBattlerData }