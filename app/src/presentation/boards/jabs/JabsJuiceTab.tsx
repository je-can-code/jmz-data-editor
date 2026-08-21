import React, { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Delete, ExpandMore, Restore } from "@mui/icons-material";
import { useJabs } from "@presentation/context/resources/jabs.context.tsx";
import {
  cloneJuiceDefaults,
  JUICE_DEFAULTS,
  JUICE_PROFILE_KEY_PATTERN,
  type JuiceCasterConfig,
  type JuiceCastingConfig,
  type JuiceConfig,
  type JuiceProfile,
  type JuiceProfilesMap,
  type JuiceTargetConfig,
} from "@core/domain/valueObjects/jabs-config.ts";

type SectionKey = "target" | "caster" | "casting";

type NumericFieldSpec<TSection> = {
  fieldKey: keyof TSection;
  label: string;
  helperText: string;
  defaultValue: number;
};

const TARGET_FIELDS: NumericFieldSpec<JuiceTargetConfig>[] = [
  {
    fieldKey: "physicalSquishIntensity",
    label: "Physical squish intensity",
    helperText: "Scale pulse on physical hits. Higher = more pronounced squish.",
    defaultValue: JUICE_DEFAULTS.target.physicalSquishIntensity,
  },
  {
    fieldKey: "magicalSquishIntensity",
    label: "Magical squish intensity",
    helperText: "Scale pulse on magical hits.",
    defaultValue: JUICE_DEFAULTS.target.magicalSquishIntensity,
  },
  {
    fieldKey: "squishFrames",
    label: "Squish frames",
    helperText: "Frames spent easing the target pulse (60 = 1s).",
    defaultValue: JUICE_DEFAULTS.target.squishFrames,
  },
  {
    fieldKey: "healingRecipientScale",
    label: "Healing recipient scale",
    helperText: "Multiplier applied when the incoming action is healing (softens the pulse).",
    defaultValue: JUICE_DEFAULTS.target.healingRecipientScale,
  },
  {
    fieldKey: "flurryDecayPercent",
    label: "Flurry decay percent",
    helperText:
      "Per-repeat damping (1–100) applied to the same action UUID vs the same target inside a 2-frame window. Lower = faster falloff for piercing / multi-hit chains.",
    defaultValue: JUICE_DEFAULTS.target.flurryDecayPercent,
  },
];

const CASTER_FIELDS: NumericFieldSpec<JuiceCasterConfig>[] = [
  {
    fieldKey: "dodgeSquishIntensity",
    label: "Dodge squish intensity",
    helperText: "Caster squish on the dodge cooldown trigger.",
    defaultValue: JUICE_DEFAULTS.caster.dodgeSquishIntensity,
  },
  {
    fieldKey: "dodgeSquishFrames",
    label: "Dodge squish frames",
    helperText: "Frames easing the dodge squish.",
    defaultValue: JUICE_DEFAULTS.caster.dodgeSquishFrames,
  },
  {
    fieldKey: "supportPulseIntensity",
    label: "Support pulse intensity",
    helperText: "Caster squish on heal / support actions (no weapon overlay).",
    defaultValue: JUICE_DEFAULTS.caster.supportPulseIntensity,
  },
  {
    fieldKey: "supportPulseFrames",
    label: "Support pulse frames",
    helperText: "Frames easing support pulses.",
    defaultValue: JUICE_DEFAULTS.caster.supportPulseFrames,
  },
  {
    fieldKey: "strikeTiltRadians",
    label: "Strike tilt (radians)",
    helperText: "Peak body tilt for offensive actions before profile multipliers (0.18 ≈ 10°).",
    defaultValue: JUICE_DEFAULTS.caster.strikeTiltRadians,
  },
  {
    fieldKey: "strikeTiltFrames",
    label: "Strike tilt frames",
    helperText: "Frames easing tilt recovery.",
    defaultValue: JUICE_DEFAULTS.caster.strikeTiltFrames,
  },
  {
    fieldKey: "weaponSwingPeakRadians",
    label: "Weapon swing peak (radians)",
    helperText: "Peak overlay rotation for IconSet swings before profile multipliers.",
    defaultValue: JUICE_DEFAULTS.caster.weaponSwingPeakRadians,
  },
  {
    fieldKey: "weaponSwingFrames",
    label: "Weapon swing frames",
    helperText: "Frames the IconSet overlay spends swinging.",
    defaultValue: JUICE_DEFAULTS.caster.weaponSwingFrames,
  },
  {
    fieldKey: "spriteVerticalOffsetPixels",
    label: "Sprite vertical offset (px)",
    helperText:
      "Positive shifts the IconSet overlay down on screen — tall-head chibi sprites often want 8–14.",
    defaultValue: JUICE_DEFAULTS.caster.spriteVerticalOffsetPixels,
  },
  {
    fieldKey: "unarmedStrikeSquishIntensity",
    label: "Unarmed strike squish intensity",
    helperText: "Squish intensity when no IconSet swing plays (icon unresolved).",
    defaultValue: JUICE_DEFAULTS.caster.unarmedStrikeSquishIntensity,
  },
  {
    fieldKey: "unarmedStrikeSquishFrames",
    label: "Unarmed strike squish frames",
    helperText: "Frames easing unarmed pulses.",
    defaultValue: JUICE_DEFAULTS.caster.unarmedStrikeSquishFrames,
  },
];

