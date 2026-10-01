import { mapHistoryKey, TREE_HISTORY_KEY, type HistoryKey } from '../history/historyKeys.ts';
import { isJsonObject, type JsonObject } from '../model/json.ts';

/**
 * The kinds of panel the workspace holds, by the component name dockview saves in a layout. Renaming one breaks
 * every saved layout that has it, which then falls back to the default layout.
 */
const PANEL_COMPONENTS = {
  map: 'map',
  mapTree: 'map-tree',
  history: 'history',
  properties: 'map-properties',
  palette: 'palette',
  layers: 'layers',
  quick: 'quick-settings',
  start: 'start',
} as const;

/**
 * One kind of panel.
 */
type PanelComponent = typeof PANEL_COMPONENTS[keyof typeof PANEL_COMPONENTS];

/**
 * The ids of the panels the workspace holds only one of.
 */
const SINGLE_PANEL_IDS = {
  mapTree: 'map-tree',
  history: 'history',
  properties: 'map-properties',
  palette: 'palette',
  layers: 'layers',
  quick: 'quick-settings',
  start: 'start',
} as const;

/**
 * The narrowest each side panel may be squeezed, in pixels, however the space is shared out: wide enough that the map
 * tree reads its names and the properties form keeps its fields legible. Maps and the start panel have no minimum of
 * their own beyond the dock's, so any number of maps can still sit side by side.
 */
const PANEL_MIN_WIDTHS: Readonly<Partial<Record<string, number>>> = {
  [PANEL_COMPONENTS.mapTree]: 240,
  [PANEL_COMPONENTS.palette]: 240,
  [PANEL_COMPONENTS.layers]: 240,
  [PANEL_COMPONENTS.properties]: 300,
  [PANEL_COMPONENTS.quick]: 300,
  [PANEL_COMPONENTS.history]: 240,
};

/**
 * Reads the narrowest a kind of panel may be squeezed.
 * @param {string} component The panel's kind.
 * @returns {number | undefined} Its minimum width in pixels, or undefined when the dock's own minimum applies.
 */
const minimumWidthFor = (component: string): number | undefined =>
{
  return PANEL_MIN_WIDTHS[component];
};

/**
 * Gives every panel in a saved layout the minimum width its kind has now, before the dock rebuilds the layout. The dock
 * keeps each panel's minimum in the layout it saves, so without this a layout saved before a minimum existed, or
 * before one changed, would come back without it, and a column already squeezed to a sliver would stay one.
 * @param {JsonObject} saved The saved layout.
 * @returns {JsonObject} A copy with each panel's minimum width set, or cleared where its kind has none.
 */
const withPanelMinimums = (saved: JsonObject): JsonObject =>
{
  const { panels } = saved;
  if (isJsonObject(panels) === false)
  {
    return saved;
  }

  const sized = Object.fromEntries(Object.entries(panels).map(([ id, state ]) =>
  {
    if (isJsonObject(state) === false)
    {
      return [ id, state ];
    }

    const { minimumWidth: _old, ...rest } = state;
    const { contentComponent } = state;
    const minimum = typeof contentComponent === 'string' ? minimumWidthFor(contentComponent) : undefined;
    return [ id, minimum === undefined ? rest : { ...rest, minimumWidth: minimum } ];
  }));
  return { ...saved, panels: sized };
};

/**
 * What a map panel keeps in the layout: which map it shows.
 */
type MapPanelParams = {
  readonly mapId: number;
};

/**
 * Where a drop landed on a panel group, as dockview reports it.
 */
type DropPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * Where a new panel goes relative to a group, as dockview takes it.
 */
type PanelDirection = 'above' | 'below' | 'left' | 'right' | 'within';

/**
 * The drag data type a map dragged from the tree carries, so a panel group knows to open it.
 */
const MAP_DRAG_TYPE = 'application/x-jmz-maps';

/**
 * Reads a map panel's parameters, refusing anything else.
 * @param {unknown} params The panel's parameters.
 * @returns {boolean} True when they name a map.
 */
const isMapPanelParams = (params: unknown): params is MapPanelParams =>
{
  if (typeof params !== 'object' || params === null)
  {
    return false;
  }

  const { mapId } = params as { mapId?: unknown };
  return typeof mapId === 'number' && Number.isInteger(mapId) && mapId > 0;
};

/**
 * Names a new map panel, the map's own name first and a numbered one for each further view of the same map.
 * @param {number} mapId The map.
 * @param {readonly string[]} takenIds Every panel id in use.
 * @returns {string} A free id.
 */
const mapPanelId = (mapId: number, takenIds: readonly string[]): string =>
{
  const taken = new Set(takenIds);
  const first = `map-${mapId}`;
  if (taken.has(first) === false)
  {
    return first;
  }

  let copy = 2;
  while (taken.has(`${first}-${copy}`))
  {
    copy += 1;
  }

  return `${first}-${copy}`;
};

/**
 * Turns where a drop landed on a group into where the new panel goes: its middle stacks a tab in the group, and an
 * edge splits the group that way.
 * @param {DropPosition} position Where the drop landed.
 * @returns {PanelDirection} Where the panel goes.
 */
const directionForDrop = (position: DropPosition): PanelDirection =>
{
  switch (position)
  {
    case 'top':
      return 'above';
    case 'bottom':
      return 'below';
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    case 'center':
      return 'within';
  }
};

/**
 * Writes the maps a drag carries as its data.
 * @param {readonly number[]} mapIds The maps.
 * @returns {string} The data.
 */
const encodeDraggedMaps = (mapIds: readonly number[]): string =>
{
  return JSON.stringify(mapIds);
};

/**
 * Reads the maps a drag carries, ignoring anything that is not a list of map ids.
 * @param {string} data The drag's data.
 * @returns {number[]} The maps, or none.
 */
const decodeDraggedMaps = (data: string): number[] =>
{
  try
  {
    const parsed: unknown = JSON.parse(data);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
      : [];
  }
  catch
  {
    return [];
  }
};

/**
 * Works out which history a panel owns, which is what undo acts on while it has focus: a map panel its map's, the
 * tree the tree's, and the properties panel the history of the map it shows. The history panel and the
 * placeholders own none, so focusing them leaves undo where it was.
 * @param {string} component The panel's kind.
 * @param {unknown} params The panel's parameters.
 * @param {number | null} currentMapId The map the properties panel shows, or null.
 * @returns {HistoryKey | null | undefined} The history, null for "none at all", or undefined to keep the last one.
 */
const historyOwnedBy = (component: string, params: unknown, currentMapId: number | null): HistoryKey | null | undefined =>
{
  switch (component)
  {
    case PANEL_COMPONENTS.map:
      return isMapPanelParams(params)
        ? mapHistoryKey(params.mapId)
        : undefined;
    case PANEL_COMPONENTS.mapTree:
      return TREE_HISTORY_KEY;
    case PANEL_COMPONENTS.properties:
      return currentMapId === null
        ? null
        : mapHistoryKey(currentMapId);
    default:
      return undefined;
  }
};

export {
  decodeDraggedMaps,
  directionForDrop,
  encodeDraggedMaps,
  historyOwnedBy,
  isMapPanelParams,
  MAP_DRAG_TYPE,
  mapPanelId,
  minimumWidthFor,
  PANEL_COMPONENTS,
  SINGLE_PANEL_IDS,
  withPanelMinimums,
};
export type { DropPosition, MapPanelParams, PanelComponent, PanelDirection };
