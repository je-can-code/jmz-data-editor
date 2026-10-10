import React from 'react';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { Add, Close } from '@mui/icons-material';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { CommandCatalogEntry, CommandField, CommandPlace } from '../../core/commands/catalogTypes.ts';
import { isFieldVisible, type FieldValues } from '../../core/commands/commandFields.ts';
import { applyPlace, placeIn, placesEndingAt } from '../../core/commands/commandPlaces.ts';
import {
  addContinuationLine,
  applyFieldChange,
  applyLineFieldChange,
  formValues,
  lineValues,
  removeContinuationLine,
  type CommandDraft,
  type ListOrigins,
} from '../../core/commands/fieldValues.ts';
import type { DatabaseNamesJson } from '../../core/commandList/databaseNames.ts';
import type { MapLocation } from '../../core/locations/LocationPicks.ts';
import type { JsonValue } from '../../core/model/json.ts';
import { PickOnMapButton } from '../locationPicker/PickOnMapButton.tsx';
import type { SoundPlayer } from './commandListResources.ts';
import { FieldControl, isWideField } from './FieldControl.tsx';

/**
 * What a generated form takes.
 */
type GeneratedCommandFormProps = {
  readonly entry: CommandCatalogEntry;
  readonly draft: CommandDraft;

  /**
   * Takes the edited command; when a list input changed, also where each of its entries came from.
   */
  readonly onChange: (draft: CommandDraft, origins?: ListOrigins) => void;
  readonly names: DatabaseNamesJson | null;
  readonly api: MapEditorApi | null;
  readonly playSound: SoundPlayer;
};

/**
 * The places among a form's inputs that can be picked on the map, and what to do with a place picked.
 */
type PlacePicking = {
  readonly places: readonly CommandPlace[];
  readonly onPlace: (place: CommandPlace, location: MapLocation) => void;
};

/**
 * Lays out the controls of the fields that show, wide ones across the whole form. A place among them, its map, x and y
 * all showing, is followed by a button picking it on the map.
 * @param {object} props The fields, their values, what changes one, what every control reads with, and the places to
 * offer picking, when the window can pick them.
 * @returns {React.JSX.Element | null} The grid, or nothing when no field shows.
 */
const FieldGrid = (props: {
  readonly fields: readonly CommandField[];
  readonly values: FieldValues;
  readonly onField: (key: string, value: JsonValue, origins?: ListOrigins) => void;
  readonly shared: Pick<GeneratedCommandFormProps, 'names' | 'api' | 'playSound'>;
  readonly picking?: PlacePicking;
}) =>
{
  const { fields, values, onField, shared, picking } = props;
  const shown = fields.filter(field => isFieldVisible(field, values));
  if (shown.length === 0)
  {
    return null;
  }

  // each place's picker sits right after its y, while all three of its fields show.
  const shownKeys = new Set(shown.map(field => field.key));
  const pickersAfter = (key: string) => (picking === undefined
    ? []
    : placesEndingAt(picking.places, key, shownKeys).map(place => ({ place, onPick: (location: MapLocation) => picking.onPlace(place, location) })));

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 1.5, alignItems: 'start' }}>
      {shown.map(field => (
        <React.Fragment key={field.key}>
          <Box sx={{ gridColumn: isWideField(field) ? '1 / -1' : undefined }}>
            <FieldControl {...shared} field={field} value={values[field.key]} onChange={(value, origins) => onField(field.key, value, origins)}/>
          </Box>
          {pickersAfter(field.key).map(({ place, onPick }) => (
            <Box key={`place:${place.map}`} sx={{ alignSelf: 'center' }}>
              <PickOnMapButton start={placeIn(values, place)} landing={place.landing === true} onPick={onPick}/>
            </Box>
          ))}
        </React.Fragment>
      ))}
    </Box>
  );
};

/**
 * The form a command's inputs generate: a control per input that shows, each change applied the way the catalog
 * says (inputs a change brings into view start at their defaults), and for commands whose lines are rows of data
 * (a shop's further goods) a row of controls per line, with rows added and taken away. A place among the inputs (Set
 * Vehicle Location's map and tile) can also be picked by clicking it on the map, given a project to read maps from.
 * @param {GeneratedCommandFormProps} props The command, its entry, and where a change goes.
 * @returns {React.JSX.Element} The form.
 */
const GeneratedCommandForm = (props: GeneratedCommandFormProps) =>
{
  const { entry, draft, onChange, names, api, playSound } = props;
  const shared = { names, api, playSound };
  const lineFields = entry.continuationFields ?? [];

  // without a server there are no maps to pick a place on.
  const picking: PlacePicking | undefined = api === null
    ? undefined
    : { places: entry.places ?? [], onPlace: (place, location) => onChange(applyPlace(entry, draft, place, location)) };

  return (
    <Stack spacing={1.5}>
      <FieldGrid
        fields={entry.fields}
        values={formValues(entry, draft)}
        onField={(key, value, origins) => onChange(applyFieldChange(entry, draft, key, value), origins)}
        shared={shared}
        picking={picking}
      />
      {lineFields.length > 0 && (
        <Stack spacing={1}>
          <Typography variant={'caption'} color={'text.secondary'}>Further items</Typography>
          {draft.continuation.map((line, row) => (
            <Stack key={row} direction={'row'} spacing={1} alignItems={'flex-start'}>
              <Box sx={{ flex: 1 }}>
                <FieldGrid
                  fields={lineFields}
                  values={lineValues(entry, line)}
                  onField={(key, value) => onChange(applyLineFieldChange(entry, draft, row, key, value))}
                  shared={shared}
                />
              </Box>
              <IconButton aria-label={`Remove item ${row + 2}`} size={'small'} onClick={() => onChange(removeContinuationLine(draft, row))}>
                <Close fontSize={'small'}/>
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button size={'small'} startIcon={<Add/>} onClick={() => onChange(addContinuationLine(entry, draft))}>
              Add an item
            </Button>
          </Box>
        </Stack>
      )}
    </Stack>
  );
};

export { GeneratedCommandForm };
export type { GeneratedCommandFormProps };
