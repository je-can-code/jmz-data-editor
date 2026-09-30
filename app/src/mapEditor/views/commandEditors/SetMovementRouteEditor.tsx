import React, { useMemo } from 'react';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import { parseSetMovementRoute, writeSetMovementRoute, type SetMovementRouteModel } from '../../core/commands/editors/moveRoute.ts';
import { CharacterField, EditorStack, FieldRow, UneditableCommand } from './editorFields.tsx';
import { MoveRouteEditor } from './MoveRouteEditor.tsx';

/**
 * Edits a Set Movement Route command: who moves, and the route, with the lines repeating its steps rebuilt on
 * every change.
 * @param {CommandEditorProps} props The command, its lines and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const SetMovementRouteEditor = (props: CommandEditorProps) =>
{
  const { command, continuation, onChange } = props;
  const model = useMemo(() => parseSetMovementRoute(command, continuation), [ command, continuation ]);
  if (model === null)
  {
    return <UneditableCommand command={command}/>;
  }

  const change = (next: SetMovementRouteModel) =>
  {
    const written = writeSetMovementRoute(command, next);
    onChange(written.command, written.continuation);
  };

  return (
    <EditorStack>
      <FieldRow>
        <CharacterField label={'Who moves'} value={model.characterId} onChange={characterId => change({ ...model, characterId })}/>
      </FieldRow>
      <MoveRouteEditor mode={'command'} route={model.route} onChange={route => change({ ...model, route })}/>
    </EditorStack>
  );
};

export { SetMovementRouteEditor };