const CASTING_FIELDS: NumericFieldSpec<JuiceCastingConfig>[] = [
  {
    fieldKey: "pulseAmplitude",
    label: "Pulse amplitude",
    helperText: "Continuous shimmer amplitude while the caster is in the casting phase. Small values look natural (0.04–0.06).",
    defaultValue: JUICE_DEFAULTS.casting.pulseAmplitude,
  },
];

/**
 * Inline numeric editor used by every juice tuning field. Wraps a {@link TextField} so that:
 *
 *   - the on-disk value is reflected as a string while the user is editing (so partial input like "0." doesn't snap)
 *   - the committed value is always a finite number — non-numeric input is ignored on blur
 *   - a "reset to default" button appears whenever the current value differs from the documented default
 */
function NumericTuningField(props: {
  label: string;
  helperText: string;
  value: number;
  defaultValue: number;
  onCommit: (next: number) => void;
})
{
  const {
    label,
    helperText,
    value,
    defaultValue,
    onCommit,
  } = props;
  const [ draft, setDraft ] = useState<string>(String(value));
  const [ isFocused, setIsFocused ] = useState(false);

  // when the external value changes (e.g. reload / reset / sibling tab edit), re-sync the editor
  // unless the user is actively typing — pulling the rug out from under a focused field is jarring.
  React.useEffect(() =>
  {
    if (isFocused === false)
    {
      setDraft(String(value));
    }
  }, [ value, isFocused ]);

  const handleBlur = () =>
  {
    setIsFocused(false);
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed) === false)
    {
      setDraft(String(value));
      return;
    }

    if (parsed !== value)
    {
      onCommit(parsed);
    }
    else
    {
      setDraft(String(value));
    }
  };

  const isDirty = Math.abs(value - defaultValue) > 1e-9;

  return (
    <TextField
      label={label}
      size={"small"}
      fullWidth
      value={draft}
      helperText={helperText}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      onChange={(e) => setDraft(e.target.value)}
      slotProps={{
        input: {
          endAdornment: isDirty
            ? (
              <Tooltip title={`Reset to default (${defaultValue})`}>
                <IconButton
                  size={"small"}
                  onClick={() =>
                  {
                    setDraft(String(defaultValue));
                    onCommit(defaultValue);
                  }}
                >
                  <Restore fontSize={"small"}/>
                </IconButton>
              </Tooltip>
            )
            : null,
        },
      }}
    />
  );
}

/**
 * Editor sub-tab for the JABS juice configuration. Renders three sections:
 *
 *   - Profiles table: keyed `tiltMul` / `swingMul` rows. The `default` row is locked (cannot be renamed
 *     or deleted) since the plugin treats it as the mandatory fallback.
 *   - Target / Caster / Casting accordions: per-field tuning sliders for the rest of the block.
 *
 * All edits go through {@link useJabs}'s setConfig; saving is owned by the outer board so the whole
 * config root (teams + juice) round-trips in one shot.
 */
