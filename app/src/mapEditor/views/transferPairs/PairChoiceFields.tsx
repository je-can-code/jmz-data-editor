import React, { useContext, useEffect, useRef, useState } from 'react';
import { Box, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { TextureImage } from '../../core/renderer/MapRenderer.ts';
import { doorLookChoices, doorLookKey, doorLookName, type DoorLook, type DoorSprite } from '../../core/transferPairs/doorSprites.ts';
import type { PairChoices } from '../../core/transferPairs/PairChoices.ts';
import type { PairKind } from '../../core/transferPairs/pairPlans.ts';
import { drawCharacterFrame } from '../../render/characterCanvas.ts';
import { projectImagesFor } from '../../render/projectImages.ts';
import { SoundPlayerContext } from '../commandList/commandListResources.ts';

/**
 * How big a door's picture draws in its list, in CSS pixels.
 */
const THUMB_SIZE = 32;

/**
 * How loud and how high a sound plays when tried, as the transfers placed play it.
 */
const TRY_SOUND = { volume: 90, pitch: 100 };

/**
 * One door's picture, drawn from its sheet as the game draws it standing closed.
 * @param {{ api: MapEditorApi | null, look: DoorLook }} props The server, and the picture.
 * @returns {React.JSX.Element} The picture.
 */
const DoorThumb = (props: { readonly api: MapEditorApi | null; readonly look: DoorLook }) =>
{
  const { api, look } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ sheet, setSheet ] = useState<{ name: string; image: TextureImage | null } | null>(null);

  // the sheet comes through the window's shared image cache, once per sheet.
  useEffect(() =>
  {
    if (api === null)
    {
      return undefined;
    }

    let current = true;
    projectImagesFor(api).image('characters', look.characterName)
      .then(image =>
      {
        if (current)
        {
          setSheet({ name: look.characterName, image });
        }
      })
      .catch(() => undefined);
    return () =>
    {
      current = false;
    };
  }, [ api, look.characterName ]);

  // drawn at the screen's pixel density, so a small picture stays sharp.
  const image = sheet !== null && sheet.name === look.characterName ? sheet.image : null;
  useEffect(() =>
  {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null)
    {
      return;
    }

    const scale = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    canvas.width = Math.round(THUMB_SIZE * scale);
    canvas.height = Math.round(THUMB_SIZE * scale);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    drawCharacterFrame(context, image, { tileId: 0, ...look }, 0, 0, canvas.width);
  }, [ image, look ]);

  return <Box component={'canvas'} ref={canvasRef} sx={{ width: THUMB_SIZE, height: THUMB_SIZE, flexShrink: 0, display: 'block' }}/>;
};

/**
 * Picks a sound from {@code audio/se}, or none, with a button that plays it as the transfer will.
 * @param {{ api: MapEditorApi | null, label: string, value: string, names: readonly string[], testId: string, onChange: (name: string) => void }} props
 * The server, what the field is called, the sound chosen, the sounds to offer, its test id, and who hears a choice.
 * @returns {React.JSX.Element} The field.
 */
const SoundField = (props: {
  readonly api: MapEditorApi | null;
  readonly label: string;
  readonly value: string;
  readonly names: readonly string[];
  readonly testId: string;
  readonly onChange: (name: string) => void;
}) =>
{
  const { api, label, value, names, testId, onChange } = props;
  const playSound = useContext(SoundPlayerContext);

  // a sound chosen that the folder lacks still shows, so a choice never drops out of its own list.
  const offered = value === '' || names.includes(value) ? names : [ value, ...names ];
  return (
    <Stack direction={'row'} alignItems={'center'} spacing={0.5}>
      <TextField
        select
        label={label}
        value={value}
        size={'small'}
        sx={{ minWidth: 160 }}
        data-testid={testId}
        slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, renderValue: selected => (selected === '' ? 'None' : String(selected)) } }}
        onChange={event => onChange(String(event.target.value))}
      >
        <MenuItem value={''}>None</MenuItem>
        {offered.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
      </TextField>
      <Tooltip title={`Play ${label.toLowerCase()}`}>
        <span>
          <IconButton
            size={'small'}
            aria-label={`Play ${label.toLowerCase()}`}
            disabled={api === null || value === ''}
            onClick={() => api !== null && playSound(api.audioUrl('se', value), TRY_SOUND)}
          >
            <PlayArrow fontSize={'small'}/>
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
};

/**
 * What the transfer placer's choices are made from.
 */
type PairChoiceFieldsProps = {
  readonly api: MapEditorApi | null;
  readonly kind: PairKind;

  /**
   * The door's picture a door takes now: the one chosen, or the one the project's doors use most.
   */
  readonly look: DoorLook;
  readonly sprites: readonly DoorSprite[];
  readonly sounds: readonly string[];
  readonly choices: PairChoices;

  /**
   * Hears a choice made, to keep as what the next transfer starts with.
   * @param {Partial<PairChoices>} chosen The choice.
   */
  readonly onChoose: (chosen: Partial<PairChoices>) => void;
};

/**
 * The transfer placer's choices: for a door, its picture, from the pictures the project's doors are drawn with, the most
 * used first, and the creak it plays as it opens; for every transfer, the sound of passing through. Each choice is kept
 * as what the next transfer starts with, for as long as the window is open.
 * @param {PairChoiceFieldsProps} props What to choose from, what is chosen, and who hears a choice.
 * @returns {React.JSX.Element} The fields.
 */
const PairChoiceFields = (props: PairChoiceFieldsProps) =>
{
  const { api, kind, look, sprites, sounds, choices, onChoose } = props;
  const offered = doorLookChoices(sprites, look);
  return (
    <Stack direction={'row'} spacing={2} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
      {kind === 'door' && (
        <FormControl size={'small'} sx={{ minWidth: 260 }}>
          <InputLabel id={'door-picture-label'}>Door picture</InputLabel>
          <Select
            labelId={'door-picture-label'}
            label={'Door picture'}
            value={doorLookKey(look)}
            data-testid={'door-picture'}
            onChange={event =>
            {
              const chosen = offered.find(sprite => doorLookKey(sprite) === event.target.value);
              if (chosen !== undefined)
              {
                const { characterName, characterIndex, direction, pattern } = chosen;
                onChoose({ doorLook: { characterName, characterIndex, direction, pattern } });
              }
            }}
            renderValue={() => (
              <Stack direction={'row'} spacing={1} alignItems={'center'}>
                <DoorThumb api={api} look={look}/>
                <Typography variant={'body2'} noWrap>{doorLookName(look)}</Typography>
              </Stack>
            )}
          >
            {offered.map(sprite => (
              <MenuItem key={doorLookKey(sprite)} value={doorLookKey(sprite)}>
                <Stack direction={'row'} spacing={1} alignItems={'center'}>
                  <DoorThumb api={api} look={sprite}/>
                  <Typography variant={'body2'}>{doorLookName(sprite)}</Typography>
                  <Typography variant={'caption'} color={'text.secondary'}>
                    {sprite.doors === 0 ? 'no doors yet' : `${sprite.doors} ${sprite.doors === 1 ? 'door' : 'doors'}`}
                  </Typography>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      {kind === 'door' && (
        <SoundField api={api} label={'Door sound'} value={choices.doorSound} names={sounds} testId={'door-sound'} onChange={doorSound => onChoose({ doorSound })}/>
      )}
      <SoundField api={api} label={'Movement sound'} value={choices.movementSound} names={sounds} testId={'movement-sound'} onChange={movementSound => onChoose({ movementSound })}/>
    </Stack>
  );
};

export { PairChoiceFields };
export type { PairChoiceFieldsProps };
