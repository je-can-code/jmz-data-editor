import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { LandingGround } from '../../core/locations/landingCheck.ts';
import type { MapCell } from '../../core/renderer/camera.ts';
import {
  NO_OVERLAY_STATE,
  type CellRect,
  type GhostEvent,
  type MapRenderer,
  type OverlayDefinition,
  type OverlayId,
  type OverlayStyle,
} from '../../core/renderer/MapRenderer.ts';
import { MapGlanceSurface, tileRect, useGlancePointer, useMapGlance, type GlancedMap } from '../../render/useMapGlance.tsx';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';

/**
 * What a pane marks on its map: the tiles the new ends will stand on, the door's picture where it will stand, and the
 * tile the player lands on there, green where they can stand and red where they cannot.
 */
type PaneMarks = {
  readonly areas: readonly CellRect[];
  readonly ghosts: readonly GhostEvent[];
  readonly landing: { readonly cell: MapCell; readonly ok: boolean } | null;
};

/**
 * What one pane of the transfer placer shows, and whom it tells about the pointer.
 */
type PairMapPaneProps = {
  /**
   * The map to show.
   */
  readonly mapId: number;

  /**
   * The tile to centre on once the map opens, at the game's own scale, or null to show the whole map.
   */
  readonly focus: MapCell | null;

  /**
   * What to mark on the map.
   */
  readonly marks: PaneMarks;

  /**
   * The test id of the element the map is drawn into.
   */
  readonly testId: string;

  /**
   * Hears the left button pressed on a tile.
   * @param {MapCell} cell The tile.
   */
  readonly onPress: (cell: MapCell) => void;

  /**
   * Hears the pointer reach another tile while the left button is held from a press on the map.
   * @param {MapCell} cell The tile.
   */
  readonly onDrag?: (cell: MapCell) => void;

  /**
   * Hears the tile under the pointer, or null when it leaves the map.
   * @param {MapCell | null} cell The tile.
   */
  readonly onHover?: (cell: MapCell | null) => void;

  /**
   * Hears the map open, and null until it has.
   * @param {GlancedMap | null} opened The map and its tileset.
   */
  readonly onOpened: (opened: GlancedMap | null) => void;

  /**
   * Hears the map made ready to judge as somewhere the player lands, and again whenever what landings are judged by
   * changes; null until it opens.
   * @param {LandingGround | null} ground The map, ready to judge.
   */
  readonly onGround: (ground: LandingGround | null) => void;
};

/**
 * The overlays a pane shows: the grid, so every tile reads as a tile; the tile under the pointer; the door's picture where
 * it will stand; and the markers of events that draw no picture, such as the shipped exits, so the spots beside them can
 * be found.
 */
const PANE_OVERLAYS: readonly OverlayId[] = [ 'grid', 'hover', 'ghost', 'markers' ];

/**
 * How the tiles a new end will stand on are drawn: an amber wash, outlined.
 */
const AREA_STYLE: OverlayStyle = { fill: 0xffb300, fillAlpha: 0.3, stroke: 0xffb300, strokeAlpha: 1, strokeWidth: 3 };

/**
 * How the tile the player lands on is drawn: green where they can stand, red where they cannot.
 */
const LANDING_STYLE: OverlayStyle = { fill: 0x43a047, fillAlpha: 0.55, stroke: 0xffffff, strokeAlpha: 0.9, strokeWidth: 2 };
const REFUSED_STYLE: OverlayStyle = { fill: 0xd32f2f, fillAlpha: 0.6, stroke: 0xffffff, strokeAlpha: 0.9, strokeWidth: 2 };

/**
 * Hands a renderer what a pane shows over the map besides its marks: the tile under the pointer with its words beside it,
 * and the door's picture where it will stand.
 * @param {MapRenderer | null} renderer The renderer, or null while there is none.
 * @param {MapCell | null} hover The tile under the pointer, or null.
 * @param {readonly GhostEvent[]} ghosts The pictures of the ends to come.
 */
