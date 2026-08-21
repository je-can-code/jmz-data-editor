import React, { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Divider,
  FormControlLabel,
  Grid,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import {
  type RmmzSkillAnimationOption,
  skillAnimationAutocompleteOptionsForSkill,
  skillAnimationOptionForValue
} from '@core/enums/RmmzSkillAnimation.ts';
import { SkillJabsExtension } from '@core/domain/entities/jabs/SkillJabsExtension.ts';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import { loadMapJson } from '@services/DataService.ts';
import {
  buildActionMapEventRows,
  DEFAULT_JABS_ACTION_MAP_ID,
  readJabsActionMapIdFromPluginsJs
} from '@services/jabs/JabsPluginsReader.ts';
import { SystemService } from '@services/SystemService.ts';
import { useJabs } from '@presentation/context/resources/jabs.context.tsx';
import { JUICE_PROFILE_KEY_PATTERN } from '@core/domain/valueObjects/jabs-config.ts';
import {
  buildJuiceProfileOptions,
  type JuiceProfileOption,
  pickSelectedJuiceProfileOption
} from '@boards/skills/jabsJuiceProfileOptions.ts';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';

const noteFormulaFieldSx = {
  '& .MuiInputBase-input': {
    fontFamily: 'monospace',
    fontSize: 13
  }
};

const HITBOX_SHAPES = [
  'circle',
  'rhombus',
  'square',
  'frontsquare',
  'line',
  'arc',
  'wall',
  'cross',
] as const;

const FORMATIONS = [
  'line',
  'spray',
  'cross',
  'xburst',
  'nova',
] as const;

const MOVE_TYPES = [
  'forward',
  'backward',
  'directional',
] as const;

// J-ABS-Juice canonical motion presets. Plugin still accepts legacy aliases
// (e.g. swing-top-down -> arc) at runtime; we surface only the canonical kebab-case keys here.
const JUICE_MOTIONS = [
  'arc',
  'arc-oscillate',
  'arc-reverse',
  'bash',
  'present',
  'recoil',
  'spin',
  'spin-reverse',
  'stab-forward',
] as const;

type MoveTypePickerRow = {
  value: (typeof MOVE_TYPES)[number] | null;
  label: string;
};

const MOVE_TYPE_PICKER_ROWS: MoveTypePickerRow[] = [
  {
    value: null,
    label: 'None'
  },
  {
    value: 'forward',
    label: 'Forward'
  },
  {
    value: 'backward',
    label: 'Backward'
  },
  {
    value: 'directional',
    label: 'Directional'
  },
];

const JABS_VIS_ANCHOR_DEFAULT = 0.5;

const JABS_VIS_SCALE_DEFAULT = 1;

type VisOffsetRawKey =
  | 'visOffsetRaw'
  | 'visOffsetURaw'
  | 'visOffsetDRaw'
  | 'visOffsetLRaw'
  | 'visOffsetRRaw'
  | 'visOffsetURRaw'
  | 'visOffsetULRaw'
  | 'visOffsetDRRaw'
  | 'visOffsetDLRaw';

function splitBracketPair(raw: string | null): [ string, string ] | null
{
  if (raw === null || raw.trim() === '')
  {
    return null;
  }
  const t = raw.trim();
  const inner = t.startsWith('[') && t.endsWith(']')
    ? t.slice(1, -1)
      .trim()
    : t;
  const comma = inner.indexOf(',');
  if (comma === -1)
  {
    return null;
  }
  const a = inner.slice(0, comma)
    .trim();
  const b = inner.slice(comma + 1)
    .trim();
  if (a === '' || b === '')
  {
    return null;
  }
  return [ a, b ];
}

function parseBracketIntPair(raw: string | null): { x: number; y: number } | null
{
  const p = splitBracketPair(raw);
  if (p === null)
  {
    return null;
  }
  const x = parseInt(p[ 0 ], 10);
  const y = parseInt(p[ 1 ], 10);
  if (Number.isNaN(x) || Number.isNaN(y))
  {
    return null;
  }
  return {
    x,
    y
  };
}

function parseBracketFloatPair(raw: string | null): { x: number; y: number } | null
{
  const p = splitBracketPair(raw);
  if (p === null)
  {
    return null;
  }
  const x = parseFloat(p[ 0 ]);
  const y = parseFloat(p[ 1 ]);
  if (Number.isNaN(x) || Number.isNaN(y))
  {
    return null;
  }
  return {
    x,
    y
  };
}

function formatVisIntBracket(
  x: number,
  y: number
): string
{
  return `[${Math.trunc(x)}, ${Math.trunc(y)}]`;
}

function formatVisFloatBracket(
  x: number,
  y: number
): string
{
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return `[${r(x)}, ${r(y)}]`;
}

function isVisAnchorDefault(
  x: number,
  y: number
): boolean
{
  return (
    Math.abs(x - JABS_VIS_ANCHOR_DEFAULT) < 1e-6
    && Math.abs(y - JABS_VIS_ANCHOR_DEFAULT) < 1e-6
  );
}

function isVisScaleDefault(
  x: number,
  y: number
): boolean
{
  return (
    Math.abs(x - JABS_VIS_SCALE_DEFAULT) < 1e-6
    && Math.abs(y - JABS_VIS_SCALE_DEFAULT) < 1e-6
  );
}

const DIRECTIONAL_VIS_ROWS: { key: VisOffsetRawKey; caption: string }[] = [
  {
    key: 'visOffsetURaw',
    caption: 'Up (↑) — replaces base offset when traveling up.'
  },
  {
    key: 'visOffsetDRaw',
    caption: 'Down (↓)'
  },
  {
    key: 'visOffsetLRaw',
    caption: 'Left (←)'
  },
  {
    key: 'visOffsetRRaw',
    caption: 'Right (→)'
  },
  {
    key: 'visOffsetURRaw',
    caption: 'Up-right (↗)'
  },
  {
    key: 'visOffsetULRaw',
    caption: 'Up-left (↖)'
  },
  {
    key: 'visOffsetDRRaw',
    caption: 'Down-right (↘)'
  },
  {
    key: 'visOffsetDLRaw',
    caption: 'Down-left (↙)'
  },
];

type JabsDelayParsed = {
  frames: number;
  touchable: boolean;
  radius: number | null;
};

function parseDelayDataRaw(raw: string | null): JabsDelayParsed | null
{
  if (raw === null || raw.trim() === '')
  {
    return null;
  }
  const m = raw.trim()
    .match(
      /^\[\s*(-?\d+)\s*,\s*(true|false)\s*(?:,\s*((?:0|[1-9]\d*)(?:\.[0-9]+)?))?\s*\]$/i
    );
  if (m === null)
  {
    return null;
  }
  const frames = parseInt(m[ 1 ], 10);
  if (Number.isNaN(frames))
  {
    return null;
  }
  const touchable = m[ 2 ].toLowerCase() === 'true';
  let radius: number | null = null;
  if (m[ 3 ] !== undefined && m[ 3 ] !== '')
  {
    const r = parseFloat(m[ 3 ]);
    if (Number.isNaN(r) === false)
    {
      radius = r;
    }
  }
  return {
    frames,
    touchable,
    radius
  };
}

function formatDelayDataTag(
  frames: number,
  touchable: boolean,
  radius: number | null
): string
{
  if (radius !== null && Number.isFinite(radius))
  {
    return `[${frames}, ${touchable}, ${radius}]`;
  }
  return `[${frames}, ${touchable}]`;
}

type JabsComboParsed = {
  skillId: number;
  linkFrames: number;
};

function parseComboDataRaw(raw: string | null): JabsComboParsed | null
{
  if (raw === null || raw.trim() === '')
  {
    return null;
  }
  const m = raw.trim()
    .match(/^\[\s*(\d+)\s*,\s*(\d+)\s*\]$/u);
  if (m === null)
  {
    return null;
  }
  const skillId = parseInt(m[ 1 ], 10);
  const linkFrames = parseInt(m[ 2 ], 10);
  if (Number.isNaN(skillId) || Number.isNaN(linkFrames))
  {
    return null;
  }
  return {
    skillId,
    linkFrames
  };
}

function formatComboDataTag(
  skillId: number,
  linkFrames: number
): string
{
  return `[${Math.trunc(skillId)}, ${Math.trunc(linkFrames)}]`;
}

function clampComboLinkFrames(
  linkFrames: number,
  cooldown: number | null
): number
{
  if (cooldown === null || cooldown <= 0)
  {
    return linkFrames;
  }
  const maxLink = cooldown - 1;
  if (linkFrames > maxLink)
  {
    return Math.max(0, maxLink);
  }
  return linkFrames;
}

type ActionIdPickerRow = {
  id: number | null;
  label: string;
};

type JabsSkillPickerRow = {
  id: number;
  label: string;
};

type SkillJabsExtensionsPanelProps = {
  projectRoot: string;
  rmmzDataPath: string;
  systemDataGeneration: number;
  projectReloadGeneration: number;
  jabs: SkillJabsExtension;
  onJabsChange: (next: SkillJabsExtension) => void;
  skillPickerOptions: JabsSkillPickerRow[];
  editingSkillId: number | null;
  contextSkillAnimationId: number | null;
};

type JabsPatch = Partial<SkillJabsExtension>;

type SkillJabsNumericFieldOpts = {
  disabled?: boolean;
  helperText?: string;
};


function SkillJabsExtensionsPanel(
  {
    projectRoot,
    rmmzDataPath,
    systemDataGeneration,
    projectReloadGeneration,
    jabs,
    onJabsChange,
    skillPickerOptions,
    editingSkillId,
    contextSkillAnimationId,
  }: SkillJabsExtensionsPanelProps
)
{
  const patch = (p: JabsPatch): void =>
  {
    onJabsChange(jabs.clone(p));
  };

  const patchVisIntPair = (
    key: VisOffsetRawKey,
    xInput: string,
    yInput: string
  ): void =>
  {
    const xe = xInput.trim() === '';
    const ye = yInput.trim() === '';
    if (xe && ye)
    {
      patch({ [ key ]: null } as JabsPatch);
      return;
    }
    const x = xe
      ? 0
      : parseInt(xInput, 10);
    const y = ye
      ? 0
      : parseInt(yInput, 10);
    if (Number.isNaN(x) || Number.isNaN(y))
    {
      return;
    }
    if (x === 0 && y === 0)
    {
      patch({ [ key ]: null } as JabsPatch);
      return;
    }
    patch({ [ key ]: formatVisIntBracket(x, y) } as JabsPatch);
  };

  const patchVisAnchorPair = (
    nx: number,
    ny: number
  ): void =>
  {
    if (isVisAnchorDefault(nx, ny))
    {
      patch({ visAnchorRaw: null });
      return;
    }
    patch({ visAnchorRaw: formatVisFloatBracket(nx, ny) });
  };

  const patchVisScalePair = (
    nx: number,
    ny: number
  ): void =>
  {
    if (isVisScaleDefault(nx, ny))
    {
      patch({ visScaleRaw: null });
      return;
    }
    patch({ visScaleRaw: formatVisFloatBracket(nx, ny) });
  };

  const patchDelayFromFields = (
    framesStr: string,
    touchable: boolean,
    radiusStr: string
  ): void =>
  {
    const ft = framesStr.trim();
    if (ft === '')
    {
      patch({ delayRaw: null });
      return;
    }
    const frames = parseInt(ft, 10);
    if (Number.isNaN(frames))
    {
      return;
    }
    const rt = radiusStr.trim();
    if (rt === '')
    {
      patch({ delayRaw: formatDelayDataTag(frames, touchable, null) });
      return;
    }
    const radius = parseFloat(rt);
    if (Number.isNaN(radius))
    {
      return;
    }
    patch({ delayRaw: formatDelayDataTag(frames, touchable, radius) });
  };

  const patchComboFromFields = (
    skillId: number | null,
    linkStr: string
  ): void =>
  {
    if (skillId === null)
    {
      patch({ comboRaw: null });
      return;
    }
    const lt = linkStr.trim();
    let linkFrames = 0;
    if (lt !== '')
    {
      linkFrames = parseInt(lt, 10);
      if (Number.isNaN(linkFrames) || linkFrames < 0)
      {
        return;
      }
    }
    linkFrames = clampComboLinkFrames(linkFrames, jabs.cooldown);
    patch({ comboRaw: formatComboDataTag(skillId, linkFrames) });
  };

  const [ pluginActionMapId, setPluginActionMapId ] = useState<number>(DEFAULT_JABS_ACTION_MAP_ID);
  const [ mapIdOverride, setMapIdOverride ] = useState<string>('');
  const [ mapError, setMapError ] = useState<string | null>(null);
  const [ eventRows, setEventRows ] = useState<{ id: number; label: string }[]>([]);

  // Remember the last icon picked while the juice icon override was active so toggling the switch off-then-on
  // restores the previous index instead of snapping back to zero.
  const [ juiceIconPickerIndex, setJuiceIconPickerIndex ] = useState<number>(
    jabs.juiceIconIndex !== null && jabs.juiceIconIndex >= 0
      ? jabs.juiceIconIndex
      : 0
  );

  useEffect(() =>
  {
    // when switching to a new skill, prime the local picker state from whatever override the new skill carries.
    if (jabs.juiceIconIndex !== null && jabs.juiceIconIndex >= 0)
    {
      setJuiceIconPickerIndex(jabs.juiceIconIndex);
    }
  }, [ jabs.juiceIconIndex ]);

  // pull the authored juice profiles map from config.jabs.json so the profile-key dropdown stays in sync
  // with the JABS config board. profiles are loaded once at app start by useJabs() and only change when
  // the config board saves, which is rare during a skill-editing session. the option-construction
  // logic lives in jabsJuiceProfileOptions.ts so it can be unit tested without mounting the panel.
  const { jabsConfig } = useJabs();
  const juiceProfileOptions = useMemo<JuiceProfileOption[]>(
    () => buildJuiceProfileOptions(jabsConfig?.juice?.profiles ?? null, jabs.juiceWeaponStyle),
    [ jabsConfig, jabs.juiceWeaponStyle ]
  );

  const selectedJuiceProfileOption = useMemo<JuiceProfileOption>(
    () => pickSelectedJuiceProfileOption(juiceProfileOptions, jabs.juiceWeaponStyle),
    [ juiceProfileOptions, jabs.juiceWeaponStyle ]
  );

  const resolvedMapId = useMemo(() =>
  {
    const o = parseInt(mapIdOverride, 10);
    if (mapIdOverride.trim() !== '' && !Number.isNaN(o) && o > 0)
    {
      return o;
    }
    return pluginActionMapId;
  }, [ mapIdOverride, pluginActionMapId ]);

  useEffect(() =>
  {
    let cancelled = false;

    const loadPluginActionMapId = async () =>
    {
      const id = await readJabsActionMapIdFromPluginsJs(projectRoot);
      if (cancelled === false)
      {
        setPluginActionMapId(id);
      }
    };

    // An effect body cannot be async, so the read is started and not awaited.
    loadPluginActionMapId();

    return () =>
    {
      cancelled = true;
    };
  }, [ projectRoot, systemDataGeneration, projectReloadGeneration ]);

  useEffect(() =>
  {
    let cancelled = false;

    const loadActionMapEvents = async () =>
    {
      if (rmmzDataPath.trim() === '')
      {
        setEventRows([]);
        setMapError('Project data path is not set.');
        return;
      }

      setMapError(null);
      try
      {
        const map = await loadMapJson(rmmzDataPath, resolvedMapId);
        if (cancelled)
        {
          return;
        }
        setEventRows(buildActionMapEventRows(map));
      }
      catch (e)
      {
        if (cancelled === false)
        {
          setEventRows([]);
          setMapError(
            `Could not load Map${String(resolvedMapId)
              .padStart(3, '0')}.json (${String(e)})`
          );
        }
      }
    };

    // An effect body cannot be async, so the load is started and not awaited.
    loadActionMapEvents();

    return () =>
    {
      cancelled = true;
    };
  }, [
    rmmzDataPath,
    resolvedMapId,
    systemDataGeneration,
    projectReloadGeneration,
  ]);

  const pickerOptions = useMemo((): ActionIdPickerRow[] =>
  {
    const head: ActionIdPickerRow[] = [
      {
        id: null,
        label: 'Default (no tag; JABS uses event id 1)',
      },
    ];
    const fromMap = eventRows.map((r) => ({
      id: r.id,
      label: r.label,
    }));
    const ids = new Set(fromMap.map((r) => r.id));
    const orphan: ActionIdPickerRow[] = [];
    if (jabs.actionId !== null && ids.has(jabs.actionId) === false)
    {
      orphan.push({
        id: jabs.actionId,
        label: `${jabs.actionId}: (not on this map)`,
      });
    }
    return head.concat(orphan, fromMap);
  }, [ eventRows, jabs.actionId ]);

  const selectedPickerOption = useMemo((): ActionIdPickerRow | null =>
  {
    return pickerOptions.find((o) => o.id === jabs.actionId) ?? pickerOptions[ 0 ] ?? null;
  }, [ jabs.actionId, pickerOptions ]);

  const castAnimationBaseOptions = useMemo(
    () => SystemService.skillAnimationAutocompleteOptions.filter((o) => o.value >= 0),
    [ systemDataGeneration ]
  );

  const castAnimationOptions = useMemo(() =>
  {
    if (jabs.castAnimation === null)
    {
      return castAnimationBaseOptions;
    }
    return skillAnimationAutocompleteOptionsForSkill(jabs.castAnimation, castAnimationBaseOptions);
  }, [ castAnimationBaseOptions, jabs.castAnimation ]);

  const comboParsed = useMemo(
    () => parseComboDataRaw(jabs.comboRaw),
    [ jabs.comboRaw ]
  );
  const comboNoteInvalid =
    jabs.comboRaw !== null
    && jabs.comboRaw.trim() !== ''
    && comboParsed === null;
  const comboLinkPastCooldown =
    comboParsed !== null
    && jabs.cooldown !== null
    && jabs.cooldown > 0
    && comboParsed.linkFrames >= jabs.cooldown;

  const comboSkillOptions = useMemo((): JabsSkillPickerRow[] =>
  {
    const filtered = skillPickerOptions.filter(
      (o) => editingSkillId === null || o.id !== editingSkillId
    );
    if (comboParsed === null)
    {
      return filtered;
    }
    if (filtered.some((o) => o.id === comboParsed.skillId))
    {
      return filtered;
    }
    const label =
      comboParsed.skillId === editingSkillId
        ? `${comboParsed.skillId}: (this skill — unusual)`
        : `${comboParsed.skillId}: (not in skill list)`;
    return [
      {
        id: comboParsed.skillId,
        label
      }, ...filtered
    ];
  }, [ comboParsed, editingSkillId, skillPickerOptions ]);

  const selectedComboSkillOption = useMemo((): JabsSkillPickerRow | null =>
  {
    if (comboParsed === null)
    {
      return null;
    }
    return comboSkillOptions.find((o) => o.id === comboParsed.skillId) ?? null;
  }, [ comboParsed, comboSkillOptions ]);

  const upgradeOverSkillOptions = useMemo((): JabsSkillPickerRow[] =>
  {
    const id = jabs.upgradeOverSkillId;
    if (id === null)
    {
      return skillPickerOptions;
    }
    if (skillPickerOptions.some((o) => o.id === id))
    {
      return skillPickerOptions;
    }
    return [
      {
        id,
        label: `${id}: (not in skill list)`
      }, ...skillPickerOptions
    ];
  }, [ jabs.upgradeOverSkillId, skillPickerOptions ]);

  const selectedUpgradeOverSkillOption = useMemo((): JabsSkillPickerRow | null =>
  {
    if (jabs.upgradeOverSkillId === null)
    {
      return null;
    }
    return upgradeOverSkillOptions.find((o) => o.id === jabs.upgradeOverSkillId) ?? null;
  }, [ jabs.upgradeOverSkillId, upgradeOverSkillOptions ]);

  const counterParrySkillOptions = useMemo((): JabsSkillPickerRow[] =>
  {
    const id = jabs.counterParrySkillId;
    if (id === null)
    {
      return skillPickerOptions;
    }
    if (skillPickerOptions.some((o) => o.id === id))
    {
      return skillPickerOptions;
    }
    return [
      {
        id,
        label: `${id}: (not in skill list)`
      }, ...skillPickerOptions
    ];
  }, [ jabs.counterParrySkillId, skillPickerOptions ]);

  const selectedCounterParrySkillOption = useMemo((): JabsSkillPickerRow | null =>
  {
    if (jabs.counterParrySkillId === null)
    {
      return null;
    }
    return counterParrySkillOptions.find((o) => o.id === jabs.counterParrySkillId) ?? null;
  }, [ counterParrySkillOptions, jabs.counterParrySkillId ]);

  const counterGuardSkillOptions = useMemo((): JabsSkillPickerRow[] =>
  {
    const id = jabs.counterGuardSkillId;
    if (id === null)
    {
      return skillPickerOptions;
    }
    if (skillPickerOptions.some((o) => o.id === id))
    {
      return skillPickerOptions;
    }
    return [
      {
        id,
        label: `${id}: (not in skill list)`
      }, ...skillPickerOptions
    ];
  }, [ jabs.counterGuardSkillId, skillPickerOptions ]);

  const selectedCounterGuardSkillOption = useMemo((): JabsSkillPickerRow | null =>
  {
    if (jabs.counterGuardSkillId === null)
    {
      return null;
    }
    return counterGuardSkillOptions.find((o) => o.id === jabs.counterGuardSkillId) ?? null;
  }, [ counterGuardSkillOptions, jabs.counterGuardSkillId ]);

  const selfAnimationOptions = useMemo(() =>
  {
    if (jabs.selfAnimationId === null)
    {
      return castAnimationBaseOptions;
    }
    return skillAnimationAutocompleteOptionsForSkill(jabs.selfAnimationId, castAnimationBaseOptions);
  }, [ castAnimationBaseOptions, jabs.selfAnimationId ]);

  const onCastSkillAnimationOptions = useMemo(() =>
  {
    if (jabs.onCastAnimationId === null)
    {
      return castAnimationBaseOptions;
    }
    return skillAnimationAutocompleteOptionsForSkill(jabs.onCastAnimationId, castAnimationBaseOptions);
  }, [ castAnimationBaseOptions, jabs.onCastAnimationId ]);

  const onCastTimeChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
  {
    const t = e.target.value.trim();
    if (t === '')
    {
      patch({ castTime: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    const nextPatch: JabsPatch = { castTime: n };
    if (jabs.castPreviewWarnAt !== null && jabs.castPreviewWarnAt > n)
    {
      nextPatch.castPreviewWarnAt = n;
    }
    patch(nextPatch);
  };

  const onCastPreviewWarnAtChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
  {
    const t = e.target.value.trim();
    if (t === '')
    {
      patch({ castPreviewWarnAt: null });
      return;
    }
    let n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    if (jabs.castTime !== null && n > jabs.castTime)
    {
      n = jabs.castTime;
    }
    patch({ castPreviewWarnAt: n });
  };

  const onCooldownChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
  {
    const t = e.target.value.trim();
    if (t === '')
    {
      patch({ cooldown: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    const comb = parseComboDataRaw(jabs.comboRaw);
    const nextPatch: JabsPatch = { cooldown: n };
    if (comb !== null && n > 0 && comb.linkFrames >= n)
    {
      nextPatch.comboRaw = formatComboDataTag(comb.skillId, n - 1);
    }
    patch(nextPatch);
  };

  const onGlobalCooldownOverrideChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void =>
  {
    const t = e.target.value.trim();
    if (t === '')
    {
      patch({ globalCooldownOverride: null });
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    if (n < 1)
    {
      patch({ globalCooldownOverride: null });
      return;
    }
    patch({ globalCooldownOverride: n });
  };

  const onNullableInt = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    key: keyof SkillJabsExtension
  ) =>
  {
    const t = e.target.value.trim();
    if (t === '')
    {
      patch({ [ key ]: null } as JabsPatch);
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n))
    {
      return;
    }
    patch({ [ key ]: n } as JabsPatch);
  };

  const onNullableFloat = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    key: keyof SkillJabsExtension
  ) =>
  {
    const t = e.target.value.trim();
    if (t === '')
    {
      patch({ [ key ]: null } as JabsPatch);
      return;
    }
    const n = parseFloat(t);
    if (Number.isNaN(n))
    {
      return;
    }
    patch({ [ key ]: n } as JabsPatch);
  };

  const rawField = (
    label: string,
    value: string | null,
    key: keyof SkillJabsExtension
  ) =>
    (
      <TextField
        label={label}
        size={'small'}
        fullWidth
        value={value ?? ''}
        onChange={(e) =>
        {
          const t = e.target.value.trim();
          patch({
            [ key ]: t === ''
              ? null
              : t
          } as JabsPatch);
        }}
        sx={noteFormulaFieldSx}
      />
    );

  const intField = (
    label: string,
    value: number | null,
    key: keyof SkillJabsExtension,
    opts?: SkillJabsNumericFieldOpts
  ) =>
    (
      <TextField
        label={label}
        size={'small'}
        fullWidth
        disabled={opts?.disabled === true}
        helperText={opts?.helperText}
        value={value === null
          ? ''
          : String(value)}
        onChange={(e) =>
        {
          onNullableInt(e, key);
        }}
      />
    );

  const floatField = (
    label: string,
    value: number | null,
    key: keyof SkillJabsExtension,
    opts?: SkillJabsNumericFieldOpts
  ) =>
    (
      <TextField
        label={label}
        size={'small'}
        fullWidth
        disabled={opts?.disabled === true}
        helperText={opts?.helperText}
        value={value === null
          ? ''
          : String(value)}
        onChange={(e) =>
        {
          onNullableFloat(e, key);
        }}
      />
    );

  const boolSwitch = (
    label: string,
    checked: boolean,
    key: keyof SkillJabsExtension,
    disabled: boolean = false
  ) =>
    (
      <FormControlLabel
        disabled={disabled}
        control={
          <Switch
            size={'small'}
            checked={checked}
            disabled={disabled}
            onChange={(e) =>
            {
              patch({ [ key ]: e.target.checked } as JabsPatch);
            }}
          />
        }
        label={label}
      />
    );

  const visBaseOff = parseBracketIntPair(jabs.visOffsetRaw);
  const visAnchorF = parseBracketFloatPair(jabs.visAnchorRaw);
  const visAnchorX = visAnchorF?.x ?? JABS_VIS_ANCHOR_DEFAULT;
  const visAnchorY = visAnchorF?.y ?? JABS_VIS_ANCHOR_DEFAULT;
  const visScaleF = parseBracketFloatPair(jabs.visScaleRaw);
  const visScaleX = visScaleF?.x ?? JABS_VIS_SCALE_DEFAULT;
  const visScaleY = visScaleF?.y ?? JABS_VIS_SCALE_DEFAULT;

  const delayParsed = useMemo(
    () => parseDelayDataRaw(jabs.delayRaw),
    [ jabs.delayRaw ]
  );
  const delayNoteInvalid =
    jabs.delayRaw !== null
    && jabs.delayRaw.trim() !== ''
    && delayParsed === null;

  // the radius half of the delay tag, as the field wants it. An unparsed tag and a tag carrying no
  // radius both read as empty, since neither gives the field anything to show.
  let delayRadiusText = '';
  if (delayParsed !== null && delayParsed.radius !== null)
  {
    delayRadiusText = String(delayParsed.radius);
  }

  // the preview warning only means something once there is a cast to preview, so the helper explains
  // which prerequisite is missing before it explains what the field does.
  let castPreviewWarnHelperText =
    `Must be ≤ cast time (${jabs.castTime} frames). Example: 30 = show telegraph for the last half-second of a 60-frame cast.`;
  if (jabs.castTime === null)
  {
    castPreviewWarnHelperText = 'Set cast time to configure preview timing.';
  }
  else if (jabs.noCastPreview)
  {
    castPreviewWarnHelperText = 'Unavailable while preview is disabled.';
  }

  // the iframe window has prerequisites, and each field names the nearest one still unmet rather than
  // sitting disabled without saying why. The end frame has one more of them than the start frame does.
  let iframesStartHelperText: string | undefined = undefined;
  if (jabs.moveType === null)
  {
    iframesStartHelperText = 'Pick a move type first.';
  }
  else if (jabs.invincibleDodge === true)
  {
    iframesStartHelperText = 'Turn off invincible dodge to edit.';
  }

  let iframesEndHelperText = iframesStartHelperText;
  if (iframesEndHelperText === undefined && jabs.iframesStartFrame === null)
  {
    iframesEndHelperText = 'Set start frame first.';
  }

  // the profile field explains the state it is in: pointing at a row that no longer exists, deliberately
  // left to the plugin, or naming a real profile -- in which case the only thing left to say is the
  // charset a new key has to satisfy.
  let juiceProfileHelperText =
    `Charset is ${JUICE_PROFILE_KEY_PATTERN.source} — author additional profiles on the JABS config board.`;
  if (selectedJuiceProfileOption.isOrphan)
  {
    juiceProfileHelperText =
      'This skill references a profile that does not exist on the JABS config board; add the row or pick "None" to clear.';
  }
  else if (selectedJuiceProfileOption.value === null)
  {
    juiceProfileHelperText =
      'Plugin will resolve a profile from the caster\'s equipped weapon / armor at runtime.';
  }

  // only two hitbox shapes read a degrees value, and they read it differently enough to say so.
  let degreesHelperText = 'Only arc and circle read this field.';
  if (jabs.hitboxShape === 'arc')
  {
    degreesHelperText = 'Wedge opening angle; also shapes the cast-preview sector.';
  }
  else if (jabs.hitboxShape === 'circle')
  {
    degreesHelperText = 'Circle hitbox is a full 360° ring in JABS — pick arc if you want a partial wedge.';
  }

  /**
   * A counter skill and the chance it fires. Parry and guard offer the same pair of controls over
   * different fields, so they share one renderer.
   *
   * The chance only means something once a skill is picked, so the slider stays disabled until then
   * and the caption above it says so rather than showing a percentage for nothing. A stored chance of
   * nothing is written as 100%, which is what the caption reports.
   *
   * @param trigger What the counter reacts to, as the labels name it.
   * @param options The skills selectable as this counter.
   * @param selectedOption The currently selected row, or null.
   * @param skillId The stored skill id, or null when no counter is set.
   * @param chance The stored proc chance, or null to mean 100.
   * @param skillIdKey The extension field holding the skill id.
   * @param chanceKey The extension field holding the chance.
   * @param pickerHelperText What the picker says about when this counter fires.
   */
  const renderCounterControls = (
    trigger: 'parry' | 'guard',
    options: JabsSkillPickerRow[],
    selectedOption: JabsSkillPickerRow | null,
    skillId: number | null,
    chance: number | null,
    skillIdKey: 'counterParrySkillId' | 'counterGuardSkillId',
    chanceKey: 'counterParryChance' | 'counterGuardChance',
    pickerHelperText: string
  ) =>
  {
    const hasNoCounterSkill = skillId === null;
    const effectiveChance = Math.min(100, Math.max(1, Math.round(chance ?? 100)));
    const chanceCaption = hasNoCounterSkill
      ? `Pick a counter-${trigger} skill to set chance.`
      : `Counter-${trigger} chance (${effectiveChance}%). Empty stored chance saves as 100%.`;

    return (
      <>
        <Grid size={12}>
          <Autocomplete<JabsSkillPickerRow, false, false, false>
            fullWidth
            size={'small'}
            options={options}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(
              a,
              b
            ) => a.id === b.id}
            value={selectedOption}
            onChange={(
              _e,
              option
            ) =>
            {
              if (option === null)
              {
                patch({
                  [ skillIdKey ]: null,
                  [ chanceKey ]: null
                });
                return;
              }
              patch({ [ skillIdKey ]: option.id });
            }}
            filterOptions={(
              opts,
              state
            ) =>
            {
              const q = state.inputValue.trim()
                .toLowerCase();
              if (q === '')
              {
                return opts;
              }
              return opts.filter((o) =>
                o.label.toLowerCase()
                  .includes(q)
                || String(o.id)
                  .includes(q));
            }}
            renderInput={(params) =>
              (
                <TextField
                  {...params}
                  variant={'outlined'}
                  label={`Counter-${trigger} skill`}
                  placeholder={'None…'}
                  helperText={pickerHelperText}
                />
              )}
          />
        </Grid>
        <Grid size={12}>
          <Stack spacing={0.75}>
            <Typography variant={'caption'} color={'text.secondary'}>
              {chanceCaption}
            </Typography>
            <Slider
              disabled={hasNoCounterSkill}
              min={1}
              max={100}
              step={1}
              value={effectiveChance}
              valueLabelDisplay={'auto'}
              valueLabelFormat={(v) => `${v}%`}
              onChange={(
                _e,
                v
              ) =>
              {
                const n = Array.isArray(v)
                  ? v[ 0 ]
                  : v;
                patch({ [ chanceKey ]: n });
              }}
            />
          </Stack>
        </Grid>
      </>
    );
  };

  /**
   * Damage reduction while guarding, and the skills a successful parry or block can fire back.
   */
  const renderGuardingSection = () =>
  {
    return (
      <BoardSectionCard title={'Guarding & counters'} collapsible defaultExpanded={false}>
        <Stack spacing={2}>
          <Typography variant={'caption'} color={'text.secondary'}>
            Guard uses flat and percent reduction in
            {' '}
            <Typography component={'span'} variant={'caption'} sx={{ fontFamily: 'monospace' }}>
              {'<guard:[FLAT, PERCENT]>'}
            </Typography>
            . Counter skills use a 1–100% proc chance.
          </Typography>
          <Grid container spacing={2}>
            <Grid size={6}>
              {intField(
                'Guard flat reduction',
                jabs.guardFlat,
                'guardFlat',
                {
                  helperText: 'Omit both flat and percent to remove the guard tag (0,0 is explicit).',
                }
              )}
            </Grid>
            <Grid size={6}>
              {intField('Guard percent reduction', jabs.guardPercent, 'guardPercent')}
            </Grid>
            <Grid size={12}>{intField('Parry', jabs.parry, 'parry')}</Grid>
            {renderCounterControls(
              'parry',
              counterParrySkillOptions,
              selectedCounterParrySkillOption,
              jabs.counterParrySkillId,
              jabs.counterParryChance,
              'counterParrySkillId',
              'counterParryChance',
              'Skill fired when a parry succeeds (optional).'
            )}
            {renderCounterControls(
              'guard',
              counterGuardSkillOptions,
              selectedCounterGuardSkillOption,
              jabs.counterGuardSkillId,
              jabs.counterGuardChance,
              'counterGuardSkillId',
              'counterGuardChance',
              'Skill fired when a guard blocks (optional).'
            )}
          </Grid>
        </Stack>
      </BoardSectionCard>
    );
  };

  /**
   * What happens once the skill resolves: how long the slot is locked, and what it can chain into.
   *
   * The combo window is bounded by the cooldown -- JABS never opens a follow-up that outlives the
   * lockout -- so the link field validates against the cooldown above it and says what the ceiling is.
   * A combo tag that does not parse falls back to editing the raw tag, since the two pickers cannot
   * represent something they could not read.
   */
  const renderPostExecutionSection = () =>
  {
    const hasExplicitCooldown = jabs.cooldown !== null && jabs.cooldown > 0;
    const maxUsableLinkFrames = hasExplicitCooldown
      ? (jabs.cooldown as number) - 1
      : undefined;
    const linkFramesHelperText = hasExplicitCooldown
      ? `Must stay below cooldown (${jabs.cooldown} frames); max usable link is ${maxUsableLinkFrames}.`
      : 'Set an explicit cooldown above to validate against JABS (link must be shorter than cooldown).';
    const comboRawIsBlank = jabs.comboRaw === null || jabs.comboRaw.trim() === '';

    return (
      <BoardSectionCard title={'Post-execution (cooldown & combos)'} collapsible defaultExpanded={false}>
        <Stack spacing={2}>
          <Typography variant={'caption'} color={'text.secondary'}>
            After the skill executes, JABS blocks it again until the cooldown elapses (same frame clock as cast time).
            This is separate from MP/TP costs — it is the JABS “you just used this” gate on the skill slot(s). Combo
            link
            timing is validated against this cooldown: the follow-up window must finish before the cooldown does, or
            the
            chain never becomes reachable in-game. Global cooldown (GCD) is a separate battler-wide timer when enabled
            in
            JABS plugin parameters and for whitelisted skill types; oGCD and per-skill GCD length apply only in that
            system.
          </Typography>
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField
                label={'Cooldown (frames)'}
                size={'small'}
                fullWidth
                value={jabs.cooldown === null
                  ? ''
                  : String(jabs.cooldown)}
                onChange={onCooldownChange}
                helperText={'Empty uses the JABS default. Higher = longer lockout. Lowering cooldown may auto-reduce combo link frames to stay valid.'}
                slotProps={{
                  htmlInput: {
                    inputMode: 'numeric',
                    min: 0,
                    step: 1
                  }
                }}
              />
            </Grid>
            <Grid size={6}>
              <Stack spacing={0.5}>
                {boolSwitch(
                  'Per-slot cooldown (unique)',
                  jabs.uniqueCooldown,
                  'uniqueCooldown'
                )}
                <Typography variant={'caption'} color={'text.secondary'}>
                  On: only the slot you fired goes on cooldown. Off: every quick-slot that holds this same skill id
                  shares one cooldown (fire from one key, they all wait).
                </Typography>
              </Stack>
            </Grid>
            <Grid size={6}>
              <TextField
                label={'GCD length override (frames)'}
                size={'small'}
                fullWidth
                value={jabs.globalCooldownOverride === null
                  ? ''
                  : String(jabs.globalCooldownOverride)}
                onChange={onGlobalCooldownOverrideChange}
                helperText={'Empty uses the JABS default GCD length when this skill is subject to GCD. Enter a positive number to override.'}
                slotProps={{
                  htmlInput: {
                    inputMode: 'numeric',
                    min: 1,
                    step: 1
                  }
                }}
              />
            </Grid>
            <Grid size={6}>
              <Stack spacing={0.5}>
                {boolSwitch('oGCD (off-global cooldown)', jabs.ogcd, 'ogcd')}
                <Typography variant={'caption'} color={'text.secondary'}>
                  On: this skill does not start or respect the battler-wide GCD (when GCD is enabled and the skill
                  type is
                  whitelisted).
                </Typography>
              </Stack>
            </Grid>
          </Grid>

          <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
            Combo chain
          </Typography>
          <Typography variant={'caption'} color={'text.secondary'}>
            After this skill resolves, the battler may chain into the follow-up skill after the link window (frames)
            has
            passed — but only if this skill’s cooldown is longer than that link time (JABS requirement). Each step in
            a
            chain can extend remaining cooldown by its own link time. By default the follow-up only opens if this
            skill
            hit something; use free combo below to open the window on whiff.
          </Typography>
          {comboLinkPastCooldown && (
            <Alert severity={'warning'}>
              Link frames are not shorter than this skill’s cooldown. In-game the combo window will never open —
              raise cooldown or lower link frames.
            </Alert>
          )}
          {comboNoteInvalid
            ? (
              <>
                <Alert severity={'warning'}>
                  This note does not match the expected combo shape
                  {' '}
                  <Typography component={'span'} variant={'body2'} sx={{ fontFamily: 'monospace' }}>
                    [followUpSkillId, linkFrames]
                  </Typography>
                  . Edit the raw tag or clear it.
                </Alert>
                {rawField('Combo tag (raw)', jabs.comboRaw, 'comboRaw')}
              </>
            )
            : (
              <Grid container spacing={2}>
                <Grid size={6}>
                  <Autocomplete<JabsSkillPickerRow, false, false, false>
                    fullWidth
                    size={'small'}
                    options={comboSkillOptions}
                    getOptionLabel={(o) => o.label}
                    isOptionEqualToValue={(
                      a,
                      b
                    ) => a.id === b.id}
                    value={selectedComboSkillOption}
                    onChange={(
                      _e,
                      option
                    ) =>
                    {
                      const link =
                        comboParsed === null
                          ? ''
                          : String(comboParsed.linkFrames);
                      if (option === null)
                      {
                        patchComboFromFields(null, link);
                        return;
                      }
                      patchComboFromFields(option.id, link);
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
                        || String(o.id)
                          .includes(q));
                    }}
                    renderInput={(params) =>
                      (
                        <TextField
                          {...params}
                          variant={'outlined'}
                          label={'Follow-up skill'}
                          placeholder={'No combo…'}
                          helperText={'Skill id that can replace this one on the same slot after the link elapses. Clear to remove the combo tag.'}
                        />
                      )}
                  />
                </Grid>
                <Grid size={6}>
                  <TextField
                    label={'Link frames (until follow-up is available)'}
                    size={'small'}
                    fullWidth
                    disabled={comboParsed === null && comboRawIsBlank}
                    value={comboParsed === null
                      ? ''
                      : String(comboParsed.linkFrames)}
                    onChange={(e) =>
                    {
                      const sid =
                        comboParsed === null
                          ? null
                          : comboParsed.skillId;
                      patchComboFromFields(sid, e.target.value);
                    }}
                    helperText={linkFramesHelperText}
                    slotProps={{
                      htmlInput: {
                        inputMode: 'numeric',
                        min: 0,
                        max: maxUsableLinkFrames,
                        step: 1,
                      },
                    }}
                  />
                </Grid>
              </Grid>
            )}
          <Stack direction={'row'} spacing={2} flexWrap={'wrap'}>
            {boolSwitch(
              'Combo starter (AI may open this chain)',
              jabs.comboStarter,
              'comboStarter'
            )}
            {boolSwitch(
              'Free combo (open window even on miss)',
              jabs.freeCombo,
              'freeCombo'
            )}
            {boolSwitch(
              'Exclude from random AI skill pick',
              jabs.aiSkillExclusion,
              'aiSkillExclusion'
            )}
          </Stack>
          <Typography variant={'caption'} color={'text.secondary'}>
            AI normally skips tagged combo skills unless combo starter is set. Use exclusion on enders that should
            only be
            reachable through the chain, not pulled at random.
          </Typography>
        </Stack>
      </BoardSectionCard>
    );
  };

  /**
   * Which action-map event this skill copies onto the battlefield, and whether it shows in the menu.
   *
   * A skill's hitbox, visuals and movement are authored as an event on a dedicated action map rather
   * than derived from the skill row, so this section is what ties the two together.
   */
  const renderActionMapSection = () =>
  {
    const overrodeMapId = mapIdOverride.trim() !== '';
    const activeMapNote = overrodeMapId
      ? '; you overrode it above'
      : '';

    return (
      <BoardSectionCard title={'Action map & menu'} collapsible defaultExpanded={false}>
        <Stack spacing={2}>
          <Typography variant={'caption'} color={'text.secondary'}>
            JABS does not build map actions from the skill database alone. Each skill points at an event on a
            dedicated
            {' '}
            <Typography component={'span'} variant={'caption'} sx={{ fontStyle: 'italic' }}>
              action map
            </Typography>
            {' '}
            — that event is the template copied onto the battlefield when the skill fires. Pick which template here;
            use
            the map override only if you are testing a different action map than the plugin default.
          </Typography>
          {mapError !== null && (
            <Alert severity={'warning'}>
              {mapError}
            </Alert>
          )}
          <Typography variant={'caption'} color={'text.secondary'}>
            {`Active action map: #${resolvedMapId} (plugin default is #${pluginActionMapId}${activeMapNote}).`}
          </Typography>
          <TextField
            id={'jabs-action-map-override'}
            variant={'outlined'}
            size={'small'}
            fullWidth
            label={'Action map id override'}
            placeholder={String(pluginActionMapId)}
            value={mapIdOverride}
            onChange={(e) =>
            {
              setMapIdOverride(e.target.value);
            }}
            helperText={'Leave empty to use the map id from JABS plugin parameters. Set only when this skill should pull templates from another map.'}
            slotProps={{
              htmlInput: {
                inputMode: 'numeric',
                min: 1,
                step: 1
              },
            }}
          />
          <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
            Which event is this skill?
          </Typography>
          <Typography variant={'caption'} color={'text.secondary'}>
            Event id on the action map — same id you see in the editor’s event list. This is the skill’s hitbox,
            visuals,
            and movement as authored on that map.
          </Typography>
          <Autocomplete<ActionIdPickerRow, false, false, false>
            fullWidth
            size={'small'}
            options={pickerOptions}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(
              a,
              b
            ) => a.id === b.id}
            value={selectedPickerOption}
            onChange={(
              _e,
              option
            ) =>
            {
              if (option === null)
              {
                patch({ actionId: null });
                return;
              }
              patch({ actionId: option.id });
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
                || (o.id !== null && String(o.id)
                  .includes(q)));
            }}
            renderInput={(params) =>
              (
                <TextField
                  {...params}
                  variant={'outlined'}
                  label={'Action template (map event id)'}
                  placeholder={'Search by id or name…'}
                />
              )}
          />
          <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
            Skill menu
          </Typography>
          {boolSwitch(
            'Hide this skill from the JABS quick menu',
            jabs.hideFromJabsMenu,
            'hideFromJabsMenu'
          )}
          <Typography variant={'caption'} color={'text.secondary'}>
            Still usable from AI, common events, or other scripts — only the player-facing menu is affected.
          </Typography>
        </Stack>
      </BoardSectionCard>
    );
  };

  /**
   * The dodge movement this skill performs, and the invincibility it grants while doing it.
   *
   * Move type gates everything else: without one there is no dodge tag to hang steps, speed or an
   * i-frame window on, so each dependent field disables itself and says which choice is missing.
   * Whole-dodge invincibility and a manual i-frame window are two spellings of the same idea, so
   * turning either on clears the other.
   */
  const renderDodgeSection = () =>
  {
    const hasNoMoveType = jabs.moveType === null;
    const moveTypeHelperText = hasNoMoveType
      ? 'Pick a move type first.'
      : undefined;

    return (
      <BoardSectionCard title={'Dodge'} collapsible defaultExpanded={false}>
        <Grid container spacing={2}>
          <Grid size={12}>
            <Typography variant={'caption'} color={'text.secondary'}>
              Pick a move type first. None means no dodge movement tag; steps, speed, invincibility, and i-frames stay
              disabled until you choose forward, backward, or directional.
            </Typography>
          </Grid>
          <Grid size={12}>
            <Autocomplete<MoveTypePickerRow, false, true, false>
              fullWidth
              size={'small'}
              disableClearable
              options={MOVE_TYPE_PICKER_ROWS}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.value === b.value}
              value={
                MOVE_TYPE_PICKER_ROWS.find((r) => r.value === jabs.moveType)
                ?? MOVE_TYPE_PICKER_ROWS[ 0 ]
              }
              onChange={(
                _e,
                option
              ) =>
              {
                if (option === null || option.value === null)
                {
                  patch({
                    moveType: null,
                    dodgeSteps: null,
                    dodgeSpeed: null,
                    invincibleDodge: false,
                    iframesStartFrame: null,
                    iframesEndFrame: null,
                  });
                  return;
                }
                patch({ moveType: option.value });
              }}
              renderInput={(params) =>
                (
                  <TextField
                    {...params}
                    label={'Move type'}
                    helperText={'Required before editing other dodge fields. None clears dodge tags from the note.'}
                  />
                )}
            />
          </Grid>
          <Grid size={6}>
            {intField(
              'Dodge steps',
              jabs.dodgeSteps,
              'dodgeSteps',
              {
                disabled: hasNoMoveType,
                helperText: moveTypeHelperText,
              }
            )}
          </Grid>
          <Grid size={6}>
            {floatField(
              'Dodge speed',
              jabs.dodgeSpeed,
              'dodgeSpeed',
              {
                disabled: hasNoMoveType,
                helperText: moveTypeHelperText,
              }
            )}
          </Grid>
          <Grid size={12}>
            <Stack spacing={0.5}>
              <FormControlLabel
                disabled={hasNoMoveType}
                control={
                  <Switch
                    size={'small'}
                    checked={jabs.invincibleDodge}
                    disabled={hasNoMoveType}
                    onChange={(e) =>
                    {
                      if (e.target.checked === true)
                      {
                        patch({
                          invincibleDodge: true,
                          iframesStartFrame: null,
                          iframesEndFrame: null,
                        });
                        return;
                      }
                      patch({ invincibleDodge: false });
                    }}
                  />
                }
                label={'Invincible dodge (full dodge duration)'}
              />
              <Typography variant={'caption'} color={'text.secondary'}>
                {hasNoMoveType
                  ? 'Pick a move type first.'
                  : 'Same as i-frames for the entire dodge animation — mutually exclusive with a manual frame window below.'}
              </Typography>
            </Stack>
          </Grid>
          <Grid size={12}>
            <Typography variant={'caption'} color={'text.secondary'} sx={{
              display: 'block',
              mb: 1
            }}>
              Manual i-frames
              {' '}
              <Typography component={'span'} variant={'caption'} sx={{ fontFamily: 'monospace' }}>
                {'<iframes:[START_FRAME, END_FRAME]>'}
              </Typography>
              {' '}
              — both frames required to write the tag. Disabled while invincible dodge is on; typing a start frame
              turns
              invincible dodge off.
              {hasNoMoveType
                ? ' Pick a move type first.'
                : ''}
            </Typography>
          </Grid>
          <Grid size={6}>
            <TextField
              label={'I-frames start frame'}
              size={'small'}
              fullWidth
              disabled={hasNoMoveType || jabs.invincibleDodge === true}
              value={jabs.iframesStartFrame === null
                ? ''
                : String(jabs.iframesStartFrame)}
              onChange={(e) =>
              {
                const t = e.target.value.trim();
                if (t === '')
                {
                  patch({
                    iframesStartFrame: null,
                    iframesEndFrame: null
                  });
                  return;
                }
                const n = parseInt(t, 10);
                if (Number.isNaN(n))
                {
                  return;
                }
                patch({
                  iframesStartFrame: n,
                  invincibleDodge: false
                });
              }}
              helperText={iframesStartHelperText}
              slotProps={{
                htmlInput: {
                  inputMode: 'numeric',
                  min: 0,
                  step: 1
                }
              }}
            />
          </Grid>
          <Grid size={6}>
            <TextField
              label={'I-frames end frame'}
              size={'small'}
              fullWidth
              disabled={
                hasNoMoveType
                || jabs.invincibleDodge === true
                || jabs.iframesStartFrame === null
              }
              value={jabs.iframesEndFrame === null
                ? ''
                : String(jabs.iframesEndFrame)}
              onChange={(e) =>
              {
                onNullableInt(e, 'iframesEndFrame');
              }}
              helperText={iframesEndHelperText}
              slotProps={{
                htmlInput: {
                  inputMode: 'numeric',
                  min: 0,
                  step: 1
                }
              }}
            />
          </Grid>
        </Grid>
      </BoardSectionCard>
    );
  };

  /**
   * The cosmetic motion layered onto the caster when the skill fires: which icon swings, how hard the
   * body leans, and which of the motion presets plays.
   *
   * Two of the numeric fields only apply to a subset of the presets, and each says which subset rather
   * than sitting greyed out with no explanation.
   */
  const renderJuiceMotionSection = () =>
  {
    // span belongs to the arc family and stab tip to the thrust family; the rest of the presets read
    // neither, which is what both fields fall back to saying.
    const usesArcSpan =
      jabs.juiceMotion === 'arc'
      || jabs.juiceMotion === 'arc-reverse'
      || jabs.juiceMotion === 'arc-oscillate';
    const usesStabTip =
      jabs.juiceMotion === 'bash'
      || jabs.juiceMotion === 'recoil'
      || jabs.juiceMotion === 'stab-forward';

    const motionPresetValue =
      jabs.juiceMotion !== null
      && JUICE_MOTIONS.includes(jabs.juiceMotion as (typeof JUICE_MOTIONS)[number])
        ? jabs.juiceMotion as (typeof JUICE_MOTIONS)[number]
        : null;

    return (
      <BoardSectionCard title={'Juice motion'} collapsible defaultExpanded={false}>
        <Stack spacing={2}>
          <Typography variant={'caption'} color={'text.secondary'}>
            Procedural motion polish layered onto the caster when this skill fires: weapon swing icon overlay, body
            tilt, and squish. All fields are optional — leave them empty to use the inferred icon from equipment and
            the built-in defaults. These are pure cosmetics; combat math is unchanged.
          </Typography>

          <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
            Weapon swing icon
          </Typography>
          <Typography variant={'caption'} color={'text.secondary'}>
            The IconSet icon shown briefly over the caster during the swing. When no override is set, the swing uses
            the icon from the caster's equipped weapon (or the offhand armor / orb for shield-style strikes).
          </Typography>
          <Stack direction={'column'} spacing={1}>
            <FormControlLabel
              control={
                <Switch
                  size={'small'}
                  checked={jabs.juiceIconIndex !== null && jabs.juiceIconIndex >= 0}
                  onChange={(e) =>
                  {
                    if (e.target.checked === true)
                    {
                      patch({ juiceIconIndex: juiceIconPickerIndex });
                      return;
                    }
                    patch({ juiceIconIndex: null });
                  }}
                />
              }
              label={'Override the swing icon for this skill'}
            />
            <IconIndexField
              disabled={jabs.juiceIconIndex === null}
              value={juiceIconPickerIndex}
              onChange={(next) =>
              {
                const safe = Math.max(0, Math.trunc(next));
                setJuiceIconPickerIndex(safe);
                if (jabs.juiceIconIndex !== null)
                {
                  patch({ juiceIconIndex: safe });
                }
              }}
            />
          </Stack>

          <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
            Swing intensity profile
          </Typography>
          <Typography variant={'caption'} color={'text.secondary'}>
            Picks a named tilt-and-swing multiplier row. Each profile pairs a tilt multiplier (how hard the
            caster's body leans on impact) with a swing multiplier (how wide the swing icon sweeps) so heavy
            weapons can read beefier while daggers stay flicky. Profiles are authored on the JABS config
            board's Juice tab; pick "None" here to let the plugin infer the row from the caster's weapon
            type (or offhand armor for shield-style strikes).
          </Typography>
          <Autocomplete<JuiceProfileOption, false, true, false>
            fullWidth
            size={'small'}
            options={juiceProfileOptions}
            value={selectedJuiceProfileOption}
            disableClearable={true}
            isOptionEqualToValue={(opt, val) => opt.value === val.value}
            getOptionLabel={(opt) => opt.label}
            renderOption={(props, opt) =>
            {
              const { key, ...rest } = props as typeof props & { key?: React.Key };
              return (
                <li key={String(key ?? opt.label)} {...rest}>
                  <Stack>
                    <Typography variant={'body2'}>
                      {opt.label}
                    </Typography>
                    {opt.value === null && (
                      <Typography variant={'caption'} color={'text.secondary'}>
                        clears the skill's tag; plugin infers from gear at strike time.
                      </Typography>
                    )}
                    {opt.value !== null && opt.isOrphan && (
                      <Typography variant={'caption'} color={'warning.main'}>
                        authored on this skill but not present in config.jabs.json -&gt; juice.profiles.
                      </Typography>
                    )}
                  </Stack>
                </li>
              );
            }}
            onChange={(_e, v) =>
            {
              patch({ juiceWeaponStyle: v.value });
            }}
            renderInput={(params) =>
              (
                <TextField
                  {...params}
                  label={'Profile key'}
                  helperText={juiceProfileHelperText}
                />
              )}
          />
          {jabsConfig === null && (
            <Alert severity={'info'} variant={'outlined'} sx={{ mt: 1 }}>
              config.jabs.json hasn't finished loading yet — the profile list will populate once it does.
            </Alert>
          )}

          <Divider sx={{ my: 1 }}/>
          <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
            Motion preset
          </Typography>
          <Typography variant={'caption'} color={'text.secondary'}>
            Picks the weapon overlay motion. On healing skills, omitting this keeps the caster-only support squish;
            any motion here opts the skill into the full strike juice. Span / stab tip below only apply to the
            relevant presets; repeat count applies to every preset.
          </Typography>
          <Autocomplete<(typeof JUICE_MOTIONS)[number], false, false, false>
            fullWidth
            size={'small'}
            options={[ ...JUICE_MOTIONS ]}
            value={motionPresetValue}
            onChange={(
              _e,
              v
            ) =>
            {
              patch({ juiceMotion: v ?? null });
            }}
            renderInput={(params) =>
              (
                <TextField
                  {...params}
                  label={'Motion preset'}
                  placeholder={'Inherit default'}
                  helperText={
                    'arc / arc-reverse / arc-oscillate use span; bash / recoil / stab-forward use stab tip degrees; present lifts the icon upward on screen; repeat count applies to every preset (rotations for spin, sweeps for arc-oscillate, replays for the rest).'
                  }
                />
              )}
          />
          <Grid container spacing={2}>
            <Grid size={4}>
              {intField(
                'Arc span (degrees)',
                jabs.juiceArcSpanDegrees,
                'juiceArcSpanDegrees',
                {
                  disabled: usesArcSpan === false,
                  helperText: usesArcSpan
                    ? 'Default 120; typical 30–300.'
                    : 'Only arc / arc-reverse / arc-oscillate use this.',
                }
              )}
            </Grid>
            <Grid size={4}>
              {intField(
                'Repeat count',
                jabs.juiceRepeatCount,
                'juiceRepeatCount',
                {
                  helperText:
                    'Number of repeats within the swing (1–8): rotations for spin / spin-reverse, alternating '
                    + 'sweeps for arc-oscillate, replays for every other preset.',
                }
              )}
            </Grid>
            <Grid size={4}>
              {intField(
                'Stab tip degrees',
                jabs.juiceStabTipDegrees,
                'juiceStabTipDegrees',
                {
                  disabled: usesStabTip === false,
                  helperText: usesStabTip
                    ? 'Tip bearing from Pixi +x at rotation 0 (signed). Empty = preset default (sword diagonal for stab; barrel toward −x for bash / recoil).'
                    : 'Only bash / recoil / stab-forward use this.',
                }
              )}
            </Grid>
          </Grid>

          <Divider sx={{ my: 1 }}/>
          <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
            Overlay flags
          </Typography>
          {boolSwitch(
            'Profile gun (flip horizontally for east/west aim)',
            jabs.juiceProfileGun,
            'juiceProfileGun'
          )}
          <Typography variant={'caption'} color={'text.secondary'}>
            For side-profile firearm icons: mirror left/right instead of rotating ~180°, so the grip never reads
            upside-down. Up / down still use ±90° rotation — pure side-view art cannot read as true top-down aim.
          </Typography>
        </Stack>
      </BoardSectionCard>
    );
  };

  return (
    <Stack spacing={1}>
      <Typography variant={'body2'} color={'text.secondary'}>
        JABS settings for this skill. Values are saved with the skill automatically.
      </Typography>

      {renderActionMapSection()}

      <BoardSectionCard title={'Casting, map execution & spawn animations'} collapsible defaultExpanded={false}>
          <Stack spacing={2}>
            <Typography variant={'caption'} color={'text.secondary'}>
              One accordion for the full pipeline: Phase 1 cast time, optional map spawn flashes, then wind-up animation
              and
              telegraph; Phase 2 how the action behaves on the map. Cast time is in frames (60 ≈ one second at default
              FPS).
              With no cast time there is no standing channel, but spawn animations and Phase 2 still apply once the
              action
              exists.
            </Typography>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Phase 1 — Wind-up & cast
            </Typography>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField
                  label={'Cast time (frames)'}
                  size={'small'}
                  fullWidth
                  value={jabs.castTime === null
                    ? ''
                    : String(jabs.castTime)}
                  onChange={onCastTimeChange}
                  helperText={'Empty or 0 = no wind-up. Higher = longer channel before the action event is placed.'}
                  slotProps={{
                    htmlInput: {
                      inputMode: 'numeric',
                      min: 0,
                      step: 1
                    },
                  }}
                />
              </Grid>
              <Grid size={12}>
                <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
                  Map spawn animations (optional)
                </Typography>
                <Typography variant={'caption'} color={'text.secondary'}>
                  Separate from the Database battle animation and from wind-up below. Same picker as elsewhere;
                  weapon-type
                  entries are omitted on purpose.
                </Typography>
              </Grid>
              <Grid size={6}>
                <Autocomplete<RmmzSkillAnimationOption, false, false, false>
                  fullWidth
                  size={'small'}
                  options={selfAnimationOptions}
                  groupBy={(option) => option.group}
                  getOptionLabel={(option) => option.label}
                  isOptionEqualToValue={(
                    a,
                    b
                  ) => a.value === b.value}
                  value={
                    jabs.selfAnimationId === null
                      ? null
                      : skillAnimationOptionForValue(jabs.selfAnimationId, castAnimationBaseOptions)
                  }
                  onChange={(
                    _e,
                    option
                  ) =>
                  {
                    patch({
                      selfAnimationId: option === null
                        ? null
                        : option.value
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
                        label={'Self / owner animation'}
                        placeholder={'Search animations…'}
                        helperText={'Plays on the acting battler tied to the map action (optional).'}
                      />
                    )}
                />
              </Grid>
              <Grid size={6}>
                <Autocomplete<RmmzSkillAnimationOption, false, false, false>
                  fullWidth
                  size={'small'}
                  options={onCastSkillAnimationOptions}
                  groupBy={(option) => option.group}
                  getOptionLabel={(option) => option.label}
                  isOptionEqualToValue={(
                    a,
                    b
                  ) => a.value === b.value}
                  value={
                    jabs.onCastAnimationId === null
                      ? null
                      : skillAnimationOptionForValue(jabs.onCastAnimationId, castAnimationBaseOptions)
                  }
                  onChange={(
                    _e,
                    option
                  ) =>
                  {
                    patch({
                      onCastAnimationId: option === null
                        ? null
                        : option.value
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
                        label={'On-cast / spawn flash'}
                        placeholder={'Search animations…'}
                        helperText={'Fires when the map action is actually spawned or cast through (optional).'}
                      />
                    )}
                />
              </Grid>
              {contextSkillAnimationId !== null
                ? (
                  <Grid size={12}>
                    <Typography variant={'caption'} color={'text.secondary'}>
                      {`This skill’s database animation id is ${contextSkillAnimationId} — use that as reference if you want the map action to match battle timing.`}
                    </Typography>
                  </Grid>
                )
                : null}
              <Grid size={12}>
                <Autocomplete<RmmzSkillAnimationOption, false, false, false>
                  fullWidth
                  size={'small'}
                  disabled={jabs.castTime === null}
                  options={castAnimationOptions}
                  groupBy={(option) => option.group}
                  getOptionLabel={(option) => option.label}
                  isOptionEqualToValue={(
                    a,
                    b
                  ) => a.value === b.value}
                  value={
                    jabs.castAnimation === null
                      ? null
                      : skillAnimationOptionForValue(jabs.castAnimation, castAnimationBaseOptions)
                  }
                  onChange={(
                    _e,
                    option
                  ) =>
                  {
                    patch({
                      castAnimation: option === null
                        ? null
                        : option.value
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
                        label={'Animation during wind-up'}
                        placeholder={'Search animations…'}
                        helperText={
                          jabs.castTime === null
                            ? 'Set cast time first — nothing plays without a wind-up.'
                            : 'Shown on the caster while cast time counts down (optional).'
                        }
                      />
                    )}
                />
              </Grid>
            </Grid>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Cast preview (telegraph)
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              While casting, JABS can preview where the action will land so players can react. Turn that off for stealth
              or surprise skills, or shorten the warning window with “frames left” below.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={12}>
                {boolSwitch(
                  'No cast preview (hide telegraph)',
                  jabs.noCastPreview,
                  'noCastPreview',
                  jabs.castTime === null
                )}
              </Grid>
              <Grid size={6}>
                <TextField
                  label={'Start warning this many frames before finish'}
                  size={'small'}
                  fullWidth
                  disabled={jabs.castTime === null || jabs.noCastPreview}
                  value={jabs.castPreviewWarnAt === null
                    ? ''
                    : String(jabs.castPreviewWarnAt)}
                  onChange={onCastPreviewWarnAtChange}
                  helperText={castPreviewWarnHelperText}
                  slotProps={{
                    htmlInput: {
                      inputMode: 'numeric',
                      min: 0,
                      max: jabs.castTime === null
                        ? undefined
                        : jabs.castTime,
                      step: 1,
                    },
                  }}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 1 }}/>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Phase 2 — Action on the map
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              Same accordion as above: after wind-up (if any), these fields control the spawned event — direct vs
              projectile,
              AI spacing, how long it lives, knockback, delayed detonation, linger, and on-defeat placement.
            </Typography>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Direct targeting
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              No separate projectile event: the hit resolves toward a target in range. If both tags are present, direct
              lock wins.
            </Typography>
            <Stack direction={'row'} spacing={2} flexWrap={'wrap'}>
              {boolSwitch(
                'Instant / direct (no map projectile)',
                jabs.direct,
                'direct'
              )}
              {boolSwitch(
                'Snap to target at fire time (removes dodge window)',
                jabs.directLock,
                'directLock'
              )}
            </Stack>
            <Grid container spacing={2}>
              <Grid size={4}>
                {floatField(
                  'AI standoff distance (tiles)',
                  jabs.proximity,
                  'proximity',
                  {
                    helperText:
                      'How close an AI battler tries to get before using this skill (non-user scopes).',
                  }
                )}
              </Grid>
              <Grid size={4}>
                {intField(
                  'Action lifetime (frames)',
                  jabs.duration,
                  'duration',
                  {
                    helperText:
                      'How long the action event stays on the map. Also ends after max hits. JABS enforces a small minimum.',
                  }
                )}
              </Grid>
              <Grid size={4}>
                {intField(
                  'Knockback distance (tiles)',
                  jabs.knockback,
                  'knockback',
                  {
                    helperText: 'Tiles the defender is pushed when this skill connects.',
                  }
                )}
              </Grid>
              <Grid size={12}>
                <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
                  Delayed detonation
                </Typography>
                <Typography variant={'caption'} color={'text.secondary'}>
                  Timed trap / mine: waits on the map, then fires. Use -1 frames with “touch to trigger” for touch-only
                  arming (see JABS warning if touch is off).
                </Typography>
              </Grid>
              {delayNoteInvalid
                ? (
                  <>
                    <Grid size={12}>
                      <Alert severity={'warning'}>
                        This note does not match the expected delay shape
                        {' '}
                        <Typography component={'span'} variant={'body2'} sx={{ fontFamily: 'monospace' }}>
                          [frames, true|false [, triggerRadius]]
                        </Typography>
                        . Edit the raw tag or clear it.
                      </Alert>
                    </Grid>
                    <Grid size={12}>
                      {rawField('Delay tag (raw)', jabs.delayRaw, 'delayRaw')}
                    </Grid>
                  </>
                )
                : (
                  <>
                    <Grid size={4}>
                      <TextField
                        label={'Frames until detonation'}
                        size={'small'}
                        fullWidth
                        value={delayParsed === null
                          ? ''
                          : String(delayParsed.frames)}
                        onChange={(e) =>
                        {
                          patchDelayFromFields(
                            e.target.value,
                            delayParsed?.touchable ?? true,
                            delayRadiusText
                          );
                        }}
                        helperText={'-1 = never auto-detonate (needs touch).'}
                        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                      />
                    </Grid>
                    <Grid size={4}>
                      <FormControlLabel
                        disabled={delayParsed === null}
                        control={
                          <Switch
                            size={'small'}
                            checked={delayParsed?.touchable ?? false}
                            onChange={(e) =>
                            {
                              const f =
                                delayParsed === null
                                  ? ''
                                  : String(delayParsed.frames);
                              patchDelayFromFields(
                                f,
                                e.target.checked,
                                delayRadiusText
                              );
                            }}
                          />
                        }
                        label={'Trigger when an enemy steps on it'}
                      />
                    </Grid>
                    <Grid size={4}>
                      <TextField
                        label={'Optional touch radius (tiles)'}
                        size={'small'}
                        fullWidth
                        disabled={delayParsed === null}
                        value={
                          delayParsed !== null && delayParsed.radius !== null
                            ? String(delayParsed.radius)
                            : ''
                        }
                        onChange={(e) =>
                        {
                          const f =
                            delayParsed === null
                              ? ''
                              : String(delayParsed.frames);
                          patchDelayFromFields(
                            f,
                            delayParsed?.touchable ?? true,
                            e.target.value
                          );
                        }}
                        placeholder={'default = use action normal hitbox'}
                        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                      />
                    </Grid>
                    <Grid size={12}>
                      <Typography variant={'caption'} color={'text.secondary'}>
                        Set frames first to add the delay tag; then touch trigger and optional radius apply. Clear
                        frames to remove the tag.
                      </Typography>
                    </Grid>
                  </>
                )}
              <Grid size={4}>
                {intField(
                  'Fade-out after expire (frames)',
                  jabs.linger,
                  'linger',
                  {
                    helperText:
                      'Visual tail after hits/duration end; collision is off during fade. Omit tag for JABS default (~10). Use 0 to vanish instantly.',
                  }
                )}
              </Grid>
              <Grid size={12}>
                {boolSwitch(
                  'Spawn on-target-defeat FX at victim position',
                  jabs.onDefeatedTarget,
                  'onDefeatedTarget'
                )}
                <Typography variant={'caption'} color={'text.secondary'} sx={{
                  display: 'block',
                  mt: 0.5
                }}>
                  Only meaningful for follow-up skills fired via battler on-target-defeat tags: places the event on the
                  defeated enemy instead of the caster.
                </Typography>
              </Grid>
            </Grid>
          </Stack>
      </BoardSectionCard>

      {renderPostExecutionSection()}

      <BoardSectionCard title={'Action size, shape & projectile'} collapsible defaultExpanded={false}>
          <Stack spacing={2}>
            <Typography variant={'caption'} color={'text.secondary'}>
              Tune how far the action reaches and what shape it uses in tile space. Choose hitbox shape first — arc and
              circle unlock degrees; line and wall unlock thickness. Direct skills (see Casting / map execution above)
              skip the map
              projectile, but radius and shape still matter for range checks and previews where applicable.
            </Typography>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Hitbox
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              Geometry JABS uses to test hits. The numeric fields below gray out when they do not apply to the selected
              shape.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={12}>
                <Autocomplete<(typeof HITBOX_SHAPES)[number], false, true, false>
                  fullWidth
                  size={'small'}
                  options={[ ...HITBOX_SHAPES ]}
                  value={
                    jabs.hitboxShape !== null
                    && HITBOX_SHAPES.includes(jabs.hitboxShape as (typeof HITBOX_SHAPES)[number])
                      ? jabs.hitboxShape as (typeof HITBOX_SHAPES)[number]
                      : undefined
                  }
                  onChange={(
                    _e,
                    v
                  ) =>
                  {
                    patch({ hitboxShape: v ?? null });
                  }}
                  renderInput={(params) =>
                    (
                      <TextField
                        {...params}
                        label={'Hitbox shape'}
                        placeholder={'Engine default if empty'}
                      />
                    )}
                />
              </Grid>
              <Grid size={6}>
                {floatField(
                  'Reach / radius (tiles)',
                  jabs.rangeRadius,
                  'rangeRadius',
                  {
                    helperText: 'How far the hitbox extends from the action origin, in map tiles (not pixels).',
                  }
                )}
              </Grid>
              <Grid size={6}>
                {intField(
                  'Arc / sweep (degrees)',
                  jabs.degrees,
                  'degrees',
                  {
                    disabled:
                      jabs.hitboxShape !== 'arc'
                      && jabs.hitboxShape !== 'circle',
                    helperText: degreesHelperText,
                  }
                )}
              </Grid>
              <Grid size={6}>
                {floatField(
                  'Line or wall thickness (tiles)',
                  jabs.thickness,
                  'thickness',
                  {
                    disabled: jabs.hitboxShape !== 'line' && jabs.hitboxShape !== 'wall',
                    helperText:
                      jabs.hitboxShape === 'line' || jabs.hitboxShape === 'wall'
                        ? 'How wide the strip is perpendicular to the line or wall axis.'
                        : 'Only line and wall hitboxes use thickness.',
                  }
                )}
              </Grid>
            </Grid>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Projectiles
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              Formation chooses the firing lines (aim directions) the skill uses. Projectile count is how many map
              actions
              spawn on each of those lines, so totals multiply. Example: spray is a three-line “W” (straight ahead,
              about
              45° up, about 45° down); with count 3 you get three actions per line — nine actions total. That can
              explode
              quickly; that may be exactly what you want. Irrelevant for purely direct / zero-projectile setups.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={6}>
                {intField(
                  'Projectile count (per firing line)',
                  jabs.projectileCount,
                  'projectileCount',
                  {
                    helperText:
                      'Each firing line from formation gets this many actions. Total on the map is (lines in that formation) × count.',
                  }
                )}
              </Grid>
              <Grid size={6}>
                <Autocomplete<(typeof FORMATIONS)[number], false, true, false>
                  fullWidth
                  size={'small'}
                  options={[ ...FORMATIONS ]}
                  value={
                    jabs.projectileFormation !== null
                    && FORMATIONS.includes(jabs.projectileFormation as (typeof FORMATIONS)[number])
                      ? jabs.projectileFormation as (typeof FORMATIONS)[number]
                      : undefined
                  }
                  onChange={(
                    _e,
                    v
                  ) =>
                  {
                    patch({ projectileFormation: v ?? null });
                  }}
                  renderInput={(params) =>
                    (
                      <TextField
                        {...params}
                        label={'Formation (firing lines)'}
                        placeholder={'Engine default if empty'}
                        helperText={
                          'Which directions count as separate lines; projectile count stacks on every line.'
                        }
                      />
                    )}
                />
              </Grid>
            </Grid>
          </Stack>
      </BoardSectionCard>

      <BoardSectionCard title={'Visual metadata (sprites)'} collapsible defaultExpanded={false}>
          <Stack spacing={2}>
            <Typography variant={'caption'} color={'text.secondary'}>
              Adjusts how the action event sprite draws on the map only. Hitboxes and combat math are unchanged.
            </Typography>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Placement (all directions)
            </Typography>
            <Grid container spacing={2}>
              <Grid size={12}>
                <Typography variant={'caption'} color={'text.secondary'}>
                  Nudge the graphic in pixels from the event center (positive X = right, positive Y = down).
                </Typography>
              </Grid>
              <Grid size={6}>
                <TextField
                  label={'Horizontal nudge (px)'}
                  size={'small'}
                  fullWidth
                  value={visBaseOff === null
                    ? ''
                    : String(visBaseOff.x)}
                  onChange={(e) =>
                  {
                    patchVisIntPair(
                      'visOffsetRaw',
                      e.target.value,
                      visBaseOff === null
                        ? ''
                        : String(visBaseOff.y)
                    );
                  }}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  label={'Vertical nudge (px)'}
                  size={'small'}
                  fullWidth
                  value={visBaseOff === null
                    ? ''
                    : String(visBaseOff.y)}
                  onChange={(e) =>
                  {
                    patchVisIntPair(
                      'visOffsetRaw',
                      visBaseOff === null
                        ? ''
                        : String(visBaseOff.x),
                      e.target.value
                    );
                  }}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
              </Grid>
              <Grid size={12}>
                <Typography variant={'body2'} sx={{ mt: 1 }}>
                  Sprite anchor (0–1, single tag)
                </Typography>
                <Typography variant={'caption'} color={'text.secondary'}>
                  {`Default ${JABS_VIS_ANCHOR_DEFAULT} = center. 0 = top/left edge of the sprite, 1 = bottom/right. Matching the default omits the tag.`}
                </Typography>
              </Grid>
              <Grid size={12}>
                <Typography variant={'caption'}>Horizontal</Typography>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={visAnchorX}
                  valueLabelDisplay={'auto'}
                  onChange={(
                    _e,
                    v
                  ) =>
                  {
                    patchVisAnchorPair(v as number, visAnchorY);
                  }}
                />
              </Grid>
              <Grid size={12}>
                <Typography variant={'caption'}>Vertical</Typography>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={visAnchorY}
                  valueLabelDisplay={'auto'}
                  onChange={(
                    _e,
                    v
                  ) =>
                  {
                    patchVisAnchorPair(visAnchorX, v as number);
                  }}
                />
              </Grid>
              <Grid size={12}>
                <Typography variant={'body2'}>Sprite scale (single tag)</Typography>
                <Typography variant={'caption'} color={'text.secondary'}>
                  JABS uses 1.0 as normal size (not 0–1). 1.0×1.0 omits the tag. Stretch horizontally and vertically
                  independently.
                </Typography>
              </Grid>
              <Grid size={12}>
                <Box sx={{ px: 1 }}>
                  <Typography variant={'caption'}>Width</Typography>
                  <Slider
                    min={0.25}
                    max={2.5}
                    step={0.05}
                    value={visScaleX}
                    marks={[
                      {
                        value: 1,
                        label: '1×'
                      }
                    ]}
                    valueLabelDisplay={'auto'}
                    valueLabelFormat={(x) => `${x}×`}
                    onChange={(
                      _e,
                      v
                    ) =>
                    {
                      patchVisScalePair(v as number, visScaleY);
                    }}
                  />
                </Box>
              </Grid>
              <Grid size={12}>
                <Box sx={{ px: 1 }}>
                  <Typography variant={'caption'}>Height</Typography>
                  <Slider
                    min={0.25}
                    max={2.5}
                    step={0.05}
                    value={visScaleY}
                    marks={[
                      {
                        value: 1,
                        label: '1×'
                      }
                    ]}
                    valueLabelDisplay={'auto'}
                    valueLabelFormat={(x) => `${x}×`}
                    onChange={(
                      _e,
                      v
                    ) =>
                    {
                      patchVisScalePair(visScaleX, v as number);
                    }}
                  />
                </Box>
              </Grid>
              <Grid size={6}>
                {intField(
                  'Sprite draw order',
                  jabs.visZ,
                  'visZ',
                  {
                    helperText: 'Higher Z draws above other characters on the map.',
                  }
                )}
              </Grid>
              <Grid size={12}>
                {boolSwitch(
                  'Rotate sprite to face direction of travel',
                  jabs.visRotate,
                  'visRotate'
                )}
              </Grid>
              <Grid size={12}>
                {boolSwitch(
                  'Debug: show origin marker on sprite',
                  jabs.visDebug,
                  'visDebug'
                )}
              </Grid>
            </Grid>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Directional sprite nudges
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              When set for a facing, that pair replaces the base nudge for that direction only (JABS precedence).
            </Typography>
            <Grid container spacing={2}>
              {DIRECTIONAL_VIS_ROWS.map((row) =>
              {
                const pr = parseBracketIntPair(jabs[ row.key ]);
                return (
                  <React.Fragment key={row.key}>
                    <Grid size={12}>
                      <Typography variant={'caption'} color={'text.secondary'}>
                        {row.caption}
                      </Typography>
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        label={'Horizontal (px)'}
                        size={'small'}
                        fullWidth
                        value={pr === null
                          ? ''
                          : String(pr.x)}
                        onChange={(e) =>
                        {
                          patchVisIntPair(
                            row.key,
                            e.target.value,
                            pr === null
                              ? ''
                              : String(pr.y)
                          );
                        }}
                        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                      />
                    </Grid>
                    <Grid size={6}>
                      <TextField
                        label={'Vertical (px)'}
                        size={'small'}
                        fullWidth
                        value={pr === null
                          ? ''
                          : String(pr.y)}
                        onChange={(e) =>
                        {
                          patchVisIntPair(
                            row.key,
                            pr === null
                              ? ''
                              : String(pr.x),
                            e.target.value
                          );
                        }}
                        slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                      />
                    </Grid>
                  </React.Fragment>
                );
              })}
            </Grid>
          </Stack>
      </BoardSectionCard>

      {renderJuiceMotionSection()}

      <BoardSectionCard title={'Learning & upgrades'} collapsible defaultExpanded={false}>
          <Stack spacing={2}>
            <Typography variant={'caption'} color={'text.secondary'}>
              JABS can auto-fill the quick bar when actors learn skills, and replace older versions when a skill is
              marked as
              an upgrade. These tags opt individual skills out of that pipeline or steer which slot gets replaced. They
              work
              together with actor/class notes that enable auto-assign or auto-upgrade.
            </Typography>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Auto-assign
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              Per-skill block: this skill is never placed on the JABS bar by auto-assign. Type-based blocklists belong
              on
              actors or classes in JABS, not on individual skills.
            </Typography>
            <Stack direction={'row'} spacing={2} flexWrap={'wrap'}>
              {boolSwitch(
                'Never auto-assign this skill to the JABS bar',
                jabs.noAutoAssign,
                'noAutoAssign'
              )}
            </Stack>
            <Typography variant={'subtitle2'} sx={{ fontWeight: 600 }}>
              Auto-upgrade
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              When a new skill is learned, it can replace a specific older skill id on the bar. Use “only upgrade” if
              this
              skill should never be assigned except as that replacement; use “no upgrade” if nothing should ever replace
              this
              skill automatically.
            </Typography>
            <Stack direction={'row'} spacing={2} flexWrap={'wrap'}>
              {boolSwitch(
                'Never let another skill auto-upgrade into this one',
                jabs.noUpgrade,
                'noUpgrade'
              )}
              {boolSwitch(
                'Only enter the bar by upgrading (no plain auto-assign)',
                jabs.onlyUpgrade,
                'onlyUpgrade'
              )}
            </Stack>
            <Autocomplete<JabsSkillPickerRow, false, false, false>
              fullWidth
              size={'small'}
              options={upgradeOverSkillOptions}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(
                a,
                b
              ) => a.id === b.id}
              value={selectedUpgradeOverSkillOption}
              onChange={(
                _e,
                option
              ) =>
              {
                patch({
                  upgradeOverSkillId: option === null
                    ? null
                    : option.id
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
                  || String(o.id)
                    .includes(q));
              }}
              renderInput={(params) =>
                (
                  <TextField
                    {...params}
                    variant={'outlined'}
                    label={'Replace this skill when this one is learned'}
                    placeholder={'None — pick a skill id…'}
                    helperText={'When auto-upgrade runs, this new skill takes the slot of the chosen id (if equipped). Clear if not an upgrade line.'}
                  />
                )}
            />
          </Stack>
      </BoardSectionCard>

      <BoardSectionCard title={'Aggro'} collapsible defaultExpanded={false}>
          <Stack spacing={2}>
            <Typography variant={'caption'} color={'text.secondary'}>
              AI picks targets by highest aggro toward them. Base values come from plugin parameters and combat events;
              these
              tags add a flat bump or scale everything this skill generates so taunts, stealth hits, or “ignore me”
              skills are
              easier to author.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={6}>
                {intField(
                  'Bonus aggro (flat)',
                  jabs.bonusAggro,
                  'bonusAggro',
                  {
                    helperText: 'Added after damage and other steps in the aggro formula. Negative values pull less threat.',
                  }
                )}
              </Grid>
              <Grid size={6}>
                {floatField(
                  'Aggro multiplier',
                  jabs.aggroMultiplier,
                  'aggroMultiplier',
                  {
                    helperText: 'Applied on top of the rest (1.0 = default). 0.5 halves, 2.0 doubles. Omit tag for engine default.',
                  }
                )}
              </Grid>
            </Grid>
          </Stack>
      </BoardSectionCard>

      <BoardSectionCard title={'Hits'} collapsible defaultExpanded={false}>
          <Stack spacing={2}>
            <Typography variant={'caption'} color={'text.secondary'}>
              Unparryable skips defender parry for this skill. Database repeats, per-skill bonus hits (
              <Typography component={'span'} variant={'caption'} sx={{ fontFamily: 'monospace' }}>
                {'<bonus-hits:N>'}
              </Typography>
              ), and pierce are on the Editor tab under
              {' '}
              <Typography component={'span'} variant={'subtitle2'} sx={{ fontWeight: 600 }}>
                Repeats, bonus hits & piercing
              </Typography>
              .
            </Typography>
            {boolSwitch(
              'Unparryable (ignore defender parry)',
              jabs.unparryable,
              'unparryable'
            )}
            <Typography variant={'caption'} color={'text.secondary'} sx={{
              display: 'block',
              mt: -1
            }}>
              Other skills can still be parried normally; this tag only affects this skill.
            </Typography>
          </Stack>
      </BoardSectionCard>

      {renderGuardingSection()}

      {renderDodgeSection()}
    </Stack>
  );
}

/**
 * Memoized so editing an unrelated field elsewhere on the Skills board (name, description, damage
 * formula, etc.) doesn't force this large panel through a full render pass- its own props (`jabs`,
 * `skillPickerOptions`, etc.) stay referentially stable across those edits, so a shallow prop
 * comparison correctly skips re-rendering it entirely.
 */
const MemoizedSkillJabsExtensionsPanel = React.memo(SkillJabsExtensionsPanel);

export { MemoizedSkillJabsExtensionsPanel as SkillJabsExtensionsPanel };
