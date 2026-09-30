import React from 'react';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { Add, Close } from '@mui/icons-material';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { CommandCatalogEntry, CommandField } from '../../core/commands/catalogTypes.ts';
import { isFieldVisible, type FieldValues } from '../../core/commands/commandFields.ts';
import {
  addContinuationLine,
  applyFieldChange,
  applyLineFieldChange,
  formValues,
  lineValues,
  removeContinuationLine,
  type CommandDraft,
} from '../../core/commands/fieldValues.ts';
import type { DatabaseNamesJson } from '../../core/commandList/databaseNames.ts';
import type { JsonValue } from '../../core/model/json.ts';
import type { SoundPlayer } from './commandListResources.ts';
import { FieldControl, isWideField } from './FieldControl.tsx';

/**
 * What a generated form takes.
 */
type GeneratedCommandFormProps = {
  readonly entry: CommandCatalogEntry;
  readonly draft: CommandDraft;
  readonly onChange: (draft: CommandDraft) => void;
  readonly names: DatabaseNamesJson | null;
  readonly api: MapEditorApi | null;
  readonly playSound: SoundPlayer;
};

/**
 * Lays out the controls of the fields that show, wide ones across the whole form.
 * @param {object} props The fields, their values, what changes one, and what every control reads with.
 * @returns {React.JSX.Element | null} The grid, or nothing when no field shows.
 */
const FieldGrid = (props: {
  readonly fields: readonly CommandField[];
  readonly values: FieldValues;
  readonly onField: (key: string, value: JsonValue) => void;
  readonly shared: Pick<GeneratedCommandFormProps, 'names' | 'api' | 'playSound'>;
}) =>
{
  const { fields, values, onField, shared } = props;
  const shown = fields.filter(field => isFieldVisible(field, values));
  if (shown.length === 0)
  {
    return null;
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 1.5, alignItems: 'start' }}>
      {shown.map(field => (
        <Box key={field.key} sx={{ gridColumn: isWideField(field) ? '1 / -1' : undefined }}>
          <FieldControl {...shared} field={field} value={values[field.key]} onChange={value => onField(field.key, value)}/>
        </Box>
      ))}
    </Box>
  );
};

/**
 * The form a command's inputs generate: a control per input that shows, each change applied the way the catalog
 * says (inputs a change brings into view start at their defaults), and for commands whose lines are rows of data
 * (a shop's further goods) a row of controls per line, with rows added and taken away.
 * @param {GeneratedCommandFormProps} props The command, its entry, and where a change goes.
 * @returns {React.JSX.Element} The form.
 */
const GeneratedCommandForm = (props: GeneratedCommandFormProps) =>
{
  const { entry, draft, onChange, names, api, playSound } = props;
  const shared = { names, api, playSound };
  const lineFields = entry.continuationFields ?? [];

  return (
    <Stack spacing={1.5}>
      <FieldGrid
        fields={entry.fields}
        values={formValues(entry, draft)}
        onField={(key, value) => onChange(applyFieldChange(entry, draft, key, value))}
        shared={shared}
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
