import React, { MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  ContentCopy,
  DeleteOutline,
  ExpandMore,
  Key,
  OpenInNew,
  Person,
  PlaylistRemove,
} from '@mui/icons-material';

import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import { useActors } from '@presentation/context/resources/actors.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { RPG_SkillDomainModel } from '@core/domain/entities/RPG_SkillDomainModel.ts';
import { RPG_ActorDomainModel } from '@core/domain/entities/RPG_ActorDomainModel.ts';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import { useProficiency } from '@presentation/context/resources/proficiency.context.tsx';
import { KnowledgeTab } from './KnowledgeTab.tsx';
import { KnowledgeExchangesTab } from './KnowledgeExchangesTab.tsx';
import {
  VirtualizedSidebarList,
  virtualizedSidebarColumnWidth,
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
} from '@presentation/components/board/VirtualizedSidebarList.tsx';
import type { VirtualizedSidebarRow } from '@presentation/components/board/VirtualizedSidebarList.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { IconSetSprite } from '@presentation/components/icons/IconSetSprite.tsx';
import Conditional = Proficiency.Conditional;
import Configuration = Proficiency.Configuration;
import KnowledgeExchange = Proficiency.KnowledgeExchange;
import KnowledgeTag = Proficiency.KnowledgeTag;
import Requirement = Proficiency.Requirement;

const proficiencyBoardListColumnWidth = virtualizedSidebarColumnWidth(
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
);