const showPaneOverlay = (renderer: MapRenderer | null, hover: MapCell | null, ghosts: readonly GhostEvent[]): void =>
{
  renderer?.setOverlayState({
    ...NO_OVERLAY_STATE,
    hover: hover === null ? null : tileRect(hover),
    hoverLabel: hover === null ? null : `${hover.x}, ${hover.y}`,
    ghostEvents: ghosts,
  });
};

/**
 * One of the transfer placer's two maps, drawn by the real renderer as the game draws it, events and all, with the
 * grid over it, only looked at, never held, as a location picker's map is. The wheel zooms and the right button pans; the
 * left button presses on a tile, drags across tiles while held, and lets go anywhere. It marks the tiles the new ends
 * will stand on, the door's picture where it will stand, and where the player lands on it, and tells whoever listens
 * once the map has opened and is ready to judge landings on.
 * @param {PairMapPaneProps} props The map, where to centre, what to mark, and who hears the pointer.
 * @returns {React.JSX.Element} The pane.
 */
const PairMapPane = (props: PairMapPaneProps) =>
{
  const { mapId, focus, marks, testId, onPress, onDrag, onHover, onOpened, onGround } = props;
  const { landings } = useMapEditorServices();
  const host = useRef<HTMLDivElement | null>(null);

  // the marks draw as an overlay of the pane's own, from whatever they are when the map draws.
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const definitions = useMemo<readonly OverlayDefinition[]>(() => [ {
    id: 'pair.marks',
    title: 'New transfer',
    defaultOn: true,
    draw: (painter, context) =>
    {
      const size = context.tileSize;
      const { areas, landing } = marksRef.current;
      areas.forEach(rect => painter.rect(rect.x * size, rect.y * size, rect.width * size, rect.height * size, AREA_STYLE));
      if (landing !== null)
      {
        const inset = size / 4;
        painter.rect(landing.cell.x * size + inset, landing.cell.y * size + inset, size / 2, size / 2, landing.ok ? LANDING_STYLE : REFUSED_STYLE);
      }
    },
  } ], []);
  const glance = useMapGlance({ host, mapId, focus, overlays: PANE_OVERLAYS, definitions });
  const { renderer, opened } = glance;

  // the map is judged as it opens, and again only when what every landing is judged by changes.
  const judge = useSyncExternalStore(landings.subscribe, () => landings.judge);
  const ground = useMemo(() => (opened === null ? null : landings.groundFor(opened.map, opened.tileset, judge)), [ opened, landings, judge ]);

  // whoever listens hears the map open and its ground, each once it changes.
  const heard = useRef({ onOpened, onGround });
  heard.current = { onOpened, onGround };
  useEffect(() =>
  {
    heard.current.onOpened(opened);
  }, [ opened ]);
  useEffect(() =>
  {
    heard.current.onGround(ground);
  }, [ ground ]);

  // the marks and the pictures are drawn again whenever they change, the pointer's tile kept as it was.
  const hoverRef = useRef<MapCell | null>(null);
  const marksKey = JSON.stringify(marks);
  useEffect(() =>
  {
    renderer.current?.refreshOverlays();
    showPaneOverlay(renderer.current, hoverRef.current, marksRef.current.ghosts);
  }, [ renderer, marksKey ]);

  // a press starts a drag that the pointer carries across tiles until the left button is let go.
  const pressed = useRef(false);
  useGlancePointer(host, glance, {
    onHover: cell =>
    {
      hoverRef.current = cell;
      showPaneOverlay(renderer.current, cell, marksRef.current.ghosts);
      onHover?.(cell);
      if (pressed.current && cell !== null)
      {
        onDrag?.(cell);
      }
    },
    onPress: cell =>
    {
      pressed.current = true;
      onPress(cell);
    },
    onRelease: () =>
    {
      pressed.current = false;
    },
  });

  return <MapGlanceSurface host={host} glance={glance} testId={testId} cursor={'crosshair'}/>;
};

export { PairMapPane };
export type { PaneMarks, PairMapPaneProps };
