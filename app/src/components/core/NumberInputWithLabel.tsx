import {
  FormControlLabel,
  InputAdornment,
  SxProps,
  TextField,
  Theme
} from '@mui/material';
import React, { ChangeEvent } from 'react';

type NumberInputWithLabelProps = {
  label: string;
  value: number;
  onChangeEventHandler: (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  disabled?: boolean;
  endAdornment?: any;
  sx?: SxProps<Theme> | undefined;
};

/**
 * A normalized number input field with an optional end icon and room for further customization..
 * @param label The label at the end of the number input.
 * @param value The controlled value of the number input.
 * @param onChangeEventHandler The controlled event handler function for managing inputs.
 * @param disabled Whether or not the input should be disabled.
 * @param endAdornment The optional icon; pass a MUI icon if desired.
 * @param sx The optional customization; pass a regular "sx" object with properties.
 * @constructor
 */
export default function NumberInputWithLabel({
  label,
  value,
  onChangeEventHandler,
  disabled,
  endAdornment,
  sx,
}: NumberInputWithLabelProps)
{
  return (
    <FormControlLabel
      label={label}
      disableTypography
      sx={{
        fontFamily: 'monospace',
        fontSize: 16
      }}
      control={
        <TextField
          type={'number'}
          variant={'standard'}
          disabled={disabled ?? false}
          slotProps={(endAdornment != null)
            ? {
              input: {
                endAdornment: (
                  <InputAdornment position={'end'}>
                    {endAdornment}
                  </InputAdornment>
                ),
              },
            }
            : undefined}
          sx={sx ?? {
            width: 160,
            height: '30px',
            maxHeight: '30px',
            px: '10px',
          }}
          value={value}
          onChange={onChangeEventHandler}
        />}
    />);
}
