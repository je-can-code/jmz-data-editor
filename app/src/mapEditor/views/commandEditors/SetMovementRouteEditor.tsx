import React, { useMemo, useState } from 'react';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import { parseSetMovementRoute, writeSetMovementRoute, type SetMovementRouteModel } from '../../core/commands/editors/moveRoute.ts';
import { routeSettingOf, type RouteSetting } from '../../core/moveRoutes/routeStart.ts';
import { CharacterField, EditorStack, FieldRow, UneditableCommand } from './editorFields.tsx';
import { MapPicker } from './MapPicker.tsx';
import { MoveRouteEditor } from './MoveRouteEditor.tsx';

/**
 * The map a common event's route is first shown on, until the author picks another.
 */
const FIRST_PREVIEW_MAP = 1;

/**
 * Edits a Set Movement Route command: who moves, and the route, with the lines repeating its steps rebuilt on every
 * change. On an event page the route is shown on the page's own map, starting where the moves before it leave the
 * walker. A common event runs wherever it is called from, so its route is shown on a map the author picks, the walker
 * starting in the middle until they put it somewhere; and an editor shown outside any list has no map to show at all.
 * @param {CommandEditorProps} props The command, its lines, where it sits, and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const SetMovementRouteEditor = (props: CommandEditorProps) =>
{
  const { command, continuation, onChange, whereabouts } = props;
  const model = useMemo(() => parseSetMovementRoute(command, continuation), [ command, continuation ]);
  const [ previewMap, setPreviewMap ] = useState(FIRST_PREVIEW_MAP);
  if (model === null)
  {
    return <UneditableCommand command={command}/>;
  }

  const change = (next: SetMovementRouteModel) =>
  {
    const written = writeSetMovementRoute(command, next);
    onChange(written.command, written.continuation);
  };

  // a page's list names its own map; any other list in the editor is a common event's, shown on the map picked.
  const onPage = whereabouts === undefined ? null : routeSettingOf(whereabouts, model.characterId);
  const common = whereabouts !== undefined && onPage === null;
  let setting: RouteSetting | null = onPage;
  if (common)
  {
    setting = { mapId: previewMap, page: null, before: [], characterId: model.characterId };
  }

  return (
    <EditorStack>
      <FieldRow>
        <CharacterField label={'Who moves'} value={model.characterId} onChange={characterId => change({ ...model, characterId })}/>
        {common
          ? <MapPicker label={'Show it on'} value={previewMap} onChange={setPreviewMap}/>
          : null}
      </FieldRow>
      <MoveRouteEditor mode={'command'} route={model.route} setting={setting} onChange={route => change({ ...model, route })}/>
    </EditorStack>
  );
};

export { SetMovementRouteEditor };
