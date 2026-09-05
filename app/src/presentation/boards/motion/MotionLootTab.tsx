import { Alert, Box, Stack, TextField, Typography } from "@mui/material";
import { useMotionConfig } from "@presentation/context/resources/motion.context.tsx";
import type { MotionLootFlicker } from "@core/domain/valueObjects/motion-config.ts";

/**
 * Editor for how an expiring loot drop announces that it is about to disappear.
 *
 * The two windows are counted backwards from the moment the drop would vanish, and the fade window
 * sits inside the warning one: the drop blinks for the last `expiryWarnFrames` and additionally
 * dissolves for the last `expiryFadeFrames`. Authoring a fade window larger than the warning one is
 * not an error the plugin refuses, it simply means the dissolve starts before any blinking does -
 * so the tab says so rather than preventing it.
 */
const MotionLootTab = () =>
{
  const {
    motionConfig,
    setConfig,
  } = useMotionConfig();

  if (motionConfig === null)
  {
    return null;
  }

  const { loot } = motionConfig;

  const setFrames = (key: "expiryWarnFrames" | "expiryFadeFrames", value: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        loot: {
          ...previous!.loot,
          [ key ]: value,
        },
      }
    ));
  };

  const setFlicker = (key: keyof MotionLootFlicker, value: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        loot: {
          ...previous!.loot,
          flicker: {
            ...previous!.loot.flicker,
            [ key ]: value,
          },
        },
      }
    ));
  };

  const fadeOutrunsWarning = loot.expiryFadeFrames > loot.expiryWarnFrames;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant={"h6"} gutterBottom>
        Expiry warning
      </Typography>
      <Typography variant={"body2"} color={"text.secondary"} sx={{ mb: 2 }}>
        Frames counted backwards from the moment the drop vanishes, at 60 per second.
      </Typography>

      <Stack direction={"row"} spacing={2} sx={{ mb: 3 }}>
        <TextField
          label={"Blink starts"}
          type={"number"}
          size={"small"}
          value={loot.expiryWarnFrames}
          helperText={`${(loot.expiryWarnFrames / 60).toFixed(1)}s before it goes`}
          onChange={event => setFrames("expiryWarnFrames", Number(event.target.value))}
        />
        <TextField
          label={"Dissolve starts"}
          type={"number"}
          size={"small"}
          value={loot.expiryFadeFrames}
          helperText={`${(loot.expiryFadeFrames / 60).toFixed(1)}s before it goes`}
          onChange={event => setFrames("expiryFadeFrames", Number(event.target.value))}
        />
      </Stack>

      {fadeOutrunsWarning && (
        <Alert severity={"warning"} sx={{ mb: 3 }}>
          The dissolve starts before the blink does, so drops fade without ever blinking. That works,
          but the blink is what makes a drop noticeable while it is still worth fetching.
        </Alert>
      )}

      <Typography variant={"h6"} gutterBottom>
        Blink
      </Typography>
      <Typography variant={"body2"} color={"text.secondary"} sx={{ mb: 2 }}>
        Opacity is re-rolled between the two bounds every interval. A lower minimum reads as a harder
        blink; a minimum equal to the maximum disables it entirely.
      </Typography>

      <Stack direction={"row"} spacing={2}>
        <TextField
          label={"Minimum opacity"}
          type={"number"}
          size={"small"}
          inputProps={{ step: 0.05, min: 0, max: 1 }}
          value={loot.flicker.min}
          onChange={event => setFlicker("min", Number(event.target.value))}
        />
        <TextField
          label={"Maximum opacity"}
          type={"number"}
          size={"small"}
          inputProps={{ step: 0.05, min: 0, max: 1 }}
          value={loot.flicker.max}
          onChange={event => setFlicker("max", Number(event.target.value))}
        />
        <TextField
          label={"Interval"}
          type={"number"}
          size={"small"}
          value={loot.flicker.interval}
          helperText={"frames between re-rolls"}
          onChange={event => setFlicker("interval", Number(event.target.value))}
        />
      </Stack>
    </Box>
  );
};

export default MotionLootTab;
