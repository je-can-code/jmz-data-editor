import { blueprintLinkOf } from '../blueprints/blueprintLink.ts';
import { placeBlueprint } from '../blueprints/blueprintPlacement.ts';
import { liveBlueprintsIn } from '../blueprints/blueprints.ts';
import { carrySpans, spansOnMap, spansWithin } from '../blueprints/placementSpans.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect, GhostEvent, GhostTile } from '../renderer/MapRenderer.ts';
import { placeStamp, type StampOutcome } from '../stamps/stampPlacement.ts';
import { previewStamp } from '../stamps/stampPreview.ts';
import type { Shaping, TilesetLayering } from '../tiles/layering.ts';
import type { TileLayerIndex } from '../tiles/tileGrid.ts';
import { fitsTileset, type Brush, type BrushKind } from './brush.ts';
import { cellsInEllipse, cellsInRect, clipRect, rectangleBetween, rectContains } from './geometry.ts';
import {
  hasShadow,
  pickBrush,
  planBrush,
  planErase,
  planFill,
  planShadowQuarters,
  planSwap,
  type PaintContext,
  type ShadowQuarter,
} from './paintPlan.ts';
import { isPaintingTool, type PaintSettings, type PaintTool } from './PaintState.ts';
import { applyTileEdit, FreehandTrail, PaintStroke, QuarterTrail } from './strokes.ts';
import { captureClip, clipGhosts, planPlaceClip, type TileClip } from './tileClip.ts';
import { choiceFor, layerLabel, NO_PREVIEW, paintContextFor, previewTool, shapeGhosts, type LayerMode } from './toolPreview.ts';

/**
 * The pointer and the keys held with it, in map terms: the cell and the quarter under the pointer, whether Shift is
 * held (tiles go down exactly), whether Ctrl is held (the select tool copies rather than moves), and whether the
 * one-stroke override's key is held.
 */
type ToolPointer = {
  readonly cell: MapCell | null;
  readonly quarter: ShadowQuarter;
  readonly shift: boolean;
  readonly copy: boolean;
  readonly override: boolean;
};

/**
 * What the map should show for the tools: the brush cursor (the cells a click would reach, or the extent of a shape or
 * an eyedropper drag) and its words, the ghost preview, the selected area, and, for the stamp, the ghosts of the events
 * it would place and in red the tiles where another event stands in their way.
 */
type ToolOverlay = {
  readonly hover: CellRect | null;
  readonly hoverLabel: string | null;
  readonly ghostTiles: readonly GhostTile[];
  readonly selectedCells: CellRect | null;
  readonly ghostEvents: readonly GhostEvent[];
  readonly blockedCells: readonly MapCell[];
};

/**
 * What a session paints on and with.
 */
type ToolSessionHost = {
  /**
   * The window's documents and histories.
   */
  readonly hub: DocumentHub;

  /**
   * The map on show, or null before one is open.
   */
  map(): MapDocument | null;

  /**
   * The map's tileset layering: its mode and "goes on top" marks.
   */
  layering(map: MapDocument): TilesetLayering;

  /**
   * The window's painting settings.
   */
  settings(): PaintSettings;

  /**
   * Hands over a brush the eyedropper picked.
   */
  pickBrush(brush: Brush): void;

  /**
   * Takes up another tool, as the eyedropper does when it has picked.
   */
  pickTool(tool: PaintTool): void;

  /**
   * Hears what a click of the stamp tool came to: the events it placed, which take the selection, what it left out, or
   * why it was refused. Left out, nobody hears.
   */
  stamped?(outcome: StampOutcome): void;

  /**
   * Says why a map may hold no copy of a blueprint, or null when it may (see blueprintPlacement's link gate): the stamp
   * tool places neither a blueprint there nor a stamp carrying copies of one.
   */
  linkRefusal(mapId: number): string | null;
};

/**
 * A drag in progress, by what it is doing.
 */
