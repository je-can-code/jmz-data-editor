import { InputAdornment, TextField } from '@mui/material';
import { Key } from '@mui/icons-material';
import React from 'react';

type KeyTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function KeyTextField({
  value,
  onChange,
  disabled
}: KeyTextFieldProps)
{
  return <>
    <TextField
      required
      disabled={disabled ?? false}
      variant={'outlined'}
      label={'Key'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      size={'small'}
      fullWidth
      slotProps={{
        input: {
          startAdornment: <InputAdornment position={'start'}>
            <Key/>
          </InputAdornment>
        }
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          fontFamily: 'monospace',
        },
      }}
    />
  </>;
}
