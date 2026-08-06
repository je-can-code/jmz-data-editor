import { Autocomplete, TextField } from '@mui/material';
import type { JabsFoodTypeDefinition } from '@core/domain/valueObjects/jabs-config.ts';

type FoodType = JabsFoodTypeDefinition;

/**
 * The properties required to pick a food group.
 */
type FoodTypeSelectProps = {
  /** Every group an author may choose from. */
  options: FoodType[];
  /** The key currently chosen, or empty when the item is not food. */
  value: string;
  /** Called with the new key, or an empty string when the choice is cleared. */
  onChange: (key: string) => void;
};

/**
 * Picks the food group an item belongs to, if any.
 *
 * Only one group at a time: eating binds the battler to that group's run of states, and a second group would not
 * stack with the first, it would replace it. So this is a single choice that can also be cleared, rather than a set.
 *
 * A key that is chosen but no longer defined is still shown, so renaming a group cannot quietly strip it from every
 * item that used it.
 * @param {FoodTypeSelectProps} props The options, selection, and change handler.
 */
const FoodTypeSelect = ({ options, value, onChange }: FoodTypeSelectProps) =>
{
  // keep an unrecognized key visible rather than silently blanking the field.
  const known = options.some(option => option.key === value);
  const selectable: FoodType[] = known || value.length === 0
    ? options
    : [ ...options, { key: value, name: `${value} (undefined)`, iconIndex: 0 } ];
  const selected = selectable.find(option => option.key === value) ?? null;

  return (
    <Autocomplete<FoodType>
      size={'small'}
      options={selectable}
      value={selected}
      onChange={(_, newValue) =>
      {
        onChange(newValue?.key ?? '');
      }}
      getOptionKey={(option) => option.key}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(a, b) => a.key === b.key}
      renderInput={(params) => (
        <TextField
          {...params}
          size={'small'}
          label={'Food group'}
          helperText={'Eating this feeds the party for a while. Leave empty for ordinary items.'}
          placeholder={'Not food'}
        />
      )}
    />
  );
};

export { FoodTypeSelect };