type Gesture =
  | { readonly kind: 'idle' }
  | {
    readonly kind: 'freehand';
    readonly stroke: PaintStroke;
    readonly trail: FreehandTrail;
    readonly origin: MapCell;
    readonly brush: Brush | null;
    readonly erasing: BrushKind | null;
    readonly context: PaintContext;
    readonly label: string | null;
  }
  | { readonly kind: 'shadow'; readonly stroke: PaintStroke; readonly trail: QuarterTrail; readonly adding: boolean }
  | {
    readonly kind: 'shape';
    readonly map: MapDocument;
    readonly shape: 'rectangle' | 'ellipse';
    readonly anchor: MapCell;
    readonly brush: Brush;
    readonly context: PaintContext;
    readonly mode: LayerMode;
  }
  | { readonly kind: 'pick'; readonly anchor: MapCell; readonly brushKind: BrushKind; readonly mode: LayerMode }
  | { readonly kind: 'marquee'; readonly anchor: MapCell }
  | {
    readonly kind: 'drag-clip';
    readonly map: MapDocument;
    readonly clip: TileClip;
    readonly grab: MapCell;
    readonly copy: boolean;
    readonly mode: number;
  };

/**
 * The words a history row gives each kind of edit, by what the brush paints.
 */
const STEP_LABELS = {
  paint: { tiles: 'Paint tiles', regions: 'Paint regions', shadows: 'Shadow every quarter' },
  rectangle: { tiles: 'Draw a rectangle', regions: 'Draw a rectangle of regions', shadows: 'Shadow a rectangle' },
  ellipse: { tiles: 'Draw an ellipse', regions: 'Draw an ellipse of regions', shadows: 'Shadow an ellipse' },
  fill: { tiles: 'Fill', regions: 'Fill regions', shadows: 'Fill shadows' },
  erase: { tiles: 'Erase tiles', regions: 'Erase regions', shadows: 'Erase shadows' },
  swap: { tiles: 'Swap tiles', regions: 'Swap regions', shadows: 'Swap' },
} as const;

/**
 * The idle gesture.
 */
const IDLE: Gesture = { kind: 'idle' };

/**
 * What the stamp tool's cursor says over a map that may hold no copy of a blueprint, with a blueprint, or a stamp
 * carrying copies of one, in hand.
 */
const LINKS_REFUSED_LABEL = 'Blueprints can\'t go here';

/**
 * No ghost events and no blocked tiles: shared, so the renderer sees nothing change while none show.
 */
const NO_GHOST_EVENTS: readonly GhostEvent[] = Object.freeze([]);
const NO_CELLS: readonly MapCell[] = Object.freeze([]);

/**
 * An overlay showing nothing of the tools: no cursor, no words, no ghosts and no selected area.
 */
const NO_TOOL_OVERLAY: ToolOverlay = {
  hover: null,
  hoverLabel: null,
  ghostTiles: [],
  selectedCells: null,
  ghostEvents: NO_GHOST_EVENTS,
  blockedCells: NO_CELLS,
};

/**
 * One map view's painting: what the tool in hand does as the left button goes down, drags and comes up over the map,
 * and what the map shows for it meanwhile. It knows nothing of pointer events or pixels; the view hands it cells and
 * keys, and draws the overlay it answers with.
 *
 * Every edit is one step of the map's history: a pen, eraser or shadow pen stroke from press to release, however many
 * cells it crossed, and a rectangle, ellipse, fill, swap, move, copy or stamp as it lands. Everything a stroke paints
 * with is fixed when it starts: the brush, the tool, the layer (the override's while its key is held) and whether Shift
 * holds autotiles exact, so letting a key go mid-stroke never changes what the rest of the stroke does.
 */
class ToolSession
{
  #host: ToolSessionHost;

  #gesture: Gesture = IDLE;

  #pointer: ToolPointer | null = null;

  #selection: CellRect | null = null;

  #toolBeforePick: PaintTool = 'pen';

  /**
   * @param {ToolSessionHost} host What the session paints on and with.
   */
  constructor(host: ToolSessionHost)
  {
    this.#host = host;
    this.toolChanged(host.settings().tool);
  }

  /**
   * Whether a drag is in progress.
   * @returns {boolean} True between a press that started something and its release.
   */
  get isActive(): boolean
  {
    return this.#gesture.kind !== 'idle';
  }

  /**
   * The area the select tool has selected.
   * @returns {CellRect | null} The area, or null when nothing is selected.
   */
  get selection(): CellRect | null
  {
    return this.#selection;
  }

