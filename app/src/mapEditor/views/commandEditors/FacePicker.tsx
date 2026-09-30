import React, { useState } from 'react';
import { Autocomplete, Box, Button, Collapse, TextField, Typography } from '@mui/material';
import { useEditorEnvironment, useFaceNames } from './editorEnvironment.tsx';
import { DraftTextField, FieldRow, NumberField } from './editorFields.tsx';

/**
 * How many faces a sheet holds across, and down; MZ draws every face sheet as this grid.
 */
const SHEET_COLUMNS = 4;
const SHEET_ROWS = 2;

/**
 * One face, cut from its sheet.
 * @param {{ url: string | null, index: number, size: number }} props The sheet's address, the face and how big to draw it.
 * @returns {React.JSX.Element} The face.
 */
const Face = (props: { url: string | null; index: number; size: number }) =>
{
  const { url, index, size } = props;
  const column = index % SHEET_COLUMNS;
  const row = Math.floor(index / SHEET_COLUMNS);
  return (
    <Box sx={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: 0.5,
      bgcolor: 'action.hover',
      backgroundImage: url === null ? 'none' : `url("${url}")`,
      backgroundSize: `${SHEET_COLUMNS * 100}% ${SHEET_ROWS * 100}%`,
      backgroundPosition: `${(column * 100) / (SHEET_COLUMNS - 1)}% ${(row * 100) / (SHEET_ROWS - 1)}%`,
    }}/>
  );
};

/**
 * What the face picker takes.
 */
type FacePickerProps = {
  readonly faceName: string;
  readonly faceIndex: number;
  readonly onChange: (faceName: string, faceIndex: number) => void;
};

/**
 * Picks a message's face: the current one shown, and a panel that unfolds beside it listing the sheets in
 * img/faces and the eight faces of the one chosen. Without a server that lists folders, the sheet's name is
 * typed instead.
 * @param {FacePickerProps} props The face and what to do with a new one.
 * @returns {React.JSX.Element} The picker.
 */
const FacePicker = (props: FacePickerProps) =>
{
  const { faceName, faceIndex, onChange } = props;
  const { api } = useEditorEnvironment();
  const sheets = useFaceNames();
  const [ open, setOpen ] = useState(false);
  const [ browsing, setBrowsing ] = useState(faceName);
  const urlOf = (name: string) => (api === null || name === '' ? null : api.imageUrl('faces', name));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          component={'button'}
          type={'button'}
          aria-label={faceName === '' ? 'Choose a face' : `Face: ${faceName} ${faceIndex + 1}`}
          onClick={() =>
          {
            setBrowsing(faceName);
            setOpen(!open);
          }}
          sx={{ p: 0, border: 1, borderColor: open ? 'primary.main' : 'divider', borderRadius: 1, cursor: 'pointer', bgcolor: 'transparent' }}
        >
          {faceName === ''
            ? <Box sx={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Typography variant={'caption'} color={'text.secondary'}>No face</Typography></Box>
            : <Face url={urlOf(faceName)} index={faceIndex} size={72}/>}
        </Box>
        {faceName === '' ? null : <Button size={'small'} onClick={() => onChange('', 0)}>No face</Button>}
      </Box>
      <Collapse in={open} unmountOnExit>
        {sheets === null
          ? (
            <FieldRow>
              <DraftTextField size={'small'} label={'Face sheet'} value={faceName} onText={name => onChange(name, faceIndex)}/>
              <NumberField label={'Face'} value={faceIndex} min={0} max={7} onChange={index => onChange(faceName, index)}/>
            </FieldRow>
          )
          : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Autocomplete
                size={'small'}
                sx={{ width: 260 }}
                options={sheets as string[]}
                value={browsing === '' ? null : browsing}
                onChange={(_event, picked) => setBrowsing(picked ?? '')}
                renderInput={params => <TextField {...params} label={'Face sheet'}/>}
              />
              {browsing === ''
                ? null
                : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${SHEET_COLUMNS}, 72px)`, gap: 0.5 }}>
                    {Array.from({ length: SHEET_COLUMNS * SHEET_ROWS }, (_, index) => (
                      <Box
                        key={index}
                        component={'button'}
                        type={'button'}
                        aria-label={`${browsing} ${index + 1}`}
                        onClick={() =>
                        {
                          onChange(browsing, index);
                          setOpen(false);
                        }}
                        sx={{
                          p: 0,
                          cursor: 'pointer',
                          bgcolor: 'transparent',
                          border: 2,
                          borderRadius: 1,
                          borderColor: browsing === faceName && index === faceIndex ? 'primary.main' : 'transparent',
                        }}
                      >
                        <Face url={urlOf(browsing)} index={index} size={68}/>
                      </Box>
                    ))}
                  </Box>
                )}
            </Box>
          )}
      </Collapse>
    </Box>
  );
};

export { FacePicker };