const JabsJuiceTab = () =>
{
  const {
    jabsConfig,
    setConfig,
  } = useJabs();

  // guarded: until the file finishes loading we cannot render numeric fields tied to specific keys.
  if (jabsConfig === null)
  {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography color={"text.secondary"}>
          Loading JABS configuration...
        </Typography>
      </Box>
    );
  }

  const { juice } = jabsConfig;

  const patchSection = <K extends SectionKey>(section: K, partial: Partial<JuiceConfig[K]>) =>
  {
    setConfig(prev =>
    {
      const base = prev ?? jabsConfig;
      return {
        ...base,
        juice: {
          ...base.juice,
          [ section ]: {
            ...base.juice[ section ],
            ...partial,
          },
        },
      };
    });
  };

  const updateProfiles = (mutator: (profiles: JuiceProfilesMap) => JuiceProfilesMap) =>
  {
    setConfig(prev =>
    {
      const base = prev ?? jabsConfig;
      return {
        ...base,
        juice: {
          ...base.juice,
          profiles: mutator({ ...base.juice.profiles }),
        },
      };
    });
  };

  const resetJuiceToDefaults = () =>
  {
    setConfig(prev =>
    {
      const base = prev ?? jabsConfig;
      return {
        ...base,
        juice: cloneJuiceDefaults(),
      };
    });
  };

  return (
    <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
      <Stack spacing={3} sx={{ maxWidth: 960, mx: "auto" }}>
        <Stack direction={"row"} alignItems={"center"} spacing={2}>
          <Typography variant={"h4"} color={"primary"}>
            JABS Juice
          </Typography>
          <Box sx={{ flexGrow: 1 }}/>
          <Button
            variant={"outlined"}
            color={"warning"}
            size={"small"}
            startIcon={<Restore/>}
            onClick={resetJuiceToDefaults}
          >
            Reset entire juice block to defaults
          </Button>
        </Stack>

        <Typography variant={"body2"} color={"text.secondary"}>
          Procedural battler motion tuning consumed by J-ABS-Juice at runtime. The plugin treats the{" "}
          <code>juice</code> block as strictly required — missing fields cause an authoring-time crash,
          so the editor always re-saves a complete shape regardless of which sections you touch.
        </Typography>

        <JuiceProfilesPanel
          profiles={juice.profiles}
          updateProfiles={updateProfiles}
        />

        <JuiceSectionAccordion<JuiceTargetConfig>
          id={"juice-target"}
          title={"Target reactions"}
          subtitle={"Squish pulses applied to whatever the action hits."}
          fields={TARGET_FIELDS}
          values={juice.target}
          onCommit={(fieldKey, next) => patchSection("target", { [ fieldKey ]: next } as Partial<JuiceTargetConfig>)}
          defaultsFor={JUICE_DEFAULTS.target}
        />

        <JuiceSectionAccordion<JuiceCasterConfig>
          id={"juice-caster"}
          title={"Caster motion"}
          subtitle={"Tilt, weapon swing, and squish applied to the battler that fired the skill."}
          fields={CASTER_FIELDS}
          values={juice.caster}
          onCommit={(fieldKey, next) => patchSection("caster", { [ fieldKey ]: next } as Partial<JuiceCasterConfig>)}
          defaultsFor={JUICE_DEFAULTS.caster}
        />

        <JuiceSectionAccordion<JuiceCastingConfig>
          id={"juice-casting"}
          title={"Casting shimmer"}
          subtitle={"Continuous motion played while a skill is mid-cast."}
          fields={CASTING_FIELDS}
          values={juice.casting}
          onCommit={(fieldKey, next) => patchSection("casting", { [ fieldKey ]: next } as Partial<JuiceCastingConfig>)}
          defaultsFor={JUICE_DEFAULTS.casting}
        />
      </Stack>
    </Box>
  );
};

type JuiceSectionAccordionProps<TSection> = {
  id: string;
  title: string;
  subtitle: string;
  fields: NumericFieldSpec<TSection>[];
  values: TSection;
  defaultsFor: TSection;
  onCommit: (fieldKey: keyof TSection, next: number) => void;
};

