import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { Transaction } from '../history/Transaction.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzMapProperties } from '../model/rmmzTypes.ts';
import { planResize, type ResizeAnchor, type ResizePlan } from './resizeMap.ts';

/**
 * The map properties the form edits directly. The size changes only with the tiles, through a resize, and
 * {@code meta} is carried as the file had it, never edited.
 */
type EditableMapProperty = Exclude<keyof RmmzMapProperties, 'width' | 'height' | 'meta'>;

/**
 * Some of a map's editable properties, with their new values.
 */
type MapPropertyChanges = Partial<Pick<RmmzMapProperties, EditableMapProperty>>;

/**
 * What the history panel calls a change to each property. Properties the form shows together share a name, so a
 * change to any of them reads the same.
 */
const PROPERTY_LABELS: Readonly<Record<EditableMapProperty, string>> = {
  displayName: 'Change display name',
  tilesetId: 'Change tileset',
  scrollType: 'Change scrolling',
  autoplayBgm: 'Change music',
  bgm: 'Change music',
  autoplayBgs: 'Change ambience',
  bgs: 'Change ambience',
  specifyBattleback: 'Change battle backgrounds',
  battleback1Name: 'Change battle backgrounds',
  battleback2Name: 'Change battle backgrounds',
  disableDashing: 'Change dashing',
  parallaxName: 'Change parallax',
  parallaxLoopX: 'Change parallax',
  parallaxLoopY: 'Change parallax',
  parallaxSx: 'Change parallax',
  parallaxSy: 'Change parallax',
  parallaxShow: 'Change parallax',
  encounterList: 'Change encounters',
  encounterStep: 'Change encounters',
  note: 'Change note',
};

/**
 * Names a change to some properties: their shared name, or a general one when they differ.
 * @param {readonly EditableMapProperty[]} names The properties changed.
 * @returns {string} The label.
 */
const labelForProperties = (names: readonly EditableMapProperty[]): string =>
{
  const labels = [ ...new Set(names.map(name => PROPERTY_LABELS[name])) ];
  return labels.length === 1
    ? labels[0]
    : 'Change map properties';
};

/**
 * Writes some of a map's properties inside an open transaction; a property already holding its new value adds nothing
 * to it.
 * @param {Transaction} tx The open transaction.
 * @param {number} mapId The map.
 * @param {MapPropertyChanges} changes The properties and their new values.
 */
const applyPropertyChanges = (tx: Transaction, mapId: number, changes: MapPropertyChanges): void =>
{
  const key = mapDocumentKey(mapId);
  const names = Object.keys(changes) as EditableMapProperty[];
  names.forEach(name => tx.set(key, [ name ], changes[name] as unknown as JsonValue));
};

/**
 * Changes some of a map's properties as one step in the map's own history, so it undoes from that map's panel,
 * its properties or the history panel alike. Properties already holding their new values change nothing, and a
 * change that changes nothing records nothing.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {MapPropertyChanges} changes The properties and their new values.
 * @returns {HistoryStep | null} The step, or null when nothing changed.
 */
const editMapProperties = (hub: DocumentHub, mapId: number, changes: MapPropertyChanges): HistoryStep | null =>
{
  const names = Object.keys(changes) as EditableMapProperty[];
  if (names.length === 0)
  {
    return null;
  }

  return hub.edit(labelForProperties(names), [ mapHistoryKey(mapId) ], tx => applyPropertyChanges(tx, mapId, changes));
};

/**
 * Works out a resize of a held map without making it, for the form to show what it would do.
 * @param {MapDocument} map The map.
 * @param {number} width The new width.
 * @param {number} height The new height.
 * @param {ResizeAnchor} anchor What stays put.
 * @returns {ResizePlan} The plan.
 */
const previewResize = (map: MapDocument, width: number, height: number, anchor: ResizeAnchor): ResizePlan =>
{
  return planResize({ width: map.width, height: map.height, cells: map.cells, events: map.events }, width, height, anchor);
};

/**
 * Resizes a map as one step in its history: the tiles carried to where the anchor puts them, every event shifted
 * with them, and the events left outside the new size removed, all of which one undo puts back.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {number} width The new width.
 * @param {number} height The new height.
 * @param {ResizeAnchor} anchor What stays put.
 * @returns {HistoryStep | null} The step, or null when the size did not change.
 */
const resizeMap = (hub: DocumentHub, mapId: number, width: number, height: number, anchor: ResizeAnchor): HistoryStep | null =>
{
  const key = mapDocumentKey(mapId);
  const map = hub.map(key);
  if (map.width === width && map.height === height)
  {
    return null;
  }

  const plan = previewResize(map, width, height, anchor);
  return hub.edit(`Resize to ${width} by ${height}`, [ mapHistoryKey(mapId) ], tx =>
  {
    plan.dropped.forEach(id => tx.set(key, [ 'events', id ], null));
    plan.moved.forEach(({ id, x, y }) =>
    {
      tx.set(key, [ 'events', id, 'x' ], x);
      tx.set(key, [ 'events', id, 'y' ], y);
    });
    tx.resize(key, plan.tiles);
  });
};

export { applyPropertyChanges, editMapProperties, labelForProperties, previewResize, PROPERTY_LABELS, resizeMap };
export type { EditableMapProperty, MapPropertyChanges };
