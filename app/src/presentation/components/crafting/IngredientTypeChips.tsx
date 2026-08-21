import { Autocomplete, Chip, TextField } from '@mui/material';

import IngredientType = Crafting.IngredientType;

/**
 * The properties required to pick a set of ingredient types.
 */
type IngredientTypeChipsProps = {
  /** Every type an author may choose from. */
  options: IngredientType[];
  /** The keys currently chosen. */
  value: string[];
  /** Called with the new set of keys whenever the selection changes. */
  onChange: (keys: string[]) => void;
  /** The field's label. */
  label: string;
  /** What to show when nothing is chosen. */
  placeholder: string;
  /** Optional guidance shown beneath the field. */
  helperText?: string;
};

/**
 * Picks any number of ingredient types, shown as chips.
 *
 * The options come from the authored vocabulary rather than free text, because a key that does not exist is
 * indistinguishable at a glance from one that does - and the game gives no sign either way, it simply never matches.
 *
 * A key that is selected but no longer defined is still shown, rather than silently dropped. Renaming a type would
 * otherwise quietly strip it from every entry carrying it, with nothing to notice.
 * @param {IngredientTypeChipsProps} props The options, selection, and change handler.
 */
const IngredientTypeChips = ({
  options,
  value,
  onChange,
  label,
  placeholder,
  helperText,
}: IngredientTypeChipsProps) =>
{
  // a selected key with no definition behind it still needs a chip, so the author can see it and decide.
  const orphanedKeys = value.filter(key => !options.some(option => option.key === key));
  const selectable: IngredientType[] = [
    ...options,
    ...orphanedKeys.map(key => ({
      key,
      name: `${key} (undefined)`,
      iconIndex: 0,
      description: '',
    })),
  ];
  const selected = value
    .map(key => selectable.find(option => option.key === key))
    .filter((option): option is IngredientType => option !== undefined);

  return (
    <Autocomplete<IngredientType, true>
      multiple
      size={'small'}
      options={selectable}
      value={selected}
      onChange={(_, newValue) =>
      {
        onChange(newValue.map(option => option.key));
      }}
      disableCloseOnSelect
      getOptionKey={(option) => option.key}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(a, b) => a.key === b.key}
      slotProps={{
        listbox: { sx: { maxHeight: '400px' } },
      }}
      renderTags={(tags, getTagProps) =>
        tags.map((option, index) => (
          <Chip
            {...getTagProps({ index })}
            key={option.key}
            label={option.name}
            size={'small'}
          />
        ))
      }
      renderInput={(params) => (
        <TextField
          {...params}
          size={'small'}
          label={label}
          helperText={helperText}
          placeholder={value.length === 0
            ? placeholder
            : ''}
        />
      )}
    />
  );
};

export { IngredientTypeChips };
