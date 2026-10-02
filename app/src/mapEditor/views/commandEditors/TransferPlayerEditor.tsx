import React, { useMemo } from 'react';
import { Button } from '@mui/material';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import {
  parseTransferPlayer,
  setTransferDesignation,
  TRANSFER_DESIGNATION,
  TRANSFER_DIRECTIONS,
  TRANSFER_FADES,
  writeTransferPlayer,
  type TransferPlayerModel,
} from '../../core/commands/editors/transferPlayer.ts';
import { useEditorEnvironment } from './editorEnvironment.tsx';
import { EditorStack, FieldRow, IdField, NumberField, SelectField, UneditableCommand } from './editorFields.tsx';
import { MapPicker } from './MapPicker.tsx';

/**
 * How a transfer can name its destination.
 */
const DESIGNATIONS = [
  { value: TRANSFER_DESIGNATION.direct, label: 'This map and tile' },
  { value: TRANSFER_DESIGNATION.variables, label: 'Map and tile from variables' },
];

/**
 * Edits a Transfer Player command: where it sends the player (picked from the map tree, or read from variables),
 * which way they face, and the fade. When the window can pick a spot on a map, a button offers it.
 * @param {CommandEditorProps} props The command and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const TransferPlayerEditor = (props: CommandEditorProps) =>
{
  const { command, onChange } = props;
  const { pickLocation } = useEditorEnvironment();
  const model = useMemo(() => parseTransferPlayer(command), [ command ]);
  if (model === null)
  {
    return <UneditableCommand command={command}/>;
  }

  const change = (next: TransferPlayerModel) => onChange(writeTransferPlayer(command, next), []);
  const direct = model.designation === TRANSFER_DESIGNATION.direct;

  return (
    <EditorStack>
      <FieldRow>
        <SelectField label={'Destination'} value={model.designation} options={DESIGNATIONS} width={250}
          onChange={designation => change(setTransferDesignation(model, designation))}/>
      </FieldRow>
      {direct
        ? (
          <FieldRow>
            <MapPicker label={'Map'} value={model.mapId} onChange={mapId => change({ ...model, mapId })}/>
            <NumberField label={'X'} value={model.x} min={0} onChange={x => change({ ...model, x })}/>
            <NumberField label={'Y'} value={model.y} min={0} onChange={y => change({ ...model, y })}/>
            {pickLocation === undefined
              ? null
              : (
                <Button size={'small'} onClick={() =>
                {
                  pickLocation({ mapId: model.mapId, x: model.x, y: model.y })
                    .then(picked =>
                    {
                      if (picked !== null)
                      {
                        change({ ...model, ...picked });
                      }
                    })
                    .catch(() => undefined);
                }}>
                  Pick on the map
                </Button>
              )}
          </FieldRow>
        )
        : (
          <FieldRow>
            <IdField label={'Map from'} kind={'variable'} value={model.mapId} onChange={mapId => change({ ...model, mapId })}/>
            <IdField label={'X from'} kind={'variable'} value={model.x} onChange={x => change({ ...model, x })}/>
            <IdField label={'Y from'} kind={'variable'} value={model.y} onChange={y => change({ ...model, y })}/>
          </FieldRow>
        )}
      <FieldRow>
        <SelectField label={'Facing'} value={model.direction} options={TRANSFER_DIRECTIONS}
          onChange={direction => change({ ...model, direction })}/>
        <SelectField label={'Fade'} value={model.fade} options={TRANSFER_FADES}
          onChange={fade => change({ ...model, fade })}/>
      </FieldRow>
    </EditorStack>
  );
};

export { TransferPlayerEditor };
