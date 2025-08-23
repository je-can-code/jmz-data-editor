import React, { useState } from "react";
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Step,
  StepButton,
  Stepper,
  TextField,
  Typography
} from "@mui/material";
import { Game_Trait } from "./Traits";
import { TraitManager } from "./TraitManager.ts";
import { TraitMapper } from "./TraitMapper.tsx";
import {
  Add,
  Clear,
  Close,
  Edit,
  Percent,
  SportsMma,
  Sync,
  Whatshot
} from "@mui/icons-material";
import { SystemService } from "../../../../services/SystemService.ts";
import NumberInputWithLabel from "../../../../components/NumberInputWithLabel.tsx";
import {
  fromBParamIdToName,
  fromSParamIdToName,
  fromXParamIdToName
} from "../../../../mappers/ParameterIdMapper.ts";
import { CollapseEffect, PartyAbility, SpecialFlag } from "../../../../enums/TraitValues.ts";
import RPG_Trait = Rmmz.Data.RPG_Trait;


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

  //region actions
  const handleTraitListItemOnClickEvent = (index: number) =>
  {
    if (!selectedTraits.length) return;

    setSelectedTraitIndex(index);

    const selectedTrait = selectedTraits.at(index)!;
    setTraitBeingEdited(selectedTrait);

    const gameTrait = TraitMapper.toGameTrait(selectedTrait);
    setSelectedTrait(gameTrait);
    setActiveStep(0);
  };

  const handleUpdateTraitBeingEditedForCode = (newCode: number) =>
  {
    const updated = determineInitialTraitBeingEdited(newCode);
    setTraitBeingEdited(updated);
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
      case 14: // state immunity
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

  const handleDeleteTraitOnClick = (index: number) =>
  {
    const updatedTraits = selectedTraits.toSpliced(index, 1);
    updateEnemyTraits(updatedTraits);

    // clean up dialog state if we deleted the trait we were editing
    if (selectedTraitIndex === index)
    {
      setEditTraitActive(false);
      setTraitBeingEdited(null);
      setSelectedTrait(null);
      setActiveStep(0);
    }
  };
  //endregion actions

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
              handleDeleteTraitOnClick(index);
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
      // rates
      case 11:
        return renderElementalResistanceDataSelection();
      case 12:
        return renderBParamDataSelection("Debuff Param", fromBParamIdToName);
      case 13:
        return renderStateDataSelection("State");
      case 14:
        return renderStateDataSelection("Immunity to State");

      // parameters
      case 21:
        return renderBParamDataSelection("Base Parameter", fromBParamIdToName);
      case 22:
        return renderXParamDataSelection("EX Parameter", fromXParamIdToName);
      case 23:
        return renderSParamDataSelection("SP Parameter", fromSParamIdToName);

      // attack-related
      case 31:
        return renderElementalResistanceDataSelection("On-Hit Element");
      case 32:
        return renderStateDataSelection("On-Hit State");
      case 33:
        return <Typography>Select the speed value in the next step.</Typography>;
      case 34:
        return <Typography>Select the extra hit count in the next step.</Typography>;
      case 35:
        return renderSkillDataSelection("Attack Skill");

      // skills
      case 41:
        return renderSkillTypeSelection("Add Skill Type");
      case 42:
        return renderSkillTypeSelection("Seal Skill Type");
      case 43:
        return renderSkillDataSelection("Add Skill");
      case 44:
        return renderSkillDataSelection("Seal Skill");

      // equipment
      case 51:
        return renderStringArraySelection(SystemService.weaponTypes, "Weapon Type");
      case 52:
        return renderStringArraySelection(SystemService.armorTypes, "Armor Type");
      case 53:
        return renderStringArraySelection(SystemService.equipTypes, "Lock Slot");
      case 54:
        return renderStringArraySelection(SystemService.equipTypes, "Seal Slot");
      case 55:
        return <Typography>No selection necessary.</Typography>;

      // other
      case 61:
        return <Typography>Select the chance in the next step.</Typography>;
      case 62:
        return renderStringArraySelection(SpecialFlag, "Special Flag");
      case 63:
        return renderStringArraySelection(CollapseEffect, "Collapse Effect");
      case 64:
        return renderStringArraySelection(PartyAbility, "Party Ability");

      default:
        return <></>;
    }
  };

  const renderElementalResistanceDataSelection = (label: string = "Element") =>
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
            dataId: Math.max(0, index),
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
        renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
      />

    </>;
  };

  const renderBParamDataSelection = (label: string, formatter: (id: number) => string) =>
  {
    if (traitBeingEdited === null) return <></>;

    const ids = Array.from({ length: 8 }, (_, i) => i);
    const options = ids.map(formatter);
    const initial = options.at(traitBeingEdited.dataId ?? 0);
    return <>
      <br/>
      <Autocomplete
        options={options}
        value={initial}
        sx={{ width: 300 }}
        onChange={(_, newValue) =>
        {
          const index = options.indexOf(newValue as string);
          const updatedTrait = {
            ...traitBeingEdited,
            dataId: Math.max(0, index),
          } as RPG_Trait;
          setTraitBeingEdited(updatedTrait);
        }}
        renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
      />
    </>;
  };

  const renderXParamDataSelection = (label: string, formatter: (id: number) => string) =>
  {
    if (traitBeingEdited === null) return <></>;
    const ids = Array.from({ length: 10 }, (_, i) => i);
    const options = ids.map(formatter);
    const initial = options.at(traitBeingEdited.dataId ?? 0);
    return <>
      <br/>
      <Autocomplete
        options={options}
        value={initial}
        sx={{ width: 300 }}
        onChange={(_, newValue) =>
        {
          const index = options.indexOf(newValue as string);
          const updatedTrait = {
            ...traitBeingEdited,
            dataId: Math.max(0, index),
          } as RPG_Trait;
          setTraitBeingEdited(updatedTrait);
        }}
        renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
      />
    </>;
  };

  const renderSParamDataSelection = (label: string, formatter: (id: number) => string) =>
  {
    if (traitBeingEdited === null) return <></>;
    const ids = Array.from({ length: 10 }, (_, i) => i);
    const options = ids.map(formatter);
    const initial = options.at(traitBeingEdited.dataId ?? 0);
    return <>
      <br/>
      <Autocomplete
        options={options}
        value={initial}
        sx={{ width: 300 }}
        onChange={(_, newValue) =>
        {
          const index = options.indexOf(newValue as string);
          const updatedTrait = {
            ...traitBeingEdited,
            dataId: Math.max(0, index),
          } as RPG_Trait;
          setTraitBeingEdited(updatedTrait);
        }}
        renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
      />
    </>;
  };

  const renderStateDataSelection = (label: string) =>
  {
    if (traitBeingEdited === null) return <></>;
    const options = SystemService.stateData.map(s => s?.name ?? "");
    const initial = options.at(traitBeingEdited.dataId ?? 0);
    return <>
      <br/>
      <Autocomplete
        options={options}
        value={initial}
        sx={{ width: 360 }}
        onChange={(_, newValue) =>
        {
          const index = options.indexOf(newValue as string);
          const updatedTrait = {
            ...traitBeingEdited,
            dataId: Math.max(0, index),
          } as RPG_Trait;
          setTraitBeingEdited(updatedTrait);
        }}
        slotProps={{
          listbox: {
            sx: { maxHeight: 240 }
          }
        }}
        renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
      />
    </>;
  };

  const renderSkillDataSelection = (label: string) =>
  {
    if (traitBeingEdited === null) return <></>;
    const options = SystemService.skillData.map(s => `${s?.name ?? ""} (id:${s?.id ?? 0})`);
    const initial = options.at(traitBeingEdited.dataId ?? 0);
    return <>
      <br/>
      <Autocomplete
        options={options}
        value={initial}
        sx={{ width: 420 }}
        onChange={(_, newValue) =>
        {
          const index = options.indexOf(newValue as string);
          const updatedTrait = {
            ...traitBeingEdited,
            dataId: Math.max(0, index),
          } as RPG_Trait;
          setTraitBeingEdited(updatedTrait);
        }}
        slotProps={{
          listbox: {
            sx: { maxHeight: 240 }
          }
        }}
        renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
      />
    </>;
  };

  const renderSkillTypeSelection = (label: string) =>
  {
    if (traitBeingEdited === null) return <></>;
    const options = SystemService.systemData.skillTypes;
    const initial = options.at(traitBeingEdited.dataId ?? 0);
    return <>
      <br/>
      <Autocomplete
        options={options}
        value={initial}
        sx={{ width: 360 }}
        onChange={(_, newValue) =>
        {
          const index = options.indexOf(newValue as string);
          const updatedTrait = {
            ...traitBeingEdited,
            dataId: Math.max(0, index),
          } as RPG_Trait;
          setTraitBeingEdited(updatedTrait);
        }}
        renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
      />
    </>;
  };

  const renderStringArraySelection = (options: string[], label: string) =>
  {
    if (traitBeingEdited === null) return <></>;
    const initial = options.at(traitBeingEdited.dataId ?? 0);
    return <>
      <br/>
      <Autocomplete
        options={options}
        value={initial}
        sx={{ width: 360 }}
        onChange={(_, newValue) =>
        {
          const index = options.indexOf(newValue as string);
          const updatedTrait = {
            ...traitBeingEdited,
            dataId: Math.max(0, index),
          } as RPG_Trait;
          setTraitBeingEdited(updatedTrait);
        }}
        renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
      />
    </>;
  };

  const renderValueSelection = () =>
  {
    if (traitBeingEdited === null) return <></>;

    switch (traitBeingEdited.code)
    {
      // percentage-based: value stored as 0.0-? factor
      case 11: // elemental rate
      case 12: // debuff rate
      case 13: // state rate
      case 21: // base parameter rate
      case 22: // ex parameter rate
      case 23: // sp parameter rate
        return <>
          <NumberInputWithLabel
            label={"Rate"}
            value={(traitBeingEdited.value ?? 0) * 100}
            endAdornment={<Percent/>}
            onChangeEventHandler={(event) =>
            {
              const raw = parseInt(event.target.value);
              const updatedValue = isNaN(raw)
                ? 0
                : parseFloat(((raw) / 100).toFixed(2));
              const updatedTrait = {
                ...traitBeingEdited,
                value: updatedValue,
              } as RPG_Trait;
              setTraitBeingEdited(updatedTrait);
            }}
          />
        </>;

      // on-hit state application rate (percentage factor)
      case 32:
        return <>
          <NumberInputWithLabel
            label={"Apply Rate"}
            value={(traitBeingEdited.value ?? 0) * 100}
            endAdornment={<Percent/>}
            onChangeEventHandler={(event) =>
            {
              const raw = parseInt(event.target.value);
              const updatedValue = isNaN(raw)
                ? 0
                : parseFloat(((raw) / 100).toFixed(2));
              const updatedTrait = {
                ...traitBeingEdited,
                value: updatedValue,
              } as RPG_Trait;
              setTraitBeingEdited(updatedTrait);
            }}
          />
        </>;

      // attack speed modifier: integer
      case 33:
        return <>
          <NumberInputWithLabel
            label={"Speed"}
            value={traitBeingEdited.value ?? 0}
            onChangeEventHandler={(event) =>
            {
              const raw = parseInt(event.target.value);
              const updatedTrait = {
                ...traitBeingEdited,
                value: isNaN(raw) ? 0 : raw,
              } as RPG_Trait;
              setTraitBeingEdited(updatedTrait);
            }}
          />
        </>;

      // attack count modifier: integer (extra hits)
      case 34:
        return <>
          <NumberInputWithLabel
            label={"Extra Hits"}
            value={traitBeingEdited.value ?? 0}
            onChangeEventHandler={(event) =>
            {
              const raw = parseInt(event.target.value);
              const updatedTrait = {
                ...traitBeingEdited,
                value: isNaN(raw) ? 0 : raw,
              } as RPG_Trait;
              setTraitBeingEdited(updatedTrait);
            }}
          />
        </>;

      // action times: percentage chance (factor)
      case 61:
        return <>
          <NumberInputWithLabel
            label={"Extra Turn Chance"}
            value={(traitBeingEdited.value ?? 0) * 100}
            endAdornment={<Percent/>}
            onChangeEventHandler={(event) =>
            {
              const raw = parseInt(event.target.value);
              const updatedValue = isNaN(raw)
                ? 0
                : parseFloat(((raw) / 100).toFixed(2));
              const updatedTrait = {
                ...traitBeingEdited,
                value: updatedValue,
              } as RPG_Trait;
              setTraitBeingEdited(updatedTrait);
            }}
          />
        </>;

      // codes without a numeric value component
      case 14: // state immunity
      case 31: // attack element
      case 35: // attack skill
      case 41:
      case 42:
      case 43:
      case 44:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 62:
      case 63:
      case 64:
        return <Typography>No numeric value for this trait.</Typography>;

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
      <DialogTitle id={"trait-editor-title"}>
        <Typography component={"span"} variant={"h4"}>
          Modify Trait
        </Typography>
      </DialogTitle>
      <DialogContent>
        {selectedTrait === null
          ? <></>
          : <>
            <Grid container spacing={2}>
              <Grid size={3}>
                {renderStepper()}
              </Grid>
              <Grid size={9}>
                {renderStepView()}
              </Grid>
            </Grid>

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