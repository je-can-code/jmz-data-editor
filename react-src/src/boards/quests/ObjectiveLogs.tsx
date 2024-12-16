import OmniObjectiveLogType from "./OmniObjectiveLogType.ts";
import { Questopedia } from "../../../types/custom/Quests";
import OmniObjectiveLogs = Questopedia.OmniObjectiveLogs;
import { Box, TextField } from "@mui/material";
import { AccountCircle, Announcement, Bedtime, Block, CancelPresentation, Verified } from "@mui/icons-material";
import styled from "styled-components";
import { yellow } from "@mui/material/colors";

const BoxStyles = {
  display: 'flex',
  alignItems: 'flex-end'
};

const AdornmentStyles = {
  mr: 1,
  my: 0.5
};

type ObjectiveLogsProps = {
  logs?: OmniObjectiveLogs;
  updateObjectiveLogsFunc: (updatedObjectiveLogs: OmniObjectiveLogs) => void;
};

export default function ObjectiveLogs(
  {
    logs,
    updateObjectiveLogsFunc
  }: ObjectiveLogsProps)
{
  const handleObjectiveLogsOnChangeEvent = (input: string, logType: OmniObjectiveLogType) =>
  {
    let updatedObjectiveLogs = {
      ...logs,
    } as OmniObjectiveLogs;

    switch (logType)
    {
      case OmniObjectiveLogType.Inactive:
        updatedObjectiveLogs.inactive = input;
        break;
      case OmniObjectiveLogType.Active:
        updatedObjectiveLogs.active = input;
        break;
      case OmniObjectiveLogType.Completed:
        updatedObjectiveLogs.completed = input;
        break;
      case OmniObjectiveLogType.Failed:
        updatedObjectiveLogs.failed = input;
        break;
      case OmniObjectiveLogType.Missed:
        updatedObjectiveLogs.missed = input;
        break;
    }

    updateObjectiveLogsFunc(updatedObjectiveLogs);
  };

  return <>
    <Box sx={BoxStyles}>
      <Bedtime
        sx={{
          ...AdornmentStyles,
          color: yellow[800]
      }}
      />
      <TextField
        variant={"standard"}
        label={"Inactive"}
        value={logs?.inactive}
        onChange={event => handleObjectiveLogsOnChangeEvent(
          event.target.value,
          OmniObjectiveLogType.Inactive)}
        size={"small"}
        fullWidth
      />
    </Box>

    <Box sx={BoxStyles}>
      <Announcement
        sx={AdornmentStyles}
        color={"primary"}
      />
      <TextField
        variant={"standard"}
        label={"Active"}
        value={logs?.active}
        onChange={event => handleObjectiveLogsOnChangeEvent(
          event.target.value,
          OmniObjectiveLogType.Active)}
        size={"small"}
        fullWidth
      />
    </Box>

    <Box sx={BoxStyles}>
      <Verified
        sx={AdornmentStyles}
        color={"success"}
      />
      <TextField
        variant={"standard"}
        label={"Completed"}
        value={logs?.completed}
        onChange={event => handleObjectiveLogsOnChangeEvent(
          event.target.value,
          OmniObjectiveLogType.Completed)}
        size={"small"}
        fullWidth
      />
    </Box>

    <Box sx={BoxStyles}>
      <CancelPresentation
        sx={AdornmentStyles}
        color={"error"}
      />
      <TextField
        variant={"standard"}
        label={"Failed"}
        value={logs?.failed}
        onChange={event => handleObjectiveLogsOnChangeEvent(
          event.target.value,
          OmniObjectiveLogType.Failed)}
        size={"small"}
        fullWidth
      />
    </Box>

    <Box sx={BoxStyles}>
      <Block
        sx={AdornmentStyles}
        color={"secondary"}
      />
      <TextField
        variant={"standard"}
        label={"Missed"}
        value={logs?.missed}
        onChange={event => handleObjectiveLogsOnChangeEvent(
          event.target.value,
          OmniObjectiveLogType.Missed)}
        size={"small"}
        fullWidth
      />
    </Box>
  </>
}