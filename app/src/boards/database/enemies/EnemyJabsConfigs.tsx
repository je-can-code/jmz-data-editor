import { Box, Checkbox, FormControlLabel, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { JabsConfig, JabsConfigs, JabsDataParser } from "../services/JabsDataParser.ts";
import {
  Visibility, VisibilityOff, DirectionsRun,
  Favorite, HeartBroken, Security, NoEncryption,
  Badge, BadgeSharp
} from "@mui/icons-material";
import { blue, green, grey, orange, purple, red } from "@mui/material/colors";

type EnemyJabsConfigsProps = {
  note: string;
  updateNote: (value: string) => void;
};

/*
TODO:
 this component was written by AI but there are severe sync issues despite it being modeled
 directly after the fully funcitonal EnemyJabsAiTraits component.
 */

const EnemyJabsConfigs = ({
  note,
  updateNote,
}: EnemyJabsConfigsProps) =>
{
  //region state
  const [ noIdle, setNoIdle ] = useState<boolean>(false);
  const [ canIdle, setCanIdle ] = useState<boolean>(false);
  const [ noHpBar, setNoHpBar ] = useState<boolean>(false);
  const [ showHpBar, setShowHpBar ] = useState<boolean>(false);
  const [ inanimate, setInanimate ] = useState<boolean>(false);
  const [ notInanimate, setNotInanimate ] = useState<boolean>(false);
  const [ invincible, setInvincible ] = useState<boolean>(false);
  const [ notInvincible, setNotInvincible ] = useState<boolean>(false);
  const [ noName, setNoName ] = useState<boolean>(false);
  const [ showName, setShowName ] = useState<boolean>(false);
  //endregion state

  useEffect(() =>
  {
    refreshConfigsFromNote();
  }, [ note ]);

  const resetConfigs = () =>
  {
    // reset all the configs.
    setNoIdle(false);
    setCanIdle(false);
    setNoHpBar(false);
    setShowHpBar(false);
    setInanimate(false);
    setNotInanimate(false);
    setInvincible(false);
    setNotInvincible(false);
    setNoName(false);
    setShowName(false);
  };

  const refreshConfigsFromNote = () =>
  {
    resetConfigs();

    const currentConfigs = JabsDataParser.readConfigs(note);
    setNoIdle(currentConfigs.noIdle);
    setCanIdle(currentConfigs.canIdle);
    setNoHpBar(currentConfigs.noHpBar);
    setShowHpBar(currentConfigs.showHpBar);
    setInanimate(currentConfigs.inanimate);
    setNotInanimate(currentConfigs.notInanimate);
    setInvincible(currentConfigs.invincible);
    setNotInvincible(currentConfigs.notInvincible);
    setNoName(currentConfigs.noName);
    setShowName(currentConfigs.showName);
  };

  // Key change: Handle each config change individually with direct values
  const handleConfigChange = (configName: keyof JabsConfigs, checked: boolean) =>
  {
    // Get current configs from the note
    const currentConfigs = JabsDataParser.readConfigs(note);

    // Create a new config object with the updated value
    const updatedConfigs = {
      ...currentConfigs,
      [configName]: checked
    };

    // Update the UI state
    switch (configName)
    {
      case 'noIdle':
        setNoIdle(checked);
        break;
      case 'canIdle':
        setCanIdle(checked);
        break;
      case 'noHpBar':
        setNoHpBar(checked);
        break;
      case 'showHpBar':
        setShowHpBar(checked);
        break;
      case 'inanimate':
        setInanimate(checked);
        break;
      case 'notInanimate':
        setNotInanimate(checked);
        break;
      case 'invincible':
        setInvincible(checked);
        break;
      case 'notInvincible':
        setNotInvincible(checked);
        break;
      case 'noName':
        setNoName(checked);
        break;
      case 'showName':
        setShowName(checked);
        break;
    }

    // Update the note with the new configs
    const updatedNote = JabsDataParser.writeConfigs(note, updatedConfigs);
    updateNote(updatedNote);
  };

  return <>
    <Typography
      variant={"h4"}
      gutterBottom={true}
      color={"primary"}
      align={"center"}
      sx={{ paddingTop: 2 }}
    >
      JABS Configs
    </Typography>

    {/* Main container for vertical layout */}
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }}>
      {/* Movement configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Movement</Typography>
        <Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={noIdle}
                onChange={(_, checked) => handleConfigChange(JabsConfig.NoIdle, checked)}
                icon={<DirectionsRun sx={{ color: grey[400] }}/>}
                checkedIcon={<DirectionsRun sx={{ color: red[500] }}/>}
              />
            }
            label="No Idle"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={canIdle}
                onChange={(_, checked) => handleConfigChange(JabsConfig.CanIdle, checked)}
                icon={<DirectionsRun sx={{ color: grey[400] }}/>}
                checkedIcon={<DirectionsRun sx={{ color: green[500] }}/>}
              />
            }
            label="Can Idle"
          />
        </Stack>
      </Box>

      {/* HP Bar configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>HP Bar</Typography>
        <Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={noHpBar}
                onChange={(_, checked) => handleConfigChange(JabsConfig.NoHpBar, checked)}
                icon={<HeartBroken sx={{ color: grey[400] }}/>}
                checkedIcon={<HeartBroken sx={{ color: red[500] }}/>}
              />
            }
            label="No HP Bar"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={showHpBar}
                onChange={(_, checked) => handleConfigChange(JabsConfig.ShowHpBar, checked)}
                icon={<Favorite sx={{ color: grey[400] }}/>}
                checkedIcon={<Favorite sx={{ color: blue[500] }}/>}
              />
            }
            label="Show HP Bar"
          />
        </Stack>
      </Box>

      {/* Animation configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Animation</Typography>
        <Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={inanimate}
                onChange={(_, checked) => handleConfigChange(JabsConfig.Inanimate, checked)}
                icon={<VisibilityOff sx={{ color: grey[400] }}/>}
                checkedIcon={<VisibilityOff sx={{ color: purple[500] }}/>}
              />
            }
            label="Inanimate"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={notInanimate}
                onChange={(_, checked) => handleConfigChange(JabsConfig.NotInanimate, checked)}
                icon={<Visibility sx={{ color: grey[400] }}/>}
                checkedIcon={<Visibility sx={{ color: green[500] }}/>}
              />
            }
            label="Not Inanimate"
          />
        </Stack>
      </Box>

      {/* Invincibility configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Invincibility</Typography>
        <Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={invincible}
                onChange={(_, checked) => handleConfigChange(JabsConfig.Invincible, checked)}
                icon={<Security sx={{ color: grey[400] }}/>}
                checkedIcon={<Security sx={{ color: orange[500] }}/>}
              />
            }
            label="Invincible"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={notInvincible}
                onChange={(_, checked) => handleConfigChange(JabsConfig.NotInvincible, checked)}
                icon={<NoEncryption sx={{ color: grey[400] }}/>}
                checkedIcon={<NoEncryption sx={{ color: blue[500] }}/>}
              />
            }
            label="Not Invincible"
          />
        </Stack>
      </Box>

      {/* Name display configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Name Display</Typography>
        <Stack>
          <FormControlLabel
            control={
              <Checkbox
                checked={noName}
                onChange={(_, checked) => handleConfigChange(JabsConfig.NoName, checked)}
                icon={<BadgeSharp sx={{ color: grey[400] }}/>}
                checkedIcon={<BadgeSharp sx={{ color: red[500] }}/>}
              />
            }
            label="No Name"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={showName}
                onChange={(_, checked) => handleConfigChange(JabsConfig.ShowName, checked)}
                icon={<Badge sx={{ color: grey[400] }}/>}
                checkedIcon={<Badge sx={{ color: green[500] }}/>}
              />
            }
            label="Show Name"
          />
        </Stack>
      </Box>
    </Box>
  </>;
};

export { EnemyJabsConfigs }