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

  const defaultStandardSx: SxProps<Theme> = {
    width: 160,
    height: '30px',
    maxHeight: '30px',
    px: '10px',
  };

  const standardBaseSx: SxProps<Theme> =
    helperText !== undefined && helperText !== ''
      ? {
        width: 160,
        px: '10px',
      }
      : defaultStandardSx;

  const textFieldSx: SxProps<Theme> = (() =>
  {
    if (variant !== 'standard')
    {
      return sx ?? {};
    }
    if (typeof sx === 'object' && sx !== null && !Array.isArray(sx))
    {
      return {
        ...standardBaseSx,
        ...sx,
      };
    }
    if (sx === undefined || sx === null)
    {
      return standardBaseSx;
    }
    return sx;
  })();

  const slotProps: Record<string, unknown> = {};
  if (endAdornment != null)
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

  const endPlacementFieldSx: SxProps<Theme> = (() =>
  {
    if (typeof textFieldSx === 'object' && textFieldSx !== null && !Array.isArray(textFieldSx))
    {
      if (fullWidth === true)
      {
        return textFieldSx;
      }
      return {
        ...textFieldSx,
        flexShrink: 0,
      };
    }
    return textFieldSx;
  })();

  const textField = (
    <TextField
      id={id}
      type={'number'}
      variant={variant}
      size={size}
      label={floatingLabel ? label : undefined}
      disabled={disabled === true}
      fullWidth={floatingLabel ? fullWidth : (isStart ? true : fullWidth)}
      helperText={helperText}
      slotProps={Object.keys(slotProps).length > 0
        ? slotProps as object
        : undefined}
      sx={isStart
        ? {
          ...(
            typeof textFieldSx === 'object' && textFieldSx !== null && !Array.isArray(textFieldSx)
              ? textFieldSx
              : {}
          ),
          flex: 1,
          minWidth: 0,
        }
        : endPlacementFieldSx}
      value={value}
      onChange={onChangeEventHandler}
    />
  );

  if (floatingLabel)
  {
    return textField;
  }

  const startLabelAlign =
    helperText !== undefined && helperText !== ''
      ? 'flex-start'
      : 'center';

  const endLabelAlign =
    helperText !== undefined && helperText !== ''
      ? 'flex-start'
      : 'center';

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
                paddingTop:
                  helperText !== undefined && helperText !== ''
                    ? '8px'
                    : 0,
              }}
            >
              {label}
            </Typography>
          )
        }
        control={textField}
        sx={{
          marginLeft: 0,
          marginRight: 0,
          width: fullWidth
            ? '100%'
            : undefined,
          display: 'flex',
          alignItems: startLabelAlign,
          gap: 2,
        }}
      />
    );
  }

  return (
    <FormControlLabel
      label={label}
      disableTypography
      sx={{
        fontFamily: 'monospace',
        fontSize: 16,
        marginLeft: 0,
        marginRight: 0,
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: endLabelAlign,
        columnGap: 1,
        ...(fullWidth === true
          ? {
            width: '100%',
          }
          : {}),
      }}
      control={textField}
    />
  );
}
