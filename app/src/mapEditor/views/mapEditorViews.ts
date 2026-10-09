import { MAP_EDITOR_PATH, type WindowOpenResult, type WindowShell } from '../../core/infrastructure/shell/WindowShell.ts';
import { blueprintIdOfMap, blueprintMapId, isMappableBlueprintId } from '../core/model/documentKeys.ts';

/**
 * What one map editor window shows: the workspace, the full editor of one event, the common events, or the switches and
 * variables. Each comes from {@code map.html}; the query string says which, so every window is a plain URL the shell can
 * open and focus. The event may be one of a blueprint opened as a map, named by the id below zero the blueprint takes as a
 * map, which its URL spells as the blueprint's own id.
 */
type MapEditorView =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'event'; readonly mapId: number; readonly eventId: number }
  | { readonly kind: 'common-events' }
  | { readonly kind: 'switches-variables' };

/**
 * The name every map editor window's title ends with.
 */
const APP_TITLE = 'jmz-map-editor';

/**
 * Reads a query value as a positive whole number.
 * @param {string | null} value The value.
 * @returns {number | null} The number, or null when it is not one.
 */
const positiveInteger = (value: string | null): number | null =>
{
  if (value === null || /^\d+$/u.test(value) === false)
  {
    return null;
  }

  const number = Number.parseInt(value, 10);
  return number > 0
    ? number
    : null;
};

/**
 * Reads the map an event window's query names: a map by its id, or a blueprint opened as a map by the blueprint's id,
 * as the id below zero it takes as a map.
 * @param {URLSearchParams} params The query.
 * @returns {number | null} The map id, or null when the query names neither.
 */
const eventMapOf = (params: URLSearchParams): number | null =>
{
  const blueprintId = params.get('blueprint');
  if (blueprintId !== null)
  {
    return isMappableBlueprintId(blueprintId)
      ? blueprintMapId(blueprintId)
      : null;
  }

  return positiveInteger(params.get('map'));
};

/**
 * Works out what a window shows from its query string. Anything incomplete or unknown shows the workspace.
 * @param {string} search The query string, such as {@code ?view=event&map=12&event=5}, or
 * {@code ?view=event&blueprint=k3x9q2mf&event=5} for an event of a blueprint.
 * @returns {MapEditorView} The view.
 */
const parseMapEditorView = (search: string): MapEditorView =>
{
  const params = new URLSearchParams(search);
  if (params.get('view') === 'common-events')
  {
    return { kind: 'common-events' };
  }

  if (params.get('view') === 'switches-variables')
  {
    return { kind: 'switches-variables' };
  }

  if (params.get('view') !== 'event')
  {
    return { kind: 'workspace' };
  }

  const mapId = eventMapOf(params);
  const eventId = positiveInteger(params.get('event'));
  return mapId === null || eventId === null
    ? { kind: 'workspace' }
    : { kind: 'event', mapId, eventId };
};

/**
 * Builds the page a view lives at. The same view always builds the same path, which is what lets the shell focus
 * an event's window instead of opening a second one.
 * @param {MapEditorView} view The view.
 * @returns {string} The path from the origin's root.
 */
const mapEditorPath = (view: MapEditorView): string =>
{
  switch (view.kind)
  {
    case 'workspace':
      return MAP_EDITOR_PATH;
    case 'common-events':
      return `${MAP_EDITOR_PATH}?view=common-events`;
    case 'switches-variables':
      return `${MAP_EDITOR_PATH}?view=switches-variables`;
    case 'event':
    {
      const blueprintId = blueprintIdOfMap(view.mapId);
      return blueprintId === null
        ? `${MAP_EDITOR_PATH}?view=event&map=${view.mapId}&event=${view.eventId}`
        : `${MAP_EDITOR_PATH}?view=event&blueprint=${blueprintId}&event=${view.eventId}`;
    }
  }
};

/**
 * Builds a window's title.
 * @param {MapEditorView} view The view.
 * @returns {string} The title.
 */
const titleFor = (view: MapEditorView): string =>
{
  switch (view.kind)
  {
    case 'workspace':
      return APP_TITLE;
    case 'common-events':
      return `Common events - ${APP_TITLE}`;
    case 'switches-variables':
      return `Switches & Variables - ${APP_TITLE}`;
    case 'event':
      return blueprintIdOfMap(view.mapId) === null
        ? `Event ${view.eventId} on map ${view.mapId} - ${APP_TITLE}`
        : `Event ${view.eventId} of a blueprint - ${APP_TITLE}`;
  }
};

/**
 * Builds an event window's title once its event has arrived: the event's name, then its map's, so a row of event
 * windows reads as the events they edit.
 * @param {string} eventName The event's name.
 * @param {string} mapName The map's name.
 * @returns {string} The title.
 */
const eventWindowTitle = (eventName: string, mapName: string): string =>
{
  return `${eventName} - ${mapName} - ${APP_TITLE}`;
};

/**
 * Opens an event's full editor in its own window, or brings forward the window already editing it: what a
 * double-click on an event does. It opens wide enough for a page's settings beside its commands. An event of a blueprint
 * opened as a map opens the same way, its window named for the blueprint.
 * @param {WindowShell} shell The page's window shell.
 * @param {number} mapId The map the event is on, or the id a blueprint opened as a map takes.
 * @param {number} eventId The event id.
 * @returns {WindowOpenResult} What became of it.
 */
const openEventWindow = (shell: WindowShell, mapId: number, eventId: number): WindowOpenResult =>
{
  const view: MapEditorView = { kind: 'event', mapId, eventId };
  const blueprintId = blueprintIdOfMap(mapId);
  const name = blueprintId === null ? `jmz-event-${mapId}-${eventId}` : `jmz-blueprint-event-${blueprintId}-${eventId}`;
  return shell.open({ path: mapEditorPath(view), name, width: 1240, height: 820 });
};

/**
 * Opens the common events in a window of their own, or brings forward the one already showing them.
 * @param {WindowShell} shell The page's window shell.
 * @returns {WindowOpenResult} What became of it.
 */
const openCommonEventsWindow = (shell: WindowShell): WindowOpenResult =>
{
  return shell.open({ path: mapEditorPath({ kind: 'common-events' }), name: 'jmz-common-events', width: 1280, height: 860 });
};

/**
 * Opens the switches and variables in a window of their own, or brings forward the one already showing them: the
 * Switches & Variables button's and the map views' preview chip's way there.
 * @param {WindowShell} shell The page's window shell.
 * @returns {WindowOpenResult} What became of it.
 */
const openSwitchesVariablesWindow = (shell: WindowShell): WindowOpenResult =>
{
  return shell.open({ path: mapEditorPath({ kind: 'switches-variables' }), name: 'jmz-switches-variables', width: 1180, height: 860 });
};

export {
  APP_TITLE,
  eventWindowTitle,
  mapEditorPath,
  openCommonEventsWindow,
  openEventWindow,
  openSwitchesVariablesWindow,
  parseMapEditorView,
  titleFor,
};
export type { MapEditorView };
