import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, } from 'react';
import { FixedSizeList, } from 'react-window';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Slider,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ContentCopy, KeyboardArrowLeft, KeyboardArrowRight, } from '@mui/icons-material';
import { MuiSnackbarSeverity, MuiSnackbarVariant, } from '@core/enums/MuiSnackbar.ts';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { RPG_StateDomainModel } from '@core/domain/entities/RPG_StateDomainModel.ts';
import {
  type SkillHistoryBonusCountMode,
  StateJabsExtension,
} from '@core/domain/entities/jabs/StateJabsExtension.ts';
import type { StateCritExtension } from '@core/domain/entities/state/StateCritExtension.ts';
import type { StateDropsExtension } from '@core/domain/entities/state/StateDropsExtension.ts';
import type { StateElemExtension } from '@core/domain/entities/state/StateElemExtension.ts';
import type { StateLevelExtension } from '@core/domain/entities/state/StateLevelExtension.ts';
import type { StateProfExtension } from '@core/domain/entities/state/StateProfExtension.ts';
import type { StateResourcesExtension } from '@core/domain/entities/state/StateResourcesExtension.ts';
import type { StateSdpExtension } from '@core/domain/entities/state/StateSdpExtension.ts';
import type { StatePassiveAbsExtension } from '@core/domain/entities/state/StatePassiveAbsExtension.ts';
import type { StatePassiveConditionalExtension } from '@core/domain/entities/state/StatePassiveConditionalExtension.ts';
import type { StateSksExtension } from '@core/domain/entities/state/StateSksExtension.ts';
import type { StateStealExtension } from '@core/domain/entities/state/StateStealExtension.ts';
import { StatePluginNoteSections } from '@presentation/boards/states/StatePluginNoteSections.tsx';
import { StatePassiveConditionalPanel } from '@presentation/boards/states/StatePassiveConditionalPanel.tsx';
import { NaturalGrowthQuadrantsEditor } from '@presentation/components/naturalGrowth/NaturalGrowthQuadrantsEditor.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import {
  type VirtualizedSidebarRow,
  VirtualizedSidebarList,
  virtualizedSidebarColumnWidth,
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
} from '@presentation/components/board/VirtualizedSidebarList.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import { RMMZ_STATE_MOTION_OPTIONS, } from '@core/enums/RmmzStateMotion.ts';
import { RMMZ_STATE_OVERLAY_OPTIONS, } from '@core/enums/RmmzStateOverlay.ts';
import {
  type RmmzSkillStypeOption,
  skillHistoryTypeFilterAutocompleteOptions,
  skillHistoryTypeFilterOptionForValue,
} from '@core/enums/RmmzSkillStype.ts';
import { RMMZ_STATE_RESTRICTION_OPTIONS, } from '@core/enums/RmmzStateRestriction.ts';
import { RMMZ_STATE_AUTO_REMOVAL_TIMING_OPTIONS, } from '@core/enums/RmmzStateAutoRemovalTiming.ts';
import TraitEditor from '../../components/traits/TraitEditor.tsx';
import { type IdLabelRow, } from '@presentation/components/usableItem/UsableEffectsEditor.tsx';
import { SystemService } from '@services/SystemService.ts';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import RPG_Trait = Rmmz.Data.RPG_Trait;

const statesBoardListColumnWidth = virtualizedSidebarColumnWidth(
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
);

/**
 * Human-readable approximate duration label for J-ABS frame counts.
 *
 * @param frames Duration in frames (60 frames ≈ 1 second).
 * @returns Empty string when {@code frames} is invalid; otherwise {@code (~N.s)}.
 */
const formatApproxSecondsLabelFromFrames = (frames: number): string =>
{
  if (!Number.isFinite(frames) || frames < 0)
  {
    return '';
  }
  const sec = Math.round((frames / 60) * 100) / 100;
  const display = parseFloat(sec.toFixed(2));
  return `(~${display}s)`;
};

/**
 * Resolves this state's map timer in frames (matches J-ABS {@code jabsStateDurationFrames} tag priority).
 *
 * @param jabs Hydrated JABS extension for the state row.
 * @returns Tag-derived frame count, or {@code null} when no map-duration tags are set.
 */
const resolveStateMapDurationFramesFromJabs = (jabs: StateJabsExtension): number | null =>
{
  if (jabs.stateDurationFrames !== null && jabs.stateDurationFrames > 0)
  {
    return Math.trunc(jabs.stateDurationFrames);
  }
  if (jabs.stateDurationSeconds !== null && jabs.stateDurationSeconds > 0)
  {
    return Math.trunc(jabs.stateDurationSeconds) * 60;
  }
  return null;
};

/**
 * Whether J-ABS runs a finite map timer for this row (mirrors {@code jabsStateHasMapTimer}).
 *
 * @param jabs Hydrated JABS extension for the state row.
 * @returns True when a positive duration tag is set and {@code indefiniteState} is false.
 */
const stateJabsHasMapTimer = (jabs: StateJabsExtension): boolean =>
{
  if (jabs.indefiniteState)
  {
    return false;
  }
  return resolveStateMapDurationFramesFromJabs(jabs) !== null;
};

const SKILL_HISTORY_COUNT_MODE_OPTIONS: { value: SkillHistoryBonusCountMode; label: string }[] = [
  { value: 'unique', label: 'Different skills' },
  { value: 'all', label: 'Every cast' },
  { value: 'streak', label: 'Same skill repeated' },
  { value: 'distinct_types', label: 'Different skill types' },
];

/**
 * Whether a skill-history bonus row is complete enough to emit a note tag.
 *
 * @param jabs Hydrated JABS extension for the state row.
 * @returns True when all four skill-history fields are set.
 */
const stateJabsHasSkillHistoryBonus = (jabs: StateJabsExtension): boolean =>
{
  return jabs.skillHistoryBonusTypeId !== null
    && jabs.skillHistoryBonusWindowSeconds !== null
    && jabs.skillHistoryBonusPctPerCount !== null
    && jabs.skillHistoryBonusCountMode !== null;
};

/**
 * Parses comma-separated non-negative integers from notetag list fields.
 * Skips invalid tokens; order is preserved.
 *
 * @param raw Comma-separated values (e.g. from JABS {@code shieldTypeList}).
 * @returns Parsed integers, each {@code >= 0}.
 */
const parseCommaSeparatedNonNegativeInts = (raw: string): number[] =>
{
  const t = raw.trim();
  if (t === '')
  {
    return [];
  }
  const out: number[] = [];
  for (const part of t.split(','))
  {
    const v = parseInt(part.trim(), 10);
    if (Number.isNaN(v) === false && v >= 0)
    {
      out.push(v);
    }
  }
  return out;
};

/**
 * Minimum percent modifier (notetag interior) allowed on J-ABS timing sliders.
 */
const TIMING_PERCENT_SLIDER_MIN = -99;

/**
 * Maximum percent modifier (notetag interior) allowed on J-ABS timing sliders.
 */
const TIMING_PERCENT_SLIDER_MAX = 400;

/**
 * Slider marks for J-ABS cast/cooldown percent timing.
 * Neutral tick at modifier 0 maps to {@code (0 + 100) / 100} = 1×.
 */
const TIMING_PERCENT_SLIDER_MARKS: { value: number; label: string }[] = [
  {
    value: 0,
    label: '1×',
  },
];

/**
 * Regex: optional sign plus digits only (plain integer bracket interior).
 */
const PLAIN_INTEGER_BRACKET_INTERIOR = /^[+-]?\d+$/;

/**
 * Regex: empty input is handled by callers; otherwise optional sign and numeric literal with optional fraction.
 * When this does not match, the UI treats the value as a custom formula string.
 */
const PLAIN_NUMBER_BRACKET_INTERIOR = /^[-+]?(\d+\.?\d*|\.\d+)$/;

/**
 * True when timing percent interior is empty or a single integer (slider mode).
 *
 * @param raw Bracket interior from the notetag.
 * @returns True for empty or one signed integer; false for formulas.
 */
const isPlainIntegerBracketInterior = (raw: string): boolean =>
{
  const t = raw.trim();
  if (t === '')
  {
    return true;
  }
  return PLAIN_INTEGER_BRACKET_INTERIOR.test(t);
};

/**
 * True when cast/cooldown base or flat interior is empty or a plain decimal (number field mode).
 *
 * @param raw Bracket interior from the notetag.
 * @returns True for empty or one signed decimal literal; false for formulas.
 */
const isPlainNumberBracketInterior = (raw: string): boolean =>
{
  const t = raw.trim();
  if (t === '')
  {
    return true;
  }
  return PLAIN_NUMBER_BRACKET_INTERIOR.test(t);
};

/**
 * Maps a percent-tag bracket interior to the timing slider index.
 * Non-numeric or empty interiors fall back to {@code 0}; values clamp to slider bounds.
 *
 * @param raw Bracket interior for cast/cooldown percent tags.
 * @returns Slider position in {@link TIMING_PERCENT_SLIDER_MIN}..{@link TIMING_PERCENT_SLIDER_MAX}.
 */
const timingPercentSliderValueFromInterior = (raw: string): number =>
{
  const t = raw.trim();
  if (t === '')
  {
    return 0;
  }
  const n = parseInt(t, 10);
  if (Number.isNaN(n))
  {
    return 0;
  }
  if (n < TIMING_PERCENT_SLIDER_MIN)
  {
    return TIMING_PERCENT_SLIDER_MIN;
  }
  if (n > TIMING_PERCENT_SLIDER_MAX)
  {
    return TIMING_PERCENT_SLIDER_MAX;
  }
  return n;
};

/**
 * Formats the J-ABS timing multiplier for display (e.g. {@code 1.25×}).
 *
 * @param modifier Summed percent modifier (J-ABS uses {@code (modifier + 100) / 100} as multiplier).
 * @returns Multiplier string with two decimal places and a times sign.
 */
const timingPercentMultiplierLabel = (modifier: number): string =>
{
  const mult = (modifier + 100) / 100;
  const rounded = Math.round(mult * 100) / 100;
  return `${rounded.toFixed(2)}×`;
};

/**
 * Builds the caption above timing percent sliders (prefix, multiplier, optional percent suffix).
 *
 * @param prefix Label prefix such as {@code Cast scale} or {@code Cooldown scale}.
 * @param raw Bracket interior from the notetag (percent modifier or formula).
 * @returns Single-line caption for the slider header.
 */
const timingPercentSliderCaption = (
  prefix: string,
  raw: string
): string =>
{
  const mod = timingPercentSliderValueFromInterior(raw);
  const suffix =
    mod === 0
      ? ''
      : ` (${mod >= 0
        ? '+'
        : ''}${mod}%)`;
  return `${prefix} · ${timingPercentMultiplierLabel(mod)}${suffix}`;
};

/**
 * Builds id/label rows for damage elements from {@link SystemService.elements}.
 *
 * @param names Element display names from system data; index is the damage element id.
 * @returns Rows for autocomplete, with id {@code 0} labeled {@code None}.
 */