const ProficiencyBoard = () =>
{
  const {
    conditionals,
    setConditionals,
    knowledgeTags,
    setKnowledgeTags,
    skillTypeMapping,
    setSkillTypeMapping,
    knowledgeExchanges,
    setKnowledgeExchanges,
    save,
    reload,
    loading: proficiencyLoading,
  } = useProficiency();

  const { data: actors, loading: actorsLoading } = useActors();
  const { skills, byId: skillsById, loading: skillsLoading } = useSkills();
  const navigate = useNavigate();

  //region state
  const listRef = useRef<any>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  const [ selectedConditional, setSelectedConditional ] = useState<Conditional | null>(null);
  const [ selectedConditionalIndex, setSelectedConditionalIndex ] = useState<number>(0);
  const [ conditionalsContextMenu, setConditionalsContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ currentRequirements, setCurrentRequirements ] = useState<Requirement[]>([]);
  const [ expandedRequirementIdx, setExpandedRequirementIdx ] = useState<number | null>(null);

  const [ actorIdChecked, setActorIdsChecked ] = useState<number[]>([]);
  const [ skillIdRewardEarned, setSkillIdRewardEarned ] = useState<number[]>([]);

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ tabIndex, setTabIndex ] = useState<number>(0);
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

  /**
   * Replaces the authored kinds of knowledge.
   * @param {KnowledgeTag[]} updated The full list of kinds, in display order.
   */
  const applyKnowledgeTags = (updated: KnowledgeTag[]) =>
  {
    setKnowledgeTags(updated);
    setCanSave(true);
  };

  /**
   * Replaces which kinds of knowledge each skill type produces.
   * @param {Proficiency.SkillTypeMapping} updated The full mapping, keyed by skill type id.
   */
  const applySkillTypeMapping = (updated: Proficiency.SkillTypeMapping) =>
  {
    setSkillTypeMapping(updated);
    setCanSave(true);
  };

  /**
   * Replaces the authored knowledge exchanges.
   * @param {KnowledgeExchange[]} updated The full list of exchanges, in display order.
   */
  const applyKnowledgeExchanges = (updated: KnowledgeExchange[]) =>
  {
    setKnowledgeExchanges(updated);
    setCanSave(true);
  };

  useEffect(() =>
  {
    if (selectedConditional !== null) return;
    const first = conditionals.at(0) ?? null;
    if (first === null) return;
    setSelectedConditionalIndex(0);
    syncSelectionWithConditional(first);
  }, [ conditionals, selectedConditional ]);

  const syncSelectionWithConditional = (conditional: Conditional | null) =>
  {
    setSelectedConditional(conditional);
    setActorIdsChecked(conditional?.actorIds ?? []);
    setSkillIdRewardEarned(conditional?.skillRewards ?? []);
    setCurrentRequirements(conditional?.requirements ?? []);
    setExpandedRequirementIdx(null);
  };

  const moveItem = <T,>(arr: T[], idx: number, dir: 1 | -1): T[] =>
  {
    const next = idx + dir;
    if (next < 0 || next >= arr.length) return arr;
    const copy = [ ...arr ];
    [ copy[idx], copy[next] ] = [ copy[next], copy[idx] ];
    return copy;
  };

  //region updates
  const patchRequirement = (idx: number, patch: Partial<Requirement>) =>
  {
    const updated = currentRequirements.with(idx, { ...currentRequirements[idx], ...patch } as Requirement);
    setCurrentRequirements(updated);
    const updatedConditional = { ...selectedConditional, requirements: updated } as Conditional;
    setSelectedConditional(updatedConditional);
    applyConditionals(conditionals.with(selectedConditionalIndex, updatedConditional));
  };

  const handleConditionalSkillRewardsChange = (newIds: number[]) =>
  {
    setSkillIdRewardEarned(newIds);
    const updatedConditional = { ...selectedConditional, skillRewards: newIds } as Conditional;
    setSelectedConditional(updatedConditional);
    applyConditionals(conditionals.with(selectedConditionalIndex, updatedConditional));
  };

  const handleReorderRequirement = (idx: number, dir: 1 | -1) =>
  {
    const updated = moveItem(currentRequirements, idx, dir);
    if (updated === currentRequirements) return;
    setCurrentRequirements(updated);
    if (expandedRequirementIdx === idx) setExpandedRequirementIdx(idx + dir);
    else if (expandedRequirementIdx === idx + dir) setExpandedRequirementIdx(idx);
    const updatedConditional = { ...selectedConditional, requirements: updated } as Conditional;
    setSelectedConditional(updatedConditional);
    applyConditionals(conditionals.with(selectedConditionalIndex, updatedConditional));
  };

  const handleConditionalApplicableActorIdToggle = (value: number) =>
  {
    const currentIndex = actorIdChecked.indexOf(value);
    const newChecked = [ ...actorIdChecked ];
    if (currentIndex === -1) newChecked.push(value);
    else newChecked.splice(currentIndex, 1);
    newChecked.sort();
    setActorIdsChecked(newChecked);
    const updatedConditional = { ...selectedConditional, actorIds: newChecked } as Conditional;
    setSelectedConditional(updatedConditional);
    applyConditionals(conditionals.with(selectedConditionalIndex, updatedConditional));
  };

  const handleConditionalJsRewardsOnChangeEvent = (event: any) =>
  {
    const updatedConditional = { ...selectedConditional, jsRewards: event.target.value } as Conditional;
    setSelectedConditional(updatedConditional);
    applyConditionals(conditionals.with(selectedConditionalIndex, updatedConditional));
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

  const handleReloadButtonOnClickEvent = async () =>
  {
    try
    {
      setSelectedConditional(null);
      setSelectedConditionalIndex(0);
      setCurrentRequirements([]);
      setExpandedRequirementIdx(null);
      setActorIdsChecked([]);
      setSkillIdRewardEarned([]);
      setCanSave(false);
      await reload();
      handleSnack('Proficiency data has been reloaded successfully.', MuiSnackbarSeverity.Success);
    }
    catch (error)
    {
      console.error('Failed to reload proficiency data:', error);
      const message = error instanceof Error ? error.message : 'Unknown error.';
      handleSnack(`Failed to reload proficiency data: ${message}`, MuiSnackbarSeverity.Error);
    }
  };
  //endregion updates

  //region selections
  const handleConditionalListItemOnClickEvent = (_: any, index: number) =>
  {
    setSelectedConditionalIndex(index);
    syncSelectionWithConditional(conditionals.at(index) ?? null);
  };

  const handleSnackClose = (_: any, reason?: string) =>
  {
    if (reason === 'clickaway') return;
    setSnackOpen(false);
  };

  const handleConditionalContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();
    setConditionalsContextMenu(prev =>
      prev === null
        ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6 }
        : null
    );
  };

  const handleConditionalContextMenuClose = () => setConditionalsContextMenu(null);

  const handleAddNewConditional = (index: number) =>
  {
    const newConditional = {
      key:          'NEW-CONDITIONAL-0',
      requirements: [ { skillId: 1, proficiency: 10, secondarySkillIds: [] } as Requirement ],
      skillRewards: [],
      actorIds:     [],
      jsRewards:    '',
    } as Conditional;
    applyConditionals(conditionals.toSpliced(index, 0, newConditional));
    handleSnack('Conditional added.', MuiSnackbarSeverity.Success);
  };

  const handleCloneConditional = (index: number) =>
  {
    if (!selectedConditional) return;
    const cloned = {
      key:          `${selectedConditional.key}-COPY`,
      skillRewards: [ ...selectedConditional.skillRewards ],
      requirements: selectedConditional.requirements.map(r => ({ ...r, secondarySkillIds: [ ...r.secondarySkillIds ] })),
      actorIds:     [ ...selectedConditional.actorIds ],
      jsRewards:    selectedConditional.jsRewards,
    } as Conditional;
    applyConditionals(conditionals.toSpliced(index, 0, cloned));
    handleSnack('Conditional cloned.', MuiSnackbarSeverity.Success);
  };

  const handleDeleteConditional = (index: number) =>
  {
    if (!selectedConditional) return;
    applyConditionals(conditionals.toSpliced(index, 1));
    handleSnack('Conditional deleted.', MuiSnackbarSeverity.Success);
  };

  const handleAddNewRequirement = () =>
  {
    if (!selectedConditional) return;
    const newReq = { skillId: 1, proficiency: 10, secondarySkillIds: [] } as Requirement;
    const updated = [ ...currentRequirements, newReq ];
    setCurrentRequirements(updated);
    const updatedConditional = { ...selectedConditional, requirements: updated } as Conditional;
    setSelectedConditional(updatedConditional);
    applyConditionals(conditionals.with(selectedConditionalIndex, updatedConditional));
    setExpandedRequirementIdx(updated.length - 1);
    handleSnack('Requirement added.', MuiSnackbarSeverity.Success);
  };

  const handleCloneRequirement = (index: number) =>
  {
    const req = currentRequirements[index];
    if (!req || !selectedConditional) return;
    const cloned = { ...req, secondarySkillIds: [ ...req.secondarySkillIds ] } as Requirement;
    const updated = currentRequirements.toSpliced(index + 1, 0, cloned);
    setCurrentRequirements(updated);
    const updatedConditional = { ...selectedConditional, requirements: updated } as Conditional;
    setSelectedConditional(updatedConditional);
    applyConditionals(conditionals.with(selectedConditionalIndex, updatedConditional));
    setExpandedRequirementIdx(index + 1);
    handleSnack('Requirement cloned.', MuiSnackbarSeverity.Success);
  };

  const handleDeleteRequirement = (index: number) =>
  {
    if (!selectedConditional) return;
    if (currentRequirements.length === 1)
    {
      handleSnack('Cannot delete last requirement; update it instead.', MuiSnackbarSeverity.Error);
      return;
    }
    const updated = currentRequirements.toSpliced(index, 1);
    setCurrentRequirements(updated);
    const updatedConditional = { ...selectedConditional, requirements: updated } as Conditional;
    setSelectedConditional(updatedConditional);
    applyConditionals(conditionals.with(selectedConditionalIndex, updatedConditional));
    setExpandedRequirementIdx(prev =>
    {
      if (prev === null || prev < index) return prev;
      if (prev === index) return null;
      return prev - 1;
    });
    handleSnack('Requirement deleted.', MuiSnackbarSeverity.Success);
  };
  //endregion selections

  //region render
  const getConditionalSidebarRow = useCallback((index: number): VirtualizedSidebarRow =>
  {
    const conditional = conditionals.at(index);
    if (!conditional) return { type: 'spacer' };
    const iconSkillId = conditional.skillRewards?.at(0) ?? 0;
    const iconIndex   = iconSkillId > 0 ? skillsById.get(iconSkillId)?.iconIndex : undefined;
    return { type: 'item', label: conditional.key, title: conditional.key, iconIndex };
  }, [ conditionals, skillsById ]);

  const renderActorListItem = (actor: RPG_ActorDomainModel, index: number) =>
  {
    if (!actor || actor.name === '' || actor.name.startsWith('=='))
    {
      return <React.Fragment key={`${index}-hidden`}/>;
    }

    return (
      <ListItem key={`${actor.id}-${actor.name}`} sx={{ paddingTop: 0, paddingBottom: 0 }}>
        <ListItemButton sx={{ height: 30 }}>
          <ListItemIcon>
            <Person/>
          </ListItemIcon>
          <ListItemText primary={actor.name}/>
          <Switch
            edge={'end'}
            onChange={() => handleConditionalApplicableActorIdToggle(actor.id)}
            checked={actorIdChecked.includes(actor.id)}
          />
        </ListItemButton>
      </ListItem>
    );
  };
  //endregion render

  useBoardActions({
    onSave: async () =>
    {
      setCanSave(false);

      // every block of the configuration has to be named here. anything left out is not merely
      // unsaved - it is written away, because this replaces the file rather than patching it.
      await save({
        conditionals,
        knowledgeTags,
        skillTypeMapping,
        knowledgeExchanges,
      } as Configuration);
      handleSnack('Proficiency data saved successfully!', MuiSnackbarSeverity.Success);
    },
    canSave: canSave && !proficiencyLoading,
    onReload: handleReloadButtonOnClickEvent,
    canReload: !proficiencyLoading,
  });

  if (actorsLoading || skillsLoading || proficiencyLoading)
  {
    return (
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
        <Typography>Loading database and proficiency resources...</Typography>
      </Box>
    );
  }

  const validSkills = skills.filter(s => s.name && !s.name.startsWith('=='));

  return <>
    <Box sx={{
      flex:            1,
      minHeight:       0,
      display:         'flex',
      flexDirection:   'column',
      overflow:        'hidden',
    }}>
      <EditorBoardSplitLayout
        sidebarColumnWidth={proficiencyBoardListColumnWidth}
        sidebar={
          <VirtualizedSidebarList
            ref={listRef}
            itemCount={conditionals.length}
            itemSize={30}
            fillContainer
            listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
            labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
            selectedIndex={selectedConditionalIndex}
            getRow={getConditionalSidebarRow}
            onSelectIndex={(index) => handleConditionalListItemOnClickEvent(null, index)}
            onContextMenu={handleConditionalContextMenu}
            listWrapperRef={listWrapperRef}
          />
        }
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
          <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
            <Tab label={'Conditionals'} id={'proficiency-tab-0'} aria-controls={'proficiency-tabpanel-0'}/>
            <Tab label={'Knowledge'} id={'proficiency-tab-1'} aria-controls={'proficiency-tabpanel-1'}/>
            <Tab label={'Exchanges'} id={'proficiency-tab-2'} aria-controls={'proficiency-tabpanel-2'}/>
          </Tabs>
        </Box>

        {tabIndex === 1 && (
          <Box sx={{ overflow: 'auto', p: 2 }}>
            <KnowledgeTab
              tags={knowledgeTags}
              onTagsChange={applyKnowledgeTags}
              mapping={skillTypeMapping}
              onMappingChange={applySkillTypeMapping}
            />
          </Box>
        )}

        {tabIndex === 2 && (
          <Box sx={{ overflow: 'auto', p: 2 }}>
            <KnowledgeExchangesTab
              exchanges={knowledgeExchanges}
              onChange={applyKnowledgeExchanges}
              tags={knowledgeTags}
            />
          </Box>
        )}

        {tabIndex === 0 && (selectedConditional === null
          ? <Typography sx={{ p: 2 }}>
              Please select a conditional on the left.
            </Typography>

          : <Box sx={{ overflow: 'auto', p: 2 }}>
              <Stack spacing={2}>

                {/* Key */}
                <TextField
                  required
                  variant={'outlined'}
                  label={'Key'}
                  value={selectedConditional.key}
                  onChange={e =>
                  {
                    const updated = { ...selectedConditional, key: e.target.value } as Conditional;
                    setSelectedConditional(updated);
                    applyConditionals(conditionals.with(selectedConditionalIndex, updated));
                  }}
                  size={'small'}
                  fullWidth
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position={'start'}>
                          <Key/>
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                {/* Actors + Skill Rewards */}
                <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
                  <Box sx={{ width: 260, flexShrink: 0 }}>
                    <BoardSectionCard title={'Applicable Actors'} density={'compact'}>
                      <List dense disablePadding>
                        {actors.map(renderActorListItem)}
                      </List>
                    </BoardSectionCard>
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <BoardSectionCard title={'Skill Rewards'}>
                      <Stack spacing={1.5}>
                        <Autocomplete
                          size={'small'}
                          options={validSkills.filter(s => !skillIdRewardEarned.includes(s.id))}
                          value={null}
                          onChange={(_, val) =>
                          {
                            if (!val) return;
                            handleConditionalSkillRewardsChange(
                              [ ...skillIdRewardEarned, val.id ].sort((a, b) => a - b)
                            );
                          }}
                          getOptionLabel={opt => `[${opt.id}] ${opt.name}`}
                          isOptionEqualToValue={(a, b) => a.id === b.id}
                          renderOption={(props, option) => (
                            <li {...props} key={props.key ?? option.id}>
                              <Stack direction={'row'} spacing={1} alignItems={'center'}>
                                <IconSetSprite iconIndex={option.iconIndex ?? 0} sizePx={20}/>
                                <Typography variant={'body2'}>[{option.id}] {option.name}</Typography>
                              </Stack>
                            </li>
                          )}
                          renderInput={(params) => (
                            <TextField {...params} label={'Add Skill Reward'} variant={'outlined'}/>
                          )}
                        />

                        {skillIdRewardEarned.length > 0 && (
                          <Stack spacing={0.5}>
                            {skillIdRewardEarned.map((skillId, rewardIdx) =>
                            {
                              const skill = skillsById.get(skillId);
                              if (!skill) return null;
                              return (
                                <Stack
                                  key={skillId}
                                  direction={'row'}
                                  alignItems={'center'}
                                  spacing={1.5}
                                  sx={{
                                    px:          1,
                                    py:          0.5,
                                    borderRadius: 1,
                                    border:      '1px solid',
                                    borderColor: 'divider',
                                  }}
                                >
                                  <IconSetSprite iconIndex={skill.iconIndex ?? 0} sizePx={24}/>
                                  <Typography variant={'body2'} sx={{ flex: 1 }}>
                                    [{skill.id}] {skill.name}
                                  </Typography>
                                  <Tooltip title={'Move up'}>
                                    <span>
                                      <IconButton
                                        size={'small'}
                                        disabled={rewardIdx === 0}
                                        onClick={() => handleConditionalSkillRewardsChange(moveItem(skillIdRewardEarned, rewardIdx, -1))}
                                      >
                                        <ArrowUpward fontSize={'small'}/>
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title={'Move down'}>
                                    <span>
                                      <IconButton
                                        size={'small'}
                                        disabled={rewardIdx === skillIdRewardEarned.length - 1}
                                        onClick={() => handleConditionalSkillRewardsChange(moveItem(skillIdRewardEarned, rewardIdx, 1))}
                                      >
                                        <ArrowDownward fontSize={'small'}/>
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title={'Go to skill'}>
                                    <IconButton
                                      size={'small'}
                                      onClick={() => navigate(`/skills?skillId=${skill.id}`)}
                                    >
                                      <OpenInNew fontSize={'small'}/>
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={'Remove'}>
                                    <IconButton
                                      size={'small'}
                                      onClick={() =>
                                        handleConditionalSkillRewardsChange(
                                          skillIdRewardEarned.filter(id => id !== skillId)
                                        )}
                                    >
                                      <DeleteOutline fontSize={'small'}/>
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              );
                            })}
                          </Stack>
                        )}
                      </Stack>
                    </BoardSectionCard>
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <BoardSectionCard
                      title={'Skill Requirements'}
                      subtitle={'Skills that must reach the specified proficiency level'}
                      actions={
                        <Tooltip title={'Add requirement'}>
                          <IconButton size={'small'} onClick={handleAddNewRequirement}>
                            <Add fontSize={'small'}/>
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <Stack spacing={0.5}>
                        {currentRequirements.map((req, idx) =>
                        {
                          const primarySkill       = skillsById.get(req.skillId);
                          const secondarySkillObjs = req.secondarySkillIds
                            .map(id => skillsById.get(id))
                            .filter((s): s is RPG_SkillDomainModel => !!s);

                          return (
                            <Accordion
                              key={idx}
                              expanded={expandedRequirementIdx === idx}
                              onChange={(_, expanded) => setExpandedRequirementIdx(expanded ? idx : null)}
                              disableGutters
                              sx={{ '&:before': { display: 'none' } }}
                            >
                              <AccordionSummary expandIcon={<ExpandMore/>}>
                                <Stack
                                  direction={'row'}
                                  alignItems={'center'}
                                  spacing={1.5}
                                  sx={{ flex: 1, minWidth: 0, mr: 1 }}
                                >
                                  <IconSetSprite iconIndex={primarySkill?.iconIndex ?? 0} sizePx={24}/>
                                  <Typography variant={'body2'} noWrap sx={{ flex: 1, minWidth: 0 }}>
                                    {primarySkill
                                      ? `[${primarySkill.id}] ${primarySkill.name}`
                                      : `Skill #${req.skillId}`}
                                  </Typography>
                                  <Typography variant={'caption'} color={'text.secondary'} sx={{ flexShrink: 0 }}>
                                    ×{req.proficiency}
                                  </Typography>
                                  {req.secondarySkillIds.length > 0 && (
                                    <Typography variant={'caption'} color={'text.secondary'} sx={{ flexShrink: 0 }}>
                                      +{req.secondarySkillIds.length} secondary
                                    </Typography>
                                  )}
                                </Stack>
                                <Stack direction={'row'} spacing={0.5} onClick={e => e.stopPropagation()}>
                                  <Tooltip title={'Move up'}>
                                    <span>
                                      <IconButton size={'small'} disabled={idx === 0} onClick={() => handleReorderRequirement(idx, -1)}>
                                        <ArrowUpward fontSize={'small'}/>
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title={'Move down'}>
                                    <span>
                                      <IconButton size={'small'} disabled={idx === currentRequirements.length - 1} onClick={() => handleReorderRequirement(idx, 1)}>
                                        <ArrowDownward fontSize={'small'}/>
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title={'Clone'}>
                                    <IconButton size={'small'} onClick={() => handleCloneRequirement(idx)}>
                                      <ContentCopy fontSize={'small'}/>
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={'Delete'}>
                                    <IconButton size={'small'} onClick={() => handleDeleteRequirement(idx)}>
                                      <DeleteOutline fontSize={'small'}/>
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              </AccordionSummary>

                              <AccordionDetails>
                                <Stack spacing={1.5}>
                                  <TextField
                                    type={'number'}
                                    label={'Proficiency Required'}
                                    variant={'outlined'}
                                    size={'small'}
                                    sx={{ width: 180 }}
                                    value={req.proficiency}
                                    onChange={e =>
                                      patchRequirement(idx, { proficiency: parseInt(e.target.value) || 0 })}
                                    slotProps={{ htmlInput: { min: '0', step: '1' } }}
                                  />

                                  <Autocomplete
                                    size={'small'}
                                    options={validSkills}
                                    value={skillsById.get(req.skillId) ?? null}
                                    onChange={(_, val) => val && patchRequirement(idx, { skillId: val.id })}
                                    getOptionLabel={opt => `[${opt.id}] ${opt.name}`}
                                    isOptionEqualToValue={(a, b) => a.id === b.id}
                                    renderOption={(props, option) => (
                                      <li {...props} key={props.key ?? option.id}>
                                        <Stack direction={'row'} spacing={1} alignItems={'center'}>
                                          <IconSetSprite iconIndex={option.iconIndex ?? 0} sizePx={20}/>
                                          <Typography variant={'body2'}>[{option.id}] {option.name}</Typography>
                                        </Stack>
                                      </li>
                                    )}
                                    renderInput={(params) => (
                                      <TextField {...params} label={'Primary Skill'} variant={'outlined'}/>
                                    )}
                                  />

                                  <Autocomplete<RPG_SkillDomainModel, true>
                                    multiple
                                    size={'small'}
                                    options={validSkills}
                                    value={secondarySkillObjs}
                                    onChange={(_, val) =>
                                      patchRequirement(idx, { secondarySkillIds: val.map(s => s.id) })}
                                    getOptionLabel={opt => `[${opt.id}] ${opt.name}`}
                                    isOptionEqualToValue={(a, b) => a.id === b.id}
                                    slotProps={{ chip: { size: 'small' } }}
                                    renderOption={(props, option) => (
                                      <li {...props} key={props.key ?? option.id}>
                                        <Stack direction={'row'} spacing={1} alignItems={'center'}>
                                          <IconSetSprite iconIndex={option.iconIndex ?? 0} sizePx={20}/>
                                          <Typography variant={'body2'}>[{option.id}] {option.name}</Typography>
                                        </Stack>
                                      </li>
                                    )}
                                    renderInput={(params) => (
                                      <TextField {...params} label={'Secondary Skills'} variant={'outlined'}/>
                                    )}
                                  />

                                  {req.secondarySkillIds.length > 0 && (
                                    <Box>
                                      <Button
                                        size={'small'}
                                        variant={'outlined'}
                                        color={'inherit'}
                                        startIcon={<PlaylistRemove/>}
                                        onClick={() => patchRequirement(idx, { secondarySkillIds: [] })}
                                      >
                                        Clear Secondary Skills
                                      </Button>
                                    </Box>
                                  )}
                                </Stack>
                              </AccordionDetails>
                            </Accordion>
                          );
                        })}
                      </Stack>
                    </BoardSectionCard>
                  </Box>
                </Stack>

                {/* JS Rewards */}
                <BoardSectionCard title={'Javascript Rewards'} collapsible defaultExpanded={false}>
                  <TextField
                    label={'Javascript-based Rewards'}
                    placeholder={'Raw javascript to be executed upon completing this conditional...'}
                    value={selectedConditional.jsRewards}
                    onChange={handleConditionalJsRewardsOnChangeEvent}
                    multiline
                    fullWidth
                    rows={6}
                    variant={'outlined'}
                    size={'small'}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        fontFamily: 'monospace',
                        fontSize:   13,
                      },
                    }}
                  />
                </BoardSectionCard>

              </Stack>
            </Box>)}
      </EditorBoardSplitLayout>
    </Box>

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

    {/* Conditionals context menu */}
    <Menu
      open={conditionalsContextMenu !== null}
      onClose={handleConditionalContextMenuClose}
      anchorReference={'anchorPosition'}
      anchorPosition={conditionalsContextMenu !== null
        ? { top: conditionalsContextMenu.mouseY, left: conditionalsContextMenu.mouseX }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewConditional(selectedConditionalIndex);
        handleConditionalContextMenuClose();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>
      <MenuItem onClick={() =>
      {
        handleAddNewConditional(selectedConditionalIndex + 1);
        handleConditionalContextMenuClose();
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>
      <Divider/>
      <MenuItem onClick={() =>
      {
        handleCloneConditional(selectedConditionalIndex);
        handleConditionalContextMenuClose();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>
      <MenuItem onClick={() =>
      {
        handleCloneConditional(selectedConditionalIndex + 1);
        handleConditionalContextMenuClose();
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>
      <Divider/>
      <MenuItem dense onClick={() =>
      {
        handleDeleteConditional(selectedConditionalIndex);
        handleConditionalContextMenuClose();
      }}>
        <ListItemIcon><DeleteOutline/></ListItemIcon>
        <Typography>Remove Selected</Typography>
      </MenuItem>
    </Menu>
  </>;
};

export default ProficiencyBoard;
