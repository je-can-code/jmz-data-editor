import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { closedTiles, type LandingGround, type LandingProblem } from '../../core/locations/landingCheck.ts';
import { hoverWords, pickProblem } from '../../core/locations/landingPicker.ts';
import type { MapCell } from '../../core/renderer/camera.ts';
import {
  NO_OVERLAY_STATE,
  type CellRect,
  type MapRenderer,
  type OverlayDefinition,
  type OverlayId,
  type OverlayStyle,
} from '../../core/renderer/MapRenderer.ts';
import { MapGlanceSurface, tileRect, useGlancePointer, useMapGlance } from '../../render/useMapGlance.tsx';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';

/**
 * What a location picker's map shows, and whom it tells about clicks.
 */
type LocationPickerMapProps = {
  /**
   * The map to show.
   */
  readonly mapId: number;

  /**
   * The tile picked on that map, outlined, or null while none is.
   */
  readonly picked: MapCell | null;

  /**
   * The tile to centre on once the map opens, at the game's own scale, or null to show the whole map.
   */
  readonly focus: MapCell | null;

  /**
   * Whether the player lands on the tile picked: the map then shades every tile the player cannot land on, and a click
   * on one is refused rather than picked. Left out, every tile can be picked.
   */
  readonly landing?: boolean;

  /**
   * Hears a tile clicked that can be picked.
   * @param {MapCell} cell The tile.
   */
  readonly onPick: (cell: MapCell) => void;

  /**
   * Hears a tile double-clicked that can be picked, which picks it and finishes.
   * @param {MapCell} cell The tile.
   */
  readonly onConfirm: (cell: MapCell) => void;

  /**
   * Hears a tile clicked or double-clicked that the player cannot land on, which is refused.
   * @param {MapCell} cell The tile.
   * @param {LandingProblem} problem Why the player cannot land there.
   */
  readonly onRefuse?: (cell: MapCell, problem: LandingProblem) => void;

  /**
   * Hears the map shown made ready to judge as a landing, once it opens and whenever what landings are judged by
   * changes, and null while none is shown or the picker judges nothing.
   * @param {LandingGround | null} ground The map, ready to judge.
   */
  readonly onGround?: (ground: LandingGround | null) => void;
};

/**
 * The overlays a picker's map shows: the grid, so every tile reads as a tile; the tile picked and the one under the
 * pointer; and the markers of events that draw no picture, such as doors, so the spots beside them can be found.
 */
const PICKER_OVERLAYS: readonly OverlayId[] = [ 'grid', 'selection', 'hover', 'markers' ];

/**
 * How a tile the player cannot land on is shaded: a red wash, light enough that the map shows through it.
 */
const CLOSED_STYLE: OverlayStyle = { fill: 0xd32f2f, fillAlpha: 0.38 };

/**
 * No overlays of the picker's own, for a pick judged by nothing.
 */
const NO_DEFINITIONS: readonly OverlayDefinition[] = [];

/**
 * Hands a renderer what a picker draws over the map: the tile under the pointer with its words beside it, and the tile
 * picked. The picked tile is handed over as the same rectangle until it changes, so the pointer moving never redraws it.
 * @param {MapRenderer | null} renderer The renderer, or null while there is none.
 * @param {MapCell | null} hover The tile under the pointer, or null.
 * @param {string | null} label The words beside it, or null.
 * @param {CellRect | null} picked The tile picked, or null.
 */
const showPickerOverlay = (renderer: MapRenderer | null, hover: MapCell | null, label: string | null, picked: CellRect | null): void =>
{
  renderer?.setOverlayState({
    ...NO_OVERLAY_STATE,
    hover: hover === null ? null : tileRect(hover),
    hoverLabel: label,
    selectedCells: picked,
  });
};

