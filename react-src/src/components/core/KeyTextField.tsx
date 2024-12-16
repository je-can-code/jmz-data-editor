import { InputAdornment, TextField } from "@mui/material";
import { Key } from "@mui/icons-material";
import React from "react";

type KeyTextFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function KeyTextField({ value, onChange }: KeyTextFieldProps)
{
  return <>
    <TextField
      required
      variant={"outlined"}
      label={"Key"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      size={"small"}
      fullWidth
      slotProps={{
        input: {
          startAdornment: <InputAdornment position={"start"}>
            <Key/>
          </InputAdornment>
        }
      }}
    />
  </>
}