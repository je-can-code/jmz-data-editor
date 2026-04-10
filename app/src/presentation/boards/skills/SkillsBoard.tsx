import React, { ChangeEvent, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { ContentCopy, DoubleArrow, ExpandMore, KeyboardArrowLeft, KeyboardArrowRight } from '@mui/icons-material';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import SaveButton from '../../../components/core/SaveButton.tsx';
import ReloadButton from '../../../components/core/ReloadButton.tsx';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { RPG_SkillDomainModel } from '@core/domain/entities/RPG_SkillDomainModel.ts';
import { SkillJabsExtension } from '@core/domain/entities/jabs/SkillJabsExtension.ts';
import {
  RMMZ_SKILL_OCCASION_OPTIONS,
  type RmmzSkillOccasionOption,
  skillOccasionOption
} from '@core/enums/RmmzSkillOccasion.ts';
import { RMMZ_SKILL_SCOPE_OPTIONS, type RmmzSkillScopeOption, skillScopeOption } from '@core/enums/RmmzSkillScope.ts';
import {
  type RmmzSkillAnimationOption,
  skillAnimationAutocompleteOptionsForSkill,
  skillAnimationOptionForValue
} from '@core/enums/RmmzSkillAnimation.ts';
import {
  type RmmzSkillStypeOption,
  skillStypeAutocompleteOptions,
  skillStypeOptionForValue
} from '@core/enums/RmmzSkillStype.ts';
import {
  type RmmzWeaponTypeOption,
  weaponTypeAutocompleteOptions,
  weaponTypeOptionForValue
} from '@core/enums/RmmzWeaponType.ts';
import {
  RMMZ_USABLE_HIT_TYPE_OPTIONS,
  type RmmzUsableHitTypeOption,
  usableHitTypeOption
} from '@core/enums/RmmzUsableHitType.ts';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import {
  type UsableItemDamageEditorValue,
  UsableItemDamageSection
} from '@presentation/components/usableItem/UsableItemDamageSection.tsx';
import { type IdLabelRow, UsableEffectsEditor } from '@presentation/components/usableItem/UsableEffectsEditor.tsx';
import { SystemService } from '@services/SystemService.ts';
import {
  SKILL_JABS_ACCORDION_INITIAL_EXPANDED,
  type SkillJabsAccordionId,
  SkillJabsExtensionsPanel,
} from '@presentation/boards/skills/SkillJabsExtensionsPanel.tsx';

/**
 * Default expanded/collapsed state for skill editor accordions on first paint.
 * Keys match {@code accordion} ids in the skills board layout.
 */
const SKILL_EDITOR_ACCORDION_INITIAL_EXPANDED: Record<string, boolean> = {
  'editor-general': true,
  'editor-usage': true,
  'editor-execution': true,
  'editor-bonus-hits': true,
  'editor-messages': true,
  'editor-damage': true,
  'editor-effects': true,
  'editor-skill-extend': true,
  'editor-sks': true,
  'editor-costs': true,
};

/**
 * MUI {@code sx} for formula and note fields that should render in a monospace font.
 */
const noteFormulaFieldSx = {
  '& .MuiInputBase-input': { fontFamily: 'monospace' },
};

/**
 * Board for editing project skills: list selection, RMMZ fields, JABS extensions, and note preview.
 *
 * @returns Skills editor grid layout.
 */
const SkillsBoard = () =>
{
  const {
    skills,
    setData: setSkills,
    loading,
    save,
    reload
  } = useSkills();

  const { states } = useStates();

  const {
    systemDataGeneration,
    projectRoot,
    rmmzDataPath,
    projectReloadGeneration,
  } = useProjectPath();

  /**
   * States available as skill effect targets (id and display name).
   *
   * @returns Rows for state effect pickers, excluding empty names.
   */
  const stateEffectPickerRows = useMemo((): IdLabelRow[] =>
  {
    const rows: IdLabelRow[] = [
      {
        id: 0,
        label: '0: Normal attack states',
      },
    ];
    for (const s of states)
    {
      if (s.id <= 0)
      {
        continue;
      }
      rows.push({
        id: s.id,
        label: `${s.id}: ${s.name}`,
      });
    }
    return rows;
  }, [ states ]);

  /**
   * Skills available as effect or extend targets (id and display name).
   *
   * @returns Rows for skill pickers, excluding section headers.
   */
  const skillEffectPickerRows = useMemo((): IdLabelRow[] =>
  {
    return skills
      .filter((s) => !s.name.startsWith('==='))
      .map((s) => ({
        id: s.id,
        label: `${s.id}: ${s.name}`,
      }));
  }, [ skills ]);

  /**
   * Common events from {@link SystemService} for skill effect configuration.
   *
   * @returns Id/label rows for common-event pickers.
   */
  const commonEventPickerRows = useMemo((): IdLabelRow[] =>
  {
    return SystemService.commonEventAutocompleteRows.slice();
  }, [ systemDataGeneration ]);

  const [ selectedSkill, setSelectedSkill ] = useState<RPG_SkillDomainModel | null>(null);
  const [ selectedSkillIndex, setSelectedSkillIndex ] = useState<number>(0);
  const [ searchTerm, setSearchTerm ] = useState<string>('');

  const listRef = useRef<FixedSizeList>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  const [ isSaving, setIsSaving ] = useState<boolean>(false);
  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);

  const [ skillEditorTab, setSkillEditorTab ] = useState<number>(0);

  const [ skillEditorAccordionExpanded, setSkillEditorAccordionExpanded ] = useState<Record<string, boolean>>(
    () => ({ ...SKILL_EDITOR_ACCORDION_INITIAL_EXPANDED })
  );

  const [ jabsAccordionExpanded, setJabsAccordionExpanded ] = useState<Record<string, boolean>>(
    () => ({ ...SKILL_JABS_ACCORDION_INITIAL_EXPANDED })
  );

  /**
   * Expands or collapses a skill editor accordion section.
   *
   * @param id Accordion key aligned with {@link SKILL_EDITOR_ACCORDION_INITIAL_EXPANDED}.
   * @param expanded Next expanded flag from MUI {@link Accordion}.
   * @returns {void}
   */
  const handleSkillEditorAccordionChange = useCallback((
    id: string,
    expanded: boolean
  ) =>
  {
    setSkillEditorAccordionExpanded((prev) => ({
      ...prev,
      [ id ]: expanded
    }));
  }, []);

  /**
   * Expands or collapses a JABS extensions accordion section.
   *
   * @param id Accordion id from {@link SkillJabsAccordionId}.
   * @param expanded Next expanded flag from MUI {@link Accordion}.
   * @returns {void}
   */
  const handleJabsAccordionChange = useCallback((
    id: SkillJabsAccordionId,
    expanded: boolean
  ) =>
  {
    setJabsAccordionExpanded((prev) => ({
      ...prev,
      [ id ]: expanded
    }));
  }, []);

  /**
   * Supplies {@code expanded} and {@code onChange} for a skill editor accordion.
   *
   * @param id Accordion section id.
   * @returns Partial accordion props wired to local expanded state.
   */
  const editorAccordionProps = (id: string) =>
    ({
      expanded: skillEditorAccordionExpanded[ id ] ?? false,
      onChange: (
        _e: SyntheticEvent,
        expanded: boolean
      ) =>
      {
        handleSkillEditorAccordionChange(id, expanded);
      },
    });

  /**
   * Read-only note text for the Note tab (serialized RMMZ skill note).
   *
   * @returns Empty string when no skill selected; otherwise current {@code note}.
   */
  const serializedSkillNotePreview = useMemo(() =>
  {
    if (selectedSkill === null)
    {
      return '';
    }
    return selectedSkill.toRmmz().note;
  }, [ selectedSkill ]);

  /**
   * Animation autocomplete options, optionally biased so the current skill animation stays visible.
   *
   * @returns Options for the execution animation {@link Autocomplete}.
   */
  const executionAnimationOptions = useMemo(() =>
  {
    const base = SystemService.skillAnimationAutocompleteOptions;
    if (!selectedSkill)
    {
      return base;
    }
    return skillAnimationAutocompleteOptionsForSkill(selectedSkill.animationId, base);
  }, [ selectedSkill, systemDataGeneration ]);

  /**
   * Opens the snackbar with the given copy and presentation.
   *
   * @param message User-visible snack text.
   * @param severity MUI severity; defaults to info.
   * @param variant MUI variant; defaults to filled.
   * @returns {void}
   */
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

  /**
   * Clones the given skill into selection and list slot, and enables save.
   *
   * @param updatedSkill Domain model after in-place edits (typically current selection).
   * @returns {void}
   */
  const updateSkill = useCallback(
    (updatedSkill: RPG_SkillDomainModel) =>
    {
      const clonedSkill = Object.assign(
        Object.create(Object.getPrototypeOf(updatedSkill)),
        updatedSkill
      );

      setSelectedSkill(clonedSkill);
      setCanSave(true);

      setSkills((prevSkills) =>
      {
        if (!prevSkills || selectedSkillIndex < 0)
        {
          return prevSkills;
        }
        return prevSkills.with(selectedSkillIndex, clonedSkill);
      });
    },
    [ selectedSkillIndex, setSkills ]
  );

  /**
   * Skills that may appear in the extend-base multiselect (excludes headers and self-id).
   *
   * @returns Picker rows for skill extend configuration.
   */
  const skillExtendPickerOptions = useMemo((): IdLabelRow[] =>
  {
    if (selectedSkill === null)
    {
      return [];
    }
    return skillEffectPickerRows.filter(
      (o) => o.id >= 1 && o.id !== selectedSkill.id
    );
  }, [ skillEffectPickerRows, selectedSkill ]);

  /**
   * Current extend-base ids resolved to picker rows (missing ids get placeholder labels).
   *
   * @returns Selected rows for the extend-base {@link Autocomplete}.
   */
  const selectedSkillExtendPickerValues = useMemo((): IdLabelRow[] =>
  {
    if (selectedSkill === null)
    {
      return [];
    }
    const byId = new Map(skillEffectPickerRows.map((o) => [ o.id, o ]));
    return selectedSkill.skillExtendBaseIds.map((id) =>
    {
      const row = byId.get(id);
      if (row !== undefined)
      {
        return row;
      }
      return {
        id,
        label: `${id}: (missing skill)`,
      };
    });
  }, [ skillEffectPickerRows, selectedSkill ]);

  const selectedSkillIdForExtendReverse =
    selectedSkill === null
      ? null
      : selectedSkill.id;

  /**
   * Other skills that list the selected skill as an extend base (reverse extend graph).
   *
   * @returns List indices, ids, and names of extenders.
   */
  const skillExtendersOfSelected = useMemo(() =>
  {
    if (selectedSkillIdForExtendReverse === null)
    {
      return [];
    }
    const baseId = selectedSkillIdForExtendReverse;
    const rows: { listIndex: number; id: number; name: string }[] = [];
    for (let i = 0; i < skills.length; i++)
    {
      const s = skills[ i ];
      if (s.id === baseId)
      {
        continue;
      }
      if (s.skillExtendBaseIds.includes(baseId) === false)
      {
        continue;
      }
      rows.push({
        listIndex: i,
        id: s.id,
        name: s.name,
      });
    }
    return rows;
  }, [ skills, selectedSkillIdForExtendReverse ]);

  const handleSkillListItemOnClickEventRef = useRef<
    (
      index: number,
      keepListFocus?: boolean
    ) => void
  >(() =>
  {
  });

  const { updateUrl } = useUrlSelection(
    'skillId',
    skills,
    (s) => s.id,
    selectedSkillIndex,
    (index) => handleSkillListItemOnClickEventRef.current(index, false),
    (index) => listRef.current?.scrollToItem(index, 'smart')
  );

  /**
   * Selects a skill by list index and optionally keeps focus on the virtualized list.
   *
   * @param index Index in the {@code skills} array.
   * @param keepListFocus When true, refocuses the list wrapper after selection.
   * @returns {void}
   */
  const handleSkillListItemOnClickEvent = (
    index: number,
    keepListFocus: boolean = true
  ) =>
  {
    setSelectedSkillIndex(index);

    if (skills.length > 0)
    {
      const skill = skills.at(index)!;
      setSelectedSkill(skill);
      updateUrl(skill);
    }

    if (keepListFocus)
    {
      setTimeout(() => listWrapperRef.current?.focus(), 0);
    }
  };

  handleSkillListItemOnClickEventRef.current = handleSkillListItemOnClickEvent;

  useEffect(() =>
  {
    if (skills.length === 0)
    {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('skillId'))
    {
      return;
    }

    if (selectedSkill === null)
    {
      handleSkillListItemOnClickEvent(0, false);
    }
  }, [ skills.length ]);

  useEffect(() =>
  {
    listWrapperRef.current?.focus();
  }, []);

  /**
   * Copies the current skill serialized note to the clipboard and reports success or failure.
   *
   * @returns Promise resolved after clipboard write attempt.
   */
  const handleCopySerializedSkillNote = async () =>
  {
    if (selectedSkill === null)
    {
      return;
    }

    const text = selectedSkill.toRmmz().note;
    try
    {
      await navigator.clipboard.writeText(text);
      handleSnack('Note copied to clipboard.', MuiSnackbarSeverity.Success);
    }
    catch
    {
      handleSnack('Could not copy to clipboard.', MuiSnackbarSeverity.Error);
    }
  };

  /**
   * Updates the search term, jumps to the first name match, and selects that skill.
   *
   * @param event Change event from the search field.
   * @returns {void}
   */
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const term = event.target.value.toLowerCase();
    setSearchTerm(term);

    if (term.trim() === '')
    {
      return;
    }

    const foundIndex = skills.findIndex(skill =>
    {
      if (skill.name.length === 0)
      {
        return false;
      }
      return skill.name.toLowerCase()
        .includes(term);
    });

    if (foundIndex !== -1)
    {
      listRef.current?.scrollToItem(foundIndex, 'start');
      handleSkillListItemOnClickEvent(foundIndex, false);
    }
  };

  /**
   * Finds the next skill whose name contains the search query, walking the list cyclically.
   *
   * @param startIndex Current list index to search from (exclusive of first step).
   * @param term Search string; trimmed and compared case-insensitively.
   * @param direction {@code 1} forward, {@code -1} backward.
   * @returns Matching index, or {@code -1} when empty query or no match.
   */
  const findNextMatchIndex = (
    startIndex: number,
    term: string,
    direction: 1 | -1
  ) =>
  {
    const query = term.trim()
      .toLowerCase();
    if (query === '')
    {
      return -1;
    }

    const length = skills.length;
    if (length === 0)
    {
      return -1;
    }

    for (let step = 1; step <= length; step++)
    {
      const idx = (
        startIndex + (
          direction * step
        ) + length
      ) % length;
      const skill = skills[ idx ];
      if (skill && skill.name.length > 0 && skill.name.toLowerCase()
        .includes(query))
      {
        return idx;
      }
    }

    return -1;
  };

  /**
   * Selects the previous skill matching the current search term.
   *
   * @returns {void}
   */
  const handleSearchPrevClick = () =>
  {
    const query = searchTerm.trim();
    if (query === '')
    {
      return;
    }

    const start = selectedSkillIndex ?? 0;
    const prevIndex = findNextMatchIndex(start, query, -1);
    if (prevIndex !== -1)
    {
      listRef.current?.scrollToItem(prevIndex, 'start');
      handleSkillListItemOnClickEvent(prevIndex);
    }
  };

  /**
   * Selects the next skill matching the current search term.
   *
   * @returns {void}
   */
  const handleSearchNextClick = () =>
  {
    const query = searchTerm.trim();
    if (query === '')
    {
      return;
    }

    const start = selectedSkillIndex ?? 0;
    const nextIndex = findNextMatchIndex(start, query, 1);
    if (nextIndex !== -1)
    {
      listRef.current?.scrollToItem(nextIndex, 'start');
      handleSkillListItemOnClickEvent(nextIndex);
    }
  };

  /**
   * Persists all skills through the resource context.
   *
   * @returns Promise resolved when save completes.
   */
  const handleSaveButtonOnClickEvent = async () =>
  {
    await save(skills);
    handleSnack('Skills data has been saved successfully.');
  };

  /**
   * Reloads skills from disk and clears the dirty flag on success.
   *
   * @returns Promise resolved when reload completes or rejected on failure.
   */
  const handleReloadButtonOnClickEvent = async () =>
  {
    try
    {
      await reload();
      setCanSave(false);
      handleSnack('Skills data has been reloaded successfully.', MuiSnackbarSeverity.Success);
    }
    catch (error)
    {
      console.error('Failed to reload skills data:', error);
      handleSnack('Failed to reload skills data.', MuiSnackbarSeverity.Error);
    }
  };

  /**
   * Moves selection to the next skill in list order (wraps).
   *
   * @returns {void}
   */
  const handleIterateNext = () =>
  {
    const length = skills.length;
    if (length === 0)
    {
      return;
    }

    const start = selectedSkillIndex ?? 0;
    const nextIndex = (
      start + 1
    ) % length;

    listRef.current?.scrollToItem(nextIndex, 'start');
    handleSkillListItemOnClickEvent(nextIndex);
  };

  /**
   * Moves selection to the previous skill in list order (wraps).
   *
   * @returns {void}
   */
  const handleIteratePrev = () =>
  {
    const length = skills.length;
    if (length === 0)
    {
      return;
    }

    const start = selectedSkillIndex ?? 0;
    const prevIndex = (
      start - 1 + length
    ) % length;

    listRef.current?.scrollToItem(prevIndex, 'start');
    handleSkillListItemOnClickEvent(prevIndex);
  };

  /**
   * Arrow up/down navigation for the focused skill list.
   *
   * @param event Keyboard event from the list container.
   * @returns {void}
   */
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) =>
  {
    if (event.key === 'ArrowDown')
    {
      event.preventDefault();
      handleIterateNext();
    }
    else if (event.key === 'ArrowUp')
    {
      event.preventDefault();
      handleIteratePrev();
    }
  };

  /**
   * Writes the skill display name from the general editor field.
   *
   * @param event Change event from the name input.
   * @returns {void}
   */
  const handleSkillNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.name = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Writes the skill help/description text.
   *
   * @param event Change event from the description field.
   * @returns {void}
   */
  const handleDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.description = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Updates the skill icon index from {@link IconIndexField}.
   *
   * @param next Chosen icon index in the icon set.
   * @returns {void}
   */
  const handleSkillIconIndexOnChange = (next: number) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.iconIndex = next;
    updateSkill(selectedSkill);
  };

  /**
   * Writes battle or menu message line 1.
   *
   * @param event Change event from the message field.
   * @returns {void}
   */
  const handleSkillMessage1OnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.message1 = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Writes battle or menu message line 2.
   *
   * @param event Change event from the message field.
   * @returns {void}
   */
  const handleSkillMessage2OnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.message2 = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Parses MP/TP-style cost text; invalid input becomes {@code 0}.
   *
   * @param raw Digits from a cost field.
   * @returns Non-negative parsed integer.
   */
  const parseCostInput = (raw: string): number =>
  {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed))
    {
      return 0;
    }
    return parsed;
  };

  /**
   * Parses execution speed; invalid input becomes {@code 0}.
   *
   * @param raw Digits from the speed field.
   * @returns Parsed speed value.
   */
  const parseExecutionSpeedInput = (raw: string): number =>
  {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed))
    {
      return 0;
    }
    return parsed;
  };

  /**
   * Parses success rate percent; clamps to {@code 0}..{@code 100}, default {@code 100} when NaN.
   *
   * @param raw Digits from the success rate field.
   * @returns Clamped success rate.
   */
  const parseExecutionSuccessInput = (raw: string): number =>
  {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed))
    {
      return 100;
    }
    if (parsed < 0)
    {
      return 0;
    }
    if (parsed > 100)
    {
      return 100;
    }
    return parsed;
  };

  /**
   * Parses repeat count; minimum {@code 1}, default {@code 1} when NaN.
   *
   * @param raw Digits from the repeats field.
   * @returns At least one repeat.
   */
  const parseExecutionRepeatsInput = (raw: string): number =>
  {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed))
    {
      return 1;
    }
    if (parsed < 1)
    {
      return 1;
    }
    return parsed;
  };

  /**
   * Writes base MP cost from {@link parseCostInput}.
   *
   * @param event Change event from the MP cost field.
   * @returns {void}
   */
  const handleMpCostOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.mpCost = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes base TP cost from {@link parseCostInput}.
   *
   * @param event Change event from the TP cost field.
   * @returns {void}
   */
  const handleTpCostOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.tpCost = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes TP gain on use from {@link parseCostInput}.
   *
   * @param event Change event from the TP gain field.
   * @returns {void}
   */
  const handleTpGainOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.tpGain = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes HP cost flat amount from {@link parseCostInput}.
   *
   * @param event Change event from the HP flat cost field.
   * @returns {void}
   */
  const handleHpCostFlatOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.hpCostFlat = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes HP cost percent from {@link parseCostInput}.
   *
   * @param event Change event from the HP percent cost field.
   * @returns {void}
   */
  const handleHpCostPercentOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.hpCostPercent = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes HP cost formula text.
   *
   * @param event Change event from the HP formula field.
   * @returns {void}
   */
  const handleHpCostFormulaOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.hpCostFormula = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Toggles whether HP cost may reduce the user below 1 HP.
   *
   * @param event Change event from the checkbox.
   * @returns {void}
   */
  const handleHpCostCanKillOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.hpCostCanKill = event.target.checked;
    updateSkill(selectedSkill);
  };

  /**
   * Writes JABS MP cost tag flat component from {@link parseCostInput}.
   *
   * @param event Change event from the tag flat field.
   * @returns {void}
   */
  const handleMpCostTagFlatOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.mpCostTagFlat = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes JABS MP cost tag percent component from {@link parseCostInput}.
   *
   * @param event Change event from the tag percent field.
   * @returns {void}
   */
  const handleMpCostTagPercentOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.mpCostTagPercent = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes JABS MP cost tag formula string.
   *
   * @param event Change event from the tag formula field.
   * @returns {void}
   */
  const handleMpCostTagFormulaOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.mpCostTagFormula = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Writes JABS TP cost tag flat component from {@link parseCostInput}.
   *
   * @param event Change event from the tag flat field.
   * @returns {void}
   */
  const handleTpCostTagFlatOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.tpCostTagFlat = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes JABS TP cost tag percent component from {@link parseCostInput}.
   *
   * @param event Change event from the tag percent field.
   * @returns {void}
   */
  const handleTpCostTagPercentOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.tpCostTagPercent = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes JABS TP cost tag formula string.
   *
   * @param event Change event from the tag formula field.
   * @returns {void}
   */
  const handleTpCostTagFormulaOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.tpCostTagFormula = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack HP gain flat from {@link parseCostInput}.
   *
   * @param event Change event from the flat gain field.
   * @returns {void}
   */
  const handleOnAttackHpGainFlatOnChangeEvent = (
    event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackHpGainFlat = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack HP gain percent from {@link parseCostInput}.
   *
   * @param event Change event from the percent gain field.
   * @returns {void}
   */
  const handleOnAttackHpGainPercentOnChangeEvent = (
    event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackHpGainPercent = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack HP gain formula text.
   *
   * @param event Change event from the formula field.
   * @returns {void}
   */
  const handleOnAttackHpGainFormulaOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackHpGainFormula = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack MP gain flat from {@link parseCostInput}.
   *
   * @param event Change event from the flat gain field.
   * @returns {void}
   */
  const handleOnAttackMpGainFlatOnChangeEvent = (
    event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackMpGainFlat = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack MP gain percent from {@link parseCostInput}.
   *
   * @param event Change event from the percent gain field.
   * @returns {void}
   */
  const handleOnAttackMpGainPercentOnChangeEvent = (
    event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackMpGainPercent = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack MP gain formula text.
   *
   * @param event Change event from the formula field.
   * @returns {void}
   */
  const handleOnAttackMpGainFormulaOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackMpGainFormula = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack TP gain flat from {@link parseCostInput}.
   *
   * @param event Change event from the flat gain field.
   * @returns {void}
   */
  const handleOnAttackTpGainFlatOnChangeEvent = (
    event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackTpGainFlat = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack TP gain percent from {@link parseCostInput}.
   *
   * @param event Change event from the percent gain field.
   * @returns {void}
   */
  const handleOnAttackTpGainPercentOnChangeEvent = (
    event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackTpGainPercent = parseCostInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes on-attack TP gain formula text.
   *
   * @param event Change event from the formula field.
   * @returns {void}
   */
  const handleOnAttackTpGainFormulaOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.onAttackTpGainFormula = event.target.value;
    updateSkill(selectedSkill);
  };

  /**
   * Applies skill scope from the usage {@link Autocomplete}.
   *
   * @param _event Unused MUI autocomplete change event.
   * @param option Selected scope row, or {@code null} when cleared.
   * @returns {void}
   */
  const handleSkillScopeAutocompleteOnChangeEvent = (
    _event: React.SyntheticEvent,
    option: RmmzSkillScopeOption | null
  ) =>
  {
    if (!selectedSkill || option === null)
    {
      return;
    }

    selectedSkill.scope = option.value;
    updateSkill(selectedSkill);
  };

  /**
   * Applies skill occasion (menu vs battle) from the usage {@link Autocomplete}.
   *
   * @param _event Unused MUI autocomplete change event.
   * @param option Selected occasion row, or {@code null} when cleared.
   * @returns {void}
   */
  const handleSkillOccasionAutocompleteOnChangeEvent = (
    _event: React.SyntheticEvent,
    option: RmmzSkillOccasionOption | null
  ) =>
  {
    if (!selectedSkill || option === null)
    {
      return;
    }

    selectedSkill.occasion = option.value;
    updateSkill(selectedSkill);
  };

  /**
   * Applies skill type id from the usage {@link Autocomplete}.
   *
   * @param _event Unused MUI autocomplete change event.
   * @param option Selected skill-type row, or {@code null} when cleared.
   * @returns {void}
   */
  const handleSkillStypeAutocompleteOnChangeEvent = (
    _event: React.SyntheticEvent,
    option: RmmzSkillStypeOption | null
  ) =>
  {
    if (!selectedSkill || option === null)
    {
      return;
    }

    selectedSkill.stypeId = option.value;
    updateSkill(selectedSkill);
  };

  /**
   * Applies first required weapon type from the usage {@link Autocomplete}.
   *
   * @param _event Unused MUI autocomplete change event.
   * @param option Selected weapon-type row, or {@code null} when cleared.
   * @returns {void}
   */
  const handleSkillRequiredWtype1AutocompleteOnChangeEvent = (
    _event: React.SyntheticEvent,
    option: RmmzWeaponTypeOption | null
  ) =>
  {
    if (!selectedSkill || option === null)
    {
      return;
    }

    selectedSkill.requiredWtypeId1 = option.value;
    updateSkill(selectedSkill);
  };

  /**
   * Applies second required weapon type from the usage {@link Autocomplete}.
   *
   * @param _event Unused MUI autocomplete change event.
   * @param option Selected weapon-type row, or {@code null} when cleared.
   * @returns {void}
   */
  const handleSkillRequiredWtype2AutocompleteOnChangeEvent = (
    _event: React.SyntheticEvent,
    option: RmmzWeaponTypeOption | null
  ) =>
  {
    if (!selectedSkill || option === null)
    {
      return;
    }

    selectedSkill.requiredWtypeId2 = option.value;
    updateSkill(selectedSkill);
  };

  /**
   * Writes execution speed via {@link parseExecutionSpeedInput}.
   *
   * @param event Change event from the speed field.
   * @returns {void}
   */
  const handleSkillSpeedOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.speed = parseExecutionSpeedInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes success rate via {@link parseExecutionSuccessInput}.
   *
   * @param event Change event from the success rate field.
   * @returns {void}
   */
  const handleSkillSuccessRateOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.successRate = parseExecutionSuccessInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Writes repeat count via {@link parseExecutionRepeatsInput}.
   *
   * @param event Change event from the repeats field.
   * @returns {void}
   */
  const handleSkillRepeatsOnChangeEvent = (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.repeats = parseExecutionRepeatsInput(event.target.value);
    updateSkill(selectedSkill);
  };

  /**
   * Applies damage hit type from the execution {@link Autocomplete}.
   *
   * @param _event Unused MUI autocomplete change event.
   * @param option Selected hit-type row, or {@code null} when cleared.
   * @returns {void}
   */
  const handleSkillHitTypeAutocompleteOnChangeEvent = (
    _event: React.SyntheticEvent,
    option: RmmzUsableHitTypeOption | null
  ) =>
  {
    if (!selectedSkill || option === null)
    {
      return;
    }

    selectedSkill.hitType = option.value;
    updateSkill(selectedSkill);
  };

  /**
   * Applies battle animation id from the execution {@link Autocomplete}.
   *
   * @param _event Unused MUI autocomplete change event.
   * @param option Selected animation row, or {@code null} when cleared.
   * @returns {void}
   */
  const handleSkillAnimationAutocompleteOnChangeEvent = (
    _event: React.SyntheticEvent,
    option: RmmzSkillAnimationOption | null
  ) =>
  {
    if (!selectedSkill || option === null)
    {
      return;
    }

    selectedSkill.animationId = option.value;
    updateSkill(selectedSkill);
  };

  /**
   * Copies damage editor state (formula, elements, crit overrides) onto the skill.
   *
   * @param next Value emitted from {@link UsableItemDamageSection}.
   * @returns {void}
   */
  const handleUsableItemDamageChange = (next: UsableItemDamageEditorValue) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.damageType = next.damageType;
    selectedSkill.damageElementId = next.damageElementId;
    selectedSkill.damageFormula = next.damageFormula;
    selectedSkill.damageVariance = next.damageVariance;
    selectedSkill.damageCritical = next.damageCritical;
    selectedSkill.attackElementIds = next.attackElementIds;
    selectedSkill.thisCritChanceFormula = next.thisCritChanceFormula;
    selectedSkill.thisCritDamageMultiplierFormula = next.thisCritDamageMultiplierFormula;
    selectedSkill.thisCritsAlways = next.thisCritsAlways;
    updateSkill(selectedSkill);
  };

  /**
   * Replaces the skill effects array from {@link UsableEffectsEditor}.
   *
   * @param next Full effects list for the skill.
   * @returns {void}
   */
  const handleSkillEffectsChange = (next: Rmmz.Data.RPG_UsableEffect[]) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.effects = next;
    updateSkill(selectedSkill);
  };

  /**
   * Persists extend-base skill ids from the multi-select {@link Autocomplete}.
   *
   * @param _event Unused MUI autocomplete change event.
   * @param options Selected skill rows (order preserved).
   * @returns {void}
   */
  const handleSkillExtendBaseIdsChange = (
    _event: SyntheticEvent,
    options: IdLabelRow[]
  ) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.skillExtendBaseIds = options.map((o) => o.id);
    updateSkill(selectedSkill);
  };

  /**
   * Parses J-SKS slot cost; empty clears to {@code null}, invalid numbers ignored.
   *
   * @param event Change event from the slot cost field.
   * @returns {void}
   */
  const handleSksSlotCostChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    const t = event.target.value.trim();
    if (t === '')
    {
      selectedSkill.sksSlotCost = null;
      updateSkill(selectedSkill);
      return;
    }

    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }

    selectedSkill.sksSlotCost = n;
    updateSkill(selectedSkill);
  };

  /**
   * Toggles explicit-unslotted SKS flag from the checkbox.
   *
   * @param event Change event from the checkbox.
   * @returns {void}
   */
  const handleSksExplicitUnslottedChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.sksExplicitUnslotted = event.target.checked;
    updateSkill(selectedSkill);
  };

  /**
   * Replaces the whole JABS extension from {@link SkillJabsExtensionsPanel}.
   *
   * @param next Cloned extension snapshot from the panel.
   * @returns {void}
   */
  const handleJabsChange = (next: SkillJabsExtension) =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.jabs = next;
    updateSkill(selectedSkill);
  };

  /**
   * Merges a partial JABS update without replacing unrelated fields.
   *
   * @param partial Subset of {@link SkillJabsExtension} fields to apply.
   * @returns {void}
   */
  const patchSkillJabs = (partial: Partial<SkillJabsExtension>): void =>
  {
    if (!selectedSkill)
    {
      return;
    }

    selectedSkill.jabs = selectedSkill.jabs.clone(partial);
    updateSkill(selectedSkill);
  };

  /**
   * Row renderer for the virtualized skill list.
   *
   * @param props react-window row props (index, style, etc.).
   * @returns List row element or empty fragment for gaps or section headers.
   */
  const renderSkillListItem = (props: ListChildComponentProps) =>
  {
    const {
      index,
      style
    } = props;

    const skill = skills.at(index);

    if (!skill)
    {
      return <></>;
    }

    if (skill.name.startsWith('==='))
    {
      return <></>;
    }

    return (
      <ListItem
        key={index}
        style={{
          ...style,
          height: 'auto',
          paddingTop: 0,
          paddingBottom: 0
        }}
      >
        <ListItemButton
          sx={{
            maxHeight: '30px',
            paddingLeft: '0px',
            marginLeft: '-14px',
          }}
          selected={selectedSkillIndex === index}
          onMouseDown={(e) =>
          {
            e.preventDefault();
          }}
          tabIndex={-1}
          onClick={() => handleSkillListItemOnClickEvent(index)}
        >
          <ListItemIcon sx={{ minWidth: '24px' }}>
            {(
              selectedSkillIndex === index
            )
              ? <DoubleArrow color={'success'} fontSize={'small'}/>
              : <KeyboardArrowRight color={'warning'} fontSize={'small'}/>}
          </ListItemIcon>
          <ListItemText
            disableTypography
            primary={`${skill.id}: ${skill.name}`}
            sx={{
              fontSize: 16,
              fontFamily: 'monospace',
            }}/>
        </ListItemButton>
      </ListItem>
    );
  };

  return <>
    <Grid container spacing={2}>
      <Grid size={2}>
        <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ marginTop: 1 }}>
          <Tooltip title={'Previous match'}>
            <span>
              <IconButton
                size={'small'}
                onClick={handleSearchPrevClick}
                disabled={searchTerm.trim() === ''}
              >
                <KeyboardArrowLeft/>
              </IconButton>
            </span>
          </Tooltip>

          <TextField
            variant="outlined"
            label="Search Skill"
            value={searchTerm}
            onChange={handleSearchChange}
            size="small"
            fullWidth
            slotProps={{
              input: {
                endAdornment: searchTerm
                  ? (
                    <Tooltip title="Clear search">
                      <Box
                        component="span"
                        sx={{ cursor: 'pointer' }}
                        onClick={() => setSearchTerm('')}
                      >
                        ✕
                      </Box>
                    </Tooltip>
                  )
                  : null
              }
            }}
          />

          <Tooltip title={'Next match'}>
            <span>
              <IconButton
                size={'small'}
                onClick={handleSearchNextClick}
                disabled={searchTerm.trim() === ''}
              >
                <KeyboardArrowRight/>
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
        <div
          ref={listWrapperRef}
          tabIndex={0}
          role={'listbox'}
          onKeyDown={handleListKeyDown}
          style={{
            outline: 'none'
          }}
        >
          {/* @ts-ignore */}
          <FixedSizeList
            ref={listRef}
            height={960}
            width={310}
            itemSize={30}
            overscanCount={5}
            itemCount={skills.length}
          >
            {renderSkillListItem}
          </FixedSizeList>
        </div>
      </Grid>

      <Grid size={10}>
        <Paper sx={{
          height: '100%',
          width: '100%',
          padding: 2
        }} elevation={10}>
          {(
            selectedSkill === null
          )
            ? (
              <Typography>
                Please select a skill on the left.
              </Typography>
            )
            : (
              <Stack spacing={2}>
                <Tabs
                  value={skillEditorTab}
                  onChange={(
                    _e,
                    next
                  ) =>
                  {
                    setSkillEditorTab(next);
                  }}
                  aria-label={'Skill editor sections'}
                >
                  <Tab label={'Editor'} id={'skill-editor-tab-0'} aria-controls={'skill-editor-tabpanel-0'}/>
                  <Tab label={'JABS'} id={'skill-editor-tab-1'} aria-controls={'skill-editor-tabpanel-1'}/>
                  <Tab label={'Note'} id={'skill-editor-tab-2'} aria-controls={'skill-editor-tabpanel-2'}/>
                </Tabs>

                <Box
                  id={'skill-editor-tabpanel-0'}
                  role={'tabpanel'}
                  aria-labelledby={'skill-editor-tab-0'}
                  hidden={skillEditorTab !== 0}
                  sx={{
                    display: skillEditorTab === 0
                      ? 'block'
                      : 'none'
                  }}
                >
                  <Stack spacing={3}>
                    <Grid container spacing={2} alignItems={'flex-start'}>
                      <Grid size={6}>
                        <Stack spacing={2}>
                          <Accordion
                            {...editorAccordionProps('editor-general')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                General
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography
                                  variant={'caption'}
                                  sx={{
                                    fontFamily: 'monospace',
                                    display: 'block',
                                  }}
                                >
                                  {`Skill id: ${selectedSkill.id}`}
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Name'}
                                      value={selectedSkill.name}
                                      onChange={handleSkillNameOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <IconIndexField
                                      value={selectedSkill.iconIndex}
                                      onChange={handleSkillIconIndexOnChange}
                                    />
                                  </Grid>
                                </Grid>
                                <TextField
                                  variant={'outlined'}
                                  label={'Description'}
                                  value={selectedSkill.description}
                                  onChange={handleDescriptionOnChangeEvent}
                                  size={'small'}
                                  fullWidth
                                  multiline
                                  minRows={4}
                                />
                              </Stack>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion
                            {...editorAccordionProps('editor-usage')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Usage
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Stack spacing={2}>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  Details about targeting, usability, and requirements.
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={4}>
                                    <Autocomplete<RmmzSkillScopeOption, false, false, false>
                                      fullWidth
                                      size={'small'}
                                      options={[ ...RMMZ_SKILL_SCOPE_OPTIONS ]}
                                      groupBy={(option) => option.group}
                                      getOptionLabel={(option) => option.label}
                                      isOptionEqualToValue={(
                                        a,
                                        b
                                      ) => a.value === b.value}
                                      value={skillScopeOption(selectedSkill.scope)}
                                      onChange={handleSkillScopeAutocompleteOnChangeEvent}
                                      filterOptions={(
                                        options,
                                        state
                                      ) =>
                                      {
                                        const q = state.inputValue.trim()
                                          .toLowerCase();
                                        if (q === '')
                                        {
                                          return options;
                                        }
                                        return options.filter((o) =>
                                          o.label.toLowerCase()
                                            .includes(q)
                                          || o.group.toLowerCase()
                                            .includes(q));
                                      }}
                                      slotProps={{
                                        listbox: { style: { maxHeight: 240 } },
                                      }}
                                      renderInput={(params) =>
                                        (
                                          <TextField
                                            {...params}
                                            variant={'outlined'}
                                            label={'Scope'}
                                            placeholder={'Search targets…'}
                                          />
                                        )}
                                    />
                                  </Grid>
                                  <Grid size={4}>
                                    <Autocomplete<RmmzSkillOccasionOption, false, false, false>
                                      fullWidth
                                      size={'small'}
                                      options={[ ...RMMZ_SKILL_OCCASION_OPTIONS ]}
                                      getOptionLabel={(option) => option.label}
                                      isOptionEqualToValue={(
                                        a,
                                        b
                                      ) => a.value === b.value}
                                      value={skillOccasionOption(selectedSkill.occasion)}
                                      onChange={handleSkillOccasionAutocompleteOnChangeEvent}
                                      filterOptions={(
                                        options,
                                        state
                                      ) =>
                                      {
                                        const q = state.inputValue.trim()
                                          .toLowerCase();
                                        if (q === '')
                                        {
                                          return options;
                                        }
                                        return options.filter((o) =>
                                          o.label.toLowerCase()
                                            .includes(q)
                                          || o.detail.toLowerCase()
                                            .includes(q));
                                      }}
                                      slotProps={{
                                        listbox: { style: { maxHeight: 240 } },
                                      }}
                                      renderInput={(params) =>
                                        (
                                          <TextField
                                            {...params}
                                            variant={'outlined'}
                                            label={'Occasion'}
                                            placeholder={'When this skill can be used…'}
                                          />
                                        )}
                                    />
                                  </Grid>
                                  <Grid size={4}>
                                    <Autocomplete<RmmzSkillStypeOption, false, false, false>
                                      fullWidth
                                      size={'small'}
                                      options={skillStypeAutocompleteOptions(
                                        selectedSkill.stypeId,
                                        SystemService.skillTypes ?? []
                                      )}
                                      groupBy={(option) => option.group}
                                      getOptionLabel={(option) => option.label}
                                      isOptionEqualToValue={(
                                        a,
                                        b
                                      ) => a.value === b.value}
                                      value={skillStypeOptionForValue(
                                        selectedSkill.stypeId,
                                        SystemService.skillTypes ?? []
                                      )}
                                      onChange={handleSkillStypeAutocompleteOnChangeEvent}
                                      filterOptions={(
                                        options,
                                        state
                                      ) =>
                                      {
                                        const q = state.inputValue.trim()
                                          .toLowerCase();
                                        if (q === '')
                                        {
                                          return options;
                                        }
                                        return options.filter((o) =>
                                          o.label.toLowerCase()
                                            .includes(q)
                                          || o.group.toLowerCase()
                                            .includes(q)
                                          || String(o.value)
                                            .includes(q));
                                      }}
                                      slotProps={{
                                        listbox: { style: { maxHeight: 240 } },
                                      }}
                                      renderInput={(params) =>
                                        (
                                          <TextField
                                            {...params}
                                            variant={'outlined'}
                                            label={'Skill type'}
                                            placeholder={'Search skill types…'}
                                          />
                                        )}
                                    />
                                  </Grid>
                                </Grid>
                                <Grid container spacing={2}>
                                  <Grid size={6}>
                                    <Autocomplete<RmmzWeaponTypeOption, false, false, false>
                                      fullWidth
                                      size={'small'}
                                      options={weaponTypeAutocompleteOptions(
                                        selectedSkill.requiredWtypeId1,
                                        SystemService.weaponTypes ?? []
                                      )}
                                      groupBy={(option) => option.group}
                                      getOptionLabel={(option) => option.label}
                                      isOptionEqualToValue={(
                                        a,
                                        b
                                      ) => a.value === b.value}
                                      value={weaponTypeOptionForValue(
                                        selectedSkill.requiredWtypeId1,
                                        SystemService.weaponTypes ?? []
                                      )}
                                      onChange={handleSkillRequiredWtype1AutocompleteOnChangeEvent}
                                      filterOptions={(
                                        options,
                                        state
                                      ) =>
                                      {
                                        const q = state.inputValue.trim()
                                          .toLowerCase();
                                        if (q === '')
                                        {
                                          return options;
                                        }
                                        return options.filter((o) =>
                                          o.label.toLowerCase()
                                            .includes(q)
                                          || o.group.toLowerCase()
                                            .includes(q)
                                          || String(o.value)
                                            .includes(q));
                                      }}
                                      slotProps={{
                                        listbox: { style: { maxHeight: 240 } },
                                      }}
                                      renderInput={(params) =>
                                        (
                                          <TextField
                                            {...params}
                                            variant={'outlined'}
                                            label={'Weapon Type 1'}
                                            placeholder={'Search weapon types…'}
                                          />
                                        )}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <Autocomplete<RmmzWeaponTypeOption, false, false, false>
                                      fullWidth
                                      size={'small'}
                                      options={weaponTypeAutocompleteOptions(
                                        selectedSkill.requiredWtypeId2,
                                        SystemService.weaponTypes ?? []
                                      )}
                                      groupBy={(option) => option.group}
                                      getOptionLabel={(option) => option.label}
                                      isOptionEqualToValue={(
                                        a,
                                        b
                                      ) => a.value === b.value}
                                      value={weaponTypeOptionForValue(
                                        selectedSkill.requiredWtypeId2,
                                        SystemService.weaponTypes ?? []
                                      )}
                                      onChange={handleSkillRequiredWtype2AutocompleteOnChangeEvent}
                                      filterOptions={(
                                        options,
                                        state
                                      ) =>
                                      {
                                        const q = state.inputValue.trim()
                                          .toLowerCase();
                                        if (q === '')
                                        {
                                          return options;
                                        }
                                        return options.filter((o) =>
                                          o.label.toLowerCase()
                                            .includes(q)
                                          || o.group.toLowerCase()
                                            .includes(q)
                                          || String(o.value)
                                            .includes(q));
                                      }}
                                      slotProps={{
                                        listbox: { style: { maxHeight: 240 } },
                                      }}
                                      renderInput={(params) =>
                                        (
                                          <TextField
                                            {...params}
                                            variant={'outlined'}
                                            label={'Weapon Type 2'}
                                            placeholder={'Search weapon types…'}
                                          />
                                        )}
                                    />
                                  </Grid>
                                </Grid>
                              </Stack>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion
                            {...editorAccordionProps('editor-execution')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Execution
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Stack spacing={2}>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  Details about how the skill lands and how the target interprets it.
                                </Typography>
                                <Grid container spacing={3} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <Stack spacing={2.5}>
                                      <NumberInputWithLabel
                                        id={'skill-execution-speed'}
                                        label={'Speed'}
                                        labelPlacement={'start'}
                                        variant={'outlined'}
                                        size={'small'}
                                        fullWidth
                                        value={selectedSkill.speed}
                                        onChangeEventHandler={handleSkillSpeedOnChangeEvent}
                                        htmlInput={{ step: 1 }}
                                        helperText={'Unused in JABS.'}
                                      />
                                      <NumberInputWithLabel
                                        id={'skill-execution-success'}
                                        label={'Success'}
                                        labelPlacement={'start'}
                                        variant={'outlined'}
                                        size={'small'}
                                        fullWidth
                                        value={selectedSkill.successRate}
                                        onChangeEventHandler={handleSkillSuccessRateOnChangeEvent}
                                        htmlInput={{
                                          min: 0,
                                          max: 100,
                                          step: 1,
                                        }}
                                        endAdornment={'%'}
                                        helperText={'Failure causes "miss".'}
                                      />
                                    </Stack>
                                  </Grid>
                                  <Grid size={6}>
                                    <Stack spacing={2}>
                                      <Autocomplete<RmmzUsableHitTypeOption, false, false, false>
                                        fullWidth
                                        size={'small'}
                                        options={[ ...RMMZ_USABLE_HIT_TYPE_OPTIONS ]}
                                        groupBy={(option) => option.group}
                                        getOptionLabel={(option) => option.label}
                                        isOptionEqualToValue={(
                                          a,
                                          b
                                        ) => a.value === b.value}
                                        value={usableHitTypeOption(selectedSkill.hitType)}
                                        onChange={handleSkillHitTypeAutocompleteOnChangeEvent}
                                        filterOptions={(
                                          options,
                                          state
                                        ) =>
                                        {
                                          const q = state.inputValue.trim()
                                            .toLowerCase();
                                          if (q === '')
                                          {
                                            return options;
                                          }
                                          return options.filter((o) =>
                                            o.label.toLowerCase()
                                              .includes(q)
                                            || o.detail.toLowerCase()
                                              .includes(q)
                                            || o.group.toLowerCase()
                                              .includes(q));
                                        }}
                                        slotProps={{
                                          listbox: { style: { maxHeight: 240 } },
                                        }}
                                        renderInput={(params) =>
                                          (
                                            <TextField
                                              {...params}
                                              variant={'outlined'}
                                              label={'Hit type'}
                                              placeholder={'Search hit types…'}
                                            />
                                          )}
                                      />
                                      <Autocomplete<RmmzSkillAnimationOption, false, false, false>
                                        fullWidth
                                        size={'small'}
                                        options={executionAnimationOptions}
                                        groupBy={(option) => option.group}
                                        getOptionLabel={(option) => option.label}
                                        isOptionEqualToValue={(
                                          a,
                                          b
                                        ) => a.value === b.value}
                                        value={skillAnimationOptionForValue(
                                          selectedSkill.animationId,
                                          SystemService.skillAnimationAutocompleteOptions
                                        )}
                                        onChange={handleSkillAnimationAutocompleteOnChangeEvent}
                                        filterOptions={(
                                          options,
                                          state
                                        ) =>
                                        {
                                          const q = state.inputValue.trim()
                                            .toLowerCase();
                                          if (q === '')
                                          {
                                            return options;
                                          }
                                          return options.filter((o) =>
                                            o.label.toLowerCase()
                                              .includes(q)
                                            || o.detail.toLowerCase()
                                              .includes(q)
                                            || o.group.toLowerCase()
                                              .includes(q)
                                            || String(o.value)
                                              .includes(q));
                                        }}
                                        slotProps={{
                                          listbox: { style: { maxHeight: 280 } },
                                        }}
                                        renderInput={(params) =>
                                          (
                                            <TextField
                                              {...params}
                                              variant={'outlined'}
                                              label={'Animation'}
                                              placeholder={'Search animations…'}
                                            />
                                          )}
                                      />
                                    </Stack>
                                  </Grid>
                                </Grid>
                              </Stack>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion
                            {...editorAccordionProps('editor-bonus-hits')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Additional Hits
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Stack spacing={2}>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  Details about how many times this skill lands on targets.
                                </Typography>
                                <NumberInputWithLabel
                                  id={'skill-bonus-hits-repeats'}
                                  label={'Repeats'}
                                  labelPlacement={'start'}
                                  variant={'outlined'}
                                  size={'small'}
                                  fullWidth
                                  value={selectedSkill.repeats}
                                  onChangeEventHandler={handleSkillRepeatsOnChangeEvent}
                                  htmlInput={{
                                    min: 1,
                                    step: 1,
                                  }}
                                  helperText={'Unused in JABS.'}
                                />
                                <TextField
                                  variant={'outlined'}
                                  label={'Bonus hits (JABS)'}
                                  size={'small'}
                                  fullWidth
                                  value={
                                    selectedSkill.jabs.jabsBonusHitsFromSkillNote === null
                                      ? ''
                                      : String(selectedSkill.jabs.jabsBonusHitsFromSkillNote)
                                  }
                                  onChange={(e) =>
                                  {
                                    const t = e.target.value.trim();
                                    if (t === '')
                                    {
                                      patchSkillJabs({ jabsBonusHitsFromSkillNote: null });
                                      return;
                                    }
                                    const n = parseInt(t, 10);
                                    if (Number.isNaN(n))
                                    {
                                      return;
                                    }
                                    patchSkillJabs({ jabsBonusHitsFromSkillNote: n });
                                  }}
                                  helperText={'How many additional hits per collision.'}
                                  slotProps={{
                                    htmlInput: {
                                      inputMode: 'numeric',
                                      min: 0,
                                      step: 1
                                    },
                                  }}
                                />
                                <Grid container spacing={2}>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Allowed Collision Count'}
                                      size={'small'}
                                      fullWidth
                                      value={
                                        selectedSkill.jabs.pierceMaxCount === null
                                          ? ''
                                          : String(selectedSkill.jabs.pierceMaxCount)
                                      }
                                      onChange={(e) =>
                                      {
                                        const t = e.target.value.trim();
                                        if (t === '')
                                        {
                                          patchSkillJabs({
                                            pierceMaxCount: null,
                                            pierceDelayFrames: null,
                                          });
                                          return;
                                        }
                                        const n = parseInt(t, 10);
                                        if (Number.isNaN(n))
                                        {
                                          return;
                                        }
                                        patchSkillJabs({ pierceMaxCount: n });
                                      }}
                                      helperText={'Clear and this will only hit one target.'}
                                      slotProps={{
                                        htmlInput: {
                                          inputMode: 'numeric',
                                          min: 0,
                                          step: 1
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Frames between pierce hits'}
                                      size={'small'}
                                      fullWidth
                                      disabled={selectedSkill.jabs.pierceMaxCount === null}
                                      value={
                                        selectedSkill.jabs.pierceDelayFrames === null
                                          ? ''
                                          : String(selectedSkill.jabs.pierceDelayFrames)
                                      }
                                      onChange={(e) =>
                                      {
                                        const t = e.target.value.trim();
                                        if (t === '')
                                        {
                                          patchSkillJabs({ pierceDelayFrames: null });
                                          return;
                                        }
                                        const n = parseInt(t, 10);
                                        if (Number.isNaN(n))
                                        {
                                          return;
                                        }
                                        patchSkillJabs({ pierceDelayFrames: n });
                                      }}
                                      helperText={
                                        selectedSkill.jabs.pierceMaxCount === null
                                          ? 'Set max pierce first.'
                                          : '0 = check every colliding frame.'
                                      }
                                      slotProps={{
                                        htmlInput: {
                                          inputMode: 'numeric',
                                          min: 0,
                                          step: 1
                                        },
                                      }}
                                    />
                                  </Grid>
                                </Grid>
                              </Stack>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion
                            {...editorAccordionProps('editor-messages')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Messages
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Stack spacing={2}>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  Battle log lines when the skill is used. %1 = user name, %2 = skill name.
                                </Typography>
                                <TextField
                                  variant={'outlined'}
                                  label={'Message 1'}
                                  value={selectedSkill.message1}
                                  onChange={handleSkillMessage1OnChangeEvent}
                                  size={'small'}
                                  fullWidth
                                  placeholder={'e.g. %1 attacks!'}
                                />
                                <TextField
                                  variant={'outlined'}
                                  label={'Message 2'}
                                  value={selectedSkill.message2}
                                  onChange={handleSkillMessage2OnChangeEvent}
                                  size={'small'}
                                  fullWidth
                                />
                              </Stack>
                            </AccordionDetails>
                          </Accordion>

                        </Stack>
                      </Grid>

                      <Grid size={6}>
                        <Stack spacing={2}>
                          <Accordion
                            {...editorAccordionProps('editor-damage')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Damage
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography variant={'caption'} color={'text.secondary'} sx={{
                                display: 'block',
                                mb: 1.5
                              }}>
                                Details that define the damage dealt by this skill.
                              </Typography>
                              <UsableItemDamageSection
                                embedded
                                value={{
                                  damageType: selectedSkill.damageType,
                                  damageElementId: selectedSkill.damageElementId,
                                  damageFormula: selectedSkill.damageFormula,
                                  damageVariance: selectedSkill.damageVariance,
                                  damageCritical: selectedSkill.damageCritical,
                                  attackElementIds: selectedSkill.attackElementIds,
                                  thisCritChanceFormula: selectedSkill.thisCritChanceFormula,
                                  thisCritDamageMultiplierFormula:
                                  selectedSkill.thisCritDamageMultiplierFormula,
                                  thisCritsAlways: selectedSkill.thisCritsAlways,
                                }}
                                onChange={handleUsableItemDamageChange}
                                elementNames={SystemService.elements ?? []}
                              />
                            </AccordionDetails>
                          </Accordion>

                          <Accordion
                            {...editorAccordionProps('editor-effects')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Effects
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography variant={'caption'} color={'text.secondary'} sx={{
                                display: 'block',
                                mb: 1.5
                              }}>
                                Additional effects that execute against the target when a skill lands.
                              </Typography>
                              <UsableEffectsEditor
                                value={selectedSkill.effects}
                                onChange={handleSkillEffectsChange}
                                stateRows={stateEffectPickerRows}
                                skillRows={skillEffectPickerRows}
                                commonEventRows={commonEventPickerRows}
                              />
                            </AccordionDetails>
                          </Accordion>

                          <Accordion
                            {...editorAccordionProps('editor-skill-extend')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Skill extend
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Stack spacing={1.5}>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  The list of skills that this skill will functionally extend.
                                </Typography>
                                <Autocomplete<IdLabelRow, true, false, false>
                                  multiple
                                  size={'small'}
                                  options={skillExtendPickerOptions}
                                  getOptionLabel={(o) => o.label}
                                  isOptionEqualToValue={(
                                    a,
                                    b
                                  ) => a.id === b.id}
                                  value={selectedSkillExtendPickerValues}
                                  onChange={handleSkillExtendBaseIdsChange}
                                  sx={{ width: '100%' }}
                                  renderTags={(
                                    tagValue,
                                    getTagProps
                                  ) =>
                                    tagValue.map((
                                      option,
                                      index
                                    ) =>
                                    {
                                      const {
                                        key,
                                        ...chipProps
                                      } = getTagProps({ index });
                                      const listIndex = skills.findIndex((s) => s.id === option.id);
                                      const canNavigate = listIndex !== -1;

                                      return (
                                        <Chip
                                          key={key}
                                          {...chipProps}
                                          label={option.label}
                                          onClick={(event) =>
                                          {
                                            if (canNavigate === true)
                                            {
                                              event.stopPropagation();
                                              listRef.current?.scrollToItem(listIndex, 'smart');
                                              handleSkillListItemOnClickEvent(listIndex, false);
                                            }
                                          }}
                                          sx={{
                                            cursor: canNavigate === true
                                              ? 'pointer'
                                              : 'default',
                                          }}
                                        />
                                      );
                                    })}
                                  renderInput={(params) =>
                                    (
                                      <TextField
                                        {...params}
                                        variant={'outlined'}
                                        label={'Extends skills'}
                                        placeholder={'Search skills…'}
                                      />
                                    )}
                                />

                                <Typography variant={'subtitle2'} sx={{
                                  fontWeight: 600,
                                  pt: 0.5
                                }}>
                                  Extended by
                                </Typography>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  Other skills that augment this one when learned. Click a chip to open it in the list.
                                </Typography>
                                {skillExtendersOfSelected.length === 0
                                  ? (
                                    <Typography variant={'body2'} color={'text.secondary'}>
                                      None
                                    </Typography>
                                  )
                                  : (
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 0.75,
                                      }}
                                    >
                                      {skillExtendersOfSelected.map((row) =>
                                        (
                                          <Chip
                                            key={row.id}
                                            size={'small'}
                                            label={`${row.id}: ${row.name}`}
                                            onClick={() =>
                                            {
                                              listRef.current?.scrollToItem(row.listIndex, 'smart');
                                              handleSkillListItemOnClickEvent(row.listIndex, false);
                                            }}
                                            sx={{ cursor: 'pointer' }}
                                          />
                                        ))}
                                    </Box>
                                  )}
                              </Stack>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion
                            {...editorAccordionProps('editor-sks')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Skill slots
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Stack spacing={1.5}>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  Details about the slot cost of this skill. Does not apply if this skillType is not
                                  among the plugin parameter's list of skills that require equipping.
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      label={'Slot cost (points)'}
                                      size={'small'}
                                      fullWidth
                                      value={selectedSkill.sksSlotCost === null
                                        ? ''
                                        : String(selectedSkill.sksSlotCost)}
                                      onChange={handleSksSlotCostChange}
                                      helperText={
                                        'Empty uses the plugin default. Integer slot points to equip (can be negative if your rules allow).'
                                      }
                                      slotProps={{
                                        htmlInput: {
                                          inputMode: 'numeric',
                                          step: 1
                                        }
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <FormControlLabel
                                      label={'Always unslotted'}
                                      control={
                                        <Switch
                                          size={'small'}
                                          checked={selectedSkill.sksExplicitUnslotted}
                                          onChange={handleSksExplicitUnslottedChange}
                                        />
                                      }
                                    />
                                    <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
                                      On: always available, not shown in the slot equip list. Off: clears only this
                                      option;
                                      skill type settings may still treat the skill as outside slots.
                                    </Typography>
                                  </Grid>
                                </Grid>
                              </Stack>
                            </AccordionDetails>
                          </Accordion>

                          <Accordion
                            {...editorAccordionProps('editor-costs')}
                            disableGutters
                            elevation={0}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 1,
                              '&:before': { display: 'none' },
                            }}
                          >
                            <AccordionSummary expandIcon={<ExpandMore/>}>
                              <Typography variant={'subtitle1'} sx={{ fontWeight: 600 }}>
                                Resources (costs/gains)
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Typography variant={'caption'} color={'text.secondary'}>
                                Details about the costs and gains of various resources when this skill is used.
                              </Typography>
                              <Stack spacing={2}>
                                <Grid
                                  container
                                  spacing={2}
                                  alignItems={'stretch'}
                                  justifyContent={'left'}
                                >
                                  {/* HP */}
                                  <Grid size={4}>
                                    <Paper
                                      variant={'outlined'}
                                      sx={{
                                        padding: 1.5,
                                        borderColor: 'divider',
                                        height: '100%',
                                      }}
                                    >
                                      <Typography variant={'h6'} color={'warning'}>
                                        HP cost
                                      </Typography>
                                      <Stack spacing={2} alignItems={'flex-start'}>
                                        <NumberInputWithLabel
                                          label={'flat'}
                                          size={'small'}
                                          value={selectedSkill.hpCostFlat}
                                          onChangeEventHandler={handleHpCostFlatOnChangeEvent}
                                        />
                                        <NumberInputWithLabel
                                          label={'%'}
                                          size={'small'}
                                          value={selectedSkill.hpCostPercent}
                                          onChangeEventHandler={handleHpCostPercentOnChangeEvent}
                                        />
                                        <FormControlLabel
                                          labelPlacement={'top'}
                                          sx={{
                                            alignItems: 'flex-start',
                                            marginLeft: 0,
                                          }}
                                          control={
                                            <Switch
                                              size={'small'}
                                              checked={selectedSkill.hpCostCanKill}
                                              onChange={handleHpCostCanKillOnChangeEvent}
                                            />
                                          }
                                          label={
                                            <Typography variant={'body2'}>
                                              Can die from HP costs?
                                            </Typography>
                                          }
                                        />
                                        <TextField
                                          variant={'standard'}
                                          label={'formula'}
                                          value={selectedSkill.hpCostFormula}
                                          onChange={handleHpCostFormulaOnChangeEvent}
                                          size={'small'}
                                          placeholder={'e.g. a.mhp * 0.1'}
                                          helperText={'Evaluated when the skill is executed.'}
                                          sx={{
                                            ...noteFormulaFieldSx,
                                            width: 'min(100%, 220px)',
                                          }}
                                        />
                                      </Stack>
                                    </Paper>
                                  </Grid>

                                  {/* MP */}
                                  <Grid size={4}>
                                    <Paper
                                      variant={'outlined'}
                                      sx={{
                                        padding: 1.5,
                                        borderColor: 'divider',
                                        height: '100%',
                                      }}
                                    >
                                      <Typography variant={'h6'} color={'info'}>
                                        MP cost
                                      </Typography>
                                      <Stack spacing={2} alignItems={'flex-start'}>
                                        <NumberInputWithLabel
                                          label={'db'}
                                          size={'small'}
                                          value={selectedSkill.mpCost}
                                          onChangeEventHandler={handleMpCostOnChangeEvent}
                                          helperText={'Base MP before optional extras.'}
                                        />
                                        <NumberInputWithLabel
                                          label={'flat'}
                                          size={'small'}
                                          value={selectedSkill.mpCostTagFlat}
                                          onChangeEventHandler={handleMpCostTagFlatOnChangeEvent}
                                        />
                                        <NumberInputWithLabel
                                          label={'%'}
                                          size={'small'}
                                          value={selectedSkill.mpCostTagPercent}
                                          onChangeEventHandler={handleMpCostTagPercentOnChangeEvent}
                                        />
                                        <TextField
                                          variant={'standard'}
                                          label={'formula'}
                                          value={selectedSkill.mpCostTagFormula}
                                          onChange={handleMpCostTagFormulaOnChangeEvent}
                                          size={'small'}
                                          helperText={'Added to the database MP cost.'}
                                          sx={{
                                            ...noteFormulaFieldSx,
                                            width: 'min(100%, 220px)',
                                          }}
                                        />
                                      </Stack>
                                    </Paper>
                                  </Grid>

                                  {/* TP */}
                                  <Grid size={4}>
                                    <Paper
                                      variant={'outlined'}
                                      sx={{
                                        padding: 1.5,
                                        borderColor: 'divider',
                                        height: '100%',
                                      }}
                                    >
                                      <Typography variant={'h6'} color={'success'}>
                                        TP cost
                                      </Typography>
                                      <Stack spacing={2} alignItems={'flex-start'}>
                                        <NumberInputWithLabel
                                          label={'db'}
                                          size={'small'}
                                          value={selectedSkill.tpCost}
                                          onChangeEventHandler={handleTpCostOnChangeEvent}
                                          helperText={'Base TP before optional extras.'}
                                        />
                                        <NumberInputWithLabel
                                          label={'flat'}
                                          size={'small'}
                                          value={selectedSkill.tpCostTagFlat}
                                          onChangeEventHandler={handleTpCostTagFlatOnChangeEvent}
                                        />
                                        <NumberInputWithLabel
                                          label={'%'}
                                          size={'small'}
                                          value={selectedSkill.tpCostTagPercent}
                                          onChangeEventHandler={handleTpCostTagPercentOnChangeEvent}
                                        />
                                        <TextField
                                          variant={'standard'}
                                          label={'formula'}
                                          value={selectedSkill.tpCostTagFormula}
                                          onChange={handleTpCostTagFormulaOnChangeEvent}
                                          size={'small'}
                                          helperText={'Added to the database TP cost.'}
                                          sx={{
                                            ...noteFormulaFieldSx,
                                            width: 'min(100%, 220px)',
                                          }}
                                        />
                                      </Stack>
                                    </Paper>
                                  </Grid>
                                </Grid>

                                <Divider/>

                                <Grid
                                  container
                                  spacing={2}
                                  alignItems={'stretch'}
                                  justifyContent={'left'}
                                >
                                  <Grid size={4}>
                                    <Paper
                                      variant={'outlined'}
                                      sx={{
                                        padding: 1.5,
                                        borderColor: 'divider',
                                        height: '100%',
                                      }}
                                    >
                                      <Typography variant={'h6'} color={'warning'}>
                                        HP gain
                                      </Typography>
                                      <Stack spacing={2} alignItems={'flex-start'}>
                                        <NumberInputWithLabel
                                          label={'flat'}
                                          size={'small'}
                                          value={selectedSkill.onAttackHpGainFlat}
                                          onChangeEventHandler={handleOnAttackHpGainFlatOnChangeEvent}
                                        />
                                        <NumberInputWithLabel
                                          label={'%'}
                                          size={'small'}
                                          value={selectedSkill.onAttackHpGainPercent}
                                          onChangeEventHandler={handleOnAttackHpGainPercentOnChangeEvent}
                                        />
                                        <TextField
                                          variant={'standard'}
                                          label={'formula'}
                                          value={selectedSkill.onAttackHpGainFormula}
                                          onChange={handleOnAttackHpGainFormulaOnChangeEvent}
                                          size={'small'}
                                          placeholder={'e.g. a.mat'}
                                          helperText={'Evaluated per connecting hit.'}
                                          sx={{
                                            ...noteFormulaFieldSx,
                                            width: 'min(100%, 220px)',
                                          }}
                                        />
                                      </Stack>
                                    </Paper>
                                  </Grid>
                                  <Grid size={4}>
                                    <Paper
                                      variant={'outlined'}
                                      sx={{
                                        padding: 1.5,
                                        borderColor: 'divider',
                                        height: '100%',
                                      }}
                                    >
                                      <Typography variant={'h6'} color={'info'}>
                                        MP gain
                                      </Typography>
                                      <Stack spacing={2} alignItems={'flex-start'}>
                                        <NumberInputWithLabel
                                          label={'flat'}
                                          size={'small'}
                                          value={selectedSkill.onAttackMpGainFlat}
                                          onChangeEventHandler={handleOnAttackMpGainFlatOnChangeEvent}
                                        />
                                        <NumberInputWithLabel
                                          label={'%'}
                                          size={'small'}
                                          value={selectedSkill.onAttackMpGainPercent}
                                          onChangeEventHandler={handleOnAttackMpGainPercentOnChangeEvent}
                                        />
                                        <TextField
                                          variant={'standard'}
                                          label={'formula'}
                                          value={selectedSkill.onAttackMpGainFormula}
                                          onChange={handleOnAttackMpGainFormulaOnChangeEvent}
                                          size={'small'}
                                          helperText={'Evaluated per connecting hit.'}
                                          sx={{
                                            ...noteFormulaFieldSx,
                                            width: 'min(100%, 220px)',
                                          }}
                                        />
                                      </Stack>
                                    </Paper>
                                  </Grid>
                                  <Grid size={4}>
                                    <Paper
                                      variant={'outlined'}
                                      sx={{
                                        padding: 1.5,
                                        borderColor: 'divider',
                                        height: '100%',
                                      }}
                                    >
                                      <Typography variant={'h6'} color={'success'}>
                                        TP gain
                                      </Typography>
                                      <Stack spacing={2} alignItems={'flex-start'}>
                                        <NumberInputWithLabel
                                          label={'db'}
                                          size={'small'}
                                          value={selectedSkill.tpGain}
                                          onChangeEventHandler={handleTpGainOnChangeEvent}
                                          helperText={'Base TP reward when the skill succeeds.'}
                                        />
                                        <NumberInputWithLabel
                                          label={'flat'}
                                          size={'small'}
                                          value={selectedSkill.onAttackTpGainFlat}
                                          onChangeEventHandler={handleOnAttackTpGainFlatOnChangeEvent}
                                        />
                                        <NumberInputWithLabel
                                          label={'%'}
                                          size={'small'}
                                          value={selectedSkill.onAttackTpGainPercent}
                                          onChangeEventHandler={handleOnAttackTpGainPercentOnChangeEvent}
                                        />
                                        <TextField
                                          variant={'standard'}
                                          label={'formula'}
                                          value={selectedSkill.onAttackTpGainFormula}
                                          onChange={handleOnAttackTpGainFormulaOnChangeEvent}
                                          size={'small'}
                                          helperText={'Evaluated per connecting hit.'}
                                          sx={{
                                            ...noteFormulaFieldSx,
                                            width: 'min(100%, 220px)',
                                          }}
                                        />
                                      </Stack>
                                    </Paper>
                                  </Grid>
                                </Grid>
                              </Stack>
                            </AccordionDetails>
                          </Accordion>
                        </Stack>
                      </Grid>
                    </Grid>
                  </Stack>
                </Box>

                <Box
                  id={'skill-editor-tabpanel-1'}
                  role={'tabpanel'}
                  aria-labelledby={'skill-editor-tab-1'}
                  hidden={skillEditorTab !== 1}
                  sx={{
                    display: skillEditorTab === 1
                      ? 'block'
                      : 'none'
                  }}
                >
                  <SkillJabsExtensionsPanel
                    projectRoot={projectRoot}
                    rmmzDataPath={rmmzDataPath}
                    systemDataGeneration={systemDataGeneration}
                    projectReloadGeneration={projectReloadGeneration}
                    jabs={selectedSkill.jabs}
                    onJabsChange={handleJabsChange}
                    skillPickerOptions={skillEffectPickerRows}
                    editingSkillId={selectedSkill.id}
                    contextSkillAnimationId={selectedSkill.animationId}
                    accordionExpandedById={jabsAccordionExpanded}
                    onAccordionExpandedChange={handleJabsAccordionChange}
                  />
                </Box>

                <Box
                  id={'skill-editor-tabpanel-2'}
                  role={'tabpanel'}
                  aria-labelledby={'skill-editor-tab-2'}
                  hidden={skillEditorTab !== 2}
                  sx={{
                    display: skillEditorTab === 2
                      ? 'block'
                      : 'none'
                  }}
                >
                  <Stack spacing={2}>
                    <Stack
                      direction={'row'}
                      alignItems={'flex-start'}
                      justifyContent={'space-between'}
                      spacing={2}
                    >
                      <Typography variant={'body2'} color={'text.secondary'} sx={{ flex: 1 }}>
                        Full note text as it would be saved. Read-only; change values on the Editor tab.
                      </Typography>
                      <Button
                        variant={'outlined'}
                        size={'small'}
                        startIcon={<ContentCopy/>}
                        onClick={() =>
                        {
                          void handleCopySerializedSkillNote();
                        }}
                      >
                        Copy
                      </Button>
                    </Stack>
                    <TextField
                      multiline
                      fullWidth
                      minRows={24}
                      value={serializedSkillNotePreview}
                      slotProps={{
                        input: {
                          readOnly: true,
                        },
                      }}
                      sx={{
                        '& .MuiInputBase-input': {
                          fontFamily: 'monospace',
                          fontSize: 13,
                        },
                      }}
                    />
                  </Stack>
                </Box>
              </Stack>
            )}
        </Paper>
      </Grid>
    </Grid>

    {/*region not-grid-related elements */}
    <Box sx={{
      display: 'flex',
      gap: 2
    }}>
      <SaveButton
        extraSaveText={'Skills Data'}
        canSave={canSave}
        isSaving={isSaving}
        handleSave={async () =>
        {
          setIsSaving(true);
          try
          {
            await handleSaveButtonOnClickEvent();
            setCanSave(false);
          }
          finally
          {
            setIsSaving(false);
          }
        }}
      />

      <ReloadButton
        handleReload={async () =>
        {
          await handleReloadButtonOnClickEvent();
        }}
        canReload={!loading}
        extraReloadText={'Skills Data'}
      />
    </Box>

    <Snackbar
      open={snackOpen}
      autoHideDuration={2500}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'center'
      }}
      onClose={(
        _,
        reason
      ) =>
      {
        if (reason === 'clickaway')
        {
          return;
        }
        setSnackOpen(false);
      }}>
      <Alert
        onClose={() => setSnackOpen(false)}
        severity={snackSeverity}
        variant={snackVariant}
        sx={{ width: '100%' }}
      >
        {snackMessage}
      </Alert>
    </Snackbar>
    {/*endregion not-grid-related elements */}
  </>;
};

export default SkillsBoard;