/**
 * One map to pick a tile on, drawn by the real renderer as the game draws it, events and all, with the grid over it.
 * The wheel zooms and the right button pans, as in every map view; the left button picks the tile under it, and a
 * double-click picks it and finishes. The tile under the pointer shows its coordinates beside it.
 *
 * Choosing where the player lands, the map is judged as it opens, by the window's landings: each tile the player cannot
 * land on is shaded, says so under the pointer, and is refused when clicked, whoever hears why.
 *
 * The map is only looked at, never held ({@link useMapGlance}). Each map opened centres on the focus tile when it has
 * one on that map, and otherwise shows the whole map. Until the map asked for has opened, the pointer picks nothing; a
 * map that cannot be opened says why in place of the canvas, and so does a window that cannot draw one more map just
 * now, as every map view does.
 * @param {LocationPickerMapProps} props The map, the tile picked, where to centre, and who hears the clicks.
 * @returns {React.JSX.Element} The map.
 */
const LocationPickerMap = (props: LocationPickerMapProps) =>
{
  const { mapId, picked, focus, landing = false, onPick, onConfirm, onRefuse, onGround } = props;
  const { landings } = useMapEditorServices();
  const host = useRef<HTMLDivElement | null>(null);
  const closedRef = useRef<readonly CellRect[]>([]);

  // the shading draws as an overlay of its own, from whichever map was judged last.
  const definitions = useMemo<readonly OverlayDefinition[]>(() => (landing
    ? [ {
      id: 'landing.closed',
      title: 'No landing',
      defaultOn: true,
      draw: (painter, context) =>
      {
        const size = context.tileSize;
        closedRef.current.forEach(rect => painter.rect(rect.x * size, rect.y * size, rect.width * size, rect.height * size, CLOSED_STYLE));
      },
    } ]
    : NO_DEFINITIONS), [ landing ]);
  const glance = useMapGlance({ host, mapId, focus, overlays: PICKER_OVERLAYS, definitions });
  const { renderer, opened } = glance;
  const hoverRef = useRef<MapCell | null>(null);
  const pickedRef = useRef<CellRect | null>(null);

  // the map is judged as it opens, and again only when what every landing is judged by changes.
  const judge = useSyncExternalStore(landings.subscribe, () => landings.judge);
  const ground = useMemo(
    () => (landing && opened !== null ? landings.groundFor(opened.map, opened.tileset, judge) : null),
    [ landing, opened, landings, judge ],
  );
  const groundRef = useRef(ground);
  groundRef.current = ground;

  // the shading follows the judgement, and whoever listens hears it.
  const groundHeard = useRef(onGround);
  groundHeard.current = onGround;
  useEffect(() =>
  {
    closedRef.current = ground === null ? [] : closedTiles(ground);
    renderer.current?.refreshOverlays();
    groundHeard.current?.(ground);
  }, [ renderer, ground ]);

  /**
   * Picks a tile, or refuses it when the player cannot land there.
   * @param {MapCell} cell The tile.
   * @param {(cell: MapCell) => void} take What picking it does.
   */
  const pickOrRefuse = (cell: MapCell, take: (cell: MapCell) => void) =>
  {
    const problem = pickProblem(groundRef.current, cell);
    if (problem === null)
    {
      take(cell);
      return;
    }

    onRefuse?.(cell, problem);
  };

  // the tile under the pointer is drawn with its words; the left button picks, a double-click finishes.
  useGlancePointer(host, glance, {
    onHover: cell =>
    {
      hoverRef.current = cell;
      showPickerOverlay(renderer.current, cell, cell === null ? null : hoverWords(cell, groundRef.current), pickedRef.current);
    },
    onPress: cell => pickOrRefuse(cell, onPick),
    onDoublePress: cell => pickOrRefuse(cell, onConfirm),
  });

  // outline the tile picked, keeping one rectangle for as long as the tile stays the same.
  useEffect(() =>
  {
    pickedRef.current = picked === null ? null : tileRect(picked);
    const hover = hoverRef.current;
    showPickerOverlay(renderer.current, hover, hover === null ? null : hoverWords(hover, groundRef.current), pickedRef.current);
  }, [ renderer, picked ]);

  return <MapGlanceSurface host={host} glance={glance} testId={'location-picker-map'} cursor={'crosshair'}/>;
};

export { LocationPickerMap };
export type { LocationPickerMapProps };
