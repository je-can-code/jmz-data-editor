import React, { type MouseEvent, useState, } from 'react';
import {
  Autocomplete,
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
  Menu,
  MenuItem,
  Stack,
  Step,
  StepButton,
  Stepper,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Game_Trait } from './Traits';
import { ArrowDownward, ArrowUpward, Close, DeleteOutline, Edit, Percent, Sync, } from '@mui/icons-material';
import { SystemService } from '@services/SystemService.ts';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { fromBParamIdToName, fromSParamIdToName, fromXParamIdToName } from '../../../mappers/ParameterIdMapper.ts';
import { CollapseEffect, PartyAbility, SpecialFlag } from '@core/enums/TraitValues.ts';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useTraitMapping } from '@presentation/hooks/useTraitMapping.ts';
import RPG_Trait = Rmmz.Data.RPG_Trait;

/**
 * Order | value text | trait labels | edit/delete. Matches {@link UsableEffectsEditor} row rhythm.
 */
const TRAIT_EDITOR_GRID_TEMPLATE = '88px minmax(4.5rem, 7rem) minmax(0, 1fr) 88px';

/**
 * How each trait code presents its value field. A {@code percent} trait stores a factor and is authored
 * as a whole-number percent; an {@code integer} trait stores exactly what was typed. Only the caption
 * differs between traits sharing a kind.
 */
const TRAIT_VALUE_INPUTS: Record<number, { kind: 'percent' | 'integer'; label: string }> = {
  11: { kind: 'percent', label: 'Rate' }, // elemental rate
  12: { kind: 'percent', label: 'Rate' }, // debuff rate
  13: { kind: 'percent', label: 'Rate' }, // state rate
  21: { kind: 'percent', label: 'Rate' }, // base parameter rate
  22: { kind: 'percent', label: 'Rate' }, // ex parameter rate
  23: { kind: 'percent', label: 'Rate' }, // sp parameter rate
  32: { kind: 'percent', label: 'Apply Rate' }, // on-hit state application rate
  33: { kind: 'integer', label: 'Speed' }, // attack speed modifier
  34: { kind: 'integer', label: 'Extra Hits' }, // attack count modifier
  61: { kind: 'percent', label: 'Extra Turn Chance' }, // action times
};

/**
 * The trait codes that carry no numeric value at all. These are distinct from codes this editor does
 * not recognize: a listed code renders a note saying there is nothing to set, where an unknown one
 * renders nothing.
 */
const TRAIT_CODES_WITHOUT_VALUE = new Set([
  14, // state immunity
  31, // attack element
  35, // attack skill
  41, 42, 43, 44, // skill access
  51, 52, 53, 54, 55, // equipment
  62, 63, 64, // party-wide
]);

/**
 * What a freshly added trait starts at, keyed by trait code. Zero is a fine starting point for most
 * fields, but not all: a rate of zero would read as "nullify", and a dataId of zero names the engine's
 * "none" row, which is not something an author can mean to pick.
 *
 * Codes absent from this table start at zero for both, which is correct for them -- 22, 33, 55, 61,
 * 62, 63 and 64 either take no dataId or read zero as a real value.
 */
