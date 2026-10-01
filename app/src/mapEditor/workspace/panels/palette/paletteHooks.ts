import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { EditorDocument } from '../../../core/model/EditorDocument.ts';
import type { RmmzTileset } from '../../../core/model/rmmzTypes.ts';
import { cellInspector, type InspectorState } from '../../../core/palette/cellInspector.ts';
import type { PaintSelectionState } from '../../../core/palette/paintSelection.ts';
import type { PaletteModeState } from '../../../core/palette/paletteMode.ts';
import { marksOf, openTilesetMarks } from '../../../core/palette/tilesetMarkEdits.ts';
import type { TextureImage } from '../../../core/renderer/MapRenderer.ts';
import { marksForTileset, type TilesetMarks } from '../../../core/tiles/tilesetMarks.ts';
import { projectImagesFor } from '../../../render/projectImages.ts';
import { useDocumentRevision, useWorkspace } from '../../workspaceHooks.tsx';
import { usePaintScope } from './paintScope.tsx';

/**
 * Reads the paint selection the surrounding palette picks for (see usePaintScope), re-rendering when the brush or the
 * layer changes.
 * @returns {PaintSelectionState} The brush and the layer.
 */
const usePaintSelection = (): PaintSelectionState =>
{
  const { selection } = usePaintScope();
  return useSyncExternalStore(selection.subscribe, selection.getState);
};

/**
 * Reads the surrounding palette's mode, re-rendering when it changes.
 * @returns {PaletteModeState} Whether the palette picks tiles or edits passability, and which flags.
 */
const usePaletteMode = (): PaletteModeState =>
{
  const { mode } = usePaintScope();
  return useSyncExternalStore(mode.subscribe, mode.getState);
};

/**
 * Reads the cell the stack view shows, re-rendering when it changes.
 * @returns {InspectorState} The cell, and whether it is held.
 */
const useInspectedCell = (): InspectorState =>
{
  return useSyncExternalStore(cellInspector.subscribe, cellInspector.getState);
};

/**
 * Loads a tileset's nine sheets through the window's image cache, which every map view shares, so a tileset already
 * drawn on a map is on hand at once.
 * @param {RmmzTileset | null} tileset The tileset, or null for none.
 * @returns {readonly (TextureImage | null)[] | null} The sheets in RMMZ order, null where the tileset names none;
 * null while they load.
 */
const useTilesetSheets = (tileset: RmmzTileset | null): readonly (TextureImage | null)[] | null =>
{
  const { api } = useWorkspace().services;
  const names = tileset === null
    ? ''
    : tileset.tilesetNames.join('\n');
  const [ loaded, setLoaded ] = useState<{ names: string; sheets: (TextureImage | null)[] } | null>(null);

  useEffect(() =>
  {
    if (api === null || names === '')
    {
      return undefined;
    }

    // the sheets are keyed by their names, so a tileset whose sheets change loads again and one that does not never does.
    let live = true;
    const images = projectImagesFor(api);
    Promise.all(names.split('\n').map(name => (name === '' ? Promise.resolve(null) : images.image('tilesets', name))))
      .then(sheets =>
      {
        if (live)
        {
          setLoaded({ names, sheets });
        }
      })
      .catch(() => undefined);

    return () =>
    {
      live = false;
    };
  }, [ api, names ]);

  return loaded !== null && loaded.names === names
    ? loaded.sheets
    : null;
};

/**
 * What the palette knows of one tileset's "goes on top" marks.
 */
type TilesetMarksState = {
  /**
   * The marks document, once held.
   */
  readonly document: EditorDocument | null;

  /**
   * The tileset's marks, or null until the document is held.
   */
  readonly marks: TilesetMarks | null;

  /**
   * Why the marks could not be read, or null.
   */
  readonly failure: string | null;
};

/**
 * Holds the marks document for the window, seeding it from the project's maps the first time a project has none, and
 * reads one tileset's marks from it, re-rendering whenever it changes, here or in another window.
 * @param {number} tilesetId The tileset.
 * @returns {TilesetMarksState} The document and the tileset's marks, or why they could not be read.
 */
const useTilesetMarks = (tilesetId: number): TilesetMarksState =>
{
  const controller = useWorkspace();
  const [ held, setHeld ] = useState<{ document: EditorDocument | null; failure: string | null }>({ document: null, failure: null });

  useEffect(() =>
  {
    let live = true;
    openTilesetMarks(controller.services)
      .then(document =>
      {
        if (live)
        {
          setHeld({ document, failure: null });
        }
      })
      .catch((error: unknown) =>
      {
        if (live)
        {
          setHeld({ document: null, failure: error instanceof Error ? error.message : String(error) });
        }
      });

    return () =>
    {
      live = false;
    };
  }, [ controller ]);

  // the revision is what changes when the document is edited in place; it is -1 while there is no document.
  const revision = useDocumentRevision(held.document);
  return useMemo(() =>
  {
    const { document, failure } = held;
    if (document === null || revision < 0)
    {
      return { document, marks: null, failure };
    }

    // a document that is not a marks document is shown as the failure it is, never read as no marks.
    try
    {
      return { document, marks: marksForTileset(marksOf(document), tilesetId), failure: null };
    }
    catch (error)
    {
      return { document, marks: null, failure: error instanceof Error ? error.message : String(error) };
    }
  }, [ held, tilesetId, revision ]);
};

export { useInspectedCell, usePaintSelection, usePaletteMode, useTilesetMarks, useTilesetSheets };
export type { TilesetMarksState };