function JuiceSectionAccordion<TSection>(props: JuiceSectionAccordionProps<TSection>)
{
  const {
    id,
    title,
    subtitle,
    fields,
    values,
    defaultsFor,
    onCommit,
  } = props;

  return (
    <Accordion
      defaultExpanded={false}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMore/>} id={`${id}-summary`} aria-controls={`${id}-content`}>
        <Stack>
          <Typography variant={"subtitle1"} sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Typography variant={"caption"} color={"text.secondary"}>
            {subtitle}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={2}>
          {fields.map((spec) =>
          {
            const { fieldKey } = spec;
            const current = values[ fieldKey ] as unknown as number;
            return (
              <Grid key={String(fieldKey)} size={6}>
                <NumericTuningField
                  label={spec.label}
                  helperText={spec.helperText}
                  value={current}
                  defaultValue={defaultsFor[ fieldKey ] as unknown as number}
                  onCommit={(next) => onCommit(fieldKey, next)}
                />
              </Grid>
            );
          })}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}

type JuiceProfilesPanelProps = {
  profiles: JuiceProfilesMap;
  updateProfiles: (mutator: (profiles: JuiceProfilesMap) => JuiceProfilesMap) => void;
};

/**
 * Profile table renderer + add-row affordance. Soft validation only: keys that violate the plugin's
 * regex ({@link JUICE_PROFILE_KEY_PATTERN}) get an inline warning, but save is never blocked — the dev
 * owns their data, and the plugin will reject malformed keys at game load with its own clear error.
 */
