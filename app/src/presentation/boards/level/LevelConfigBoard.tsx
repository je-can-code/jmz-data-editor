import { useState } from "react";
import { Box, FormControlLabel, Grid, Stack, Switch, TextField, Typography } from "@mui/material";
import { useBoardActions } from "@presentation/context/board-actions.context.tsx";
import { useLevelConfig } from "@presentation/context/resources/level.context.tsx";
import { BoardSectionCard } from "@presentation/components/board/BoardSectionCard.tsx";
import type { LevelConfigRoot } from "@core/domain/valueObjects/level-config.ts";

/**
 * Single editor board for `config.level.json` — every J-LevelMaster tuning value, in one flat form.
 * There's no per-class or per-actor data here (that's the Classes board's "Parameters" tab, which reads
 * {@link useLevelConfig}'s `trueMaxLevel` for its beyond-99 extrapolation preview) — just the global
 * scaling/ceiling knobs that used to live in the RMMZ Plugin Manager.
 */
const LevelConfigBoard = () =>
{
  const {
    levelConfig,
    setConfig,
    save,
    reload,
    loading,
  } = useLevelConfig();

  const [ isSaving, setIsSaving ] = useState(false);

  const patch = (partial: Partial<LevelConfigRoot>) =>
  {
    setConfig((prev) => (prev === null
      ? prev
      : { ...prev, ...partial }) as LevelConfigRoot);
  };

  const handleSave = async () =>
  {
    if (levelConfig === null)
    {
      return;
    }

    setIsSaving(true);
    try
    {
      await save(levelConfig);
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
  };

  const canSave = loading === false && levelConfig !== null;
  const canReload = loading === false;

  useBoardActions({
    onSave: handleSave,
    canSave,
    isSaving,
    onReload: handleReload,
    canReload,
  });

  if (levelConfig === null)
  {
    return null;
  }

  const numberField = (
    label: string,
    key: keyof LevelConfigRoot,
    step?: number,
  ) => (
    <TextField
      label={label}
      type={"number"}
      size={"small"}
      fullWidth
      value={levelConfig[ key ] as number}
      onChange={(e) => patch({ [ key ]: Number(e.target.value) } as Partial<LevelConfigRoot>)}
      slotProps={{ htmlInput: { step: step ?? 1 } }}
    />
  );

  const nullableNumberField = (
    label: string,
    key: "rewardMinMultiplier" | "rewardMaxMultiplier",
    helperText: string,
  ) => (
    <TextField
      label={label}
      type={"number"}
      size={"small"}
      fullWidth
      value={levelConfig[ key ] ?? ""}
      helperText={helperText}
      onChange={(e) =>
      {
        const raw = e.target.value;
        patch({ [ key ]: raw === "" ? null : Number(raw) } as Partial<LevelConfigRoot>);
      }}
      slotProps={{ htmlInput: { step: 0.01 } }}
    />
  );

  return (
    <Box sx={{ p: 2, overflow: "auto" }}>
      <Stack spacing={2} sx={{ maxWidth: 900 }}>
        <BoardSectionCard title={"Level Ceiling"} subtitle={"How far levels can actually go"}>
          <Grid container spacing={2}>
            <Grid size={6}>
              {numberField("Max Boosted Level (trueMaxLevel)", "trueMaxLevel")}
            </Grid>
            <Grid size={6}>
              {numberField("Default Beyond Max Level", "defaultBeyondMaxLevel")}
            </Grid>
          </Grid>
        </BoardSectionCard>

        <BoardSectionCard title={"Scaling"} subtitle={"Level-difference damage/reward multipliers"}>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={levelConfig.useScaling}
                  onChange={(e) => patch({ useScaling: e.target.checked })}
                />
              }
              label={levelConfig.useScaling
                ? "Scaling enabled by default"
                : "Scaling disabled by default"}
            />

            <Grid container spacing={2}>
              <Grid size={6}>
                {numberField("Minimum Multiplier (Combat)", "minMultiplier", 0.01)}
              </Grid>
              <Grid size={6}>
                {numberField("Maximum Multiplier (Combat)", "maxMultiplier", 0.01)}
              </Grid>
              <Grid size={6}>
                {nullableNumberField(
                  "Minimum Multiplier (Rewards)",
                  "rewardMinMultiplier",
                  "Blank uses the combat minimum.",
                )}
              </Grid>
              <Grid size={6}>
                {nullableNumberField(
                  "Maximum Multiplier (Rewards)",
                  "rewardMaxMultiplier",
                  "Blank uses the combat maximum.",
                )}
              </Grid>
              <Grid size={4}>
                {numberField("Growth Multiplier", "growthMultiplier", 0.01)}
              </Grid>
              <Grid size={4}>
                {numberField("Upper Invariance", "invariantUpperRange")}
              </Grid>
              <Grid size={4}>
                {numberField("Lower Invariance", "invariantLowerRange")}
              </Grid>
            </Grid>
          </Stack>
        </BoardSectionCard>

        <BoardSectionCard title={"Actor Levels"} subtitle={"Level sharing and balancer variables"}>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={levelConfig.useSharedActorLevel}
                  onChange={(e) => patch({ useSharedActorLevel: e.target.checked })}
                />
              }
              label={levelConfig.useSharedActorLevel
                ? "Single level shared across classes"
                : "Independent level per class (vanilla)"}
            />

            <Grid container spacing={2}>
              <Grid size={6}>
                {numberField("Actor Balancer Variable Id", "variableActorBalancer")}
              </Grid>
              <Grid size={6}>
                {numberField("Enemy Balancer Variable Id", "variableEnemyBalancer")}
              </Grid>
            </Grid>
          </Stack>
        </BoardSectionCard>

        <BoardSectionCard
          title={"Exp Curve"}
          subtitle={"Canonical class-independent curve inputs — only used when Single Level is on"}
          collapsible
          defaultExpanded={false}
        >
          <Grid container spacing={2}>
            <Grid size={3}>
              {numberField("Basis", "canonicalExpBasis")}
            </Grid>
            <Grid size={3}>
              {numberField("Extra", "canonicalExpExtra")}
            </Grid>
            <Grid size={3}>
              {numberField("Acceleration A", "canonicalExpAccA")}
            </Grid>
            <Grid size={3}>
              {numberField("Acceleration B", "canonicalExpAccB")}
            </Grid>
          </Grid>
          <Typography variant={"caption"} color={"text.secondary"} sx={{ mt: 1, display: "block" }}>
            Ignored whenever another plugin (e.g. J-Level-Flat) overrides expForLevel.
          </Typography>
        </BoardSectionCard>
      </Stack>
    </Box>
  );
};

export default LevelConfigBoard;