const TRAIT_SEED_VALUES: Record<number, { dataId: number; value: number }> = {
  // rate traits are multipliers, so they open at 1x rather than at zero.
  12: { dataId: 0, value: 1 }, // debuff rate
  21: { dataId: 0, value: 1 }, // parameter rate
  23: { dataId: 0, value: 1 }, // sp-parameter rate
  34: { dataId: 0, value: 1 }, // attack count

  // state traits name a state and carry a rate, so both fields open at one.
  13: { dataId: 1, value: 1 }, // state resist rate
  14: { dataId: 1, value: 1 }, // state immunity
  32: { dataId: 1, value: 1 }, // attack state rate

  // these name a database row, where id 0 is the engine's "none" and is not a valid pick.
  11: { dataId: 1, value: 0 }, // element rate
  31: { dataId: 1, value: 0 }, // attack element
  35: { dataId: 1, value: 0 }, // attack skill
  41: { dataId: 1, value: 0 }, // add skill type
  42: { dataId: 1, value: 0 }, // seal skill type
  43: { dataId: 1, value: 0 }, // add skill
  44: { dataId: 1, value: 0 }, // seal skill
  51: { dataId: 1, value: 0 }, // add weapon equip type
  52: { dataId: 1, value: 0 }, // add armor equip type
  53: { dataId: 1, value: 0 }, // lock slot
  54: { dataId: 1, value: 0 }, // seal slot
};

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

  const [ addMenuAnchor, setAddMenuAnchor ] = useState<HTMLElement | null>(null);
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
    const seed = TRAIT_SEED_VALUES[ newCode ] ?? {
      dataId: 0,
      value: 0,
    };

    return {
      code: newCode,
      dataId: seed.dataId,
      value: seed.value,
    };
  };

  const handleAddMenuOpen = (event: MouseEvent<HTMLElement>) =>
  {
    setAddMenuAnchor(event.currentTarget);
  };

  const handleAddMenuClose = () =>
  {
    setAddMenuAnchor(null);
  };

  const handleAddTraitPick = (code: number) =>
  {
    const newTrait = determineInitialTraitBeingEdited(code);
    applyTraits([ ...selectedTraits, newTrait ]);
    handleAddMenuClose();
  };

  const handleMoveTrait = (
    index: number,
    delta: number
  ) =>
  {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= selectedTraits.length)
    {
      return;
    }
    const copy = [ ...selectedTraits ];
    const [ row ] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, row);
    applyTraits(copy);

    if (selectedTraitIndex === index)
    {
      setSelectedTraitIndex(nextIndex);
    }
    else if (selectedTraitIndex === nextIndex)
    {
      setSelectedTraitIndex(index);
    }
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

    if (selectedTraitIndex > index)
    {
      setSelectedTraitIndex(selectedTraitIndex - 1);
    }
    else if (selectedTraitIndex === index)
    {
      setEditTraitActive(false);
      setTraitBeingEdited(null);
      setSelectedTrait(null);
      setActiveStep(0);
      setSelectedTraitIndex(
        updatedTraits.length === 0
          ? 0
          : Math.min(index, updatedTraits.length - 1)
      );
    }
    else if (selectedTraitIndex >= updatedTraits.length)
    {
      setSelectedTraitIndex(Math.max(0, updatedTraits.length - 1));
    }
  };
  //endregion actions

  //region render
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

    // trait codes group by their tens digit, and each group picks its dataId from a different source.
    const { code } = traitBeingEdited;
    if (code <= 14)
    {
      return renderRateDataSelection(code);
    }
    if (code <= 23)
    {
      return renderParameterDataSelection(code);
    }
    if (code <= 35)
    {
      return renderAttackDataSelection(code);
    }
    if (code <= 44)
    {
      return renderSkillDataSelection(code);
    }
    if (code <= 55)
    {
      return renderEquipmentDataSelection(code);
    }

    return renderOtherDataSelection(code);
  };

  /**
   * Picks the dataId source for the resistance rate traits.
   * @param {number} code The trait code being edited.
   */
  const renderRateDataSelection = (code: number) =>
  {
    switch (code)
    {
      case 11:
        return renderSearchableSelection(SystemService.elements, 'Element', 300);
      case 12:
        return renderParamDataSelection('Debuff Param', 8, fromBParamIdToName);
      case 13:
        return renderSearchableSelection(states.map(s => s.name), 'State');
      case 14:
        return renderSearchableSelection(states.map(s => s.name), 'Immunity to State');
      default:
        return <></>;
    }
  };

  /**
   * Picks the dataId source for the parameter rate traits.
   * @param {number} code The trait code being edited.
   */
  const renderParameterDataSelection = (code: number) =>
  {
    switch (code)
    {
      case 21:
        return renderParamDataSelection('Base Parameter', 8, fromBParamIdToName);
      case 22:
        return renderParamDataSelection('EX Parameter', 10, fromXParamIdToName);
      case 23:
        return renderParamDataSelection('SP Parameter', 10, fromSParamIdToName);
      default:
        return <></>;
    }
  };

  /**
   * Picks the dataId source for the attack traits. Speed and hit count carry no dataId, so they say so
   * rather than showing an empty picker.
   * @param {number} code The trait code being edited.
   */
  const renderAttackDataSelection = (code: number) =>
  {
    switch (code)
    {
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
      default:
        return <></>;
    }
  };

  /**
   * Picks the dataId source for the skill access traits.
   * @param {number} code The trait code being edited.
   */
  const renderSkillDataSelection = (code: number) =>
  {
    switch (code)
    {
      case 41:
        return renderSearchableSelection(SystemService.systemData.skillTypes, 'Add Skill Type');
      case 42:
        return renderSearchableSelection(SystemService.systemData.skillTypes, 'Seal Skill Type');
      case 43:
        return renderSearchableSelection(skills.map(s => `${s.name} (id:${s.id})`), 'Add Skill', 420);
      case 44:
        return renderSearchableSelection(skills.map(s => `${s.name} (id:${s.id})`), 'Seal Skill', 420);
      default:
        return <></>;
    }
  };

  /**
   * Picks the dataId source for the equipment traits. Dual-wield is a flag with nothing to select.
   * @param {number} code The trait code being edited.
   */
  const renderEquipmentDataSelection = (code: number) =>
  {
    switch (code)
    {
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
      default:
        return <></>;
    }
  };

  /**
   * Picks the dataId source for the party-wide traits, which read from enums rather than the database.
   * @param {number} code The trait code being edited.
   */
  const renderOtherDataSelection = (code: number) =>
  {
    switch (code)
    {
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

    const { code } = traitBeingEdited;

    const valueInput = TRAIT_VALUE_INPUTS[ code ];
    if (valueInput !== undefined)
    {
      return valueInput.kind === 'percent'
        ? renderPercentageValueInput(valueInput.label)
        : renderIntegerValueInput(valueInput.label);
    }

    // a known code with no numeric component says so, rather than leaving the step looking unfinished.
    if (TRAIT_CODES_WITHOUT_VALUE.has(code))
    {
      return <Typography>No numeric value for this trait.</Typography>;
    }

    return <></>;
  };

  /**
   * Renders a value field for a trait whose value is stored as a factor and authored as a percent.
   * @param {string} label The caption naming what the percentage means for this trait.
   */
  const renderPercentageValueInput = (label: string) =>
  {
    if (traitBeingEdited === null)
    {
      return <></>;
    }

    return <>
      <NumberInputWithLabel
        label={label}
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
  };

  /**
   * Renders a value field for a trait whose value is stored exactly as authored.
   * @param {string} label The caption naming what the number means for this trait.
   */
  const renderIntegerValueInput = (label: string) =>
  {
    if (traitBeingEdited === null)
    {
      return <></>;
    }

    return <>
      <NumberInputWithLabel
        label={label}
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
    <Stack spacing={1.5}>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block' }}>
        Passive traits and resistances. Edit opens the code / target / value steps.
      </Typography>
      <Stack direction={'row'} alignItems={'center'} spacing={1}>
        <Button
          variant={'outlined'}
          size={'small'}
          onClick={handleAddMenuOpen}
        >
          Add trait
        </Button>
        <Menu
          anchorEl={addMenuAnchor}
          open={addMenuAnchor !== null}
          onClose={handleAddMenuClose}
          slotProps={{
            list: {
              dense: true,
              sx: { maxHeight: 360 },
            },
          }}
        >
          {codes.map((code) => (
            <MenuItem
              key={code}
              onClick={() =>
              {
                handleAddTraitPick(code);
              }}
            >
              <Stack spacing={0}>
                <Typography variant={'body2'}>{getTraitCodeName(code)}</Typography>
                <Typography variant={'caption'} color={'text.secondary'}>
                  {codeDescriptions[ code ]}
                </Typography>
              </Stack>
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      {selectedTraits.length === 0
        ? (
          <Typography variant={'body2'} color={'text.secondary'}>
            No traits. Use &quot;Add trait&quot; to append a row.
          </Typography>
        )
        : (
          <Box sx={{
            overflowX: 'auto',
            width: '100%',
          }}>
            <Stack spacing={0}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: TRAIT_EDITOR_GRID_TEMPLATE,
                  columnGap: 1.5,
                  alignItems: 'end',
                  pb: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  minWidth: 0,
                }}
              >
                <Typography variant={'caption'} fontWeight={600} color={'text.secondary'}>
                  Order
                </Typography>
                <Typography variant={'caption'} fontWeight={600} color={'text.secondary'}>
                  Value
                </Typography>
                <Typography
                  variant={'caption'}
                  fontWeight={600}
                  color={'text.secondary'}
                  sx={{ minWidth: 0 }}
                >
                  Trait
                </Typography>
                <Box/>
              </Box>
              {selectedTraits.map((
                rpgTrait,
                index
              ) =>
              {
                const trait = toGameTrait(rpgTrait);
                const valueLabel = trait.valueString.trim() === ''
                  ? '—'
                  : trait.valueString;
                return (
                  <Box
                    key={`${index}-${rpgTrait.code}-${rpgTrait.dataId}-${rpgTrait.value}`}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: TRAIT_EDITOR_GRID_TEMPLATE,
                      columnGap: 1.5,
                      alignItems: 'center',
                      py: 0.5,
                      borderBottom: 1,
                      borderColor: 'divider',
                      minWidth: 0,
                      '&:last-of-type': {
                        borderBottom: 0,
                      },
                    }}
                  >
                    <Stack
                      direction={'row'}
                      spacing={0}
                      sx={{
                        justifyContent: 'center',
                      }}
                    >
                      <Tooltip title={'Move up'}>
                        <span>
                          <IconButton
                            size={'small'}
                            disabled={index === 0}
                            onClick={() =>
                            {
                              handleMoveTrait(index, -1);
                            }}
                          >
                            <ArrowUpward fontSize={'inherit'}/>
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={'Move down'}>
                        <span>
                          <IconButton
                            size={'small'}
                            disabled={index >= selectedTraits.length - 1}
                            onClick={() =>
                            {
                              handleMoveTrait(index, 1);
                            }}
                          >
                            <ArrowDownward fontSize={'inherit'}/>
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                    <Box sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      minWidth: 0,
                      px: 0.5,
                    }}>
                      <Typography
                        variant={'body2'}
                        component={'span'}
                        color={'text.primary'}
                        noWrap
                        title={valueLabel}
                        sx={{
                          fontFamily: 'ui-monospace, monospace',
                          fontVariantNumeric: 'tabular-nums',
                          textAlign: 'center',
                          minWidth: 0,
                          width: '100%',
                        }}
                      >
                        {valueLabel}
                      </Typography>
                    </Box>
                    <Box
                      role={'button'}
                      tabIndex={0}
                      onClick={() =>
                      {
                        handleTraitListItemOnClickEvent(index);
                      }}
                      onKeyDown={(ke) =>
                      {
                        if (ke.key === 'Enter' || ke.key === ' ')
                        {
                          ke.preventDefault();
                          handleTraitListItemOnClickEvent(index);
                        }
                      }}
                      sx={{
                        minWidth: 0,
                        cursor: 'pointer',
                        py: 0.25,
                      }}
                    >
                      <Typography
                        variant={'body2'}
                        noWrap
                        title={trait.dataName}
                        sx={{ minWidth: 0 }}
                      >
                        {trait.dataName}
                      </Typography>
                      <Typography variant={'caption'} color={'text.secondary'} noWrap sx={{ minWidth: 0 }}>
                        {trait.codeName}
                      </Typography>
                    </Box>
                    <Stack
                      direction={'row'}
                      spacing={0}
                      sx={{
                        justifyContent: 'center',
                      }}
                    >
                      <Tooltip title={'Edit'}>
                        <IconButton
                          size={'small'}
                          onClick={() =>
                          {
                            handleTraitListItemOnClickEvent(index);
                            setEditTraitActive(true);
                          }}
                        >
                          <Edit fontSize={'small'}/>
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={'Remove'}>
                        <IconButton
                          size={'small'}
                          color={'error'}
                          onClick={() =>
                          {
                            handleDeleteTraitOnClick(index);
                          }}
                        >
                          <DeleteOutline fontSize={'small'}/>
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}
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
