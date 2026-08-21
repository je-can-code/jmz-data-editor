import { FormControlLabel, InputAdornment, SxProps, TextField, Theme, Typography } from '@mui/material';
import React, { ChangeEvent, type InputHTMLAttributes } from 'react';

type NumberInputWithLabelProps = {
  label: string;
  value: number;
  onChangeEventHandler: (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  disabled?: boolean;
  endAdornment?: React.ReactNode | undefined;
  sx?: SxProps<Theme> | undefined;
  /**
   * When true, renders the label as a MUI floating label inside the outlined box (same style as TextField).
   * Overrides {@link labelPlacement} — the FormControlLabel wrapper is skipped entirely.
   */
  floatingLabel?: boolean;
  /**
   * {@code end}: control then label (default, historical). {@code start}: label on the left, then control.
   */
  labelPlacement?: 'end' | 'start';
  variant?: 'standard' | 'outlined';
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  /** Passed to {@code TextField} {@code slotProps.htmlInput} (e.g. {@code min}, {@code max}, {@code step}). */
  htmlInput?: InputHTMLAttributes<HTMLInputElement>;
  /** Associates the start label with the input; recommended when {@link labelPlacement} is {@code start}. */
  id?: string;
  /** Fixed width for the start label column; used only when {@link labelPlacement} is {@code start}. */
  labelMinWidth?: string;
  /** Shown under the numeric field (MUI {@code TextField} helper). */
  helperText?: string;
};

/**
 * The sx shapes that can be merged field by field. MUI also accepts an array of sx values and a
 * theme callback, and neither can be spread into -- spreading the array form would copy
 * {@code Array.prototype} onto the style object. Those forms pass through untouched instead.
 */
type MergeableSx = Exclude<SxProps<Theme>, ReadonlyArray<unknown> | ((theme: Theme) => unknown)>;

/**
 * Whether a helper line was supplied. A helper line adds a row under the field, which several of the
 * layout decisions below have to make room for.
 * @param {string|undefined} helperText The caller's helper line, if any.
 * @returns {boolean}
 */
function hasHelperText(helperText: string | undefined): boolean
{
  return helperText !== undefined && helperText !== '';
}

/**
 * Resolves the field's sx, layering the caller's values over the standard-variant defaults.
 * Only the standard variant carries defaults; every other variant is the caller's to style. MUI also
 * accepts arrays and callbacks for sx, and neither can be merged field by field, so those pass through.
 * @param {string} variant The TextField variant being rendered.
 * @param {SxProps<Theme>|undefined} sx The caller's sx, which may be absent or unmergeable.
 * @param {MergeableSx} standardBaseSx The defaults the standard variant starts from.
 * @returns {SxProps<Theme>}
 */
function resolveTextFieldSx(
  variant: 'standard' | 'outlined',
  sx: SxProps<Theme> | undefined,
  standardBaseSx: MergeableSx
)
{
  if (variant !== 'standard')
  {
    return sx ?? {};
  }

  if (typeof sx === 'object' && sx !== null && !Array.isArray(sx))
  {
    const merged: SxProps<Theme> = {
      ...standardBaseSx,
      ...sx,
    };
    return merged;
  }

  if (sx === undefined || sx === null)
  {
    return standardBaseSx;
  }

  return sx;
}

/**
 * Resolves the field's sx when the label sits after it. A field that is not filling the row must be
 * kept from shrinking, or a long label squeezes it.
 * @param {SxProps<Theme>} textFieldSx The already-resolved field sx.
 * @param {boolean} fullWidth Whether the field fills the available width.
 * @returns {SxProps<Theme>}
 */
function resolveEndPlacementFieldSx(
  textFieldSx: SxProps<Theme>,
  fullWidth: boolean
)
{
  if (typeof textFieldSx === 'object' && textFieldSx !== null && !Array.isArray(textFieldSx))
  {
    if (fullWidth === true)
    {
      return textFieldSx;
    }

    const unshrinkable: SxProps<Theme> = {
      ...textFieldSx,
      flexShrink: 0,
    };
    return unshrinkable;
  }

  return textFieldSx;
}

/**
 * Resolves the field's sx when the label sits before it, where the field takes the rest of the row.
 * @param {SxProps<Theme>} textFieldSx The already-resolved field sx.
 * @returns {SxProps<Theme>}
 */
function resolveStartPlacementFieldSx(textFieldSx: SxProps<Theme>)
{
  if (typeof textFieldSx === 'object' && textFieldSx !== null && !Array.isArray(textFieldSx))
  {
    const filling: SxProps<Theme> = {
      ...textFieldSx,
      flex: 1,
      minWidth: 0,
    };
    return filling;
  }

  return {
    flex: 1,
    minWidth: 0,
  };
}

/**
 * Builds the sx for the row wrapping a start-placed label and its field.
 * @param {boolean} fullWidth Whether the row spans the available width.
 * @param {string} labelAlign How the label aligns against the field.
 * @returns {SxProps<Theme>}
 */
function buildStartLabelRowSx(
  fullWidth: boolean,
  labelAlign: 'flex-start' | 'center'
): SxProps<Theme>
{
  return {
    marginLeft: 0,
    marginRight: 0,
    width: fullWidth
      ? '100%'
      : undefined,
    display: 'flex',
    alignItems: labelAlign,
    gap: 2,
  };
}

/**
 * Builds the sx for the row wrapping a field and its end-placed label.
 * @param {boolean} fullWidth Whether the row spans the available width.
 * @param {string} labelAlign How the label aligns against the field.
 * @returns {SxProps<Theme>}
 */
function buildEndLabelRowSx(
  fullWidth: boolean,
  labelAlign: 'flex-start' | 'center'
): SxProps<Theme>
{
  return {
    fontFamily: 'monospace',
    fontSize: 16,
    marginLeft: 0,
    marginRight: 0,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: labelAlign,
    columnGap: 1,
    ...(fullWidth === true
      ? {
        width: '100%',
      }
      : {}),
  };
}

/**
 * A normalized number input with an adjacent label and optional end adornment.
 * @param label The field caption (after the control when {@code labelPlacement} is {@code end}, before when {@code start}).
 * @param value The controlled numeric value.
 * @param onChangeEventHandler Change handler for the input.
 * @param disabled When true, the input is disabled.
 * @param endAdornment Optional node shown in an end {@link InputAdornment}.
 * @param sx Optional {@link TextField} {@code sx}; defaults differ by {@link variant}.
 * @param labelPlacement Label position relative to the control.
 * @param variant MUI TextField variant.
 * @param size MUI TextField size.
 * @param fullWidth When true, the control grows to fill horizontal space (with {@code start}, the row uses full width).
 * @param htmlInput Native input attributes.
 * @param id Input id for {@code label} association when {@code labelPlacement} is {@code start}.
 * @param labelMinWidth Minimum width of the start label.
 * @param helperText Optional helper line under the input.
 */
export default function NumberInputWithLabel({
  label,
  value,
  onChangeEventHandler,
  disabled,
  endAdornment,
  sx,
  floatingLabel = true,
  labelPlacement = 'end',
  variant = 'standard',
  size = 'medium',
  fullWidth = false,
  htmlInput,
  id,
  labelMinWidth = '6.75rem',
  helperText,
}: NumberInputWithLabelProps)
{
  const placement = labelPlacement;
  const isStart = placement === 'start';

  const defaultStandardSx: MergeableSx = {
    width: 160,
    height: '30px',
    maxHeight: '30px',
    px: '10px',
  };

  // a helper line needs the height the fixed-height default would deny it.
  const standardBaseSx: MergeableSx = hasHelperText(helperText)
    ? {
      width: 160,
      px: '10px',
    }
    : defaultStandardSx;

  const textFieldSx: SxProps<Theme> = resolveTextFieldSx(variant, sx, standardBaseSx);

  const slotProps: Record<string, unknown> = {};
  if (endAdornment !== undefined && endAdornment !== null)
  {
    slotProps[ 'input' ] = {
      endAdornment: (
        <InputAdornment position={'end'}>
          {endAdornment}
        </InputAdornment>
      ),
    };
  }
  if (htmlInput !== undefined)
  {
    slotProps[ 'htmlInput' ] = htmlInput;
  }

  const endPlacementFieldSx: SxProps<Theme> = resolveEndPlacementFieldSx(textFieldSx, fullWidth);

  // a start-placed label shares its row with the field, so the field fills whatever the label leaves.
  let fieldFillsWidth = fullWidth;
  if (floatingLabel === false && isStart)
  {
    fieldFillsWidth = true;
  }

  const placementFieldSx = isStart
    ? resolveStartPlacementFieldSx(textFieldSx)
    : endPlacementFieldSx;

  const textField = (
    <TextField
      id={id}
      type={'number'}
      variant={variant}
      size={size}
      label={floatingLabel ? label : undefined}
      disabled={disabled === true}
      fullWidth={fieldFillsWidth}
      helperText={helperText}
      slotProps={Object.keys(slotProps).length > 0
        ? slotProps as object
        : undefined}
      sx={placementFieldSx}
      value={value}
      onChange={onChangeEventHandler}
    />
  );

  if (floatingLabel)
  {
    return textField;
  }

  // without a helper line the label centers on the field; with one, it aligns to the field's top so it
  // does not drift down as the helper row grows. This holds for either placement.
  const labelAlign = hasHelperText(helperText)
    ? 'flex-start'
    : 'center';
  const labelPaddingTop = hasHelperText(helperText)
    ? '8px'
    : 0;

  if (isStart)
  {
    return (
      <FormControlLabel
        labelPlacement={'start'}
        disableTypography
        label={
          (
            <Typography
              component={'label'}
              htmlFor={id}
              variant={'body2'}
              sx={{
                minWidth: labelMinWidth,
                flexShrink: 0,
                paddingTop: labelPaddingTop,
              }}
            >
              {label}
            </Typography>
          )
        }
        control={textField}
        sx={buildStartLabelRowSx(fullWidth, labelAlign)}
      />
    );
  }

  return (
    <FormControlLabel
      label={label}
      disableTypography
      sx={buildEndLabelRowSx(fullWidth, labelAlign)}
      control={textField}
    />
  );
}
