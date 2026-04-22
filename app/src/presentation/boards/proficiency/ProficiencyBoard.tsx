import React, { ChangeEvent, MouseEvent, useRef, useState } from 'react';
import { FixedSizeList } from 'react-window';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Snackbar,
  SpeedDial,
  SpeedDialAction,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import {
  Add,
  ContentCopy,
  ExitToApp,
  Key,
  NavigateNext,
  Person,
  PlaylistRemove,
  PriceCheck,
  RadioButtonUnchecked,
  Remove,
  TaskAlt
} from '@mui/icons-material';
import styled from 'styled-components';

import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import SaveButton from '../../../components/core/SaveButton.tsx';
import { useActors } from '@presentation/context/resources/actors.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { RPG_SkillDomainModel } from '@core/domain/entities/RPG_SkillDomainModel.ts';
import { RPG_ActorDomainModel } from '@core/domain/entities/RPG_ActorDomainModel.ts';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import { useElementClientRect } from '@presentation/hooks/useElementClientRect.ts';
import { useProficiency } from '@presentation/context/resources/proficiency.context.tsx';
import Conditional = Proficiency.Conditional;
import Requirement = Proficiency.Requirement;

//region setup
const EntryText = styled(ListItemText)`
  font-family: monospace;
`;
//endregion setup

