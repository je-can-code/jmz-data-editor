import React, { useMemo } from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';
import { mapLabel, mapOptions, type MapOption } from '../../core/commands/editors/mapOptions.ts';
import { useMapInfos } from './editorEnvironment.tsx';
import { NumberField } from './editorFields.tsx';

/**
 * Picks a map from the map tree, listed as the tree shows it. Until the tree is read, or without a server, the
 * map is typed as a number. A map the tree lacks is still shown and kept.
 * @param {{ label: string, value: number, onChange: (mapId: number) => void }} props The map and what to do with a new one.
 * @returns {React.JSX.Element} The picker.
 */
const MapPicker = (props: { label: string; value: number; onChange: (mapId: number) => void }) =>
{
  const { label, value, onChange } = props;
  const infos = useMapInfos();
  const options = useMemo(() => (infos === null ? [] : mapOptions(infos)), [ infos ]);
  if (options.length === 0)
  {
    return <NumberField label={label} value={value} onChange={onChange} min={1}/>;
  }

  const selected: MapOption = options.find(option => option.id === value) ?? { id: value, name: '', depth: 0 };
  return (
    <Autocomplete
      size={'small'}
      sx={{ width: 300 }}
      disableClearable
      options={options.some(option => option.id === value) ? options : [ selected, ...options ]}
      value={selected}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionLabel={option => mapLabel(option.id, option.name)}
      renderOption={(optionProps, option) =>
      {
        const { key, ...rest } = optionProps;
        return (
          <Box component={'li'} key={key} {...rest} sx={{ pl: `${16 + option.depth * 14}px !important` }}>
            {mapLabel(option.id, option.name)}
          </Box>
        );
      }}
      onChange={(_event, picked) => onChange(picked.id)}
      renderInput={params => <TextField {...params} label={label}/>}
    />
  );
};

export { MapPicker };