const shieldElementRowsFromSystem = (names: readonly string[] | undefined): IdLabelRow[] =>
{
  const list =
    names === undefined || names.length === 0
      ? [ 'None' ]
      : [ ...names ];
  return list.map((
    name,
    id
  ) =>
  {
    if (id === 0)
    {
      return {
        id,
        label: 'None',
      };
    }
    return {
      id,
      label: name.length > 0
        ? name
        : `Element ${id}`,
    };
  });
};

/**
 * Board for editing project states: list selection, RMMZ fields, JABS, plugins, traits, natural growth, note.
 *
 * @returns States editor grid layout.
 */
const StatesBoard = () =>
{
  const {
    states,
    setData: setStates,
    save,
    reload,
    loading,
  } = useStates();

  const { skills } = useSkills();
  const { systemDataGeneration } = useProjectPath();

  const [ selectedState, setSelectedState ] = useState<RPG_StateDomainModel | null>(null);
  const [ selectedStateIndex, setSelectedStateIndex ] = useState<number>(0);
  const [ searchTerm, setSearchTerm ] = useState<string>('');

  const listRef = useRef<FixedSizeList>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  const [ isSaving, setIsSaving ] = useState<boolean>(false);
  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);

  const [ stateEditorTab, setStateEditorTab ] = useState<number>(0);

  /**
   * Skills for shield-break autocomplete, excluding list section headers.
   *
   * @returns Id and display label for each selectable skill.
   */
  const shieldBreakSkillPickerRows = useMemo((): IdLabelRow[] =>
  {
    return skills
      .filter((s) => s.name.startsWith('===') === false)
      .map((s) => ({
        id: s.id,
        label: `${s.id}: ${s.name}`,
      }));
  }, [ skills ]);

  /**
   * States for passive auto-apply picker, excluding list section headers.
   *
   * @returns Id and display label for each selectable state.
   */
  const passiveStatePickerRows = useMemo((): IdLabelRow[] =>
  {
    return states
      .filter((s) => s.name.startsWith('===') === false)
      .map((s) => ({
        id: s.id,
        label: `${s.id}: ${s.name}`,
      }));
  }, [ states ]);

  /**
   * Skills for passive auto-execute picker, excluding list section headers.
   *
   * @returns Id and display label for each selectable skill.
   */
  const passiveSkillPickerRows = useMemo((): IdLabelRow[] =>
  {
    return skills
      .filter((s) => s.name.startsWith('===') === false)
      .map((s) => ({
        id: s.id,
        label: `${s.id}: ${s.name}`,
      }));
  }, [ skills ]);

  /**
   * Shield element picker options: system elements plus ids referenced only in the note.
   *
   * @returns Combined rows for JABS shield type list editing.
   */
  const shieldElementAutocompleteOptions = useMemo((): IdLabelRow[] =>
  {
    const base = shieldElementRowsFromSystem(SystemService.elements);
    const noteIds =
      selectedState === null
        ? []
        : parseCommaSeparatedNonNegativeInts(selectedState.jabs.shieldTypeList);
    const known = new Set(base.map((o) => o.id));
    const extra: IdLabelRow[] = [];
    for (const id of noteIds)
    {
      if (known.has(id) === false)
      {
        known.add(id);
        extra.push({
          id,
          label: `#${id} (not in System.json)`,
        });
      }
    }
    return [
      ...base,
      ...extra,
    ];
  }, [
    selectedState?.jabs.shieldTypeList,
    systemDataGeneration,
  ]);

  /**
   * Element rows for JABS plugin sections (absorb, strict, boosts): system data plus note-only ids.
   *
   * @returns Rows for element multi-selects on the editor tab.
   */
  const statePluginElementAutocompleteOptions = useMemo((): IdLabelRow[] =>
  {
    const base = shieldElementRowsFromSystem(SystemService.elements);
    if (selectedState === null)
    {
      return base;
    }
    const known = new Set(base.map((o) => o.id));
    const extra: IdLabelRow[] = [];
    /**
     * Adds a synthetic row when {@code id} is not present in system element names.
     *
     * @param id Damage element id referenced from state extension data.
     * @returns {void}
     */
    const pushUnknown = (id: number) =>
    {
      if (known.has(id) === false)
      {
        known.add(id);
        extra.push({
          id,
          label: `#${id} (not in System.json)`,
        });
      }
    };
    for (const id of parseCommaSeparatedNonNegativeInts(selectedState.elem.absorbElementList))
    {
      pushUnknown(id);
    }
    for (const id of parseCommaSeparatedNonNegativeInts(selectedState.elem.strictElementList))
    {
      pushUnknown(id);
    }
    for (const row of selectedState.elem.elementBoosts)
    {
      pushUnknown(row.elementId);
    }
    return [
      ...base,
      ...extra,
    ];
  }, [
    selectedState?.elem.absorbElementList,
    selectedState?.elem.strictElementList,
    selectedState?.elem.elementBoosts,
    systemDataGeneration,
  ]);

  /**
   * Prefix and suffix affix weight totals across all loaded states (same default 100 as J-Passive-ABS when weight omitted).
   */
  const passiveAffixPoolTotals = useMemo(() =>
  {
    let prefixTotal = 0;
    let suffixTotal = 0;
    if (states === null || states === undefined)
    {
      return {
        prefixTotal,
        suffixTotal,
      };
    }
    for (const row of states)
    {
      if (row === null)
      {
        continue;
      }
      const w = row.passiveAbs.affixWeight ?? 100;
      if (row.passiveAbs.enemyPrefix === true)
      {
        prefixTotal += w;
      }
      if (row.passiveAbs.enemySuffix === true)
      {
        suffixTotal += w;
      }
    }
    return {
      prefixTotal,
      suffixTotal,
    };
  }, [ states ]);

  /**
   * Currently selected absorb-element rows for the plugin elem editor.
   *
   * @returns Rows aligned to {@code absorbElementList} order.
   */
  const selectedAbsorbElements = useMemo((): IdLabelRow[] =>
  {
    if (selectedState === null)
    {
      return [];
    }
    const ids = parseCommaSeparatedNonNegativeInts(selectedState.elem.absorbElementList);
    const byId = new Map(statePluginElementAutocompleteOptions.map((o) => [ o.id, o ]));
    return ids.map((id) =>
    {
      const row = byId.get(id);
      if (row !== undefined)
      {
        return row;
      }
      return {
        id,
        label: `#${id}`,
      };
    });
  }, [
    selectedState?.elem.absorbElementList,
    statePluginElementAutocompleteOptions,
  ]);

  /**
   * Currently selected strict-element rows for the plugin elem editor.
   *
   * @returns Rows aligned to {@code strictElementList} order.
   */
  const selectedStrictElements = useMemo((): IdLabelRow[] =>
  {
    if (selectedState === null)
    {
      return [];
    }
    const ids = parseCommaSeparatedNonNegativeInts(selectedState.elem.strictElementList);
    const byId = new Map(statePluginElementAutocompleteOptions.map((o) => [ o.id, o ]));
    return ids.map((id) =>
    {
      const row = byId.get(id);
      if (row !== undefined)
      {
        return row;
      }
      return {
        id,
        label: `#${id}`,
      };
    });
  }, [
    selectedState?.elem.strictElementList,
    statePluginElementAutocompleteOptions,
  ]);

  /**
   * Shield type list values as autocomplete rows (JABS shield section).
   *
   * @returns Rows for the shield elements multi-select.
   */
  const selectedShieldElements = useMemo((): IdLabelRow[] =>
  {
    if (selectedState === null)
    {
      return [];
    }
    const ids = parseCommaSeparatedNonNegativeInts(selectedState.jabs.shieldTypeList);
    const byId = new Map(shieldElementAutocompleteOptions.map((o) => [ o.id, o ]));
    return ids.map((id) =>
    {
      const row = byId.get(id);
      if (row !== undefined)
      {
        return row;
      }
      return {
        id,
        label: `#${id} (not in System.json)`,
      };
    });
  }, [
    selectedState,
    shieldElementAutocompleteOptions,
  ]);

  /**
   * On-break skill picker options: all skills plus ids referenced only in the note.
   *
   * @returns Rows for shield break skill multi-select.
   */
  const shieldBreakSkillAutocompleteOptions = useMemo((): IdLabelRow[] =>
  {
    const base = shieldBreakSkillPickerRows;
    const noteIds =
      selectedState === null
        ? []
        : parseCommaSeparatedNonNegativeInts(selectedState.jabs.shieldBreakSkillIds);
    const known = new Set(base.map((o) => o.id));
    const extra: IdLabelRow[] = [];
    for (const id of noteIds)
    {
      if (known.has(id) === false)
      {
        known.add(id);
        extra.push({
          id,
          label: `${id}: (missing skill)`,
        });
      }
    }
    return [
      ...base,
      ...extra,
    ];
  }, [
    shieldBreakSkillPickerRows,
    selectedState?.jabs.shieldBreakSkillIds,
  ]);

  /**
   * Currently selected on-break skills as autocomplete rows.
   *
   * @returns Rows aligned to {@code shieldBreakSkillIds} order.
   */
  const selectedShieldBreakSkills = useMemo((): IdLabelRow[] =>
  {
    if (selectedState === null)
    {
      return [];
    }
    const ids = parseCommaSeparatedNonNegativeInts(selectedState.jabs.shieldBreakSkillIds);
    const byId = new Map(shieldBreakSkillAutocompleteOptions.map((o) => [ o.id, o ]));
    return ids.map((id) =>
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
  }, [
    selectedState,
    shieldBreakSkillAutocompleteOptions,
  ]);

  /**
   * Clones the given state into selection and list slot, and enables save.
   *
   * @param updatedState Domain model after in-place edits (typically current selection).
   * @returns {void}
   */
  const updateState = useCallback(
    (updatedState: RPG_StateDomainModel) =>
    {
      const clonedState = Object.assign(
        Object.create(Object.getPrototypeOf(updatedState)),
        updatedState
      );

      setSelectedState(clonedState);
      setCanSave(true);

      setStates((prevStates) =>
      {
        if (!prevStates || selectedStateIndex < 0)
        {
          return prevStates;
        }
        return prevStates.with(selectedStateIndex, clonedState);
      });
    },
    [ selectedStateIndex, setStates ]
  );

  /**
   * Writes the state display name from the general editor field.
   *
   * @param event Change event from the name input.
   * @returns {void}
   */
  const handleStateNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.name = event.target.value;
    updateState(selectedState);
  };

  /**
   * Updates the icon index from {@link IconIndexField}.
   *
   * @param next Chosen icon index in the icon set.
   * @returns {void}
   */
  const handleStateIconIndexOnChange = (next: number) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.iconIndex = next;
    updateState(selectedState);
  };

  /**
   * Writes the help/description text for the state.
   *
   * @param event Change event from the description field.
   * @returns {void}
   */
  const handleStateDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.description = event.target.value;
    updateState(selectedState);
  };

  /**
   * Sets RMMZ restriction level from the select control.
   *
   * @param event Change event carrying the numeric restriction id.
   * @returns {void}
   */
  const handleStateRestrictionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.restriction = Number(event.target.value);
    updateState(selectedState);
  };

  /**
   * Parses battle priority from text; invalid input becomes {@code 0}.
   *
   * @param event Change event from the priority field.
   * @returns {void}
   */
  const handleStatePriorityOnChangeEvent = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    const parsed = parseInt(event.target.value, 10);
    selectedState.priority = Number.isNaN(parsed)
      ? 0
      : parsed;
    updateState(selectedState);
  };

  /**
   * Sets battler motion type from the select control.
   *
   * @param event Change event carrying the motion enum id.
   * @returns {void}
   */
  const handleStateMotionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.motion = Number(event.target.value);
    updateState(selectedState);
  };

  /**
   * Sets overlay mode from the select control.
   *
   * @param event Change event carrying the overlay enum id.
   * @returns {void}
   */
  const handleStateOverlayOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.overlay = Number(event.target.value);
    updateState(selectedState);
  };

  /**
   * Toggles remove-at-battle-end from the checkbox.
   *
   * @param event Change event from the checkbox.
   * @returns {void}
   */
  const handleStateRemoveAtBattleEndChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.removeAtBattleEnd = event.target.checked;
    updateState(selectedState);
  };

  /**
   * Toggles remove-when-restriction-lifts from the checkbox.
   *
   * @param event Change event from the checkbox.
   * @returns {void}
   */
  const handleStateRemoveByRestrictionChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.removeByRestriction = event.target.checked;
    updateState(selectedState);
  };

  /**
   * Sets auto-removal timing from the select control.
   *
   * @param event Change event carrying the timing enum id.
   * @returns {void}
   */
  const handleStateAutoRemovalTimingOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.autoRemovalTiming = Number(event.target.value);
    updateState(selectedState);
  };

  /**
   * Parses minimum turns; invalid or negative input clamps to {@code 0}.
   *
   * @param event Change event from the min turns field.
   * @returns {void}
   */
  const handleStateMinTurnsOnChangeEvent = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    const parsed = parseInt(event.target.value, 10);
    selectedState.minTurns = Number.isNaN(parsed)
      ? 0
      : Math.max(0, parsed);
    updateState(selectedState);
  };

  /**
   * Parses maximum turns; invalid or negative input clamps to {@code 0}.
   *
   * @param event Change event from the max turns field.
   * @returns {void}
   */
  const handleStateMaxTurnsOnChangeEvent = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    const parsed = parseInt(event.target.value, 10);
    selectedState.maxTurns = Number.isNaN(parsed)
      ? 0
      : Math.max(0, parsed);
    updateState(selectedState);
  };

  /**
   * Toggles remove-by-damage from the checkbox.
   *
   * @param event Change event from the checkbox.
   * @returns {void}
   */
  const handleStateRemoveByDamageChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.removeByDamage = event.target.checked;
    updateState(selectedState);
  };

  /**
   * Parses chance-by-damage percent; clamps to {@code 0}..{@code 100}.
   *
   * @param event Change event from the chance field.
   * @returns {void}
   */
  const handleStateChanceByDamageOnChangeEvent = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    const parsed = parseInt(event.target.value, 10);
    selectedState.chanceByDamage = Number.isNaN(parsed)
      ? 0
      : Math.min(100, Math.max(0, parsed));
    updateState(selectedState);
  };

  /**
   * Writes battle log message line 1.
   *
   * @param event Change event from the message field.
   * @returns {void}
   */
  const handleStateMessage1OnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.message1 = event.target.value;
    updateState(selectedState);
  };

  /**
   * Writes battle log message line 2.
   *
   * @param event Change event from the message field.
   * @returns {void}
   */
  const handleStateMessage2OnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.message2 = event.target.value;
    updateState(selectedState);
  };

  /**
   * Writes battle log message line 3.
   *
   * @param event Change event from the message field.
   * @returns {void}
   */
  const handleStateMessage3OnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.message3 = event.target.value;
    updateState(selectedState);
  };

  /**
   * Writes battle log message line 4.
   *
   * @param event Change event from the message field.
   * @returns {void}
   */
  const handleStateMessage4OnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.message4 = event.target.value;
    updateState(selectedState);
  };

  /**
   * Replaces the trait list from {@link TraitEditor}.
   *
   * @param updatedTraits Next full trait array for the state.
   * @returns {void}
   */
  const updateStateTraits = (updatedTraits: RPG_Trait[]) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.traits = updatedTraits;
    updateState(selectedState);
  };

  /**
   * Merges fields into {@link StateJabsExtension}, rebuilds the note from extensions, saves selection.
   *
   * @param partial Subset of JABS extension fields to apply.
   * @returns {void}
   */
  const patchStateJabs = (partial: Partial<StateJabsExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.jabs = selectedState.jabs.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Crit extension and rebuilds the note.
   *
   * @param partial Subset of crit extension fields to apply.
   * @returns {void}
   */
  const patchStateCrit = (partial: Partial<StateCritExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.crit = selectedState.crit.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Drops extension and rebuilds the note.
   *
   * @param partial Subset of drops extension fields to apply.
   * @returns {void}
   */
  const patchStateDrops = (partial: Partial<StateDropsExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.drops = selectedState.drops.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Elemental extension and rebuilds the note.
   *
   * @param partial Subset of elemental extension fields to apply.
   * @returns {void}
   */
  const patchStateElem = (partial: Partial<StateElemExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.elem = selectedState.elem.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Level extension and rebuilds the note.
   *
   * @param partial Subset of level extension fields to apply.
   * @returns {void}
   */
  const patchStateLevel = (partial: Partial<StateLevelExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.level = selectedState.level.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Proficiency extension and rebuilds the note.
   *
   * @param partial Subset of proficiency extension fields to apply.
   * @returns {void}
   */
  const patchStateProf = (partial: Partial<StateProfExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.prof = selectedState.prof.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Resources extension and rebuilds the note.
   *
   * @param partial Subset of resources extension fields to apply.
   * @returns {void}
   */
  const patchStateResources = (partial: Partial<StateResourcesExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.resources = selectedState.resources.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Resources-ABS steal extension and rebuilds the note.
   *
   * @param partial Subset of steal extension fields to apply.
   * @returns {void}
   */
  const patchStateSteal = (partial: Partial<StateStealExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.steal = selectedState.steal.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-SDP extension and rebuilds the note.
   *
   * @param partial Subset of SDP extension fields to apply.
   * @returns {void}
   */
  const patchStateSdp = (partial: Partial<StateSdpExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.sdp = selectedState.sdp.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-SKS extension and rebuilds the note.
   *
   * @param partial Subset of SKS extension fields to apply.
   * @returns {void}
   */
  const patchStateSks = (partial: Partial<StateSksExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.sks = selectedState.sks.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Passive-ABS extension and rebuilds the note.
   *
   * @param partial Subset of Passive-ABS extension fields to apply.
   * @returns {void}
   */
  const patchStatePassiveAbs = (partial: Partial<StatePassiveAbsExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.passiveAbs = selectedState.passiveAbs.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Merges fields into the J-Passive-Conditional extension and rebuilds the note.
   *
   * @param partial Subset of passive-conditional extension fields to apply.
   * @returns {void}
   */
  const patchStatePassiveConditional = (partial: Partial<StatePassiveConditionalExtension>) =>
  {
    if (selectedState === null)
    {
      return;
    }
    selectedState.passiveConditional = selectedState.passiveConditional.clone(partial);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Sets the raw state note from the natural-growth editor, then rebuilds plugin extensions from it.
   *
   * @param nextNote Full note text after quadrant edits.
   * @returns {void}
   */
  const patchStateNaturalGrowthNote = (nextNote: string) =>
  {
    if (selectedState === null)
    {
      return;
    }

    selectedState.note = nextNote;
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Parses aggro amp text; empty clears to {@code null}, invalid numbers are ignored.
   *
   * @param key Which aggro multiplier field to update.
   * @param raw Raw text from the number input.
   * @returns {void}
   */
  const patchStateJabsAggroAmp = (
    key: 'aggroOutAmp' | 'aggroInAmp',
    raw: string
  ) =>
  {
    if (selectedState === null)
    {
      return;
    }
    const t = raw.trim();
    if (t === '')
    {
      patchStateJabs({ [ key ]: null });
      return;
    }
    const n = parseFloat(t);
    if (Number.isNaN(n))
    {
      return;
    }
    patchStateJabs({ [ key ]: n });
  };

  /**
   * Parses duration flat/percent integers; empty clears to {@code null}.
   *
   * @param key Flat or percent duration field key.
   * @param raw Raw text from the input.
   * @returns {void}
   */
  const patchStateJabsDurationInt = (
    key: 'stateDurationFlat' | 'stateDurationPercent',
    raw: string
  ) =>
  {
    if (selectedState === null)
    {
      return;
    }
    const t = raw.trim();
    if (t === '')
    {
      patchStateJabs({ [ key ]: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    patchStateJabs({ [ key ]: n });
  };

  /**
   * Clears legacy MZ duration fields so only J-ABS note tags author map timers.
   *
   * @param state State row being edited.
   * @returns {void}
   */
  const clearMzMapDurationFields = (state: RPG_StateDomainModel) =>
  {
    state.removeByWalking = false;
    state.stepsToRemove = 0;
  };

  /**
   * Merges map-duration JABS tags, clears MZ fields, rebuilds the note.
   *
   * @param partial {@code stateDurationFrames} and/or {@code stateDurationSeconds}.
   * @returns {void}
   */
  const patchStateJabsMapDuration = (
    partial: Pick<Partial<StateJabsExtension>, 'stateDurationFrames' | 'stateDurationSeconds' | 'indefiniteState'>
  ) =>
  {
    if (selectedState === null)
    {
      return;
    }

    const nextPartial = { ...partial };
    const frames = partial.stateDurationFrames;
    const seconds = partial.stateDurationSeconds;
    if (
      (frames !== undefined && frames !== null && frames > 0)
      || (seconds !== undefined && seconds !== null && seconds > 0)
    )
    {
      nextPartial.indefiniteState = false;
    }

    selectedState.jabs = selectedState.jabs.clone(nextPartial);
    clearMzMapDurationFields(selectedState);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Toggles {@code <indefiniteState>} and clears finite map-duration tags when enabled.
   *
   * @param event Change event from the checkbox.
   * @returns {void}
   */
  /**
   * Merges skill-history bonus fields and rebuilds the note.
   *
   * @param partial Skill-history bonus subset.
   * @returns {void}
   */
  const patchStateJabsSkillHistoryBonus = (
    partial: Pick<
      Partial<StateJabsExtension>,
      | 'skillHistoryBonusTypeId'
      | 'skillHistoryBonusWindowSeconds'
      | 'skillHistoryBonusPctPerCount'
      | 'skillHistoryBonusCountMode'
    >
  ) =>
  {
    patchStateJabs(partial);
  };

  /**
   * Parses a non-negative integer for skill-history fields; empty clears to {@code null}.
   *
   * @param raw Raw text from the input.
   * @returns Parsed integer or {@code null}.
   */
  const parseStateJabsNonNegativeIntOrNull = (raw: string): number | null =>
  {
    const t = raw.trim();
    if (t === '')
    {
      return null;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n) || n < 0)
    {
      return null;
    }
    return n;
  };

  const handleStateJabsIndefiniteChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (selectedState === null)
    {
      return;
    }

    const { checked } = event.target;
    if (checked)
    {
      patchStateJabsMapDuration({
        indefiniteState: true,
        stateDurationFrames: null,
        stateDurationSeconds: null,
      });
      return;
    }
    selectedState.jabs = selectedState.jabs.clone({ indefiniteState: false });
    clearMzMapDurationFields(selectedState);
    selectedState.rebuildNoteFromExtensions();
    updateState(selectedState);
  };

  /**
   * Parses {@code <stateDuration:FRAMES>}; clears seconds when a positive frame count is saved.
   *
   * @param raw Raw text from the frames field.
   * @returns {void}
   */
  const patchStateJabsMapDurationFrames = (raw: string) =>
  {
    const t = raw.trim();
    if (t === '')
    {
      patchStateJabsMapDuration({ stateDurationFrames: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    if (n > 0)
    {
      patchStateJabsMapDuration({
        stateDurationFrames: n,
        stateDurationSeconds: null,
      });
      return;
    }
    patchStateJabsMapDuration({ stateDurationFrames: null });
  };

  /**
   * Parses {@code <stateDurationSec:SECONDS>}; clears frames when a positive second count is saved.
   *
   * @param raw Raw text from the seconds field.
   * @returns {void}
   */
  const patchStateJabsMapDurationSeconds = (raw: string) =>
  {
    const t = raw.trim();
    if (t === '')
    {
      patchStateJabsMapDuration({ stateDurationSeconds: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    if (n > 0)
    {
      patchStateJabsMapDuration({
        stateDurationSeconds: n,
        stateDurationFrames: null,
      });
      return;
    }
    patchStateJabsMapDuration({ stateDurationSeconds: null });
  };

  /**
   * Writes the JABS state duration formula string.
   *
   * @param event Change event from the formula field.
   * @returns {void}
   */
  const handleStateJabsDurationFormulaChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchStateJabs({ stateDurationFormula: event.target.value });
  };

  /**
   * Parses signed slip/regen or speed-boost integers; empty clears to {@code null}.
   *
   * @param key Slip flat/percent or speed boost field to update.
   * @param raw Raw text from the numeric field.
   * @returns {void}
   */
  const patchStateJabsSlipSigned = (
    key:
      | 'slipHpFlat'
      | 'slipMpFlat'
      | 'slipTpFlat'
      | 'slipHpPercent'
      | 'slipMpPercent'
      | 'slipTpPercent'
      | 'speedBoost',
    raw: string
  ) =>
  {
    if (selectedState === null)
    {
      return;
    }
    const t = raw.trim();
    if (t === '')
    {
      patchStateJabs({ [ key ]: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    patchStateJabs({ [ key ]: n });
  };

  /**
   * Writes slip damage/heal formula text for HP, MP, or TP.
   *
   * @param key Which slip formula field to update.
   * @param event Change event from the formula field.
   * @returns {void}
   */
  const handleStateJabsSlipFormulaChangeEvent = (
    key: 'slipHpFormula' | 'slipMpFormula' | 'slipTpFormula',
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) =>
  {
    patchStateJabs({ [ key ]: event.target.value });
  };

  /**
   * Writes bracket-interior strings for shield formulas or J-ABS timing tags.
   *
   * @param key Target JABS string field.
   * @param event Change event from the text or multiline field.
   * @returns {void}
   */
  const handleStateJabsBracketInteriorChangeEvent = (
    key:
      | 'shieldPointsFormula'
      | 'shieldCapFormula'
      | 'timingBaseCastTime'
      | 'timingCastTimeFlat'
      | 'timingCastTimePercent'
      | 'timingBaseFastCooldown'
      | 'timingFastCooldownFlat'
      | 'timingFastCooldownRate',
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) =>
  {
    patchStateJabs({ [ key ]: event.target.value });
  };

  /**
   * Maps slider output to a percent-tag interior string (empty when modifier is zero).
   *
   * @param key Cast-time or fast-cooldown percent field.
   * @param _event Unused MUI Slider change event.
   * @param value Slider value or range; only the first value is used when an array.
   * @returns {void}
   */
  const handleStateJabsTimingPercentSliderChange = (
    key: 'timingCastTimePercent' | 'timingFastCooldownRate',
    _event: Event,
    value: number | number[]
  ) =>
  {
    if (selectedState === null)
    {
      return;
    }
    const v = Array.isArray(value)
      ? value[ 0 ]
      : value;
    const n = Math.round(v);
    const clamped = Math.min(
      TIMING_PERCENT_SLIDER_MAX,
      Math.max(TIMING_PERCENT_SLIDER_MIN, n)
    );
    patchStateJabs({
      [ key ]: clamped === 0
        ? ''
        : String(clamped),
    });
  };

  /**
   * Normalizes plain-number timing fields to stringified numbers; partial {@code -}/{@code +} clears.
   *
   * @param key Base or flat timing field in frame units.
   * @param event Change event from the number input.
   * @returns {void}
   */
  const handleStateJabsTimingNumberInteriorChange = (
    key:
      | 'timingBaseCastTime'
      | 'timingCastTimeFlat'
      | 'timingBaseFastCooldown'
      | 'timingFastCooldownFlat',
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) =>
  {
    if (selectedState === null)
    {
      return;
    }
    const t = event.target.value;
    if (t === '' || t === '-' || t === '+')
    {
      patchStateJabs({ [ key ]: '' });
      return;
    }
    const n = Number(t);
    if (Number.isNaN(n))
    {
      return;
    }
    patchStateJabs({ [ key ]: String(n) });
  };

  /**
   * A JABS timing field that takes either a plain frame count or a formula.
   *
   * Both spellings are stored as the same bracket interior, so which editor appears follows what is
   * already written there: an author who typed a formula keeps the formula box, and one who typed a
   * number keeps the stepper. The four fields differ only in what they write and what they are called.
   *
   * @param fieldKey The JABS timing field being edited.
   * @param label The caption shown on the field.
   */
  const renderTimingFrameField = (
    fieldKey:
      | 'timingBaseCastTime'
      | 'timingCastTimeFlat'
      | 'timingBaseFastCooldown'
      | 'timingFastCooldownFlat',
    label: string
  ) =>
  {
    if (selectedState === null)
    {
      return <></>;
    }

    const raw = selectedState.jabs[ fieldKey ];

    if (isPlainNumberBracketInterior(raw) === false)
    {
      return (
        <TextField
          variant={'outlined'}
          label={`${label} (formula)`}
          value={raw}
          onChange={(e) =>
          {
            handleStateJabsBracketInteriorChangeEvent(fieldKey, e);
          }}
          size={'small'}
          fullWidth
          multiline
          minRows={2}
          helperText={'Plain number only to use frame input.'}
        />
      );
    }

    return (
      <TextField
        type={'number'}
        variant={'outlined'}
        label={label}
        value={raw.trim() === ''
          ? ''
          : raw}
        onChange={(e) =>
        {
          handleStateJabsTimingNumberInteriorChange(fieldKey, e);
        }}
        size={'small'}
        fullWidth
        slotProps={{
          htmlInput: {
            step: 1,
          },
        }}
      />
    );
  };

  /**
   * A JABS timing percentage, shown as a slider when it holds a plain integer and as a formula box
   * otherwise. Clearing the formula is what hands control back to the slider, which is why the
   * formula variant says so and the slider carries a reset back to 1x.
   *
   * @param fieldKey The JABS percent field being edited.
   * @param sliderCaption What the slider calls the thing it scales.
   * @param formulaLabel The caption on the formula box.
   * @param sliderAriaLabel The accessible name for the slider.
   */
  const renderTimingPercentField = (
    fieldKey: 'timingCastTimePercent' | 'timingFastCooldownRate',
    sliderCaption: string,
    formulaLabel: string,
    sliderAriaLabel: string
  ) =>
  {
    if (selectedState === null)
    {
      return <></>;
    }

    const raw = selectedState.jabs[ fieldKey ];

    if (isPlainIntegerBracketInterior(raw) === false)
    {
      return (
        <TextField
          variant={'outlined'}
          label={formulaLabel}
          value={raw}
          onChange={(e) =>
          {
            handleStateJabsBracketInteriorChangeEvent(fieldKey, e);
          }}
          size={'small'}
          fullWidth
          helperText={'Clear to use the slider, or keep a custom formula.'}
        />
      );
    }

    return (
      <Stack spacing={0.75} sx={{ width: '100%' }}>
        <Stack
          direction={'row'}
          alignItems={'center'}
          spacing={1}
          sx={{ minHeight: 32 }}
        >
          <Typography
            variant={'body2'}
            color={'text.secondary'}
            component={'div'}
            sx={{
              flex: 1,
              minWidth: 0
            }}
          >
            {timingPercentSliderCaption(sliderCaption, raw)}
          </Typography>
          <Tooltip title={'Set to 100% speed (1×)'}>
            <Button
              variant={'text'}
              size={'small'}
              onClick={() =>
              {
                resetTimingPercentModifier(fieldKey);
              }}
              sx={{
                flexShrink: 0,
                minWidth: 'auto',
                px: 1,
              }}
            >
              1×
            </Button>
          </Tooltip>
        </Stack>
        <Slider
          size={'small'}
          value={timingPercentSliderValueFromInterior(raw)}
          onChange={(
            e,
            v
          ) =>
          {
            handleStateJabsTimingPercentSliderChange(fieldKey, e, v);
          }}
          min={TIMING_PERCENT_SLIDER_MIN}
          max={TIMING_PERCENT_SLIDER_MAX}
          step={1}
          marks={TIMING_PERCENT_SLIDER_MARKS}
          valueLabelDisplay={'auto'}
          valueLabelFormat={(x) => timingPercentMultiplierLabel(x)}
          getAriaValueText={(x) =>
            `${timingPercentMultiplierLabel(x)}, modifier ${x} percent`}
          aria-label={sliderAriaLabel}
          sx={{ width: '100%' }}
        />
      </Stack>
    );
  };

  /**
   * Clears a percent timing field so the slider path can take over.
   *
   * @param key Cast-time or fast-cooldown percent field.
   * @returns {void}
   */
  const resetTimingPercentModifier = (
    key: 'timingCastTimePercent' | 'timingFastCooldownRate'
  ) =>
  {
    if (selectedState === null)
    {
      return;
    }
    patchStateJabs({ [ key ]: '' });
  };

  /**
   * Parses refresh diminish count; empty clears to {@code null}.
   *
   * @param raw Text from the stacking refresh field.
   * @returns {void}
   */
  const patchStateJabsRefreshDiminish = (raw: string) =>
  {
    if (selectedState === null)
    {
      return;
    }
    const t = raw.trim();
    if (t === '')
    {
      patchStateJabs({ stateRefreshDiminish: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    patchStateJabs({ stateRefreshDiminish: n });
  };

  /**
   * Parses non-negative stacking or shield priority integers; empty clears to {@code null}.
   *
   * @param key Unsigned JABS integer field.
   * @param raw Text from the bound input.
   * @returns {void}
   */
  const patchStateJabsStackingUnsigned = (
    key:
      | 'stateRefreshReset'
      | 'stackExtendAmount'
      | 'stackExtendMax'
      | 'stackMax'
      | 'applyStacks'
      | 'shieldPriority',
    raw: string
  ) =>
  {
    if (selectedState === null)
    {
      return;
    }
    const t = raw.trim();
    if (t === '')
    {
      patchStateJabs({ [ key ]: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n) || n < 0)
    {
      return;
    }
    patchStateJabs({ [ key ]: n });
  };

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
    variant: MuiSnackbarVariant = MuiSnackbarVariant.Filled,
  ) =>
  {
    setSnackMessage(message);
    setSnackSeverity(severity);
    setSnackVariant(variant);
    setSnackOpen(true);
  };

  const handleStateListItemOnClickEventRef = useRef<
    (
      index: number,
      keepListFocus?: boolean
    ) => void
  >(() =>
  {
  });

  const { updateUrl } = useUrlSelection(
    'stateId',
    states,
    (s) => s.id,
    (index) => handleStateListItemOnClickEventRef.current(index, false),
    (index) => listRef.current?.scrollToItem(index, 'smart'),
  );

  /**
   * Selects a state by list index and optionally keeps focus on the virtualized list.
   *
   * @param index Index in the {@code states} array.
   * @param keepListFocus When true, refocuses the list wrapper after selection.
   * @returns {void}
   */
  const handleStateListItemOnClickEvent = (
    index: number,
    keepListFocus: boolean = true,
  ) =>
  {
    setSelectedStateIndex(index);

    if (states.length > 0)
    {
      const state = states.at(index)!;
      setSelectedState(state);
      updateUrl(state);
    }

    if (keepListFocus)
    {
      setTimeout(() => listWrapperRef.current?.focus(), 0);
    }
  };

  handleStateListItemOnClickEventRef.current = handleStateListItemOnClickEvent;

  const updateUrlRef = useRef(updateUrl);
  updateUrlRef.current = updateUrl;

  /**
   * After reload or project switch, {@code states} is a new array of fresh models; without this, {@code selectedState}
   * would keep a stale reference and the editor would show unsaved edits that no longer exist on disk.
   */
  useEffect(() =>
  {
    if (states.length === 0)
    {
      setSelectedState(null);
      return;
    }

    const idx = Math.min(Math.max(0, selectedStateIndex), states.length - 1);
    let next: RPG_StateDomainModel = states[idx];
    const priorId = selectedState?.id;
    if (typeof priorId === 'number' && priorId >= 1)
    {
      const found = states.find((s) => s.id === priorId);
      if (found !== undefined)
      {
        next = found;
      }
    }

    if (next !== selectedState)
    {
      setSelectedState(next);
      updateUrlRef.current(next);
    }
  }, [ states, selectedStateIndex, selectedState ]);

  useEffect(() =>
  {
    if (states.length === 0)
    {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('stateId'))
    {
      return;
    }

    if (selectedState === null)
    {
      handleStateListItemOnClickEvent(0, false);
    }
  }, [ states.length ]);

  useEffect(() =>
  {
    listWrapperRef.current?.focus();
  }, []);

  /**
   * Filters the search box, jumps to the first name match, and selects that state.
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

    const foundIndex = states.findIndex((state) =>
    {
      if (state.name.length === 0)
      {
        return false;
      }
      return state.name.toLowerCase()
        .includes(term);
    });

    if (foundIndex !== -1)
    {
      listRef.current?.scrollToItem(foundIndex, 'start');
      handleStateListItemOnClickEvent(foundIndex, false);
    }
  };

  /**
   * Finds the next state whose name contains the search query, walking the list cyclically.
   *
   * @param startIndex Current list index to search from (exclusive of first step).
   * @param term Search string; trimmed and compared case-insensitively.
   * @param direction {@code 1} for forward, {@code -1} for backward.
   * @returns Matching index, or {@code -1} when empty query or no match.
   */
  const findNextMatchIndex = (
    startIndex: number,
    term: string,
    direction: 1 | -1,
  ) =>
  {
    const query = term.trim()
      .toLowerCase();
    if (query === '')
    {
      return -1;
    }

    const { length } = states;
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
      const state = states[ idx ];
      if (state && state.name.length > 0 && state.name.toLowerCase()
        .includes(query))
      {
        return idx;
      }
    }

    return -1;
  };

  /**
   * Selects the previous state matching the current search term.
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

    const start = selectedStateIndex ?? 0;
    const prevIndex = findNextMatchIndex(start, query, -1);
    if (prevIndex !== -1)
    {
      listRef.current?.scrollToItem(prevIndex, 'start');
      handleStateListItemOnClickEvent(prevIndex);
    }
  };

  /**
   * Selects the next state matching the current search term.
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

    const start = selectedStateIndex ?? 0;
    const nextIndex = findNextMatchIndex(start, query, 1);
    if (nextIndex !== -1)
    {
      listRef.current?.scrollToItem(nextIndex, 'start');
      handleStateListItemOnClickEvent(nextIndex);
    }
  };

  /**
   * Persists all states through the resource context.
   *
   * @returns Promise resolved when save completes.
   */
  const handleSaveButtonOnClickEvent = async () =>
  {
    await save(states);
    handleSnack('States data has been saved successfully.');
  };

  /**
   * Reloads states from disk and clears the dirty flag on success.
   *
   * @returns Promise resolved when reload completes or rejected on failure.
   */
  const handleReloadButtonOnClickEvent = async () =>
  {
    try
    {
      await reload();
      setCanSave(false);
      handleSnack('States data has been reloaded successfully.', MuiSnackbarSeverity.Success);
    }
    catch (error)
    {
      console.error('Failed to reload states data:', error);
      handleSnack('Failed to reload states data.', MuiSnackbarSeverity.Error);
    }
  };

  /**
   * Moves selection to the next state in list order (wraps).
   *
   * @returns {void}
   */
  const handleIterateNext = () =>
  {
    const { length } = states;
    if (length === 0)
    {
      return;
    }

    const start = selectedStateIndex ?? 0;
    const nextIndex = (
      start + 1
    ) % length;

    listRef.current?.scrollToItem(nextIndex, 'start');
    handleStateListItemOnClickEvent(nextIndex);
  };

  /**
   * Moves selection to the previous state in list order (wraps).
   *
   * @returns {void}
   */
  const handleIteratePrev = () =>
  {
    const { length } = states;
    if (length === 0)
    {
      return;
    }

    const start = selectedStateIndex ?? 0;
    const prevIndex = (
      start - 1 + length
    ) % length;

    listRef.current?.scrollToItem(prevIndex, 'start');
    handleStateListItemOnClickEvent(prevIndex);
  };

  /**
   * Arrow up/down navigation for the focused state list.
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
   * Maps a state array index to a virtualized sidebar row.
   *
   * @param index Row index in {@link states}.
   * @returns Spacer or item descriptor for {@link VirtualizedSidebarList}.
   */
  const getStateSidebarRow = useCallback((index: number): VirtualizedSidebarRow =>
  {
    const state = states.at(index);

    if (state === undefined)
    {
      return {
        type: 'spacer',
      };
    }

    return {
      type: 'item',
      label: `${state.id}: ${state.name}`,
      title: `${state.id}: ${state.name}`,
      iconIndex: state.iconIndex,
    };
  }, [ states ]);

  useBoardActions({
    onSave: async () =>
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
    },
    canSave,
    isSaving,
    onReload: handleReloadButtonOnClickEvent,
    canReload: !loading,
  });

  return <>
    <Box sx={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <EditorBoardSplitLayout
        sidebarColumnWidth={statesBoardListColumnWidth}
        sidebar={
          <>
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
            label="Search State"
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
                  : null,
              },
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
        <VirtualizedSidebarList
          ref={listRef}
          itemCount={states.length}
          itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
          fillContainer
          listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
          labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
          selectedIndex={selectedStateIndex}
          getRow={getStateSidebarRow}
          onSelectIndex={(index) =>
          {
            handleStateListItemOnClickEvent(index);
          }}
          onListKeyDown={handleListKeyDown}
          listWrapperRef={listWrapperRef}
        />
          </>
        }
      >
          {(
            selectedState === null
          )
            ? (
              <Typography>
                Please select a state on the left.
              </Typography>
            )
            : (
              <Stack spacing={2}>
                <Tabs
                  value={stateEditorTab}
                  onChange={(
                    _e,
                    next
                  ) =>
                  {
                    setStateEditorTab(next);
                  }}
                  aria-label={'State editor sections'}
                  variant={'scrollable'}
                  scrollButtons={'auto'}
                >
                  <Tab
                    label={'Editor'}
                    id={'state-editor-tab-0'}
                    aria-controls={'state-editor-tabpanel-0'}
                  />
                  <Tab
                    label={'Natural growth'}
                    id={'state-editor-tab-1'}
                    aria-controls={'state-editor-tabpanel-1'}
                  />
                  <Tab
                    label={'Note'}
                    id={'state-editor-tab-2'}
                    aria-controls={'state-editor-tabpanel-2'}
                  />
                </Tabs>

                <Box
                  id={'state-editor-tabpanel-0'}
                  role={'tabpanel'}
                  aria-labelledby={'state-editor-tab-0'}
                  hidden={stateEditorTab !== 0}
                  sx={{
                    display: stateEditorTab === 0
                      ? 'block'
                      : 'none',
                  }}
                >
                  <Stack spacing={3}>
                    <Grid container spacing={2} alignItems={'flex-start'}>
                      <Grid size={{
                        xs: 12,
                        md: 7
                      }}>
                        <Stack spacing={2}>
                            <BoardSectionCard title={'General'} collapsible>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography
                                  variant={'caption'}
                                  sx={{
                                    fontFamily: 'monospace',
                                    display: 'block',
                                  }}
                                >
                                  {`State id: ${selectedState.id}`}
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Name'}
                                      value={selectedState.name}
                                      onChange={handleStateNameOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <IconIndexField
                                      value={selectedState.iconIndex}
                                      onChange={handleStateIconIndexOnChange}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      select
                                      variant={'outlined'}
                                      label={'Restriction'}
                                      value={selectedState.restriction}
                                      onChange={handleStateRestrictionOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                    >
                                      {RMMZ_STATE_RESTRICTION_OPTIONS.some((o) => o.value === selectedState.restriction) === false && (
                                        <MenuItem value={selectedState.restriction}>
                                          {`Other (${selectedState.restriction})`}
                                        </MenuItem>
                                      )}
                                      {RMMZ_STATE_RESTRICTION_OPTIONS.map((option) => (
                                        <MenuItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </MenuItem>
                                      ))}
                                    </TextField>
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Priority'}
                                      value={selectedState.priority}
                                      onChange={handleStatePriorityOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          min: 0,
                                          max: 999,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      select
                                      variant={'outlined'}
                                      label={'[SV] Motion'}
                                      value={selectedState.motion}
                                      onChange={handleStateMotionOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                    >
                                      {RMMZ_STATE_MOTION_OPTIONS.some((o) => o.value === selectedState.motion) === false && (
                                        <MenuItem value={selectedState.motion}>
                                          {`Other (${selectedState.motion})`}
                                        </MenuItem>
                                      )}
                                      {RMMZ_STATE_MOTION_OPTIONS.map((option) => (
                                        <MenuItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </MenuItem>
                                      ))}
                                    </TextField>
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      select
                                      variant={'outlined'}
                                      label={'[SV] Overlay'}
                                      value={selectedState.overlay}
                                      onChange={handleStateOverlayOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                    >
                                      {RMMZ_STATE_OVERLAY_OPTIONS.some((o) => o.value === selectedState.overlay) === false && (
                                        <MenuItem value={selectedState.overlay}>
                                          {`Other (${selectedState.overlay})`}
                                        </MenuItem>
                                      )}
                                      {RMMZ_STATE_OVERLAY_OPTIONS.map((option) => (
                                        <MenuItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </MenuItem>
                                      ))}
                                    </TextField>
                                  </Grid>
                                  <Grid size={12}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Description'}
                                      value={selectedState.description}
                                      onChange={handleStateDescriptionOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                      multiline
                                      minRows={2}
                                    />
                                  </Grid>
                                </Grid>
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Details'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  Details that describe the (JABS) negative effects of being afflicted with this state.
                                </Typography>
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={selectedState.jabs.negative}
                                      onChange={(e) =>
                                      {
                                        patchStateJabs({ negative: e.target.checked });
                                      }}
                                      size={'small'}
                                    />
                                  )}
                                  label={(
                                    <Box>
                                      <Typography variant={'body2'} component={'span'}>
                                        Negative
                                      </Typography>
                                      <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
                                        Allies will attempt to cleanse this state if they can.
                                      </Typography>
                                    </Box>
                                  )}
                                />
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  Ailment hooks
                                </Typography>
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={selectedState.jabs.rooted}
                                      onChange={(e) =>
                                      {
                                        patchStateJabs({ rooted: e.target.checked });
                                      }}
                                      size={'small'}
                                    />
                                  )}
                                  label={(
                                    <Box>
                                      <Typography variant={'body2'} component={'span'}>
                                        Rooted
                                      </Typography>
                                      <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
                                        Prevents the battler from moving.
                                      </Typography>
                                    </Box>
                                  )}
                                />
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={selectedState.jabs.disabled}
                                      onChange={(e) =>
                                      {
                                        patchStateJabs({ disabled: e.target.checked });
                                      }}
                                      size={'small'}
                                    />
                                  )}
                                  label={(
                                    <Box>
                                      <Typography variant={'body2'} component={'span'}>
                                        Disabled
                                      </Typography>
                                      <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
                                        Prevents the battler from using basic attacks.
                                      </Typography>
                                    </Box>
                                  )}
                                />
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={selectedState.jabs.muted}
                                      onChange={(e) =>
                                      {
                                        patchStateJabs({ muted: e.target.checked });
                                      }}
                                      size={'small'}
                                    />
                                  )}
                                  label={(
                                    <Box>
                                      <Typography variant={'body2'} component={'span'}>
                                        Muted
                                      </Typography>
                                      <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
                                        Prevents the battler from using non-basic-attack skills.
                                      </Typography>
                                    </Box>
                                  )}
                                />
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={selectedState.jabs.paralyzed}
                                      onChange={(e) =>
                                      {
                                        patchStateJabs({ paralyzed: e.target.checked });
                                      }}
                                      size={'small'}
                                    />
                                  )}
                                  label={(
                                    <Box>
                                      <Typography variant={'body2'} component={'span'}>
                                        Paralyzed
                                      </Typography>
                                      <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
                                        Functionally identical to being rooted, disabled, and muted- aka stunned.
                                      </Typography>
                                    </Box>
                                  )}
                                />
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Regen & DoT'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
                                  Details about the various slip effects this state applies to the afflicted battler.
                                  Values are defined as totals over a five-second window and are spread across twenty
                                  ticks (four per second). Negative numbers drain the pool (poison, burnout); positive
                                  numbers replenish it (regen, focus).
                                </Typography>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  Flat and percent lines are simple numbers. Formula lines use damage formulas: the
                                  afflicted battler is <code>a</code>, the applier is <code>b</code>, <code>v</code> is
                                  the variable store, and <code>s</code> is the state
                                  record.
                                </Typography>
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  HP
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Flat'}
                                      value={selectedState.jabs.slipHpFlat === null
                                        ? ''
                                        : String(selectedState.jabs.slipHpFlat)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsSlipSigned('slipHpFlat', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          step: 1,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Percent of max'}
                                      value={selectedState.jabs.slipHpPercent === null
                                        ? ''
                                        : String(selectedState.jabs.slipHpPercent)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsSlipSigned('slipHpPercent', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          step: 1,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Formula'}
                                      value={selectedState.jabs.slipHpFormula}
                                      onChange={(e) =>
                                      {
                                        handleStateJabsSlipFormulaChangeEvent('slipHpFormula', e);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      placeholder={'e.g. a.mdf * -1'}
                                    />
                                  </Grid>
                                </Grid>
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  MP
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Flat'}
                                      value={selectedState.jabs.slipMpFlat === null
                                        ? ''
                                        : String(selectedState.jabs.slipMpFlat)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsSlipSigned('slipMpFlat', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          step: 1,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Percent'}
                                      value={selectedState.jabs.slipMpPercent === null
                                        ? ''
                                        : String(selectedState.jabs.slipMpPercent)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsSlipSigned('slipMpPercent', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          step: 1,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Formula'}
                                      value={selectedState.jabs.slipMpFormula}
                                      onChange={(e) =>
                                      {
                                        handleStateJabsSlipFormulaChangeEvent('slipMpFormula', e);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      placeholder={'e.g. a.mat * -0.5'}
                                    />
                                  </Grid>
                                </Grid>
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  TP
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Flat'}
                                      value={selectedState.jabs.slipTpFlat === null
                                        ? ''
                                        : String(selectedState.jabs.slipTpFlat)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsSlipSigned('slipTpFlat', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          step: 1,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Percent'}
                                      value={selectedState.jabs.slipTpPercent === null
                                        ? ''
                                        : String(selectedState.jabs.slipTpPercent)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsSlipSigned('slipTpPercent', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          step: 1,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Formula'}
                                      value={selectedState.jabs.slipTpFormula}
                                      onChange={(e) =>
                                      {
                                        handleStateJabsSlipFormulaChangeEvent('slipTpFormula', e);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      placeholder={'e.g. a.atk * 2'}
                                    />
                                  </Grid>
                                </Grid>
                              </Stack>
                          </BoardSectionCard>

                          <StatePluginNoteSections
                            selectedState={selectedState}
                            absorbElementOptions={statePluginElementAutocompleteOptions}
                            selectedAbsorbElements={selectedAbsorbElements}
                            strictElementOptions={statePluginElementAutocompleteOptions}
                            selectedStrictElements={selectedStrictElements}
                            boostElementIdOptions={statePluginElementAutocompleteOptions}
                            patchCrit={patchStateCrit}
                            patchDrops={patchStateDrops}
                            patchElem={patchStateElem}
                            patchLevel={patchStateLevel}
                            patchProf={patchStateProf}
                            patchResources={patchStateResources}
                            patchSteal={patchStateSteal}
                            patchSdp={patchStateSdp}
                            patchSks={patchStateSks}
                            patchPassiveAbs={patchStatePassiveAbs}
                            passiveAffixPrefixPoolTotal={passiveAffixPoolTotals.prefixTotal}
                            passiveAffixSuffixPoolTotal={passiveAffixPoolTotals.suffixTotal}
                          />
                        </Stack>
                      </Grid>

                      <Grid size={{
                        xs: 12,
                        md: 5
                      }}>
                        <Stack spacing={2}>
                            <BoardSectionCard title={'State duration'} collapsible defaultExpanded={true}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  {'How long this state lasts on the map.'}
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={12}>
                                    <FormControlLabel
                                      control={(
                                        <Checkbox
                                          checked={selectedState.jabs.indefiniteState}
                                          onChange={handleStateJabsIndefiniteChange}
                                          size={'small'}
                                        />
                                      )}
                                      label={'Never expires on the map'}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Duration (frames)'}
                                      value={selectedState.jabs.stateDurationFrames === null
                                        ? ''
                                        : String(selectedState.jabs.stateDurationFrames)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsMapDurationFrames(e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      disabled={selectedState.jabs.indefiniteState}
                                      slotProps={{
                                        htmlInput: {
                                          min: 0,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Duration (seconds)'}
                                      value={selectedState.jabs.stateDurationSeconds === null
                                        ? ''
                                        : String(selectedState.jabs.stateDurationSeconds)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsMapDurationSeconds(e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      disabled={selectedState.jabs.indefiniteState}
                                      slotProps={{
                                        htmlInput: {
                                          min: 0,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    {(() =>
                                    {
                                      if (selectedState.jabs.indefiniteState)
                                      {
                                        return (
                                          <Typography variant={'body2'} color={'text.secondary'}>
                                            {'Does not expire on the map.'}
                                          </Typography>
                                        );
                                      }
                                      const tagFrames = resolveStateMapDurationFramesFromJabs(selectedState.jabs);
                                      if (stateJabsHasMapTimer(selectedState.jabs) && tagFrames !== null)
                                      {
                                        return (
                                          <Typography variant={'body2'} color={'text.secondary'}>
                                            {`Expires on the map ${formatApproxSecondsLabelFromFrames(tagFrames).replace(/[()]/g, '')}.`}
                                          </Typography>
                                        );
                                      }
                                      return (
                                        <Typography variant={'body2'} color={'text.secondary'}>
                                          {'No duration set.'}
                                        </Typography>
                                      );
                                    })()}
                                  </Grid>
                                </Grid>
                                <Divider />
                                <Typography variant={'subtitle2'}>
                                  {'Outgoing duration'}
                                </Typography>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  {'Adjusts how long states this unit applies to others last on the map.'}
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Flat bonus (frames)'}
                                      value={selectedState.jabs.stateDurationFlat === null
                                        ? ''
                                        : String(selectedState.jabs.stateDurationFlat)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsDurationInt('stateDurationFlat', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Percent bonus'}
                                      value={selectedState.jabs.stateDurationPercent === null
                                        ? ''
                                        : String(selectedState.jabs.stateDurationPercent)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsDurationInt('stateDurationPercent', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Formula bonus (frames)'}
                                      value={selectedState.jabs.stateDurationFormula}
                                      onChange={handleStateJabsDurationFormulaChangeEvent}
                                      size={'small'}
                                      fullWidth
                                      multiline
                                      minRows={2}
                                      placeholder={'e.g. a.atk * 2'}
                                    />
                                  </Grid>
                                </Grid>
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Traits'} collapsible>
                              <TraitEditor
                                selectedTraits={selectedState.traits}
                                updateEnemyTraits={updateStateTraits}
                              />
                          </BoardSectionCard>

                            <BoardSectionCard title={'Messages'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'caption'} color={'text.secondary'}>
                                  {'Use %1 for the battler name.'}
                                </Typography>
                                <Stack spacing={0.5}>
                                  <Typography variant={'body2'} color={'text.secondary'}>
                                    {'If an actor is inflicted with the state:'}
                                  </Typography>
                                  <TextField
                                    variant={'outlined'}
                                    value={selectedState.message1}
                                    onChange={handleStateMessage1OnChangeEvent}
                                    size={'small'}
                                    fullWidth
                                  />
                                </Stack>
                                <Stack spacing={0.5}>
                                  <Typography variant={'body2'} color={'text.secondary'}>
                                    {'If an enemy is inflicted with the state:'}
                                  </Typography>
                                  <TextField
                                    variant={'outlined'}
                                    value={selectedState.message2}
                                    onChange={handleStateMessage2OnChangeEvent}
                                    size={'small'}
                                    fullWidth
                                  />
                                </Stack>
                                <Stack spacing={0.5}>
                                  <Typography variant={'body2'} color={'text.secondary'}>
                                    {'If the state persists:'}
                                  </Typography>
                                  <TextField
                                    variant={'outlined'}
                                    value={selectedState.message3}
                                    onChange={handleStateMessage3OnChangeEvent}
                                    size={'small'}
                                    fullWidth
                                  />
                                </Stack>
                                <Stack spacing={0.5}>
                                  <Typography variant={'body2'} color={'text.secondary'}>
                                    {'If the state is removed:'}
                                  </Typography>
                                  <TextField
                                    variant={'outlined'}
                                    value={selectedState.message4}
                                    onChange={handleStateMessage4OnChangeEvent}
                                    size={'small'}
                                    fullWidth
                                  />
                                </Stack>
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Removal Conditions'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Grid container spacing={2} alignItems={'center'}>
                                  <Grid size={6}>
                                    <FormControlLabel
                                      control={(
                                        <Checkbox
                                          checked={selectedState.removeAtBattleEnd}
                                          onChange={handleStateRemoveAtBattleEndChange}
                                          size={'small'}
                                        />
                                      )}
                                      label={'Remove at Battle End'}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <FormControlLabel
                                      control={(
                                        <Checkbox
                                          checked={selectedState.removeByRestriction}
                                          onChange={handleStateRemoveByRestrictionChange}
                                          size={'small'}
                                        />
                                      )}
                                      label={'Remove by Restriction'}
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <TextField
                                      select
                                      variant={'outlined'}
                                      label={'Auto-removal Timing'}
                                      value={selectedState.autoRemovalTiming}
                                      onChange={handleStateAutoRemovalTimingOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                    >
                                      {RMMZ_STATE_AUTO_REMOVAL_TIMING_OPTIONS.some((o) => o.value === selectedState.autoRemovalTiming) === false && (
                                        <MenuItem value={selectedState.autoRemovalTiming}>
                                          {`Other (${selectedState.autoRemovalTiming})`}
                                        </MenuItem>
                                      )}
                                      {RMMZ_STATE_AUTO_REMOVAL_TIMING_OPTIONS.map((option) => (
                                        <MenuItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </MenuItem>
                                      ))}
                                    </TextField>
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Duration in Turns (min)'}
                                      value={selectedState.minTurns}
                                      onChange={handleStateMinTurnsOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                      disabled={selectedState.autoRemovalTiming === 0}
                                      slotProps={{
                                        htmlInput: {
                                          min: 0,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Duration in Turns (max)'}
                                      value={selectedState.maxTurns}
                                      onChange={handleStateMaxTurnsOnChangeEvent}
                                      size={'small'}
                                      fullWidth
                                      disabled={selectedState.autoRemovalTiming === 0}
                                      slotProps={{
                                        htmlInput: {
                                          min: 0,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <Stack
                                      direction={'row'}
                                      spacing={1.5}
                                      alignItems={'center'}
                                      flexWrap={'wrap'}
                                      useFlexGap
                                    >
                                      <FormControlLabel
                                        control={(
                                          <Checkbox
                                            checked={selectedState.removeByDamage}
                                            onChange={handleStateRemoveByDamageChange}
                                            size={'small'}
                                          />
                                        )}
                                        label={'Remove by Damage'}
                                      />
                                      <TextField
                                        type={'number'}
                                        variant={'outlined'}
                                        label={'%'}
                                        value={selectedState.chanceByDamage}
                                        onChange={handleStateChanceByDamageOnChangeEvent}
                                        size={'small'}
                                        disabled={selectedState.removeByDamage === false}
                                        sx={{ width: 100 }}
                                        slotProps={{
                                          htmlInput: {
                                            min: 0,
                                            max: 100,
                                          },
                                        }}
                                      />
                                    </Stack>
                                  </Grid>
                                </Grid>
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Aggro Generation'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  Details on how aggro is affected for the battler afflicted with this state.
                                </Typography>
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={selectedState.jabs.aggroLock}
                                      onChange={(e) =>
                                      {
                                        patchStateJabs({ aggroLock: e.target.checked });
                                      }}
                                      size={'small'}
                                    />
                                  )}
                                  label={(
                                    <Box>
                                      <Typography variant={'body2'} component={'span'}>
                                        Aggro lock
                                      </Typography>
                                      <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
                                        Locks this battler's aggro at its current state while afflicted.
                                      </Typography>
                                    </Box>
                                  )}
                                />
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Aggro out multiplier'}
                                      value={selectedState.jabs.aggroOutAmp === null
                                        ? ''
                                        : String(selectedState.jabs.aggroOutAmp)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsAggroAmp('aggroOutAmp', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      helperText={'Multiplies generated aggro against targets.'}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Aggro in multiplier'}
                                      value={selectedState.jabs.aggroInAmp === null
                                        ? ''
                                        : String(selectedState.jabs.aggroInAmp)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsAggroAmp('aggroInAmp', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                      helperText={'Multiplies aggro from targets.'}

                                    />
                                  </Grid>
                                </Grid>
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Recent skills'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  {'Extra damage based on which skills this unit used recently.'}
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <Autocomplete<RmmzSkillStypeOption, false, false, false>
                                      fullWidth
                                      size={'small'}
                                      options={skillHistoryTypeFilterAutocompleteOptions(
                                        selectedState.jabs.skillHistoryBonusTypeId ?? 0,
                                        SystemService.skillTypes ?? []
                                      )}
                                      groupBy={(option) => option.group}
                                      getOptionLabel={(option) => option.label}
                                      isOptionEqualToValue={(
                                        a,
                                        b
                                      ) => a.value === b.value}
                                      value={skillHistoryTypeFilterOptionForValue(
                                        selectedState.jabs.skillHistoryBonusTypeId,
                                        SystemService.skillTypes ?? []
                                      )}
                                      onChange={(
                                        _event,
                                        option
                                      ) =>
                                      {
                                        patchStateJabsSkillHistoryBonus({
                                          skillHistoryBonusTypeId: option === null
                                            ? null
                                            : option.value,
                                        });
                                      }}
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
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          variant={'outlined'}
                                          label={'Skill type filter'}
                                          placeholder={'Any, Techniques, …'}
                                        />
                                      )}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Lookback (seconds)'}
                                      value={selectedState.jabs.skillHistoryBonusWindowSeconds === null
                                        ? ''
                                        : String(selectedState.jabs.skillHistoryBonusWindowSeconds)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsSkillHistoryBonus({
                                          skillHistoryBonusWindowSeconds: parseStateJabsNonNegativeIntOrNull(e.target.value),
                                        });
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          min: 0,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      type={'number'}
                                      variant={'outlined'}
                                      label={'Bonus per count (%)'}
                                      value={selectedState.jabs.skillHistoryBonusPctPerCount === null
                                        ? ''
                                        : String(selectedState.jabs.skillHistoryBonusPctPerCount)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsSkillHistoryBonus({
                                          skillHistoryBonusPctPerCount: parseStateJabsNonNegativeIntOrNull(e.target.value),
                                        });
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        htmlInput: {
                                          min: 0,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      select
                                      variant={'outlined'}
                                      label={'What to count'}
                                      value={selectedState.jabs.skillHistoryBonusCountMode ?? ''}
                                      onChange={(e) =>
                                      {
                                        const v = e.target.value;
                                        if (v === '')
                                        {
                                          patchStateJabsSkillHistoryBonus({ skillHistoryBonusCountMode: null });
                                          return;
                                        }
                                        patchStateJabsSkillHistoryBonus({
                                          skillHistoryBonusCountMode: v as SkillHistoryBonusCountMode,
                                        });
                                      }}
                                      size={'small'}
                                      fullWidth
                                      slotProps={{
                                        select: {
                                          displayEmpty: true,
                                        },
                                      }}
                                    >
                                      <MenuItem value={''}>
                                        {'—'}
                                      </MenuItem>
                                      {SKILL_HISTORY_COUNT_MODE_OPTIONS.map((option) => (
                                        <MenuItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </MenuItem>
                                      ))}
                                    </TextField>
                                  </Grid>
                                  <Grid size={12}>
                                    {stateJabsHasSkillHistoryBonus(selectedState.jabs)
                                      ? (
                                        <Typography variant={'body2'} color={'text.secondary'}>
                                          {`+${selectedState.jabs.skillHistoryBonusPctPerCount}% damage per ${
                                            SKILL_HISTORY_COUNT_MODE_OPTIONS.find((o) =>
                                            {
                                              return o.value === selectedState.jabs.skillHistoryBonusCountMode;
                                            })?.label.toLowerCase() ?? 'entry'
                                          } in the last ${selectedState.jabs.skillHistoryBonusWindowSeconds}s (${
                                            skillHistoryTypeFilterOptionForValue(
                                              selectedState.jabs.skillHistoryBonusTypeId,
                                              SystemService.skillTypes ?? []
                                            )?.label ?? 'Any'
                                          } only).`}
                                        </Typography>
                                      )
                                      : (
                                        <Typography variant={'body2'} color={'text.secondary'}>
                                          {'Not configured.'}
                                        </Typography>
                                      )}
                                  </Grid>
                                </Grid>
                              </Stack>
                          </BoardSectionCard>

                            <StatePassiveConditionalPanel
                              ext={selectedState.passiveConditional}
                              onChange={patchStatePassiveConditional}
                              statePickerRows={passiveStatePickerRows}
                              skillPickerRows={passiveSkillPickerRows}
                            />

                            <BoardSectionCard title={'Walk speed'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
                                  Map movement speed offset for the afflicted battler.
                                </Typography>
                                <TextField
                                  type={'number'}
                                  variant={'outlined'}
                                  label={'Speed boost'}
                                  value={selectedState.jabs.speedBoost === null
                                    ? ''
                                    : String(selectedState.jabs.speedBoost)}
                                  onChange={(e) =>
                                  {
                                    patchStateJabsSlipSigned('speedBoost', e.target.value);
                                  }}
                                  size={'small'}
                                  fullWidth
                                  slotProps={{
                                    htmlInput: {
                                      step: 1,
                                    },
                                  }}
                                />
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Gap close'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
                                  Whether gap-close skills may target this battler.
                                </Typography>
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={selectedState.jabs.gapCloseTarget}
                                      onChange={(e) =>
                                      {
                                        patchStateJabs({ gapCloseTarget: e.target.checked });
                                      }}
                                      size={'small'}
                                    />
                                  )}
                                  label={'Valid gap-close target'}
                                />
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Shield'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
                                  Details the shield effect this state applies to the afflicted battler.
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={12}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Points formula'}
                                      value={selectedState.jabs.shieldPointsFormula}
                                      onChange={(e) =>
                                      {
                                        handleStateJabsBracketInteriorChangeEvent('shieldPointsFormula', e);
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Cap formula'}
                                      value={selectedState.jabs.shieldCapFormula}
                                      onChange={(e) =>
                                      {
                                        handleStateJabsBracketInteriorChangeEvent('shieldCapFormula', e);
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Priority'}
                                      value={selectedState.jabs.shieldPriority === null
                                        ? ''
                                        : String(selectedState.jabs.shieldPriority)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsStackingUnsigned('shieldPriority', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <FormControlLabel
                                      sx={{ mt: 1 }}
                                      control={(
                                        <Checkbox
                                          checked={selectedState.jabs.shieldProtect}
                                          onChange={(e) =>
                                          {
                                            patchStateJabs({ shieldProtect: e.target.checked });
                                          }}
                                          size={'small'}
                                        />
                                      )}
                                      label={'Block overflow on break'}
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <Autocomplete<IdLabelRow, true, false, false>
                                      multiple
                                      size={'small'}
                                      options={shieldElementAutocompleteOptions}
                                      getOptionLabel={(o) => o.label}
                                      isOptionEqualToValue={(
                                        a,
                                        b
                                      ) => a.id === b.id}
                                      value={selectedShieldElements}
                                      onChange={(
                                        _e,
                                        next
                                      ) =>
                                      {
                                        const ids = next.map((o) => o.id);
                                        patchStateJabs({
                                          shieldTypeList: ids.length === 0
                                            ? ''
                                            : ids.join(', '),
                                        });
                                      }}
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
                                            .includes(q));
                                      }}
                                      renderValue={(
                                        tagValue,
                                        getItemProps
                                      ) =>
                                        tagValue.map((
                                          option,
                                          index
                                        ) =>
                                        {
                                          const {
                                            key,
                                            ...chipProps
                                          } = getItemProps({ index });
                                          return (
                                            <Chip
                                              key={key}
                                              {...chipProps}
                                              label={option.label}
                                              size={'small'}
                                            />
                                          );
                                        })}
                                      renderInput={(params) =>
                                        (
                                          <TextField
                                            {...params}
                                            variant={'outlined'}
                                            label={'Shield Elements'}
                                            placeholder={'Search elements…'}
                                            helperText={'The element ids that this shield protects against.'}
                                          />
                                        )}
                                      sx={{ width: '100%' }}
                                    />
                                  </Grid>
                                  <Grid size={12}>
                                    <Autocomplete<IdLabelRow, true, false, false>
                                      multiple
                                      size={'small'}
                                      options={shieldBreakSkillAutocompleteOptions}
                                      getOptionLabel={(o) => o.label}
                                      isOptionEqualToValue={(
                                        a,
                                        b
                                      ) => a.id === b.id}
                                      value={selectedShieldBreakSkills}
                                      onChange={(
                                        _e,
                                        next
                                      ) =>
                                      {
                                        const ids = next.map((o) => o.id);
                                        patchStateJabs({
                                          shieldBreakSkillIds: ids.length === 0
                                            ? ''
                                            : ids.join(', '),
                                        });
                                      }}
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
                                            .includes(q));
                                      }}
                                      renderValue={(
                                        tagValue,
                                        getItemProps
                                      ) =>
                                        tagValue.map((
                                          option,
                                          index
                                        ) =>
                                        {
                                          const {
                                            key,
                                            ...chipProps
                                          } = getItemProps({ index });
                                          return (
                                            <Chip
                                              key={key}
                                              {...chipProps}
                                              label={option.label}
                                              size={'small'}
                                            />
                                          );
                                        })}
                                      renderInput={(params) =>
                                        (
                                          <TextField
                                            {...params}
                                            variant={'outlined'}
                                            label={'On break skills'}
                                            placeholder={'Search skills…'}
                                            helperText={'Skills that will fire upon the breaking of this shield.'}
                                          />
                                        )}
                                      sx={{ width: '100%' }}
                                    />
                                  </Grid>
                                </Grid>
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Cast & cooldown'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
                                  Formulas that affect the cast time and cooldown time of skills executed while the
                                  battler is afflicted with this state.
                                </Typography>
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  Cast time
                                </Typography>
                                <Grid container spacing={2}>
                                  <Grid size={6}>
                                    {renderTimingFrameField('timingBaseCastTime', 'Base')}
                                  </Grid>
                                  <Grid size={6}>
                                    {renderTimingFrameField('timingCastTimeFlat', 'Flat')}
                                  </Grid>
                                  <Grid size={12}>
                                    {renderTimingPercentField(
                                      'timingCastTimePercent',
                                      'Cast scale',
                                      'Percent (formula)',
                                      'Cast time percent modifier'
                                    )}
                                  </Grid>
                                </Grid>
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  Fast cooldown
                                </Typography>
                                <Grid container spacing={2}>
                                  <Grid size={6}>
                                    {renderTimingFrameField('timingBaseFastCooldown', 'Base')}
                                  </Grid>
                                  <Grid size={6}>
                                    {renderTimingFrameField('timingFastCooldownFlat', 'Flat')}
                                  </Grid>
                                  <Grid size={12}>
                                    {renderTimingPercentField(
                                      'timingFastCooldownRate',
                                      'Cooldown scale',
                                      'Rate (formula)',
                                      'Fast cooldown percent modifier'
                                    )}
                                  </Grid>
                                </Grid>
                              </Stack>
                          </BoardSectionCard>

                            <BoardSectionCard title={'Stacking & reapply'} collapsible defaultExpanded={false}>
                              <Stack spacing={2} alignItems={'stretch'}>
                                <Typography variant={'body2'} sx={{ lineHeight: 1.6 }}>
                                  How this state behaves when reapplied while already active—refresh, extend, or
                                  stack—vs
                                  global defaults unless you override below. Times are in frames (~60/s at normal
                                  speed).
                                </Typography>
                                <TextField
                                  select
                                  variant={'outlined'}
                                  label={'Reapply strategy'}
                                  value={selectedState.jabs.stackType ?? ''}
                                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                  {
                                    const v = event.target.value;
                                    patchStateJabs({
                                      stackType: v === ''
                                        ? null
                                        : (v as 'extend' | 'refresh' | 'stack'),
                                    });
                                  }}
                                  size={'small'}
                                  fullWidth
                                >
                                  <MenuItem value={''}>Default (parameters)</MenuItem>
                                  <MenuItem value={'refresh'}>Refresh (restart duration from full)</MenuItem>
                                  <MenuItem value={'extend'}>Extend (add to remaining time)</MenuItem>
                                  <MenuItem value={'stack'}>Stack (build stack count)</MenuItem>
                                </TextField>
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  Refresh
                                </Typography>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  Diminish shaves a few frames off each repeat refresh until the reset window passes,
                                  then counts from zero again.
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Diminish per reapply'}
                                      value={selectedState.jabs.stateRefreshDiminish === null
                                        ? ''
                                        : String(selectedState.jabs.stateRefreshDiminish)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsRefreshDiminish(e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Diminish reset timer'}
                                      value={selectedState.jabs.stateRefreshReset === null
                                        ? ''
                                        : String(selectedState.jabs.stateRefreshReset)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsStackingUnsigned(
                                          'stateRefreshReset',
                                          e.target.value
                                        );
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                </Grid>
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  Extend
                                </Typography>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  Reapply adds duration up to the extend cap.
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Added duration per extend'}
                                      value={selectedState.jabs.stackExtendAmount === null
                                        ? ''
                                        : String(selectedState.jabs.stackExtendAmount)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsStackingUnsigned(
                                          'stackExtendAmount',
                                          e.target.value
                                        );
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Maximum total duration'}
                                      value={selectedState.jabs.stackExtendMax === null
                                        ? ''
                                        : String(selectedState.jabs.stackExtendMax)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsStackingUnsigned(
                                          'stackExtendMax',
                                          e.target.value
                                        );
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                </Grid>
                                <Typography variant={'overline'} sx={{ lineHeight: 1.6 }}>
                                  Stack
                                </Typography>
                                <Typography variant={'body2'} color={'text.secondary'}>
                                  Stack ceiling, stacks gained per application, and whether expiry clears one layer or
                                  the
                                  whole pile.
                                </Typography>
                                <Grid container spacing={2} alignItems={'flex-start'}>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Maximum stacks'}
                                      value={selectedState.jabs.stackMax === null
                                        ? ''
                                        : String(selectedState.jabs.stackMax)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsStackingUnsigned('stackMax', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid size={6}>
                                    <TextField
                                      variant={'outlined'}
                                      label={'Stacks gained per application'}
                                      value={selectedState.jabs.applyStacks === null
                                        ? ''
                                        : String(selectedState.jabs.applyStacks)}
                                      onChange={(e) =>
                                      {
                                        patchStateJabsStackingUnsigned('applyStacks', e.target.value);
                                      }}
                                      size={'small'}
                                      fullWidth
                                    />
                                  </Grid>
                                </Grid>
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={selectedState.jabs.loseAllStacksAtOnce}
                                      onChange={(e) =>
                                      {
                                        patchStateJabs({ loseAllStacksAtOnce: e.target.checked });
                                      }}
                                      size={'small'}
                                    />
                                  )}
                                  label={(
                                    <Box>
                                      <Typography variant={'body2'} component={'span'}>
                                        Lose all stacks when duration ends
                                      </Typography>
                                      <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
                                        Off: one stack per tick-out. On: all stacks removed together.
                                      </Typography>
                                    </Box>
                                  )}
                                />
                              </Stack>
                          </BoardSectionCard>
                        </Stack>
                      </Grid>
                    </Grid>
                  </Stack>
                </Box>

                <Box
                  id={'state-editor-tabpanel-1'}
                  role={'tabpanel'}
                  aria-labelledby={'state-editor-tab-1'}
                  hidden={stateEditorTab !== 1}
                  sx={{
                    display: stateEditorTab === 1
                      ? 'block'
                      : 'none',
                  }}
                >
                  <Stack spacing={2}>
                    <Typography variant={'body2'} color={'text.secondary'}>
                      J-NaturalGrowth-style formulas on this state note. Saving re-merges other structured plugin
                      blocks from the Editor tab.
                    </Typography>
                    <NaturalGrowthQuadrantsEditor
                      note={selectedState.note}
                      onNoteChange={patchStateNaturalGrowthNote}
                    />
                  </Stack>
                </Box>

                <Box
                  id={'state-editor-tabpanel-2'}
                  role={'tabpanel'}
                  aria-labelledby={'state-editor-tab-2'}
                  hidden={stateEditorTab !== 2}
                  sx={{
                    display: stateEditorTab === 2
                      ? 'block'
                      : 'none',
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
                        Full note text as saved. Read-only; edit structured fields on the Editor or Natural growth
                        tab.
                      </Typography>
                      <Button
                        variant={'outlined'}
                        size={'small'}
                        startIcon={<ContentCopy/>}
                        onClick={() =>
                        {
                          // the copy is fire and forget; nothing reports its outcome.
                          navigator.clipboard.writeText(selectedState.note);
                        }}
                      >
                        Copy
                      </Button>
                    </Stack>
                    <TextField
                      multiline
                      fullWidth
                      minRows={24}
                      value={selectedState.note}
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
      </EditorBoardSplitLayout>
    </Box>

    <Snackbar
      open={snackOpen}
      autoHideDuration={2500}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'center',
      }}
      onClose={(
        _,
        reason,
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
  </>;
};

export default StatesBoard;