const ProficiencyBoard = () =>
{
  // Consume global contexts with aliasing
  const {
    conditionals,
    setConditionals,
    save,
    loading: proficiencyLoading
  } = useProficiency();

  const {
    data: actors,
    loading: actorsLoading
  } = useActors();

  const {
    skills,
    loading: skillsLoading
  } = useSkills();

  //region state
  const listViewportRef = useRef<HTMLDivElement>(null);
  const listViewportSize = useElementClientRect(listViewportRef);
  const [ selectedConditional, setSelectedConditional ] = useState<Conditional | null>(null);
  const [ selectedConditionalIndex, setSelectedConditionalIndex ] = useState<number>(0);
  const [ conditionalsContextMenu, setConditionalsContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ currentRequirements, setCurrentRequirements ] = useState<Requirement[]>([]);
  const [ selectedRequirement, setSelectedRequirement ] = useState<Requirement | null>(null);
  const [ selectedRequirementIndex, setSelectedRequirementIndex ] = useState<number>(0);
  const [ requirementsContextMenu, setRequirementsContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ requirementSkill, setRequirementSkill ] = useState<RPG_SkillDomainModel | null>(null);
  const [ requirementSkillText, setRequirementSkillText ] = useState<string | undefined>(undefined);
  const [ requirementSecondarySkillIds, setRequirementSecondarySkillIds ] = useState<number[]>([]);

  const [ actorIdChecked, setActorIdsChecked ] = useState<number[]>([]);
  const [ skillIdRewardEarned, setSkillIdRewardEarned ] = useState<number[]>([]);

  const [ clickedSkill, setClickedSkill ] = useState<number>(0);
  const [ isSkillDialogOpen, setIsSkillDialogOpen ] = useState<boolean>(false);

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);
  //endregion state

  const applyConditionals = (updatedConditionals: Conditional[]) =>
  {
    setConditionals(updatedConditionals);
    setCanSave(true);
  };

  const syncSelectionWithConditional = (conditional: Conditional | null) =>
  {
    setSelectedConditional(conditional);
    setActorIdsChecked(conditional?.actorIds ?? []);
    setSkillIdRewardEarned(conditional?.skillRewards ?? []);
    setCurrentRequirements(conditional?.requirements ?? []);

    // Also sync the first requirement of the newly selected conditional.
    const firstReq = conditional?.requirements?.at(0) ?? null;
    syncSelectionWithRequirement(firstReq, 0);
  };

  const syncSelectionWithRequirement = (
    requirement: Requirement | null,
    index: number
  ) =>
  {
    setSelectedRequirementIndex(index);
    setSelectedRequirement(requirement);
    setRequirementSecondarySkillIds(requirement?.secondarySkillIds ?? []);

    // Lookup the skill domain model for the requirement's primary skill.
    const skillId = requirement?.skillId ?? 0;
    const skillModel = skillId > 0
      ? skills.find(s => s.id === skillId) ?? null
      : null;

    setRequirementSkill(skillModel);
    setRequirementSkillText(skillModel?.name ?? '');
  };

  //region updates
  /**
   * The update logic for updating the key of the selected entry.
   * @param event The input event that triggered this update.
   */
  const handleConditionalKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const updatedValue = event.target.value;
    if (!selectedConditional)
    {
      return;
    }

    const updatedConditional = {
      ...selectedConditional,
      key: updatedValue
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);

    // TODO: can this update be optimized in some way?
    // consider extracting recipe view to single component, and only update whole list when entries change.
  };

  const handleConditionalApplicableActorIdToggle = (value: number) =>
  {
    const currentIndex = actorIdChecked.indexOf(value);
    const newChecked = [ ...actorIdChecked ];

    if (currentIndex === -1)
    {
      newChecked.push(value);
    }
    else
    {
      newChecked.splice(currentIndex, 1);
    }

    setActorIdsChecked(newChecked.sort());

    const updatedConditional = {
      ...selectedConditional,
      actorIds: newChecked
    } as Conditional;
    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);
  };

  const handleConditionalSkillIdRewardToggle = (value: number) =>
  {
    const currentIndex = skillIdRewardEarned.indexOf(value);
    const newChecked = [ ...skillIdRewardEarned ];

    if (currentIndex === -1)
    {
      newChecked.push(value);
    }
    else
    {
      newChecked.splice(currentIndex, 1);
    }

    setSkillIdRewardEarned(newChecked.sort());

    const updatedConditional = {
      ...selectedConditional,
      skillRewards: newChecked
    } as Conditional;
    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);
  };

  const handleRequirementSecondarySkillIdToggle = (value: number) =>
  {
    const currentIndex = requirementSecondarySkillIds.indexOf(value);
    const newChecked = [ ...requirementSecondarySkillIds ];

    if (currentIndex === -1)
    {
      newChecked.push(value);
    }
    else
    {
      newChecked.splice(currentIndex, 1);
    }

    setRequirementSecondarySkillIds(newChecked);

    const updatedRequirement = {
      ...selectedRequirement,
      secondarySkillIds: newChecked,
    } as Requirement;
    setSelectedRequirement(updatedRequirement);

    const updatedRequirements = currentRequirements.with(selectedRequirementIndex, updatedRequirement);
    setCurrentRequirements(updatedRequirements);

    const updatedConditional = {
      ...selectedConditional,
      requirements: updatedRequirements,
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);
  };

  const handleRequirementProficiencyOnChangeEvent = (value: number) =>
  {
    const updatedRequirement = {
      ...selectedRequirement,
      proficiency: value,
    } as Requirement;
    setSelectedRequirement(updatedRequirement);

    const updatedRequirements = currentRequirements.with(selectedRequirementIndex, updatedRequirement);
    setCurrentRequirements(updatedRequirements);

    const updatedConditional = {
      ...selectedConditional,
      requirements: updatedRequirements,
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);
  };

  const handleRequirementPrimarySkillOnChangeEvent = (value: RPG_SkillDomainModel | null) =>
  {
    if (value === null)
    {
      return;
    }

    setRequirementSkill(value);
    setRequirementSkillText(value.name);
    const updatedRequirement = {
      ...selectedRequirement,
      skillId: value.id ?? 0,
    } as Requirement;
    setSelectedRequirement(updatedRequirement);

    const updatedRequirements = currentRequirements.with(selectedRequirementIndex, updatedRequirement);
    setCurrentRequirements(updatedRequirements);

    const updatedConditional = {
      ...selectedConditional,
      requirements: updatedRequirements,
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);
  };

  const handleConditionalJsRewardsOnChangeEvent = (event: any) =>
  {
    const updatedJsRewards = event.target.value;
    const updatedConditional = {
      ...selectedConditional,
      jsRewards: updatedJsRewards,
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);
  };

  const handleSnack = (
    message: string,
    severity: MuiSnackbarSeverity = MuiSnackbarSeverity.Info,
    variant: MuiSnackbarVariant = MuiSnackbarVariant.Filled
  ) =>
  {
    setSnackMessage(message);
    setSnackSeverity(severity);
    setSnackVariant(variant);
    setSnackOpen(true);
  };
  //endregion updates

  //region selections
  const handleRequirementListItemOnClickEvent = (
    _: any,
    index: number
  ) =>
  {
    const requirement = currentRequirements.at(index) ?? null;
    syncSelectionWithRequirement(requirement, index);
  };

  const handleConditionalListItemOnClickEvent = (
    _: any,
    index: number,
  ) =>
  {
    setSelectedConditionalIndex(index);
    const conditional = conditionals.at(index) ?? null;
    syncSelectionWithConditional(conditional);
  };

  const handleSnackClose = (
    _: any,
    reason?: string
  ) =>
  {
    if (reason === 'clickaway')
    {
      return;
    }

    setSnackOpen(false);
  };

  const handleConditionalContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newConditionalsContextMenuState = conditionalsContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setConditionalsContextMenu(newConditionalsContextMenuState);
  };

  const handleConditionalContextMenuOnCloseEvent = () =>
  {
    setConditionalsContextMenu(null);
  };

  const handleRequirementsContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newConditionalsContextMenuState = requirementsContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setRequirementsContextMenu(newConditionalsContextMenuState);
  };

  const handleRequirementsContextMenuOnCloseEvent = () =>
  {
    setRequirementsContextMenu(null);
  };

  const handleAddNewConditional = (index: number) =>
  {
    const initialRequirement = {
      skillId: 1,
      proficiency: 10,
      secondarySkillIds: []
    } as Requirement;
    const newConditional = {
      key: 'NEW-CONDITIONAL-0',
      requirements: [ initialRequirement ],
      skillRewards: [],
      actorIds: [],
      jsRewards: ''
    } as Conditional;
    const updatedConditionals = conditionals.toSpliced(index, 0, newConditional);
    applyConditionals(updatedConditionals);

    handleSnack('Conditional has been added successfully.', MuiSnackbarSeverity.Success);
  };

  const handleCloneConditional = (index: number) =>
  {
    // TODO: error snack for unable to clone without selecting a conditional to be cloned.
    if (selectedConditional === null)
    {
      return;
    }

    const clonedRequirements = selectedConditional.requirements.toSpliced(0, 0);
    const clonedSkillIdRewards = selectedConditional.skillRewards.toSpliced(0, 0);
    const clonedActorIds = selectedConditional.actorIds.toSpliced(0, 0);
    const clonedConditional = {
      key: `${selectedConditional.key}-COPY`,
      skillRewards: clonedSkillIdRewards,
      requirements: clonedRequirements,
      actorIds: clonedActorIds,
      jsRewards: selectedConditional.jsRewards
    } as Conditional;

    const updatedConditionals = conditionals.toSpliced(index, 0, clonedConditional);
    applyConditionals(updatedConditionals);

    handleSnack('Conditional has been cloned successfully.', MuiSnackbarSeverity.Success);
  };

  const handleDeleteConditional = (index: number) =>
  {
    // TODO: error snack for unable to delete without selecting a conditional to be deleted.
    if (selectedConditional === null)
    {
      return;
    }

    // TODO: "are you sure?" popup dialog maybe?
    const updatedConditionals = conditionals.toSpliced(index, 1);
    applyConditionals(updatedConditionals);

    handleSnack('Conditional has been deleted successfully.', MuiSnackbarSeverity.Success);
  };

  const handleAddNewRequirement = (index: number) =>
  {
    const newRequirement = {
      skillId: 1,
      proficiency: 10,
      secondarySkillIds: []
    } as Requirement;

    const updatedRequirements = currentRequirements.toSpliced(index, 0, newRequirement);
    setCurrentRequirements(updatedRequirements);

    const updatedConditional = {
      ...selectedConditional,
      requirements: updatedRequirements,
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);

    handleSnack('Requirement has been added successfully.', MuiSnackbarSeverity.Success);
  };

  const handleCloneRequirement = (index: number) =>
  {
    // TODO: error snack for unable to clone without selecting a requirement to be cloned.
    if (selectedRequirement === null)
    {
      return;
    }

    const clonedSecondarySkillIds = selectedRequirement.secondarySkillIds.toSpliced(0, 0);
    const clonedRequirement = {
      skillId: selectedRequirement.skillId,
      proficiency: selectedRequirement.proficiency,
      secondarySkillIds: clonedSecondarySkillIds
    } as Requirement;

    const updatedRequirements = currentRequirements.toSpliced(index, 0, clonedRequirement);
    setCurrentRequirements(updatedRequirements);

    const updatedConditional = {
      ...selectedConditional,
      requirements: updatedRequirements,
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);

    handleSnack('Requirement has been cloned successfully.', MuiSnackbarSeverity.Success);
  };

  const handleDeleteRequirement = (index: number) =>
  {
    // TODO: error snack for unable to delete without selecting a conditional to be deleted.
    if (selectedRequirement === null)
    {
      return;
    }

    if (currentRequirements.length === 1)
    {
      handleSnack('Cannot delete last skill requirement; consider updating it instead.', MuiSnackbarSeverity.Error);
      return;
    }

    // TODO: "are you sure?" popup dialog maybe?
    const updatedRequirements = currentRequirements.toSpliced(index, 1);
    setCurrentRequirements(updatedRequirements);

    const updatedConditional = {
      ...selectedConditional,
      requirements: updatedRequirements,
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);

    handleSnack('Requirement has been deleted successfully.', MuiSnackbarSeverity.Success);
  };

  const handleClearSecondarySkillIdsForRequirement = (index: number) =>
  {
    if (selectedRequirement === null)
    {
      return;
    }

    const secondarySkillIdFreeRequirement = {
      skillId: selectedRequirement.skillId,
      proficiency: selectedRequirement.proficiency,
      secondarySkillIds: []
    } as Requirement;

    const updatedRequirements = currentRequirements.with(index, secondarySkillIdFreeRequirement);
    setCurrentRequirements(updatedRequirements);

    const updatedConditional = {
      ...selectedConditional,
      requirements: updatedRequirements,
    } as Conditional;
    setSelectedConditional(updatedConditional);

    const updatedConditionals = conditionals.with(selectedConditionalIndex, updatedConditional);
    applyConditionals(updatedConditionals);

    handleSnack('Requirement\'s secondary skill ids have been purged successfully.');
  };
  //endregion selections

  //region render
  /**
   * A mapping function for creating a data list entry in the list.
   */
  const renderConditionalListItem = (props: ListChildComponentProps) =>
  {
    const {
      index,
      style
    } = props;

    const conditional = conditionals.at(index);

    if (!conditional)
    {
      return <React.Fragment key={index}></React.Fragment>;
    }

    return (
      <ListItem key={conditional.key} style={style}>
        <ListItemButton
          selected={selectedConditionalIndex === index}
          onClick={event => handleConditionalListItemOnClickEvent(event, index)}
        >
          <ListItemIcon>
            {(selectedConditionalIndex === index)
              ? <ExitToApp color={'success'}/>
              : <NavigateNext color={'secondary'}/>}
          </ListItemIcon>
          <EntryText
            primary={conditional.key}
            disableTypography={true}
          />
        </ListItemButton>
      </ListItem>
    );
  };

  /**
   * A mapping function for creating an entry in the actor list.
   */
  const renderActorListItem = (
    actor: RPG_ActorDomainModel,
    index: number
  ) =>
  {
    if (!actor || actor.name === '' || actor.name.startsWith('=='))
    {
      // Hide placeholders/invalids, but DO render id=1 (index 0) if valid.
      return <React.Fragment key={`${index}-hidden`}></React.Fragment>;
    }

    return (
      <ListItem key={`${actor.id}-${actor.name}`} sx={{
        paddingTop: 0,
        paddingBottom: 0
      }}>
        <ListItemButton sx={{ height: 30 }}>
          <ListItemIcon>
            <Person/>
          </ListItemIcon>
          <ListItemText primary={actor.name}/>
          <Switch
            edge="end"
            onChange={() => handleConditionalApplicableActorIdToggle(actor.id)}
            checked={actorIdChecked.includes(actor.id)}
          />
        </ListItemButton>
      </ListItem>
    );
  };

  const renderSkillIdRewards = (skillId: number) =>
  {
    const skill = skills.at(skillId);
    if (!skill)
    {
      return <React.Fragment key={skillId}></React.Fragment>;
    }

    return (
      <Chip
        key={`${skillId}-${skill.name}`}
        avatar={<Avatar>{skill.id}</Avatar>}
        label={skill.name}
        variant={'outlined'}
        onClick={() =>
        {
          setClickedSkill(skill.id);
          setIsSkillDialogOpen(true);
        }}
        onDelete={() => handleConditionalSkillIdRewardToggle(skill.id)}
      />
    );
  };

  const renderConditionalRequirement = (
    requirement: Requirement,
    index: number
  ) =>
  {
    if (!requirement)
    {
      return <React.Fragment key={index}></React.Fragment>;
    }

    const skill = skills.at(requirement.skillId);
    if (!skill)
    {
      return <React.Fragment key={index}></React.Fragment>;
    }

    return (
      <ListItem key={`${index}-${skill.id}`}>
        <ListItemButton
          selected={selectedRequirementIndex === index}
          onClick={event => handleRequirementListItemOnClickEvent(event, index)}
        >
          <ListItemIcon>
            {(selectedRequirementIndex === index)
              ? <TaskAlt color={'success'}/>
              : <RadioButtonUnchecked color={'info'}/>}
          </ListItemIcon>
          <EntryText
            primary={`${skill.id}: ${skill.name}`}
            secondary={currentRequirements[ index ].secondarySkillIds
              .sort()
              .map(skillId => `${skills[ skillId ].name}(${skillId})`)
              .join(', ')}
          />
        </ListItemButton>

      </ListItem>
    );
  };
  //endregion render

  if (actorsLoading || skillsLoading || proficiencyLoading)
  {
    return (
      <Box sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        p: 2,
      }}>
        <Typography>Loading database and proficiency resources...</Typography>
      </Box>
    );
  }

  const listPixelHeight = listViewportSize.height > 0
    ? listViewportSize.height
    : 600;
  const listPixelWidth = listViewportSize.width > 0
    ? listViewportSize.width
    : 300;

  return <>
    <Box sx={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <EditorBoardSplitLayout
        sidebarColumnWidth={'min(360px, 28vw)'}
        sidebar={
          <Box
            ref={listViewportRef}
            sx={{
              flex: 1,
              minHeight: 0,
            }}
          >
        <div onContextMenu={handleConditionalContextMenu} style={{ cursor: 'context-menu', height: '100%' }}>
          {/* @ts-ignore */}
          <FixedSizeList
            height={listPixelHeight}
            width={listPixelWidth}
            itemSize={30}
            overscanCount={5}
            itemCount={conditionals.length}
          >
            {renderConditionalListItem}
          </FixedSizeList>
        </div>
          </Box>
        }
      >
          {(selectedConditional === null)
            ? <Typography>
              Please select a conditional on the left.<br/>
              If there are no conditionals, then consider making one.
            </Typography>

            : <Grid container rowSpacing={2} columnSpacing={4}>
              {/* Conditional inputs. */}
              <Grid size={4}>
                <TextField
                  required
                  variant={'outlined'}
                  label={'Key'}
                  value={selectedConditional.key}
                  onChange={handleConditionalKeyOnChangeEvent}
                  size={'small'}
                  fullWidth
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position={'start'}>
                        <Key/>
                      </InputAdornment>
                    }
                  }}
                />
              </Grid>

              <Grid size={4}>
                <List dense sx={{
                  paddingTop: 0,
                  border: '1px solid',
                  borderRadius: '6px',
                  borderColor: '#bfbfbf'
                }}>
                  <ListSubheader sx={{
                    height: '30px',
                    fontWeight: 'bold',
                    marginBottom: '10px'
                  }}>
                    Applicable Actors
                  </ListSubheader>
                  {actors.map(renderActorListItem)}
                </List>
              </Grid>

              <Grid size={4}>
                <Autocomplete
                  size={'small'}
                  options={[ ...skills ].sort((
                    a,
                    b
                  ) =>
                  {
                    if (a === null || b === null)
                    {
                      return (a as any) - (b as any);
                    }

                    // Display the selected labels first.
                    let ai = skillIdRewardEarned.indexOf(a.id);
                    ai = ai === -1
                      ? skills.length + skills.indexOf(a)
                      : ai;
                    let bi = skillIdRewardEarned.indexOf(b.id);
                    bi = bi === -1
                      ? skills.length + skills.indexOf(b)
                      : bi;
                    return ai - bi;
                  })}
                  disableCloseOnSelect
                  slotProps={{
                    listbox: {
                      style: {
                        maxHeight: '170px'
                      }
                    }
                  }}
                  getOptionKey={(option) => option?.id ?? 'no-key'}
                  getOptionLabel={(option) => option?.name ?? ''}
                  renderOption={(
                    props,
                    option,
                    { index }
                  ) =>
                  {
                    if (option === null || option.name === '' || option.name.startsWith('=='))
                    {
                      return <li {...props} style={{ display: 'none' }}/>;
                    }

                    return (
                      <li {...props} key={props.key ?? option.id} style={{ height: 32 }}>
                        <ListItem disableGutters disablePadding sx={{ height: 32 }}>
                          <ListItemIcon sx={{ height: 32 }}>
                            <Checkbox
                              checked={skillIdRewardEarned.includes(option.id)}
                              onChange={() => handleConditionalSkillIdRewardToggle(option.id)}/>
                            <EntryText
                              primary={`${option.id}: ${option.name}`}
                              disableTypography={true}
                            />
                          </ListItemIcon>
                        </ListItem>
                      </li>
                    );
                  }}
                  renderInput={(params) =>
                  {
                    return (<TextField
                      {...params}
                      size={'small'}
                      label={'Choose Skill Rewards'}
                      placeholder="Skill name..."/>);
                  }}
                />
              </Grid>

              <Grid size={8}>
                <TextField
                  label={'Javascript-based Rewards'}
                  placeholder={'Raw javascript to be executed upon completing this conditional...'}
                  value={selectedConditional.jsRewards}
                  onChange={handleConditionalJsRewardsOnChangeEvent}
                  multiline
                  fullWidth
                  rows={6}
                  variant={'standard'}
                  sx={{
                    // Root class for the input field
                    '& .MuiInput-root': {
                      fontFamily: 'monospace',
                    }, // Class for the label of the input field
                    '& .MuiInputLabel-standard': {
                      color: '#2e2e2e',
                      fontFamily: 'monospace',
                    },
                  }}
                />
              </Grid>

              <Grid size={4}>
                <Box>
                  {skillIdRewardEarned.map(renderSkillIdRewards)}
                </Box>
              </Grid>

              <Grid size={4}>
                <div onContextMenu={handleRequirementsContextMenu} style={{ cursor: 'context-menu' }}>
                  <List dense>
                    <ListSubheader sx={{
                      height: '30px',
                      fontWeight: 'bold'
                    }}>
                      Skills Required to Develop Proficiency In
                    </ListSubheader>
                    {currentRequirements.map((
                      requirement,
                      index
                    ) => renderConditionalRequirement(requirement, index))}
                  </List>
                </div>
              </Grid>

              <Grid size={4}>
                <Stack spacing={2}>
                  <TextField
                    type={'number'}
                    label={'Proficiency Required'}
                    value={selectedRequirement?.proficiency ?? 0}
                    sx={{ width: '100px' }}
                    onChange={(event) => handleRequirementProficiencyOnChangeEvent(parseInt(event.target.value) ?? 0)}
                  />
                  <Autocomplete
                    size={'small'}
                    options={skills}
                    value={requirementSkill}
                    onChange={(
                      event,
                      newValue: RPG_SkillDomainModel | null
                    ) =>
                    {
                      handleRequirementPrimarySkillOnChangeEvent(newValue);
                    }}
                    inputValue={requirementSkillText}
                    onInputChange={(
                      event,
                      newInputValue: string | undefined
                    ) =>
                    {
                      console.log(newInputValue);
                      setRequirementSkillText(newInputValue);
                    }}
                    getOptionLabel={(option) => option?.name ?? ''}
                    getOptionKey={(option) => option?.id ?? 'no-key'}
                    renderOption={(
                      props,
                      option,
                      { index }
                    ) =>
                    {
                      if (option === null || option.name === '' || option.name.startsWith('=='))
                      {
                        return <li {...props} style={{ display: 'none' }}/>;
                      }

                      return (
                        <li {...props} key={props.key ?? `${option.id}-${option.name}`} style={{ height: 32 }}>
                          <ListItem disableGutters disablePadding sx={{ height: 32 }}>
                            <ListItemButton onClick={() => handleRequirementPrimarySkillOnChangeEvent(option)}>
                              <ListItemIcon sx={{ height: 32 }}>
                                <EntryText
                                  primary={`${option.id}: ${option.name}`}
                                  disableTypography
                                />
                              </ListItemIcon>
                            </ListItemButton>
                          </ListItem>
                        </li>
                      );
                    }}
                    renderInput={(params) =>
                    {
                      return (<TextField
                        {...params}
                        size={'small'}
                        label={'Requirement Skill'}
                        placeholder="Skill name..."/>);
                    }}
                  />
                  <Autocomplete
                    size={'small'}
                    options={skills}
                    disableCloseOnSelect
                    slotProps={{
                      listbox: {
                        sx: { maxHeight: '170px' }
                      }
                    }}
                    getOptionKey={(option) => option?.id ?? 'no-key'}
                    getOptionLabel={(option) => option?.name ?? ''}
                    renderOption={(
                      props,
                      option,
                      { index }
                    ) =>
                    {
                      if (option === null || option.name === '' || option.name.startsWith('=='))
                      {
                        return <li {...props} style={{ display: 'none' }}/>;
                      }

                      return (
                        <li {...props} key={props.key ?? option.id} style={{ height: 32 }}>
                          <ListItem disableGutters disablePadding sx={{ height: 32 }}>
                            <ListItemIcon sx={{ height: 32 }}>
                              <Checkbox
                                checked={requirementSecondarySkillIds.includes(option.id)}
                                onChange={() => handleRequirementSecondarySkillIdToggle(option.id)}/>
                              <EntryText
                                primary={`${option.id}: ${option.name}`}
                                disableTypography
                              />
                            </ListItemIcon>
                          </ListItem>
                        </li>
                      );
                    }}
                    renderInput={(params) =>
                    {
                      return (<TextField
                        {...params}
                        size={'small'}
                        label={'Secondary Skills'}
                        placeholder="Skill name..."/>);
                    }}
                  />
                </Stack>
              </Grid>
            </Grid>}
      </EditorBoardSplitLayout>
    </Box>

      {/*region not-grid-related elements */}
      {/* This dialog contains skill detail for the user to understand more about their skill rewards. */}
      <Dialog
        open={isSkillDialogOpen}
        onClose={() => setIsSkillDialogOpen(false)}
      >
        <DialogTitle>
          {`Skill Detail: ${skills.at(clickedSkill)?.name}`}
        </DialogTitle>
        <DialogContent
          sx={{ height: '200px' }}
        >
          <DialogContentText>
            {skills.at(clickedSkill)?.description}
          </DialogContentText>
          <SpeedDial
            ariaLabel={'skill-speed-dial'}
            icon={<PriceCheck/>}
            sx={{
              position: 'absolute',
              left: 16,
              bottom: 16
            }}
          >
            <SpeedDialAction
              key={'mp-cost'}
              icon={'MP'}
              sx={{ color: 'pink' }}
              tooltipTitle={skills.at(clickedSkill)?.mpCost}
              tooltipOpen
              tooltipPlacement={'right'}
            />
            <SpeedDialAction
              key={'tp-cost'}
              icon={'TP'}
              tooltipTitle={skills.at(clickedSkill)?.tpCost}
              tooltipOpen
              tooltipPlacement={'right'}
            />
          </SpeedDial>

        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsSkillDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* This is over-arching save button- it will save all data to disk. */}
      <SaveButton
        extraSaveText={'Proficiencies'}
        canSave={canSave && !proficiencyLoading}
        handleSave={async () =>
        {
          setCanSave(false);
          await save(conditionals);
          handleSnack('Proficiency data saved successfully!', MuiSnackbarSeverity.Success);
        }}
      />

      {/* The snackbar for conveying useful messages. */}
      <Snackbar open={snackOpen} autoHideDuration={2500} onClose={handleSnackClose}>
        <Alert
          onClose={handleSnackClose}
          severity={snackSeverity}
          variant={snackVariant}
          sx={{ width: '100%' }}
        >
          {snackMessage}
        </Alert>
      </Snackbar>

      {/* The context menu on the conditionals list. */}
      <Menu
        open={conditionalsContextMenu !== null}
        onClose={handleConditionalContextMenuOnCloseEvent}
        anchorReference="anchorPosition"
        anchorPosition={conditionalsContextMenu !== null
          ? {
            top: conditionalsContextMenu.mouseY,
            left: conditionalsContextMenu.mouseX
          }
          : undefined}
      >
        <MenuItem onClick={() =>
        {
          handleAddNewConditional(selectedConditionalIndex);
          handleConditionalContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Add/></ListItemIcon>
          <Typography>Add new above</Typography>
        </MenuItem>
        <MenuItem onClick={() =>
        {
          handleAddNewConditional(selectedConditionalIndex + 1);
          handleConditionalContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Add/></ListItemIcon>
          <Typography>Add new below</Typography>
        </MenuItem>
        <Divider/>
        <MenuItem onClick={() =>
        {
          handleCloneConditional(selectedConditionalIndex);
          handleConditionalContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><ContentCopy/></ListItemIcon>
          <Typography>Clone above</Typography>
        </MenuItem>
        <MenuItem onClick={() =>
        {
          handleCloneConditional(selectedConditionalIndex + 1);
          handleConditionalContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><ContentCopy/></ListItemIcon>
          <Typography>Clone below</Typography>
        </MenuItem>
        <Divider/>
        <MenuItem dense onClick={() =>
        {
          handleDeleteConditional(selectedConditionalIndex);
          handleConditionalContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Remove/></ListItemIcon>
          <Typography>Remove Selected</Typography>
        </MenuItem>
      </Menu>

      {/* The context menu on the requirements list. */}
      <Menu
        open={requirementsContextMenu !== null}
        onClose={handleRequirementsContextMenuOnCloseEvent}
        anchorReference="anchorPosition"
        anchorPosition={requirementsContextMenu !== null
          ? {
            top: requirementsContextMenu.mouseY,
            left: requirementsContextMenu.mouseX
          }
          : undefined}
      >
        <MenuItem onClick={() =>
        {
          handleAddNewRequirement(selectedRequirementIndex);
          handleRequirementsContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Add/></ListItemIcon>
          <Typography>Add new above</Typography>
        </MenuItem>
        <MenuItem onClick={() =>
        {
          handleAddNewRequirement(selectedRequirementIndex + 1);
          handleRequirementsContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Add/></ListItemIcon>
          <Typography>Add new below</Typography>
        </MenuItem>
        <Divider/>
        <MenuItem onClick={() =>
        {
          handleCloneRequirement(selectedRequirementIndex);
          handleRequirementsContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><ContentCopy/></ListItemIcon>
          <Typography>Clone above</Typography>
        </MenuItem>
        <MenuItem onClick={() =>
        {
          handleCloneRequirement(selectedRequirementIndex + 1);
          handleRequirementsContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><ContentCopy/></ListItemIcon>
          <Typography>Clone below</Typography>
        </MenuItem>
        <Divider/>
        <MenuItem onClick={() =>
        {
          handleClearSecondarySkillIdsForRequirement(selectedRequirementIndex);
          handleRequirementsContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><PlaylistRemove/></ListItemIcon>
          <Typography>Remove all secondary skill ids</Typography>
        </MenuItem>
        <Divider/>
        <MenuItem dense onClick={() =>
        {
          handleDeleteRequirement(selectedRequirementIndex);
          handleRequirementsContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Remove/></ListItemIcon>
          <Typography>Remove Selected</Typography>
        </MenuItem>
      </Menu>
      {/*endregion not-grid-related elements */}
  </>;
};

export default ProficiencyBoard;
