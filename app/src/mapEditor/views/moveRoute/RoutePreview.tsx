import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Button, Typography } from '@mui/material';
import type { RmmzEventImage, RmmzMoveCommand } from '../../core/model/rmmzTypes.ts';
import { routeStart, walkerImage, type RouteSetting, type RouteStart } from '../../core/moveRoutes/routeStart.ts';
import { walkRoute, type RouteWalk, type Walker } from '../../core/moveRoutes/routeWalk.ts';
import type { MapCell } from '../../core/renderer/camera.ts';
import { NO_OVERLAY_STATE, type CellRect, type GhostEvent, type OverlayDefinition, type OverlayId } from '../../core/renderer/MapRenderer.ts';
import { walkMapOf } from '../../render/engine/walkPassage.ts';
import { MapGlanceSurface, tileRect, useGlancePointer, useMapGlance } from '../../render/useMapGlance.tsx';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { drawRouteWalk } from './routeOverlay.ts';

/**
 * What a route preview shows, and whom it tells about clicks.
 */
type RoutePreviewProps = {
  /**
   * Where the route runs and who walks it.
   */
  readonly setting: RouteSetting;

  /**
   * The route's steps, without the step ending it.
   */
  readonly steps: readonly RmmzMoveCommand[];

  /**
   * Whether the route skips the steps it cannot take.
   */
  readonly skippable: boolean;

  /**
   * Where the author put the walker, or null to start it where the editor works out.
   */
  readonly startAt: MapCell | null;

  /**
   * The step the walker is shown standing after, or null to show it where it starts.
   */
  readonly shownStep: number | null;

  /**
   * Hears a click on the map, which puts the walker there, or null when the author puts it back.
   * @param {MapCell | null} cell The tile, or null.
   */
  readonly onStartAt: (cell: MapCell | null) => void;
};

/**
 * The overlays the preview draws besides the route: where the walker starts, the tile under the pointer, the walker
 * itself, and the markers of events that draw no picture, so the doors and switches it walks past can be found.
 */
const PREVIEW_OVERLAYS: readonly OverlayId[] = [ 'selection', 'hover', 'ghost', 'markers' ];

/**
 * How far in the map sits when it centres on the walker: the game's own scale.
 */
const PREVIEW_ZOOM = 1;

/**
 * The picture a walker shows when the map has none for it, such as the player: none, so only its tile is outlined.
 */
const NO_PICTURE: RmmzEventImage = { tileId: 0, characterName: '', direction: 2, pattern: 1, characterIndex: 0 };

/**
 * Says where the route starts and how the editor knows, in the author's words.
 * @param {RouteStart} start Where the editor works out the route starts.
 * @param {MapCell | null} startAt Where the author put the walker, or null.
 * @param {number} characterId Who walks it.
 * @returns {string} The words.
 */
const startWords = (start: RouteStart, startAt: MapCell | null, characterId: number): string =>
{
  if (startAt !== null)
  {
    return `Starts at ${startAt.x}, ${startAt.y}, where you put it.`;
  }

  const { x, y } = start.walker;
  switch (start.from)
  {
    case 'earlier':
      return `Starts at ${x}, ${y}, where the moves before it on this page leave it.`;
    case 'placed':
      return characterId < 0
        ? `Starts at ${x}, ${y}, on the tile of the event running it, the nearest the page can say to where the player stands.`
        : `Starts at ${x}, ${y}, where it stands on the map.`;
    case 'unknown':
      return 'Starts in the middle of the map, since nothing here says where it stands.';
  }
};

/**
 * Says where a route that holds stops for good, or nothing for one that runs through.
 * @param {RouteWalk} walk The walk.
 * @returns {string} The words, or an empty string.
 */
const stuckWords = (walk: RouteWalk): string =>
{
  return walk.stuck
    ? ` It stops for good at step ${walk.steps.length}: something is in the way, and the route does not skip what it cannot do.`
    : '';
};

/**
 * Finds where the walker stands after a step, facing as it does then: where it starts before any, and where the walk
 * ends after a step it never reached, past a step that held it for good.
 * @param {Walker} start Where it starts.
 * @param {RouteWalk} walk The walk.
 * @param {number | null} step The step, or null for its start.
 * @returns {Walker} Where it stands.
 */
const standingAfter = (start: Walker, walk: RouteWalk, step: number | null): Walker =>
{
  if (step === null)
  {
    return start;
  }

  const taken = walk.steps[step];
  return taken === undefined
    ? walk.end
    : { ...start, x: taken.to.x, y: taken.to.y, facing: taken.facing };
};

/**
 * A map showing where a route goes: the real map around the walker, with the route drawn from where it starts, step by
 * step through the map's own walls, and the walker itself, drawn as its page's picture, standing where the step chosen
 * in the list leaves it, the view following it there. A click on the map puts the walker there, for routes whose
 * walker the page cannot place; the line beneath says where the route starts and how the editor knows, and puts it
 * back.
 *
 * Nothing here edits the map or holds it ({@link useMapGlance}); where the walker starts is the editor's guess, never
 * written anywhere.
 * @param {RoutePreviewProps} props The route, where it runs, where it starts, the step shown, and who hears clicks.
 * @returns {React.JSX.Element} The preview.
 */
