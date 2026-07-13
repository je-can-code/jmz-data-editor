import React, { type ChangeEvent } from 'react';
import { Stack } from '@mui/material';
import NumberInputWithLabel from '@components/core/NumberInputWithLabel.tsx';
import { type RPG_StealRates } from '@services/parsers/StealParser.ts';

type StealRatesFieldsProps = {
  value: RPG_StealRates;
  onChange: (next: RPG_StealRates) => void;
};

function parseSignedInt(
  raw: string,
  fallback: number
): number
{
  const n = parseInt(raw, 10);
  return Number.isFinite(n)
    ? n
    : fallback;
}

/**
 * Three signed-integer-percent fields for J-Resources-ABS {@code <lst:N>}/{@code <mst:N>}/{@code <tst:N>}
 * (life/magi/tech steal). Shared across every database object these tags are valid on (Actors, Classes,
 * Weapons, Armors, States) — all caster-wide sources the plugin sums into one steal rate per resource.
 */
function StealRatesFields(props: StealRatesFieldsProps)
{
  const {
    value,
    onChange,
  } = props;

  return (
    <Stack direction={'row'} spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <NumberInputWithLabel
        label={'Life steal %'}
        variant={'outlined'}
        size={'small'}
        value={value.lst}
        htmlInput={{ step: 1 }}
        onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        {
          onChange({
            ...value,
            lst: parseSignedInt(e.target.value, value.lst),
          });
        }}
      />
      <NumberInputWithLabel
        label={'Magi steal %'}
        variant={'outlined'}
        size={'small'}
        value={value.mst}
        htmlInput={{ step: 1 }}
        onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        {
          onChange({
            ...value,
            mst: parseSignedInt(e.target.value, value.mst),
          });
        }}
      />
      <NumberInputWithLabel
        label={'Tech steal %'}
        variant={'outlined'}
        size={'small'}
        value={value.tst}
        htmlInput={{ step: 1 }}
        onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        {
          onChange({
            ...value,
            tst: parseSignedInt(e.target.value, value.tst),
          });
        }}
      />
    </Stack>
  );
}

export { StealRatesFields };
