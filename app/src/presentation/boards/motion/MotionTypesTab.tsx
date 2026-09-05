import { Box, Paper, Stack, TextField, Typography } from "@mui/material";
import { useMotionConfig } from "@presentation/context/resources/motion.context.tsx";

/**
 * Editor for the default parameters each motion type falls back to.
 *
 * Rendered from whatever the file carries rather than from a list of known types, because
 * `MotionTypeRegistry.register(...)` is an open registry on the plugin side — a type added there
 * shows up here the day it ships, and a hardcoded list would silently stop covering it.
 *
 * A parameter's control follows the value already authored for it: numbers get a number field,
 * the handful of named directions, axes and colours get a text field. That keeps a colour like
 * `#ffa0a0` and a direction like `cw` editable without this tab having to know which types take
 * which.
 */
const MotionTypesTab = () =>
{
  const {
    motionConfig,
    setConfig,
  } = useMotionConfig();

  if (motionConfig === null)
  {
    return null;
  }

  const typeNames = Object.keys(motionConfig.types)
    .sort();

  const setParameter = (typeName: string, parameterName: string, value: number | string) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        types: {
          ...previous!.types,
          [ typeName ]: {
            ...previous!.types[ typeName ],
            [ parameterName ]: value,
          },
        },
      }
    ));
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant={"body2"} color={"text.secondary"} sx={{ mb: 2 }}>
        The values a <code>&lt;motion:[type, ...]&gt;</code> notetag falls back to for any parameter
        it does not name. Editing these retunes every motion of that type that did not spell out its
        own numbers.
      </Typography>

      <Stack spacing={2}>
        {typeNames.map(typeName => (
          <Paper key={typeName} variant={"outlined"} sx={{ p: 2 }}>
            <Typography variant={"subtitle1"} sx={{ mb: 1.5 }}>
              {typeName}
            </Typography>
            <Stack direction={"row"} spacing={2} flexWrap={"wrap"} useFlexGap>
              {Object.keys(motionConfig.types[ typeName ] ?? {})
                .map(parameterName =>
                {
                  const value = motionConfig.types[ typeName ]![ parameterName ]!;
                  const isNumeric = typeof value === "number";

                  return (
                    <TextField
                      key={parameterName}
                      label={parameterName}
                      size={"small"}
                      type={isNumeric
                        ? "number"
                        : "text"}
                      value={value}
                      sx={{ width: 160 }}
                      onChange={event => setParameter(
                        typeName,
                        parameterName,
                        isNumeric
                          ? Number(event.target.value)
                          : event.target.value)}
                    />
                  );
                })}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

export default MotionTypesTab;
