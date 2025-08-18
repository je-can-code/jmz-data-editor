import React, { useEffect, useState } from "react";
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid2,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText, Select,
  Stack,
  Step,
  StepButton,
  Stepper, TextField,
  Typography
} from "@mui/material";
import RPG_Trait = Rmmz.Data.RPG_Trait;
import { Game_Trait } from "./Traits";
import { TraitManager } from "./TraitManager.ts";
import { TraitMapper } from "./TraitMapper.tsx";
import {
  Add,
  CandlestickChart,
  Clear,
  Close,
  Edit,
  HeartBroken,
  Percent,
  SportsMma,
  Sync,
  Whatshot
} from "@mui/icons-material";
import { SystemService } from "../../../../services/SystemService.ts";
import NumberInputWithLabel from "../../../../components/NumberInputWithLabel.tsx";
import { pink } from "@mui/material/colors";
import { EnemyBaseParam } from "../../../../enums/EnemyParameter.ts";

type TraitEditorProps = {
  selectedTraits: RPG_Trait[],
  updateEnemyTraits: (updatedTraits: RPG_Trait[]) => void,
}

export default function TraitEditor({
  selectedTraits,
  updateEnemyTraits
}: TraitEditorProps)
{
  //region state
  const [ selectedTrait, setSelectedTrait ] = useState<Game_Trait | null>(null);
  const [ selectedTraitIndex, setSelectedTraitIndex ] = useState<number>(0);

  const [ traitBeingEdited, setTraitBeingEdited ] = useState<RPG_Trait | null>(null);

  const [ editTraitActive, setEditTraitActive ] = useState(false);
  const [ activeStep, setActiveStep ] = React.useState(0);
  //endregion state

  //region setup

  //endregion setup

  //region actions
  const handleTraitListItemOnClickEvent = (index: number) =>
  {
    if (!selectedTraits.length) return;

    setSelectedTraitIndex(index);

    const selectedTrait = selectedTraits.at(index)!;
    setTraitBeingEdited(selectedTrait);

    const gameTrait = TraitMapper.toGameTrait(selectedTrait);
    setSelectedTrait(gameTrait);
  };

  const handleUpdateTraitBeingEditedForCode = (newCode: number) =>
  {
    const updatedTrait = determineInitialTraitBeingEdited(newCode);
    setTraitBeingEdited(updatedTrait);
  };

  const determineInitialTraitBeingEdited = (newCode: number): RPG_Trait =>
  {
    let initialTrait: RPG_Trait = {
      code: newCode,
      dataId: 0,
      value: 0
    };
    switch (newCode)
    {
      case 12: // debuff rate
      case 21: // parameter rate
      case 23: // sp-parameter rate
      case 34: // attack count
        initialTrait.value = 1;
        break;

      case 13: // state resist rate
      case 32: // attack state rate
        initialTrait.dataId = 1;
        initialTrait.value = 1;
        break;

      case 11: // element rate - dataId 0 is "no element", which isn't valid here.
      case 31: // attack element - dataId 0 is "no element", which isn't valid here.
      case 35: // attack skill
      case 41: // add skill type
      case 42: // seal skill type
      case 43: // add skill
      case 44: // seal skill
      case 51: // add weapon equip type
      case 52: // add armor equip type
      case 53: // lock slot
      case 54: // seal slot
        initialTrait.dataId = 1;
        break;

      case 22: // ex-parameter rate
      case 33: // attack speed bonus
      case 55: // enable dual-wield
      case 61: // action times
      case 62: // special flag
      case 63: // collapse type
      case 64: // party ability
        break;
    }

    return initialTrait;
  };
  //endregion actions

  //region update
  const handleAddNewTraitOnClick = (index: number | null) =>
  {
    const newTrait = {
      code: 11,
      dataId: 1,
      value: 1,
    } as RPG_Trait;
    const updatedTraits = (index === null)
      ? [ newTrait ]
      : selectedTraits.toSpliced(index, 0, newTrait);

    updateEnemyTraits(updatedTraits);
  };

  const handleUpdateTraitOnClick = (updatedTrait: RPG_Trait, index: number) =>
  {
    const updatedTraits = selectedTraits.toSpliced(index, 1, updatedTrait);
    updateEnemyTraits(updatedTraits);
  };
  //endregion update

  //region render
  const renderTraits = () =>
  {
    if (selectedTraits.length === 0) return <></>;

    const gameTraits = TraitManager.read(selectedTraits);

    return gameTraits.map(renderTrait, TraitManager);
  };

  const renderTrait = (trait: Game_Trait, index: number) =>
  {
    return (
      <ListItem
        key={index}
        secondaryAction={<>
          <IconButton
            edge={"start"}
            onClick={() =>
            {
              handleTraitListItemOnClickEvent(index);
              setEditTraitActive(true);
            }}
          >
            <Edit/>
          </IconButton>
          <IconButton
            edge={"end"}
            onClick={() =>
            {
              console.log('TODO: implement delete')
            }}
          >
            <Clear/>
          </IconButton>
        </>}
        sx={{
          px: 1,
          py: 0
        }}
      >
        <ListItemIcon>
          <Avatar
            variant={'rounded'}
            {...stringAvatar(trait.valueString, trait.code)} />
        </ListItemIcon>
        <ListItemButton
          onClick={() => handleTraitListItemOnClickEvent(index)}
          sx={{
            px: 1,
            py: 0
          }}
        >
          <ListItemText
            primary={trait.dataName}
            secondary={trait.codeName}
          ></ListItemText>
        </ListItemButton>
      </ListItem>);
  };

  /**
   * Converts a string into an object usable to render an avatar.
   * @param traitValue
   * @param traitCode
   */
  const stringAvatar = (traitValue: string, traitCode: number) =>
  {

    let childAvatar: React.JSX.Element | string = traitValue;

    if (traitCode === 31)
    {
      childAvatar = <Whatshot/>;
    }

    if (traitCode === 35)
    {
      childAvatar = <SportsMma/>;
    }

    const coloring = TraitMapper.toCodeColor(traitCode)
    return {
      sx: {
        ...coloring,
        width: 64,
        height: 48,
        textAlign: "center",
        px: 0.5
      },
      children: childAvatar,
    };
  };

  const renderStepView = () =>
  {
    switch (activeStep)
    {
      case 0:
        return renderCodeSelections();
      case 1:
        return renderDataSelections();
      case 2:
        return renderValueSelection();
    }
  };

  const renderCodeSelections = () =>
  {
    const traitListItems = TraitMapper.codes.map(renderCodeSelection);

    return <>
      <List
        dense={true}
        sx={{
          overflow: 'auto',
          maxHeight: 300
        }}
      >
        {traitListItems}
      </List>
    </>
  };

  const renderCodeSelection = (code: number, index: number) =>
  {
    const primaryText = TraitMapper.toCodeName(code);
    const secondaryText = TraitMapper.codeDescriptions[code];
    const icon = TraitMapper.toCodeIcon(code);

    return <>
      <ListItem
        key={`${code}-${index}`}
        sx={{
          px: 1,
          py: 0
        }}
      >
        <ListItemButton
          selected={traitBeingEdited?.code === code}
          onClick={() => handleUpdateTraitBeingEditedForCode(code)}
        >
          <ListItemIcon>
            {icon}
          </ListItemIcon>
          <ListItemText
            primary={primaryText}
            secondary={secondaryText}
          ></ListItemText>
        </ListItemButton>
      </ListItem>
    </>;
  };

  const renderDataSelections = () =>
  {
    if (traitBeingEdited === null) return <></>;

    switch (traitBeingEdited.code)
    {
      case 11:
        return renderElementalResistanceDataSelection();
      default:
        return <></>;
    }
  };

  const renderElementalResistanceDataSelection = () =>
  {
    if (traitBeingEdited === null) return <></>;

    const initialElement = SystemService.elements[traitBeingEdited?.dataId ?? 0];
    return <>
      <br/>
      <Autocomplete
        options={SystemService.elements}
        value={initialElement}
        sx={{
          width: 300
        }}
        onChange={(_, newValue) =>
        {
          const index = SystemService.elements.indexOf(newValue as string);
          const updatedTrait = {
            ...traitBeingEdited,
            dataId: index,
          } as RPG_Trait;
          setTraitBeingEdited(updatedTrait);
        }}
        slotProps={{
          listbox: {
            sx: {
              maxHeight: 200,
            }
          }
        }}
        renderInput={(params) => <TextField {...params} label="Elements..."/>}
      />

    </>;
  };

  const renderValueSelection = () =>
  {
    if (traitBeingEdited === null) return <></>;

    switch (traitBeingEdited.code)
    {
      case 11: // elemental rate should be -999999 - 999999, default 100.
      case 12: // debuff rate should be -999999 - 999999, default 100.
      case 13: // state resistance rate should be -999999 - 999999, default 100.
      case 21: // base parameter rate should be -999999 - 999999, default 100.
      case 23: // sp parameter rate should be -999999 - 999999, default 100.
        return <>
          <NumberInputWithLabel
            label={"Rate"}
            value={traitBeingEdited.value * 100}
            endAdornment={<Percent/>}
            onChangeEventHandler={(event) =>
            {
              const updatedValue = parseFloat(((parseInt(event.target.value) ?? 0) / 100).toFixed(2));
              const updatedTrait = {
                ...traitBeingEdited,
                value: updatedValue,
              } as RPG_Trait;
              setTraitBeingEdited(updatedTrait);
            }}
          />
        </>;
      case 22: // ex parameter rate should be -999999 - 999999 integer number input- default 0.
        return <></>;
      case 32: // on-hit state rate should be 0 - 999999 integer number input- default 100.
        return <></>;
      default:
        return <></>;
    }
  };

  const renderStepper = () =>
  {
    if (traitBeingEdited === null) return <></>;

    const trait = TraitMapper.toGameTrait(traitBeingEdited);

    return <>
      <Stepper
        orientation={"vertical"}
        nonLinear={true}
        activeStep={activeStep}
      >
        <Step>
          <StepButton
            onClick={() => setActiveStep(0)}
          >
            {trait.codeName}
          </StepButton>
        </Step>

        <Step>
          <StepButton
            onClick={() => setActiveStep(1)}
          >
            {trait.dataName}
          </StepButton>
        </Step>

        <Step>
          <StepButton
            onClick={() => setActiveStep(2)}
          >
            Value: {trait.valueString.length > 0
            ? trait.valueString
            : "N/A"}
          </StepButton>
        </Step>
      </Stepper>
    </>
  };


  //endregion render

  return <>
    <Stack spacing={0}>
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
      }}>
        <Typography
          variant={"h5"}
          align={"center"}
          color={"primary"}
          sx={{ paddingTop: 2 }}
        >
          Traits
        </Typography>

        <Button
          sx={{
            px: 1,
            paddingBottom: 0.5,
            height: 32,
          }}
          color={"success"}
          endIcon={<Add
            sx={{
              paddingBottom: 0.5,
            }}
          />}
          variant={"outlined"}
          size={"large"}
          onClick={() => handleAddNewTraitOnClick(selectedTraits.length)}
        >
          Add Trait
        </Button>
      </Box>

      <div style={{ cursor: 'context-menu' }}>
        <List
          dense={true}
          sx={{
            overflow: 'auto',
            maxHeight: 800
          }}
        >
          {selectedTraits.length > 0
            ? renderTraits()
            : <>Choose "Add Trait" to get started.</>}
        </List>
      </div>
    </Stack>

    {/*region not-grid-related elements */}
    <Dialog
      open={editTraitActive}
      onClose={() => setEditTraitActive(false)}
      fullWidth={true}
      maxWidth={"md"}
      sx={{
        '& .MuiDialog-paper': {
          maxHeight: 450,
          minHeight: 400,
        }
      }}
    >
      <DialogTitle>
        <Typography variant={"h4"}>
          Modify Trait
        </Typography>
      </DialogTitle>
      <DialogContent>
        {selectedTrait === null
          ? <></>
          : <>
            <Grid2 container spacing={2}>
              <Grid2 size={3}>
                {renderStepper()}
              </Grid2>
              <Grid2 size={9}>
                {renderStepView()}
              </Grid2>
            </Grid2>

          </>}
      </DialogContent>
      <DialogActions>
        <Button
          variant={"contained"}
          color={"warning"}
          startIcon={<Close/>}
          onClick={() => setEditTraitActive(false)}
        >
          Nevermind
        </Button>
        <Button
          color={"primary"}
          variant={"contained"}
          startIcon={<Sync/>}
          onClick={() =>
          {
            handleUpdateTraitOnClick(traitBeingEdited!, selectedTraitIndex);
            setSelectedTrait(TraitMapper.toGameTrait(traitBeingEdited!));
            setEditTraitActive(false);
          }}
        >
          Update Trait
        </Button>
      </DialogActions>
    </Dialog>
  </>
}