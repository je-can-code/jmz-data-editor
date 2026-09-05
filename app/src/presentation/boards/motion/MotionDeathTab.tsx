import { Alert, Box, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useMotionConfig } from "@presentation/context/resources/motion.context.tsx";

/**
 * Editor for how long a defeated battler's collapse holds it on the map.
 *
 * Styles are open-ended: a battler names one with `<deathMotion:STYLE>`, and J-Motion-ABS falls back
 * to the default pacing for a name it does not recognise rather than refusing it. So this tab edits
 * whatever styles the file already carries rather than a fixed three, and the default style is
 * picked from that same list.
 */
const MotionDeathTab = () =>
{
  const {
    motionConfig,
    setConfig,
  } = useMotionConfig();

  if (motionConfig === null)
  {
    return null;
  }

  const { death } = motionConfig;
  const styles = Object.keys(death.durations);

  const setDuration = (style: string, frames: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        death: {
          ...previous!.death,
          durations: {
            ...previous!.death.durations,
            [ style ]: frames,
          },
        },
      }
    ));
  };

  const setDefaultStyle = (style: string) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        death: {
          ...previous!.death,
          defaultStyle: style,
        },
      }
    ));
  };

  const defaultStyleIsKnown = styles.includes(death.defaultStyle);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant={"h6"} gutterBottom>
        Death pacing
      </Typography>
      <Typography variant={"body2"} color={"text.secondary"} sx={{ mb: 2 }}>
        How many frames each style holds a corpse on the map for, at 60 per second. A battler picks
        one with a <code>&lt;deathMotion:STYLE&gt;</code> notetag.
      </Typography>

      {defaultStyleIsKnown === false && (
        <Alert severity={"warning"} sx={{ mb: 2 }}>
          The default style <strong>{death.defaultStyle}</strong> has no duration authored below, so
          anything relying on it has no pacing to fall back to.
        </Alert>
      )}

      <Stack spacing={2} sx={{ mb: 3, maxWidth: 320 }}>
        {styles.map(style => (
          <TextField
            key={style}
            label={style}
            type={"number"}
            size={"small"}
            value={death.durations[ style ]}
            helperText={`${((death.durations[ style ] ?? 0) / 60).toFixed(1)}s`}
            onChange={event => setDuration(style, Number(event.target.value))}
          />
        ))}
      </Stack>

      <TextField
        select
        label={"Default style"}
        size={"small"}
        sx={{ minWidth: 200 }}
        value={defaultStyleIsKnown
          ? death.defaultStyle
          : ""}
        helperText={"used by anything without its own deathMotion tag"}
        onChange={event => setDefaultStyle(event.target.value)}
      >
        {styles.map(style => (
          <MenuItem key={style} value={style}>{style}</MenuItem>
        ))}
      </TextField>
    </Box>
  );
};

export default MotionDeathTab;
