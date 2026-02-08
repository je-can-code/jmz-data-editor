import React, { useState } from 'react';
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
  Stepper, SxProps,
  TextField, Theme,
  Typography
} from '@mui/material';
import { Game_Trait } from './Traits';
import {
  Add,
  Clear,
  Close,
  Edit,
  Percent,
  SportsMma,
  Sync,
  Whatshot
} from '@mui/icons-material';
import { SystemService } from '@services/SystemService.ts';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import {
  fromBParamIdToName,
  fromSParamIdToName,
  fromXParamIdToName
} from '../../../mappers/ParameterIdMapper.ts';
import { CollapseEffect, PartyAbility, SpecialFlag } from '@core/enums/TraitValues.ts';
import RPG_Trait = Rmmz.Data.RPG_Trait;
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useTraitMapping } from '@presentation/hooks/useTraitMapping.ts';

type TraitEditorProps = {
  selectedTraits: RPG_Trait[],
  updateEnemyTraits: (updatedTraits: RPG_Trait[]) => void,
}

const TraitEditor = ({
  selectedTraits,
  updateEnemyTraits
}: TraitEditorProps) =>
{
  const {
    states,
    loading: statesLoading
  } = useStates();
  const {
    skills,
    loading: skillsLoading
  } = useSkills();
  const {
    toGameTrait,
    toCodeColor,
    toCodeIcon,
    codes,
    codeDescriptions,
    getTraitCodeName,
  } = useTraitMapping();

  //region state
  const [ selectedTrait, setSelectedTrait ] = useState<Game_Trait | null>(null);
  const [ selectedTraitIndex, setSelectedTraitIndex ] = useState<number>(0);

  const [ traitBeingEdited, setTraitBeingEdited ] = useState<RPG_Trait | null>(null);

  const [ editTraitActive, setEditTraitActive ] = useState(false);
  const [ activeStep, setActiveStep ] = React.useState(0);
  //endregion state

  //region actions
  /**
   * Helper to synchronize updated traits back to the parent component.
   * @param {RPG_Trait[]} updatedTraits The complete updated traits array.
   */
  const applyTraits = (updatedTraits: RPG_Trait[]) =>
  {
    updateEnemyTraits(updatedTraits);
  };

  const handleTraitListItemOnClickEvent = (index: number) =>
  {
    const trait = selectedTraits.at(index)!;
    setSelectedTraitIndex(index);
    setTraitBeingEdited(trait);

    // No more TraitMapper.toGameTrait()!
    const gameTrait = toGameTrait(trait);
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
      value: 1
    } as RPG_Trait;

    const updatedTraits = (index === null)
      ? [ newTrait ]
      : selectedTraits.toSpliced(index, 0, newTrait);

    applyTraits(updatedTraits);
  };

  const handleUpdateTraitOnClick = (
    updatedTrait: RPG_Trait,
    index: number
  ) =>
  {
    const updatedTraits = selectedTraits.with(index, updatedTrait);
    applyTraits(updatedTraits);
  };

  const handleDeleteTraitOnClick = (index: number) =>
  {
    const updatedTraits = selectedTraits.toSpliced(index, 1);
    applyTraits(updatedTraits);

    // clean up dialog state if we deleted the trait we were currently viewing/editing
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
    if (selectedTraits.length === 0)
    {
      return <></>;
    }

    return selectedTraits
      .map(toGameTrait)
      .map((
        trait,
        index
      ) => renderTrait(trait, index));
  };

  const renderTrait = (
    trait: Game_Trait,
    index: number
  ) =>
  {
    // Deconstruct the avatar configuration.
    const avatarConfig = stringAvatar(trait.valueString, trait.code);

    return (
      <ListItem
        key={index}
        secondaryAction={
          <>
            <IconButton
              edge={"start"}
              onClick={() =>
              {
                handleTraitListItemOnClickEvent(index);
                setEditTraitActive(true);
              }}
            >
              <Edit />
            </IconButton>
            <IconButton
              edge={"end"}
              onClick={() =>
              {
                handleDeleteTraitOnClick(index);
              }}
            >
              <Clear />
            </IconButton>
          </>
        }
        sx={{ px: 1, py: 0 }}
      >
        <ListItemIcon>
          <Avatar
            variant={"rounded"}
            {...avatarConfig}
          />
        </ListItemIcon>
        <ListItemButton
          onClick={() => handleTraitListItemOnClickEvent(index)}
          sx={{ px: 1, py: 0 }}
        >
          <ListItemText
            primary={trait.dataName}
            secondary={trait.codeName}
          />
        </ListItemButton>
      </ListItem>
    );
  };

  /**
   * Converts a string into an object usable to render an avatar.
   * @param {string} traitValue The display value for the trait.
   * @param {number} traitCode The RMMZ trait code.
   * @returns {{ sx: SxProps<Theme>, children: React.ReactNode }} The avatar configuration.
   */
  const stringAvatar = (
    traitValue: string,
    traitCode: number
  ): { sx: SxProps<Theme>, children: React.ReactNode } =>
  {
    let childAvatar: React.ReactNode = traitValue;
    if (traitCode === 31)
    {
      childAvatar = <Whatshot />;
    }
    else if (traitCode === 35)
    {
      childAvatar = <SportsMma />;
    }

    const coloring = toCodeColor(traitCode);

    return {
      sx: {
        ...coloring,
        width: 64,
        height: 48,
        textAlign: "center",
        px: 0.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
    return (
      <List dense sx={{
        overflow: 'auto',
        maxHeight: 300
      }}>
        {codes.map(renderCodeSelection)}
      </List>
    );
  };

  const renderCodeSelection = (
    code: number,
    index: number
  ) =>
  {
    const primaryText = getTraitCodeName(code);
    const secondaryText = codeDescriptions[ code ];
    const icon = toCodeIcon(code);

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
    if (traitBeingEdited === null)
    {
      return <></>;
    }

    switch (traitBeingEdited.code)
    {
      // rates
      case 11:
        return renderSearchableSelection(SystemService.elements, 'Element', 300);
      case 12:
        return renderParamDataSelection('Debuff Param', 8, fromBParamIdToName);
      case 13:
        return renderSearchableSelection(states.map(s => s.name), 'State');
      case 14:
        return renderSearchableSelection(states.map(s => s.name), 'Immunity to State');

      // parameters
      case 21:
        return renderParamDataSelection('Base Parameter', 8, fromBParamIdToName);
      case 22:
        return renderParamDataSelection('EX Parameter', 10, fromXParamIdToName);
      case 23:
        return renderParamDataSelection('SP Parameter', 10, fromSParamIdToName);

      // attack-related
      case 31:
        return renderSearchableSelection(SystemService.elements, 'On-Hit Element', 300);
      case 32:
        return renderSearchableSelection(states.map(s => s.name), 'On-Hit State');
      case 33:
        return <Typography>Select the speed value in the next step.</Typography>;
      case 34:
        return <Typography>Select the extra hit count in the next step.</Typography>;
      case 35:
        return renderSearchableSelection(skills.map(s => `${s.name} (id:${s.id})`), 'Attack Skill', 420);

      // skills
      case 41:
        return renderSearchableSelection(SystemService.systemData.skillTypes, 'Add Skill Type');
      case 42:
        return renderSearchableSelection(SystemService.systemData.skillTypes, 'Seal Skill Type');
      case 43:
        return renderSearchableSelection(skills.map(s => `${s.name} (id:${s.id})`), 'Add Skill', 420);
      case 44:
        return renderSearchableSelection(skills.map(s => `${s.name} (id:${s.id})`), 'Seal Skill', 420);

      // equipment
      case 51:
        return renderSearchableSelection(SystemService.weaponTypes, 'Weapon Type');
      case 52:
        return renderSearchableSelection(SystemService.armorTypes, 'Armor Type');
      case 53:
        return renderSearchableSelection(SystemService.equipTypes, 'Lock Slot');
      case 54:
        return renderSearchableSelection(SystemService.equipTypes, 'Seal Slot');
      case 55:
        return <Typography>No selection necessary.</Typography>;

      // other
      case 61:
        return <Typography>Select the chance in the next step.</Typography>;
      case 62:
        return renderSearchableSelection(SpecialFlag, 'Special Flag');
      case 63:
        return renderSearchableSelection(CollapseEffect, 'Collapse Effect');
      case 64:
        return renderSearchableSelection(PartyAbility, 'Party Ability');

      default:
        return <></>;
    }
  };

  /**
   * A generic, searchable selection helper that wraps the Autocomplete component.
   * Centralizes layout and standard update logic while preserving custom labels.
   * @param {string[]} options The list of string options to display.
   * @param {string} label The label for the input field.
   * @param {number} width The fixed width of the Autocomplete component.
   */
  const renderSearchableSelection = (
    options: string[],
    label: string,
    width: number = 360
  ) =>
  {
    if (traitBeingEdited === null)
    {
      return <></>;
    }

    const initial = options.at(traitBeingEdited.dataId ?? 0);

    return (
      <React.Fragment key={label}>
        <br/>
        <Autocomplete
          options={options}
          value={initial}
          sx={{ width }}
          onChange={(
            _,
            newValue
          ) =>
          {
            const index = options.indexOf(newValue as string);
            const updatedTrait = {
              ...traitBeingEdited,
              dataId: Math.max(0, index),
            } as RPG_Trait;
            setTraitBeingEdited(updatedTrait);
          }}
          slotProps={{
            listbox: { sx: { maxHeight: 240 } }
          }}
          renderInput={(params) => <TextField {...params} label={`${label}...`}/>}
        />
      </React.Fragment>
    );
  };

  /**
   * Consolidated helper for rendering parameter-based data selections (Base, EX, and SP params).
   * @param {string} label The UI label for the autocomplete.
   * @param {number} length The number of parameters in the set.
   * @param {(id: number) => string} formatter The mapping function for ID to Name.
   */
  const renderParamDataSelection = (
    label: string,
    length: number,
    formatter: (id: number) => string
  ) =>
  {
    if (traitBeingEdited === null)
    {
      return <></>;
    }

    const options = Array.from(
      { length },
      (
        _,
        i
      ) => formatter(i)
    );
    const initial = options.at(traitBeingEdited.dataId ?? 0);

    return (
      <React.Fragment key={label}>
        <br/>
        <Autocomplete
          options={options}
          value={initial}
          sx={{ width: 300 }}
          onChange={(
            _,
            newValue
          ) =>
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
      </React.Fragment>
    );
  };

  const renderValueSelection = () =>
  {
    if (traitBeingEdited === null)
    {
      return <></>;
    }

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
            label={'Rate'}
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
            label={'Apply Rate'}
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
            label={'Speed'}
            value={traitBeingEdited.value ?? 0}
            onChangeEventHandler={(event) =>
            {
              const raw = parseInt(event.target.value);
              const updatedTrait = {
                ...traitBeingEdited,
                value: isNaN(raw)
                  ? 0
                  : raw,
              } as RPG_Trait;
              setTraitBeingEdited(updatedTrait);
            }}
          />
        </>;

      // attack count modifier: integer (extra hits)
      case 34:
        return <>
          <NumberInputWithLabel
            label={'Extra Hits'}
            value={traitBeingEdited.value ?? 0}
            onChangeEventHandler={(event) =>
            {
              const raw = parseInt(event.target.value);
              const updatedTrait = {
                ...traitBeingEdited,
                value: isNaN(raw)
                  ? 0
                  : raw,
              } as RPG_Trait;
              setTraitBeingEdited(updatedTrait);
            }}
          />
        </>;

      // action times: percentage chance (factor)
      case 61:
        return <>
          <NumberInputWithLabel
            label={'Extra Turn Chance'}
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
    if (traitBeingEdited === null)
    {
      return <></>;
    }

    const trait = toGameTrait(traitBeingEdited);

    return <>
      <Stepper
        orientation={'vertical'}
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
            : 'N/A'}
          </StepButton>
        </Step>
      </Stepper>
    </>;
  };
  //endregion render

  if (statesLoading || skillsLoading)
  {
    return <Typography>Loading mapping data...</Typography>;
  }

  return <>
    <Stack spacing={0}>
      <Box sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
      }}>
        <Typography
          variant={'h5'}
          align={'center'}
          color={'primary'}
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
          color={'success'}
          endIcon={<Add
            sx={{
              paddingBottom: 0.5,
            }}
          />}
          variant={'outlined'}
          size={'large'}
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
      maxWidth={'md'}
      sx={{
        '& .MuiDialog-paper': {
          maxHeight: 450,
          minHeight: 400,
        }
      }}
    >
      <DialogTitle id={'trait-editor-title'}>
        <Typography component={'span'} variant={'h4'}>
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
          variant={'contained'}
          color={'warning'}
          startIcon={<Close/>}
          onClick={() => setEditTraitActive(false)}
        >
          Nevermind
        </Button>
        <Button
          color={'primary'}
          variant={'contained'}
          startIcon={<Sync/>}
          disabled={traitBeingEdited === null}
          onClick={() =>
          {
            if (traitBeingEdited)
            {
              handleUpdateTraitOnClick(traitBeingEdited, selectedTraitIndex);
              setSelectedTrait(toGameTrait(traitBeingEdited));
              setEditTraitActive(false);
            }
          }}
        >
          Update Trait
        </Button>
      </DialogActions>
    </Dialog>
  </>;
};

export default TraitEditor;
