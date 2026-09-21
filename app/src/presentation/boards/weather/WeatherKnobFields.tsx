import { MenuItem, TextField, Tooltip } from '@mui/material';
import { BLENDS, EDGES, type WeatherKnob } from '@core/domain/valueObjects/weather-knobs.ts';

type WeatherKnobFieldProps = {
  knob: WeatherKnob;
  value: unknown;
  motionNames: string[];
  onChange: (next: unknown) => void;
};

/**
 * One knob of a motion or a layer, rendered as whatever kind of control it wants.
 *
 * **An empty field means the knob is absent**, not that it is zero, and the two are genuinely
 * different: an absent lifetime means a particle leaves the screen rather than expiring, and an
 * absent tint means the picture is drawn as it was painted. Clearing a field therefore removes
 * the knob rather than writing a zero, which is also what keeps the file readable - a motion
 * shows the handful of things it actually says rather than two dozen defaults.
 */
const WeatherKnobField = (props: WeatherKnobFieldProps) =>
{
  const {
    knob,
    value,
    motionNames,
    onChange,
  } = props;

  const shown = value === undefined || value === null ? '' : String(value);

  const handleText = (next: string) =>
  {
    // an emptied field is the knob going away, which is how a motion stops having a lifetime
    // rather than gaining one of zero.
    if (next === '')
    {
      onChange(undefined);

      return;
    }

    onChange(knob.kind === 'number' ? Number(next) : next);
  };

  const options = (): string[] =>
  {
    if (knob.kind === 'edge') return EDGES;
    if (knob.kind === 'blend') return BLENDS;

    return motionNames;
  };

  if (knob.kind === 'edge' || knob.kind === 'blend' || knob.kind === 'motion')
  {
    return (
      <Tooltip title={knob.help} placement={'top'} arrow>
        <TextField
          select
          size={'small'}
          label={knob.label}
          value={shown}
          sx={{ width: 190 }}
          onChange={event => handleText(event.target.value)}
        >
          <MenuItem value={''}>
            (none)
          </MenuItem>
          {options().map(option => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={knob.help} placement={'top'} arrow>
      <TextField
        size={'small'}
        label={knob.label}
        type={knob.kind === 'number' ? 'number' : 'text'}
        value={shown}
        placeholder={'-'}
        sx={{ width: 190 }}
        onChange={event => handleText(event.target.value)}
      />
    </Tooltip>
  );
};

export default WeatherKnobField;