function JuiceProfilesPanel({ profiles, updateProfiles }: JuiceProfilesPanelProps)
{
  const [ pendingKey, setPendingKey ] = useState<string>("");

  const entries = useMemo(() => Object.entries(profiles) as [ string, JuiceProfile ][], [ profiles ]);

  const handleAddProfile = () =>
  {
    const k = pendingKey.trim();
    if (k === "" || Object.prototype.hasOwnProperty.call(profiles, k))
    {
      return;
    }

    updateProfiles((p) =>
    {
      p[ k ] = {
        tiltMul: 1,
        swingMul: 1,
      };
      return p;
    });
    setPendingKey("");
  };

  const handleRenameProfile = (oldKey: string, nextKey: string) =>
  {
    const trimmed = nextKey.trim();
    if (trimmed === "" || trimmed === oldKey)
    {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(profiles, trimmed))
    {
      // collisions silently no-op so the user can recover by editing further; rendering will keep
      // the old key shown until the rename is unambiguous.
      return;
    }

    updateProfiles((p) =>
    {
      const next: JuiceProfilesMap = {};
      for (const [ k, v ] of Object.entries(p))
      {
        if (k === oldKey)
        {
          next[ trimmed ] = v;
        }
        else
        {
          next[ k ] = v;
        }
      }
      return next;
    });
  };

  const handlePatchProfile = (key: string, patch: Partial<JuiceProfile>) =>
  {
    updateProfiles((p) =>
    {
      const existing = p[ key ] ?? {
        tiltMul: 1,
        swingMul: 1,
      };
      p[ key ] = {
        ...existing,
        ...patch,
      };
      return p;
    });
  };

  const handleDeleteProfile = (key: string) =>
  {
    if (key === "default")
    {
      return;
    }

    updateProfiles((p) =>
    {
      const next = { ...p };
      delete next[ key ];
      return next;
    });
  };

  const pendingKeyIsValid = pendingKey.trim() !== ""
    && Object.prototype.hasOwnProperty.call(profiles, pendingKey.trim()) === false;

  return (
    <Paper variant={"outlined"} sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack>
          <Typography variant={"subtitle1"} sx={{ fontWeight: 600 }}>
            Weapon-style profiles
          </Typography>
          <Typography variant={"caption"} color={"text.secondary"}>
            Named tilt-and-swing multiplier rows. Skills reference these via{" "}
            <code>&lt;jabsJuiceWeaponStyle:KEY&gt;</code>; unmarked skills fall back to weapon type id or armor
            type id (<code>aN</code>) keys. The <code>default</code> row is mandatory and serves as the
            fallback when a resolved key has no matching row.
          </Typography>
        </Stack>

        <Table size={"small"}>
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell>Tilt multiplier</TableCell>
              <TableCell>Swing multiplier</TableCell>
              <TableCell align={"right"}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map(([ key, profile ]) => (
              <ProfileRow
                key={key}
                profileKey={key}
                profile={profile}
                onRename={(nextKey) => handleRenameProfile(key, nextKey)}
                onPatch={(patch) => handlePatchProfile(key, patch)}
                onDelete={() => handleDeleteProfile(key)}
              />
            ))}
          </TableBody>
        </Table>

        <Stack direction={"row"} spacing={1} alignItems={"center"}>
          <TextField
            size={"small"}
            label={"New profile key"}
            value={pendingKey}
            onChange={(e) => setPendingKey(e.target.value)}
            onKeyDown={(e) =>
            {
              if (e.key === "Enter")
              {
                handleAddProfile();
              }
            }}
            helperText={
              pendingKey.trim() !== "" && JUICE_PROFILE_KEY_PATTERN.test(pendingKey.trim()) === false
                ? "Plugin regex is [A-Za-z0-9_-]+; the key will save anyway, but the plugin will reject it at load."
                : "Letters, digits, underscore, dash. Press Enter or Add to insert."
            }
            error={
              pendingKey.trim() !== "" && JUICE_PROFILE_KEY_PATTERN.test(pendingKey.trim()) === false
            }
            sx={{ flexGrow: 1 }}
          />
          <Button
            variant={"contained"}
            size={"small"}
            startIcon={<Add/>}
            disabled={pendingKeyIsValid === false}
            onClick={handleAddProfile}
          >
            Add profile
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

type ProfileRowProps = {
  profileKey: string;
  profile: JuiceProfile;
  onRename: (nextKey: string) => void;
  onPatch: (patch: Partial<JuiceProfile>) => void;
  onDelete: () => void;
};

function ProfileRow({ profileKey, profile, onRename, onPatch, onDelete }: ProfileRowProps)
{
  const isDefault = profileKey === "default";
  const [ keyDraft, setKeyDraft ] = useState<string>(profileKey);

  React.useEffect(() =>
  {
    setKeyDraft(profileKey);
  }, [ profileKey ]);

  const keyOk = JUICE_PROFILE_KEY_PATTERN.test(keyDraft.trim());

  // the default row explains why its name is locked; every other row only speaks up when the key is unusable.
  let keyHelperText: string | undefined = undefined;
  if (isDefault)
  {
    keyHelperText = "Required fallback row — name is locked.";
  }
  else if (keyOk === false)
  {
    keyHelperText = "Plugin will reject this key at load (regex [A-Za-z0-9_-]+).";
  }

  return (
    <TableRow>
      <TableCell sx={{ width: "30%" }}>
        <TextField
          size={"small"}
          fullWidth
          value={keyDraft}
          disabled={isDefault}
          onChange={(e) => setKeyDraft(e.target.value)}
          onBlur={() =>
          {
            if (keyDraft.trim() === "" || keyDraft.trim() === profileKey)
            {
              setKeyDraft(profileKey);
              return;
            }
            onRename(keyDraft.trim());
          }}
          helperText={keyHelperText}
          error={isDefault === false && keyOk === false}
        />
      </TableCell>
      <TableCell sx={{ width: "30%" }}>
        <NumericTuningField
          label={"tiltMul"}
          helperText={"Scales the caster's strike tilt amplitude."}
          value={profile.tiltMul}
          defaultValue={1}
          onCommit={(next) => onPatch({ tiltMul: next })}
        />
      </TableCell>
      <TableCell sx={{ width: "30%" }}>
        <NumericTuningField
          label={"swingMul"}
          helperText={"Scales the weapon-swing overlay peak rotation."}
          value={profile.swingMul}
          defaultValue={1}
          onCommit={(next) => onPatch({ swingMul: next })}
        />
      </TableCell>
      <TableCell align={"right"} sx={{ width: "10%" }}>
        <Tooltip title={isDefault ? "default row is required" : "Delete profile"}>
          <span>
            <IconButton
              size={"small"}
              color={"error"}
              disabled={isDefault}
              onClick={onDelete}
            >
              <Delete fontSize={"small"}/>
            </IconButton>
          </span>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

export default JabsJuiceTab;