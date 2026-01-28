import React from "react";
import {
  JabsBattlerData,
} from "@services/parsers/JabsDataParser.ts";
import NumberInputWithLabel from "../../../components/NumberInputWithLabel.tsx";
import {
  Divider,
  Stack,
  Typography
} from "@mui/material";
import {
  AccessAlarm,
  DirectionsRun,
  Speed,
  TrendingUp,
  Visibility
} from "@mui/icons-material";
import { RPG_EnemyDomainModel } from "@core/domain/entities/RPG_EnemyDomainModel.ts";

type EnemyJabsBattlerDataProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (value: RPG_EnemyDomainModel) => void;
};

const EnemyJabsBattlerData = ({
  selectedEnemy,
  updateEnemy,
}: EnemyJabsBattlerDataProps) =>
{
  const handleSightChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.sight = newValue;
    updateEnemy(selectedEnemy);
  };

  const handlePursuitChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.pursuit = newValue;
    updateEnemy(selectedEnemy);
  };

  const handlePrepareSpeedChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.prepareSpeed = newValue;
    updateEnemy(selectedEnemy);
  };

  const handleAlertDurationChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.alertDuration = newValue;
    updateEnemy(selectedEnemy);
  };

  const handleAlertSightBoostChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.alertSightBoost = newValue;
    updateEnemy(selectedEnemy);
  };

  const handleAlertPursuitBoostChange = (newValue: number) =>
  {
    selectedEnemy.jabsBattlerData.alertPursuitBoost = newValue;
    updateEnemy(selectedEnemy);
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
          value={selectedEnemy.jabsBattlerData.sight}
          onChangeEventHandler={(event) => handleSightChange(Number(event.target.value))}
          endAdornment={<Visibility color={"info"}/>}
        />
        <NumberInputWithLabel
          label="Pursuit Range"
          value={selectedEnemy.jabsBattlerData.pursuit}
          onChangeEventHandler={(event) => handlePursuitChange(Number(event.target.value))}
          endAdornment={<DirectionsRun color={"success"}/>}
        />
        <NumberInputWithLabel
          label="Prepare Speed"
          value={selectedEnemy.jabsBattlerData.prepareSpeed}
          onChangeEventHandler={(event) => handlePrepareSpeedChange(Number(event.target.value))}
        />
      </Stack>

      <Divider/>

      {/* Alert-related data section */}
      <Stack spacing={1}>
        <Typography variant="subtitle1" color="primary">Alert Parameters</Typography>
        <NumberInputWithLabel
          label="Alert Duration"
          value={selectedEnemy.jabsBattlerData.alertDuration}
          onChangeEventHandler={(event) => handleAlertDurationChange(Number(event.target.value))}
          endAdornment={<AccessAlarm color={"warning"}/>} // Orange/yellow for caution/alert
        />
        <NumberInputWithLabel
          label="Alert Sight Boost"
          value={selectedEnemy.jabsBattlerData.alertSightBoost}
          onChangeEventHandler={(event) => handleAlertSightBoostChange(Number(event.target.value))}
          endAdornment={<TrendingUp color={"secondary"}/>} // Purple for enhancement
        />
        <NumberInputWithLabel
          label="Alert Pursuit Boost"
          value={selectedEnemy.jabsBattlerData.alertPursuitBoost}
          onChangeEventHandler={(event) => handleAlertPursuitBoostChange(Number(event.target.value))}
          endAdornment={<Speed color={"error"}/>} // Red for speed/intensity
        />
      </Stack>
    </Stack>
  </>;
};

export { EnemyJabsBattlerData }