const RoutePreview = (props: RoutePreviewProps) =>
{
  const { setting, steps, skippable, startAt, shownStep, onStartAt } = props;
  const { modules } = useMapEditorServices();
  const host = useRef<HTMLDivElement | null>(null);
  const walkRef = useRef<RouteWalk | null>(null);
  const hoverRef = useRef<MapCell | null>(null);
  const startRectRef = useRef<CellRect | null>(null);

  // the route draws as an overlay of its own, from whichever walk was worked out last.
  const definitions = useMemo<OverlayDefinition[]>(() => [ {
    id: 'route.walk',
    title: 'Route',
    defaultOn: true,
    draw: (painter, context) =>
    {
      const walk = walkRef.current;
      if (walk !== null)
      {
        drawRouteWalk(painter, walk, context.tileSize);
      }
    },
  } ], []);
  const glance = useMapGlance({ host, mapId: setting.mapId, focus: null, overlays: PREVIEW_OVERLAYS, definitions });
  const { renderer, opened } = glance;

  // once the map is open, the walk is worked out afresh on every change: where it starts, then every step from there.
  const walkMap = useMemo(() => (opened === null ? null : walkMapOf(opened.map, opened.tileset, modules.passabilityRules())), [ opened, modules ]);
  const start = opened === null || walkMap === null ? null : routeStart(setting, opened.map, walkMap);
  const walker = start === null ? null : { ...start.walker, ...startAt };
  const walk = walker === null || walkMap === null ? null : walkRoute(walker, steps, walkMap, skippable);
  const standing = walker === null || walk === null ? null : standingAfter(walker, walk, shownStep);
  const image = opened === null ? null : walkerImage(setting, opened.map);
  walkRef.current = walk;

  // the start's outline stays one rectangle while the start stays put, so the pointer moving never redraws it.
  const startRect = startRectRef.current;
  if (walker !== null && (startRect === null || startRect.x !== walker.x || startRect.y !== walker.y))
  {
    startRectRef.current = tileRect(walker);
  }

  // the overlay is handed over from the pointer's listeners too, which outlive any one render.
  const shown = useRef({ standing, image });
  shown.current = { standing, image };

  /**
   * Hands the renderer where the walker starts, the walker where it stands, and the tile under the pointer with its
   * coordinates.
   */
  const showOverlay = useCallback(() =>
  {
    const hover = hoverRef.current;
    const { standing: at, image: picture } = shown.current;
    const ghost: GhostEvent[] = at === null
      ? []
      : [ { x: at.x, y: at.y, image: { ...(picture ?? NO_PICTURE), direction: at.facing, pattern: 1 }, priorityType: 1 } ];
    renderer.current?.setOverlayState({
      ...NO_OVERLAY_STATE,
      hover: hover === null ? null : tileRect(hover),
      hoverLabel: hover === null ? null : `${hover.x}, ${hover.y}`,
      selectedCells: startRectRef.current,
      ghostEvents: ghost,
    });
  }, [ renderer ]);

  // the route and the walker redraw with every change to the walk, the start or the step shown.
  const walkSignature = JSON.stringify([ walk, standing, image ]);
  useEffect(() =>
  {
    showOverlay();
    renderer.current?.refreshOverlays();
  }, [ walkSignature, showOverlay, renderer ]);

  // a map opening shows the walker where it starts, at the game's own scale.
  const walkerRef = useRef(walker);
  walkerRef.current = walker;
  useEffect(() =>
  {
    const first = walkerRef.current;
    if (opened !== null && first !== null)
    {
      renderer.current?.lookAt(first, PREVIEW_ZOOM);
    }
  }, [ renderer, opened ]);

  // choosing a step brings the walker into sight where it stands then, at the zoom the view already has, so the view
  // follows a long route step by step; a click on the map moves the start without moving the view.
  const standingRef = useRef(standing);
  standingRef.current = standing;
  useEffect(() =>
  {
    const at = standingRef.current;
    const view = renderer.current;
    if (shownStep !== null && at !== null && view !== null)
    {
      view.lookAt(at, view.camera.zoom);
    }
  }, [ renderer, shownStep ]);

  // the pointer's tile shows its coordinates, and a click puts the walker there.
  useGlancePointer(host, glance, {
    onHover: cell =>
    {
      hoverRef.current = cell;
      showOverlay();
    },
    onPress: onStartAt,
  });

  return (
    <Box>
      <Box sx={{ position: 'relative', height: 300, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        <MapGlanceSurface host={host} glance={glance} testId={'route-preview-map'} cursor={'crosshair'}/>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
        <Typography variant={'caption'} color={'text.secondary'} data-testid={'route-preview-start'} sx={{ flex: 1 }}>
          {start === null || walk === null ? '' : `${startWords(start, startAt, setting.characterId)}${stuckWords(walk)} Click the map to start it elsewhere.`}
        </Typography>
        {startAt === null
          ? null
          : (
            <Button size={'small'} onClick={() => onStartAt(null)}>
              Put it back
            </Button>
          )}
      </Box>
    </Box>
  );
};

export { RoutePreview };
export type { RoutePreviewProps };