  /**
   * Starts whatever the tool in hand does at a press of the left button. Off the map, or with the events in hand, which
   * leave the left button to the event tools, nothing starts.
   * @param {ToolPointer} pointer Where, and the keys held.
   */
  press(pointer: ToolPointer): void
  {
    this.#pointer = pointer;
    const map = this.#host.map();
    const { cell } = pointer;
    if (map === null || cell === null || this.isActive || isPaintingTool(this.#host.settings().tool) === false)
    {
      return;
    }

    // the words the cursor showed just before the press stay with the stroke it starts.
    const { hoverLabel } = this.overlay();
    this.#guard(() => this.#start(map, cell, pointer, hoverLabel));
  }

  /**
   * Follows the pointer: a drag in progress carries on, and otherwise only the preview follows.
   * @param {ToolPointer} pointer Where, and the keys held.
   */
  move(pointer: ToolPointer): void
  {
    this.#pointer = pointer;
    if (pointer.cell !== null)
    {
      this.#guard(() => this.#continue(pointer));
    }
  }

  /**
   * Finishes the drag in progress at a release of the left button.
   * @param {ToolPointer} pointer Where, and the keys held.
   */
  release(pointer: ToolPointer): void
  {
    this.#pointer = pointer;
    if (pointer.cell !== null)
    {
      this.#guard(() => this.#continue(pointer));
    }

    const gesture = this.#gesture;
    this.#gesture = IDLE;
    this.#guard(() => this.#finish(gesture, pointer));
  }

  /**
   * Ends the drag in progress without the release that should have ended it, as when the pointer is lost or the
   * window loses focus: a stroke keeps what it painted, and a shape, a pick or a move that had not landed yet never
   * lands.
   */
  interrupt(): void
  {
    const gesture = this.#gesture;
    this.#gesture = IDLE;
    if (gesture.kind === 'freehand' || gesture.kind === 'shadow')
    {
      gesture.stroke.commit();
    }
  }

  /**
   * Abandons whatever the tools are doing, as Escape does: a stroke in progress is taken back as if it never
   * happened, a drag lands nothing, and with nothing in progress the selection is let go.
   */
  escape(): void
  {
    const gesture = this.#gesture;
    this.#gesture = IDLE;
    if (gesture.kind === 'freehand' || gesture.kind === 'shadow')
    {
      gesture.stroke.cancel();
    }

    // a selection being drawn goes with its drag, and with nothing in progress the selection is let go.
    if (gesture.kind === 'idle' || gesture.kind === 'marquee')
    {
      this.#selection = null;
    }
  }

  /**
   * Forgets the pointer, as when it leaves the map, so nothing is previewed under it.
   */
  leave(): void
  {
    if (this.isActive === false)
    {
      this.#pointer = null;
    }
  }

  /**
   * Takes up new keys without moving, so the preview follows Shift and the override's key as they go down and up.
   * @param {Pick<ToolPointer, 'shift' | 'copy' | 'override'>} keys The keys held now.
   */
  keys(keys: Pick<ToolPointer, 'shift' | 'copy' | 'override'>): void
  {
    if (this.#pointer !== null)
    {
      this.#pointer = { ...this.#pointer, ...keys };
    }
  }

  /**
   * Follows the tool in hand changing: the selection goes when another tool than the select tool is taken up, since
   * only that tool shows or uses it, and every painting tool but the eyedropper and the stamp is remembered as the one
   * to go back to once the eyedropper has picked; what it picks is a brush to paint with, which neither the events nor
   * the stamp read.
   * @param {PaintTool} tool The tool in hand now.
   */
  toolChanged(tool: PaintTool): void
  {
    if (tool !== 'select')
    {
      this.#selection = null;
    }

    if (tool !== 'eyedropper' && tool !== 'stamp' && isPaintingTool(tool))
    {
      this.#toolBeforePick = tool;
    }
  }

  /**
   * Works out what the map shows for the tools now: nothing at all while the events are in hand, since the event tools
   * show the map then.
   * @returns {ToolOverlay} The overlay.
   */
  overlay(): ToolOverlay
  {
    const map = this.#host.map();
    const pointer = this.#pointer;
    const selectedCells = this.#selection;
    if (map === null)
    {
      return NO_TOOL_OVERLAY;
    }

    const gesture = this.#gesture;
    if (gesture.kind !== 'idle')
    {
      return this.#gestureOverlay(map, gesture, pointer);
    }

    const { tool } = this.#host.settings();
    if (isPaintingTool(tool) === false)
    {
      return NO_TOOL_OVERLAY;
    }

    if (tool === 'stamp' && pointer !== null && pointer.cell !== null)
    {
      return this.#stampOverlay(map, pointer, pointer.cell);
    }

    const preview = pointer === null || pointer.cell === null || tool === 'stamp'
      ? NO_PREVIEW
      : this.#idlePreview(map, pointer, pointer.cell);
    return { ...NO_TOOL_OVERLAY, hover: preview.hover, hoverLabel: preview.label, ghostTiles: preview.ghosts, selectedCells };
  }

  /**
   * Starts the tool in hand at a cell.
   * @param {MapDocument} map The map.
   * @param {MapCell} cell The cell pressed.
   * @param {ToolPointer} pointer The keys held.
   * @param {string | null} label The words the cursor showed at the press, which a stroke keeps showing.
   */
  #start(map: MapDocument, cell: MapCell, pointer: ToolPointer, label: string | null): void
  {
    const { tool, brush: inHand } = this.#host.settings();
    const mode = this.#layerMode(pointer);
    const context = paintContextFor(mode, pointer.shift ? 'exact' : 'auto', this.#host.layering(map));

    // the eyedropper, the select tool, the eraser and the stamp lay none of the brush's values, so its tileset is no
    // matter.
    switch (tool)
    {
      case 'eyedropper':
        this.#gesture = { kind: 'pick', anchor: cell, brushKind: inHand?.kind ?? 'tiles', mode };
        return;
      case 'select':
        this.#startSelect(map, cell, pointer, mode);
        return;
      case 'eraser':
        this.#startFreehand(map, cell, inHand, inHand?.kind ?? 'tiles', context, label);
        return;
      case 'stamp':
        this.#stamp(map, cell, context.shaping);
        return;
      default:
        break;
    }

    // every other tool lays the brush's values, so it needs a brush in hand, from this map's tileset.
    const brush = this.#brushFor(map);
    if (brush === null)
    {
      return;
    }

    switch (tool)
    {
      case 'fill':
        applyTileEdit(this.#host.hub, map, STEP_LABELS.fill[brush.kind], planFill(map, brush, cell, context));
        return;
      case 'swap':
        applyTileEdit(this.#host.hub, map, STEP_LABELS.swap[brush.kind], planSwap(map, brush, cell, context));
        return;
      case 'rectangle':
      case 'ellipse':
        this.#gesture = { kind: 'shape', map, shape: tool, anchor: cell, brush, context, mode };
        return;
      default:
        break;
    }

    // what is left is the pen, which is the shadow pen with a shadows brush in hand.
    if (brush.kind === 'shadows')
    {
      this.#startShadow(map, pointer.quarter);
      return;
    }

    this.#startFreehand(map, cell, brush, null, context, label);
  }

  /**
   * Starts a pen or eraser stroke, painting the first cell at once.
   * @param {MapDocument} map The map.
   * @param {MapCell} cell The cell pressed.
   * @param {Brush | null} brush The brush in hand.
   * @param {BrushKind | null} erasing What the eraser clears, or null for the pen.
   * @param {PaintContext} context What the stroke paints with.
   * @param {string | null} label The words the cursor shows while the stroke goes on.
   */
  #startFreehand(map: MapDocument, cell: MapCell, brush: Brush | null, erasing: BrushKind | null, context: PaintContext, label: string | null): void
  {
    const kind = erasing ?? (brush as Brush).kind;
    const stepLabel = erasing === null ? STEP_LABELS.paint[kind] : STEP_LABELS.erase[kind];
    const footprint = brush === null ? { width: 1, height: 1 } : { width: brush.width, height: brush.height };
    const trail = new FreehandTrail(footprint.width, footprint.height);
    const stroke = new PaintStroke(this.#host.hub, map, stepLabel);
    const gesture = { kind: 'freehand', stroke, trail, origin: cell, brush, erasing, context, label } as const;
    this.#gesture = gesture;
    this.#paintFreehand(gesture, cell);
  }

  /**
   * Places the stamp in hand with its top-left corner on the cell clicked, as one step of the map's history, and tells
   * the host what came of it: the events it placed, or why it was refused. A blueprint's stamp places copies linked to
   * the blueprint. With no stamp in hand nothing happens.
   * @param {MapDocument} map The map.
   * @param {MapCell} cell The cell clicked.
   * @param {Shaping} shaping Whether the tiles go down exactly as copied (Shift held).
   */
  #stamp(map: MapDocument, cell: MapCell, shaping: Shaping): void
  {
    const { stamp, blueprint } = this.#host.settings();
    if (stamp === null)
    {
      return;
    }

    const { mode } = this.#host.layering(map);
    const placement = { at: cell, shaping, mode, linkRefusal: this.#host.linkRefusal(map.mapId) };
    const outcome = blueprint === null
      ? placeStamp(this.#host.hub, map.mapId, stamp, placement, 'Stamp')
      : placeBlueprint(this.#host.hub, map.mapId, blueprint.id, placement);
    this.#host.stamped?.(outcome);
  }

  /**
   * Starts a shadow pen stroke on a quarter: it takes the shadow away when the quarter has one, and adds shadows
   * otherwise, and the whole stroke does the same.
   * @param {MapDocument} map The map.
   * @param {ShadowQuarter} quarter The quarter pressed.
   */
  #startShadow(map: MapDocument, quarter: ShadowQuarter): void
  {
    const adding = hasShadow(map, quarter) === false;
    const stroke = new PaintStroke(this.#host.hub, map, adding ? 'Add shadows' : 'Remove shadows');
    const trail = new QuarterTrail();
    this.#gesture = { kind: 'shadow', stroke, trail, adding };
    stroke.apply(planShadowQuarters(map, trail.moveTo(quarter), adding));
  }

  /**
   * Starts the select tool: a press inside the selection picks the selected area up to move it (or copy it, with
   * Ctrl held); anywhere else starts a new selection.
   * @param {MapDocument} map The map.
   * @param {MapCell} cell The cell pressed.
   * @param {ToolPointer} pointer The keys held.
   * @param {LayerMode} mode The layer mode, which decides the layers carried.
   */
  #startSelect(map: MapDocument, cell: MapCell, pointer: ToolPointer, mode: LayerMode): void
  {
    const selection = this.#selection;
    if (selection !== null && rectContains(selection, cell))
    {
      const clip = captureClip(map, selection, choiceFor(mode));
      if (clip !== null)
      {
        const tilesetMode = this.#host.layering(map).mode;
        this.#gesture = { kind: 'drag-clip', map, clip, grab: cell, copy: pointer.copy, mode: tilesetMode };
      }

      return;
    }

    this.#selection = { x: cell.x, y: cell.y, width: 1, height: 1 };
    this.#gesture = { kind: 'marquee', anchor: cell };
  }

  /**
   * Carries a drag on to a new pointer position.
   * @param {ToolPointer} pointer Where, and the keys held.
   */
  #continue(pointer: ToolPointer): void
  {
    const gesture = this.#gesture;
    const cell = pointer.cell as MapCell;
    if (gesture.kind === 'freehand')
    {
      this.#paintFreehand(gesture, cell);
    }
    else if (gesture.kind === 'shadow')
    {
      gesture.stroke.apply(planShadowQuarters(gesture.stroke.map, gesture.trail.moveTo(pointer.quarter), gesture.adding));
    }
    else if (gesture.kind === 'marquee')
    {
      this.#selection = rectangleBetween(gesture.anchor, cell);
    }
  }

  /**
   * Paints the cells a freehand stroke newly covers on its way to a cell.
   * @param {Extract<Gesture, { kind: 'freehand' }>} gesture The stroke.
   * @param {MapCell} cell The cell under the pointer.
   */
  #paintFreehand(gesture: Extract<Gesture, { kind: 'freehand' }>, cell: MapCell): void
  {
    const { stroke, trail, origin, brush, erasing, context } = gesture;
    const cells = trail.moveTo(cell);
    if (cells.length === 0)
    {
      return;
    }

    const { map } = stroke;
    stroke.apply(erasing === null
      ? planBrush(map, brush as Brush, cells, origin, context)
      : planErase(map, erasing, cells, context));
  }

  /**
   * Lands what a drag was doing when its button came up.
   * @param {Gesture} gesture The drag.
   * @param {ToolPointer} pointer Where it ended.
   */
  #finish(gesture: Gesture, pointer: ToolPointer): void
  {
    const end = pointer.cell;
    switch (gesture.kind)
    {
      case 'freehand':
      case 'shadow':
        gesture.stroke.commit();
        return;
      case 'shape':
        this.#finishShape(gesture, end ?? gesture.anchor);
        return;
      case 'pick':
        this.#finishPick(gesture, end ?? gesture.anchor);
        return;
      case 'drag-clip':
        this.#finishClip(gesture, end ?? gesture.grab, pointer.shift ? 'exact' : 'auto');
        return;
      default:
        break;
    }
  }

  /**
   * Paints a rectangle or ellipse dragged out from its anchor to where the button came up.
   * @param {Extract<Gesture, { kind: 'shape' }>} gesture The drag.
   * @param {MapCell} end Where it ended.
   */
  #finishShape(gesture: Extract<Gesture, { kind: 'shape' }>, end: MapCell): void
  {
    const { map, shape, anchor, brush, context } = gesture;
    const rect = rectangleBetween(anchor, end);
    const cells = shape === 'rectangle' ? cellsInRect(rect) : cellsInEllipse(rect);
    applyTileEdit(this.#host.hub, map, STEP_LABELS[shape][brush.kind], planBrush(map, brush, cells, anchor, context));
  }

  /**
   * Picks up a brush from the cells an eyedropper drag spanned, and goes back to the tool used before it.
   * @param {Extract<Gesture, { kind: 'pick' }>} gesture The drag.
   * @param {MapCell} end Where it ended.
   */
  #finishPick(gesture: Extract<Gesture, { kind: 'pick' }>, end: MapCell): void
  {
    const map = this.#host.map();
    if (map === null)
    {
      return;
    }

    // what is picked off a map belongs to that map's tileset, and paints only on maps drawn with it.
    const picked = pickBrush(map, rectangleBetween(gesture.anchor, end), gesture.brushKind, choiceFor(gesture.mode));
    if (picked !== null)
    {
      this.#host.pickBrush({ ...picked, tilesetId: map.tilesetId });
      this.#host.pickTool(this.#toolBeforePick);
    }
  }

  /**
   * Puts a lifted area down where it was dragged to, moving it or copying it, and keeps it selected there. The placements
   * of blueprints the area holds whole travel with it in the same step: moved with a move, recorded again with a copy.
   * @param {Extract<Gesture, { kind: 'drag-clip' }>} gesture The drag.
   * @param {MapCell} end Where it ended.
   * @param {Shaping} shaping Whether autotiles are reshaped around it.
   */
  #finishClip(gesture: Extract<Gesture, { kind: 'drag-clip' }>, end: MapCell, shaping: Shaping): void
  {
    const { map, clip, grab, copy, mode } = gesture;
    const dx = end.x - grab.x;
    const dy = end.y - grab.y;
    if (dx === 0 && dy === 0)
    {
      return;
    }

    const { hub } = this.#host;
    const at = { x: clip.source.x + dx, y: clip.source.y + dy };
    const changes = planPlaceClip(map, clip, { at, move: copy === false, shaping, mode });
    const carried = spansWithin(spansOnMap(hub, map.mapId), clip.source, clip.layers, map);
    applyTileEdit(hub, map, copy ? 'Copy tiles' : 'Move tiles', changes, tx =>
    {
      carrySpans(tx, hub, map.mapId, carried, { x: dx, y: dy }, map, copy);
    });
    this.#selection = clipRect({ x: at.x, y: at.y, width: clip.source.width, height: clip.source.height }, map.width, map.height);
  }

  /**
   * Works out the overlay while a drag is in progress.
   * @param {MapDocument} map The map.
   * @param {Gesture} gesture The drag.
   * @param {ToolPointer | null} pointer Where the pointer is.
   * @returns {ToolOverlay} The overlay.
   */
  #gestureOverlay(map: MapDocument, gesture: Gesture, pointer: ToolPointer | null): ToolOverlay
  {
    const cell = pointer?.cell ?? null;
    switch (gesture.kind)
    {
      case 'freehand':
      {
        // the stroke paints as it goes, so the cursor needs no ghost: the tiles are already there.
        const size = gesture.brush === null ? { width: 1, height: 1 } : gesture.brush;
        const hover = cell === null ? null : { x: cell.x, y: cell.y, width: size.width, height: size.height };
        return { ...NO_TOOL_OVERLAY, hover, hoverLabel: gesture.label };
      }
      case 'shadow':
        return { ...NO_TOOL_OVERLAY, hoverLabel: gesture.adding ? 'Add shadows' : 'Remove shadows' };
      case 'shape':
        return this.#shapeOverlay(map, gesture, cell ?? gesture.anchor);
      case 'pick':
        return { ...NO_TOOL_OVERLAY, hover: rectangleBetween(gesture.anchor, cell ?? gesture.anchor) };
      case 'marquee':
        return { ...NO_TOOL_OVERLAY, selectedCells: this.#selection };
      case 'drag-clip':
        return this.#clipOverlay(map, gesture, cell ?? gesture.grab);
      default:
        return NO_TOOL_OVERLAY;
    }
  }

  /**
   * Works out the overlay while a rectangle or ellipse is dragged out: the tiles it would lay, and its extent.
   * @param {MapDocument} map The map.
   * @param {Extract<Gesture, { kind: 'shape' }>} gesture The drag.
   * @param {MapCell} end Where the pointer is.
   * @returns {ToolOverlay} The overlay.
   */
  #shapeOverlay(map: MapDocument, gesture: Extract<Gesture, { kind: 'shape' }>, end: MapCell): ToolOverlay
  {
    const { shape, anchor, brush, context, mode } = gesture;
    const rect = rectangleBetween(anchor, end);
    const cells = shape === 'rectangle' ? cellsInRect(rect) : cellsInEllipse(rect);
    const ghostTiles = shapeGhosts(map, brush, cells, anchor, context);
    const underAnchor = ghostTiles.find(ghost => ghost.x === anchor.x && ghost.y === anchor.y);
    const hoverLabel = brush.kind === 'tiles'
      ? layerLabel(mode, underAnchor === undefined ? -1 : underAnchor.layer as TileLayerIndex, context.shaping)
      : null;
    return { ...NO_TOOL_OVERLAY, hover: rect, hoverLabel, ghostTiles };
  }

  /**
   * Works out the overlay while a lifted area is dragged: where it would land, drawn as ghosts over the map.
   * @param {MapDocument} map The map.
   * @param {Extract<Gesture, { kind: 'drag-clip' }>} gesture The drag.
   * @param {MapCell} at Where the pointer is.
   * @returns {ToolOverlay} The overlay.
   */
  #clipOverlay(map: MapDocument, gesture: Extract<Gesture, { kind: 'drag-clip' }>, at: MapCell): ToolOverlay
  {
    const { clip, grab, copy } = gesture;
    const topLeft = { x: clip.source.x + at.x - grab.x, y: clip.source.y + at.y - grab.y };
    const landed = { x: topLeft.x, y: topLeft.y, width: clip.source.width, height: clip.source.height };
    return {
      ...NO_TOOL_OVERLAY,
      hoverLabel: copy ? 'Copy' : 'Move',
      ghostTiles: clipGhosts(clip, topLeft, map),
      selectedCells: landed,
    };
  }

  /**
   * Works out the overlay while the stamp tool is in hand: the stamp's footprint with its corner under the pointer, its
   * tiles and events where a click would put them, and in red the tiles another event holds in their way. Over a map that
   * may hold no copy of a blueprint, a blueprint in hand, or a stamp carrying copies of one, says so beside the footprint.
   * With no stamp picked, only the cell under the pointer.
   * @param {MapDocument} map The map.
   * @param {ToolPointer} pointer The pointer and keys.
   * @param {MapCell} cell The cell under it.
   * @returns {ToolOverlay} The overlay.
   */
  #stampOverlay(map: MapDocument, pointer: ToolPointer, cell: MapCell): ToolOverlay
  {
    const { stamp, blueprint } = this.#host.settings();
    if (stamp === null)
    {
      return { ...NO_TOOL_OVERLAY, hover: { x: cell.x, y: cell.y, width: 1, height: 1 } };
    }

    // a map that may hold no link says so before the click that would be refused; a copy of a blueprint gone goes down
    // plain, so it is no copy here.
    const live = liveBlueprintsIn(this.#host.hub);
    const linked = blueprint !== null || stamp.events.some(event =>
    {
      const link = blueprintLinkOf(event.note);
      return link !== null && (live === null || live(link.blueprintId));
    });
    const refused = linked && this.#host.linkRefusal(map.mapId) !== null;
    const preview = previewStamp(map, stamp, cell, pointer.shift ? 'exact' : 'auto');
    return {
      hover: preview.hover,
      hoverLabel: refused ? LINKS_REFUSED_LABEL : preview.label,
      ghostTiles: preview.ghostTiles,
      selectedCells: null,
      ghostEvents: preview.ghostEvents.length === 0 ? NO_GHOST_EVENTS : preview.ghostEvents,
      blockedCells: preview.blockedCells.length === 0 ? NO_CELLS : preview.blockedCells,
    };
  }

  /**
   * Previews the tool in hand under the pointer while nothing is being dragged.
   * @param {MapDocument} map The map.
   * @param {ToolPointer} pointer The pointer and keys.
   * @param {MapCell} cell The cell under it.
   * @returns {ReturnType<typeof previewTool>} The preview.
   */
  #idlePreview(map: MapDocument, pointer: ToolPointer, cell: MapCell): ReturnType<typeof previewTool>
  {
    // only the tools that lay the brush's values care which tileset it came from.
    const { tool, brush: inHand } = this.#host.settings();
    const lays = tool !== 'eraser' && tool !== 'eyedropper' && tool !== 'select';
    const brush = lays ? this.#brushFor(map) : inHand;
    if (inHand !== null && brush === null)
    {
      return { hover: { x: cell.x, y: cell.y, width: 1, height: 1 }, ghosts: [], label: 'Picked from another tileset' };
    }

    return previewTool(map, cell, pointer.quarter, {
      tool,
      brush,
      mode: this.#layerMode(pointer),
      shaping: pointer.shift ? 'exact' : 'auto',
      layering: this.#host.layering(map),
    });
  }

  /**
   * Finds the brush in hand as a map may be painted with it: tiles picked from another tileset would lay that tileset's
   * ids here, which draw other pictures, so they count as nothing picked on this map (see {@link fitsTileset}).
   * @param {MapDocument} map The map.
   * @returns {Brush | null} The brush, or null when nothing is picked or what is picked is another tileset's.
   */
  #brushFor(map: MapDocument): Brush | null
  {
    const { brush } = this.#host.settings();
    return brush !== null && fitsTileset(brush, map.tilesetId)
      ? brush
      : null;
  }

  /**
   * Reads the layer mode the settings and the keys held add up to.
   * @param {ToolPointer} pointer The keys held.
   * @returns {LayerMode} The layer mode.
   */
  #layerMode(pointer: ToolPointer): LayerMode
  {
    const { strip, overrideLayer } = this.#host.settings();
    return { strip, overrideLayer, overrideHeld: pointer.override };
  }

  /**
   * Runs a step of the tools so that a failure never leaves a stroke open: the drag in progress is abandoned, taking
   * back what it painted, and the failure is raised on its own afterwards, so it is seen without stranding the map.
   * @param {() => void} step The step.
   */
  #guard(step: () => void): void
  {
    try
    {
      step();
    }
    catch (error)
    {
      const gesture = this.#gesture;
      this.#gesture = IDLE;
      if ((gesture.kind === 'freehand' || gesture.kind === 'shadow') && gesture.stroke.isOpen)
      {
        gesture.stroke.cancel();
      }

      queueMicrotask(() =>
      {
        throw error;
      });
    }
  }
}

export { STEP_LABELS, ToolSession };
export type { ToolOverlay, ToolPointer, ToolSessionHost };
