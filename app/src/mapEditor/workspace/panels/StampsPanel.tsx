import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Box, Button, ButtonBase, InputBase, Stack, Typography } from '@mui/material';
import { copyCountWords } from '../../core/blueprints/blueprintCopies.ts';
import {
  deleteBlueprint,
  renameBlueprint,
  saveBlueprint,
  saveBlueprints,
  type BlueprintOutcome,
} from '../../core/blueprints/blueprintEdits.ts';
import { BLUEPRINTS_DOCUMENT, blueprintsOf, type Blueprint } from '../../core/blueprints/blueprints.ts';
import {
  BLUEPRINT_USES_DOCUMENT,
  countsWithPlacements,
  forgetPlacement,
  usedCopiesOf,
  usesOf,
  type PlacedSpot,
} from '../../core/blueprints/blueprintUses.ts';
import { blueprintHistoryKey } from '../../core/history/historyKeys.ts';
import type { EditorDataDocumentKey } from '../../core/model/documentKeys.ts';
import type { EditorDocument } from '../../core/model/EditorDocument.ts';
import type { TextureImage } from '../../core/renderer/MapRenderer.ts';
import { stampCaption, type Stamp } from '../../core/stamps/stamp.ts';
import type { PaintState } from '../../core/tools/PaintState.ts';
import { projectImagesFor } from '../../render/projectImages.ts';
import { drawStampThumbnail, THUMBNAIL_BOX, thumbnailCharacters, thumbnailLayout } from '../../render/stampThumbnail.ts';
import { usePaintSettings } from '../../render/tools/PaintToolBar.tsx';
import type { WorkspaceController } from '../WorkspaceController.ts';
import { useDocumentRevision, useTilesets, useWorkspace } from '../workspaceHooks.tsx';
import { BlueprintWhereUsed } from './BlueprintWhereUsed.tsx';
import { usePaintScope } from './palette/paintScope.tsx';
import { useTilesetSheets } from './palette/paletteHooks.ts';
import { CHECKERBOARD } from './palette/TileThumb.tsx';

/**
 * What the panel knows of the blueprints: none to show in a window with no project server, still opening, open with
 * every placement of their tiles the record holds, or why they, or the record, could not be read, in words for the
 * author.
 */
type BlueprintsView =
  | { readonly kind: 'none' }
  | { readonly kind: 'opening' }
  | { readonly kind: 'open'; readonly blueprints: readonly Blueprint[]; readonly spots: readonly PlacedSpot[]; readonly revisions: readonly number[] }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * One editor-only document as the panel holds it: the document once held, or why it could not be.
 */
type HeldDocument = { readonly document: EditorDocument | null; readonly failure: string | null };

/**
 * The grid every section lays its cards out in: as many columns as fit, each card as tall as what it holds, however
 * many there are, since rows left to size themselves would shrink to fit the panel, and a card, which clips what
 * overflows it, would cut its own words off.
 */
const CARD_GRID = {
  p: 1,
  display: 'grid',
  gap: 1,
  alignContent: 'start',
  gridTemplateColumns: `repeat(auto-fill, minmax(${THUMBNAIL_BOX.width + 8}px, 1fr))`,
  gridAutoRows: 'max-content',
} as const;

/**
 * Words what went wrong, from whatever was thrown.
 * @param {unknown} error What was thrown.
 * @returns {string} Its message.
 */
const messageOf = (error: unknown): string =>
{
  return error instanceof Error ? error.message : String(error);
};

/**
 * Loads the character sheets a stamp's events show, through the window's image cache, which every map view shares.
 * @param {Stamp} stamp The stamp.
 * @returns {ReadonlyMap<string, TextureImage | null>} The sheets by name, each null until it loads, or for a missing one.
 */
const useCharacterSheets = (stamp: Stamp): ReadonlyMap<string, TextureImage | null> =>
{
  const { api } = useWorkspace().services;
  const names = useMemo(() => thumbnailCharacters(stamp), [ stamp ]);
  const [ loaded, setLoaded ] = useState<ReadonlyMap<string, TextureImage | null>>(() => new Map());

  useEffect(() =>
  {
    if (api === null || names.length === 0)
    {
      return undefined;
    }

    let live = true;
    const images = projectImagesFor(api);
    Promise.all(names.map(name => images.image('characters', name).catch(() => null)))
      .then(sheets =>
      {
        if (live)
        {
          setLoaded(new Map(names.map((name, index) => [ name, sheets[index] ])));
        }
      })
      .catch(() => undefined);

    return () =>
    {
      live = false;
    };
  }, [ api, names ]);

  return loaded;
};

/**
 * Holds one editor-only document for the panel: opens it once, when the window has a server to read it from.
 * @param {EditorDataDocumentKey} key The document.
 * @returns {HeldDocument} The document once held, or why it could not be.
 */
const useHeldDocument = (key: EditorDataDocumentKey): HeldDocument =>
{
  const controller = useWorkspace();
  const { hub, api } = controller.services;
  const [ opened, setOpened ] = useState<HeldDocument>(() => ({ document: hub.has(key) ? hub.document(key) : null, failure: null }));

  useEffect(() =>
  {
    if (api === null || opened.document !== null)
    {
      return undefined;
    }

    let live = true;
    controller.services.openDocument(key)
      .then(document =>
      {
        if (live)
        {
          setOpened({ document, failure: null });
        }
      })
      .catch((error: unknown) =>
      {
        if (live)
        {
          setOpened({ document: null, failure: messageOf(error) });
        }
      });

    return () =>
    {
      live = false;
    };
  }, [ controller, api, key, opened.document ]);

  return opened;
};

/**
 * Holds the blueprints for the panel, with the record of where their tiles are placed: opens both once, when the window
 * has a server to read them from, and reads them afresh whenever either changes, in this window or another. The
 * blueprints show only once both are held, since a blueprint placed with no record to write its placement into could
 * never be found again; one that cannot be read says why instead.
 * @returns {BlueprintsView} The blueprints and their placements, or where opening them stands.
 */
const useBlueprints = (): BlueprintsView =>
{
  const { api } = useWorkspace().services;
  const blueprints = useHeldDocument(BLUEPRINTS_DOCUMENT);
  const uses = useHeldDocument(BLUEPRINT_USES_DOCUMENT);

  // a blueprint saved, renamed or deleted, or a placement recorded or forgotten, here or in another window, moves a
  // document's revision, and each is read afresh only then, so the pictures are drawn again only when they change.
  const blueprintsRevision = useDocumentRevision(blueprints.document);
  const usesRevision = useDocumentRevision(uses.document);
  return useMemo((): BlueprintsView =>
  {
    if (api === null)
    {
      return { kind: 'none' };
    }

    if (blueprints.failure !== null)
    {
      return { kind: 'failed', message: `The blueprints could not be read: ${blueprints.failure}` };
    }

    if (uses.failure !== null)
    {
      return { kind: 'failed', message: `Where blueprints are placed could not be read: ${uses.failure}` };
    }

    if (blueprints.document === null || uses.document === null)
    {
      return { kind: 'opening' };
    }

    let read: Blueprint[] = [];
    try
    {
      read = blueprintsOf(blueprints.document);
    }
    catch (error)
    {
      return { kind: 'failed', message: `The blueprints could not be read: ${messageOf(error)}` };
    }

    try
    {
      return { kind: 'open', blueprints: read, spots: usesOf(uses.document), revisions: [ blueprintsRevision, usesRevision ] };
    }
    catch (error)
    {
      return { kind: 'failed', message: `Where blueprints are placed could not be read: ${messageOf(error)}` };
    }
  }, [ api, blueprints, uses, blueprintsRevision, usesRevision ]);
};

/**
 * A stamp's picture: its tiles and its events as the map shows them, drawn small, keeping the stamp's shape, sharp at
 * the screen's pixel density.
 * @param {{ stamp: Stamp }} props The stamp.
 * @returns {React.JSX.Element} The picture.
 */
const StampPicture = (props: { readonly stamp: Stamp }) =>
{
  const { stamp } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tilesets = useTilesets();
  const sheets = useTilesetSheets(tilesets[stamp.tilesetId] ?? null);
  const characters = useCharacterSheets(stamp);
  const layout = thumbnailLayout(stamp);

  useEffect(() =>
  {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    if (canvas === null || context === null)
    {
      return;
    }

    // drawn at the screen's pixel density, the cells crisp rather than smoothed.
    const scale = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    canvas.width = Math.max(1, Math.round(layout.width * scale));
    canvas.height = Math.max(1, Math.round(layout.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    drawStampThumbnail(context, stamp, { sheets, characters }, layout.cell * scale);
  }, [ stamp, sheets, characters, layout.width, layout.height, layout.cell ]);

  return (
    <Box
      component={'canvas'}
      ref={canvasRef}
      sx={{ width: layout.width, height: layout.height, display: 'block', background: CHECKERBOARD }}
    />
  );
};

/**
 * Names something in place, as the map tree renames a map: Enter or leaving the field keeps the name, Escape keeps
 * none. Its keys stay its own, so Escape here never puts down the stamp in hand.
 * @param {{ name: string, label: string, onDone: (name: string | null) => void }} props The name it starts with, what
 * the field is for, and what to do with the name kept, or null for none.
 * @returns {React.JSX.Element} The field.
 */
const NameField = (props: { readonly name: string; readonly label: string; readonly onDone: (name: string | null) => void }) =>
{
  const { name, label, onDone } = props;
  const [ draft, setDraft ] = useState(name);
  const finished = useRef(false);

  /**
   * Finishes once, with the name or none.
   * @param {string | null} value The name to keep, or null for none.
   */
  const finish = (value: string | null) =>
  {
    if (finished.current === false)
    {
      finished.current = true;
      onDone(value);
    }
  };

  return (
    <InputBase
      autoFocus
      value={draft}
      placeholder={label}
      onFocus={event => event.target.select()}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={event =>
      {
        event.stopPropagation();
        if (event.key === 'Enter')
        {
          finish(draft);
        }

        if (event.key === 'Escape')
        {
          finish(null);
        }
      }}
      inputProps={{ 'aria-label': label }}
      sx={{ mx: 0.75, my: 0.5, fontSize: 12, px: 0.5, bgcolor: 'background.paper', border: 1, borderColor: 'primary.main', borderRadius: 0.5 }}
    />
  );
};

/**
 * The frame every card sits in: outlined, and lit while what it holds is in hand.
 * @param {boolean} picked Whether it is in hand.
 * @returns {object} The frame's styles.
 */
const cardFrame = (picked: boolean) => ({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 1,
  border: 2,
  borderColor: picked ? 'primary.main' : 'divider',
  bgcolor: picked ? 'action.selected' : 'background.paper',
  overflow: 'hidden',
} as const);

/**
 * One stamp in the panel: its picture, what it holds, and the map it came from. A click takes it up as the brush, or
 * puts it down again when it is the stamp in hand. Beneath it, it can be saved as a blueprint, named in place.
 * @param {object} props The stamp, whether it is in hand, the name of the map it was copied from, what a click does, and
 * how to save it as a blueprint, or null while blueprints cannot be kept.
 * @returns {React.JSX.Element} The card.
 */
const StampCard = (props: {
  readonly stamp: Stamp;
  readonly picked: boolean;
  readonly from: string;
  readonly onClick: () => void;
  readonly onSave: ((name: string) => void) | null;
}) =>
{
  const { stamp, picked, from, onClick, onSave } = props;
  const [ naming, setNaming ] = useState(false);

  /**
   * Saves the stamp under the name kept, unless none was.
   * @param {string | null} name The name, or null when the naming was given up.
   */
  const named = (name: string | null) =>
  {
    setNaming(false);
    if (onSave !== null && name !== null && name.trim() !== '')
    {
      onSave(name);
    }
  };

  return (
    <Box sx={cardFrame(picked)}>
      <ButtonBase
        data-testid={'stamp-card'}
        aria-pressed={picked}
        onClick={onClick}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left' }}
      >
        <Box sx={{ height: THUMBNAIL_BOX.height + 8, display: 'grid', placeItems: 'center', bgcolor: '#121212' }}>
          <StampPicture stamp={stamp}/>
        </Box>
        <Box sx={{ px: 0.75, py: 0.5, minWidth: 0 }}>
          <Typography variant={'caption'} sx={{ display: 'block' }} noWrap title={stampCaption(stamp)}>
            {stampCaption(stamp)}
          </Typography>
          <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block' }} noWrap title={from}>
            {from}
          </Typography>
        </Box>
      </ButtonBase>
      {onSave !== null && naming && <NameField name={''} label={'Name the blueprint'} onDone={named}/>}
      {onSave !== null && naming === false && (
        <Button size={'small'} onClick={() => setNaming(true)} sx={{ alignSelf: 'flex-start', fontSize: 12, py: 0, mx: 0.25, mb: 0.25 }}>
          Save as blueprint
        </Button>
      )}
    </Box>
  );
};

/**
 * One blueprint in the panel: its picture, its name, and how many copies of it stand across every map. A click takes
 * it up as the brush, or puts it down again when it is in hand. Beneath it, it can be renamed in place, or deleted, and
 * where it is used can be shown, the card then stretching across the panel to list it.
 * @param {object} props The blueprint, whether it is in hand, the words for its copies, what a click, a rename and a
 * delete do, and the list of where it is used with how to show or hide it.
 * @returns {React.JSX.Element} The card.
 */
const BlueprintCard = (props: {
  readonly blueprint: Blueprint;
  readonly picked: boolean;
  readonly copies: string;
  readonly onPick: () => void;
  readonly onRename: (name: string) => void;
  readonly onDelete: () => void;
  readonly whereUsed: React.ReactNode | null;
  readonly onToggleWhereUsed: () => void;
}) =>
{
  const { blueprint, picked, copies, onPick, onRename, onDelete, whereUsed, onToggleWhereUsed } = props;
  const [ renaming, setRenaming ] = useState(false);

  /**
   * Renames the blueprint to the name kept, unless none was.
   * @param {string | null} name The name, or null when the rename was given up.
   */
  const renamed = (name: string | null) =>
  {
    setRenaming(false);
    if (name !== null)
    {
      onRename(name);
    }
  };

  return (
    <Box sx={{ ...cardFrame(picked), gridColumn: whereUsed === null ? 'auto' : '1 / -1' }} data-testid={'blueprint'}>
      <ButtonBase
        data-testid={'blueprint-card'}
        aria-pressed={picked}
        onClick={onPick}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left' }}
      >
        <Box sx={{ height: THUMBNAIL_BOX.height + 8, display: 'grid', placeItems: 'center', bgcolor: '#121212' }}>
          <StampPicture stamp={blueprint.stamp}/>
        </Box>
        {renaming === false && (
          <Box sx={{ px: 0.75, pt: 0.5, minWidth: 0 }}>
            <Typography variant={'caption'} sx={{ display: 'block', fontWeight: 600 }} noWrap title={blueprint.name}>
              {blueprint.name}
            </Typography>
            <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block' }} noWrap data-testid={'blueprint-copies'}>
              {copies}
            </Typography>
          </Box>
        )}
      </ButtonBase>
      {renaming
        ? <NameField name={blueprint.name} label={'Blueprint name'} onDone={renamed}/>
        : (
          <Stack direction={'row'} flexWrap={'wrap'} sx={{ mx: 0.25, mb: 0.25 }}>
            <Button size={'small'} onClick={() => setRenaming(true)} sx={{ fontSize: 12, py: 0, minWidth: 0 }}>
              Rename
            </Button>
            <Button size={'small'} onClick={onDelete} sx={{ fontSize: 12, py: 0, minWidth: 0 }}>
              Delete
            </Button>
            <Button size={'small'} aria-expanded={whereUsed !== null} onClick={onToggleWhereUsed} sx={{ fontSize: 12, py: 0, minWidth: 0 }}>
              Where used
            </Button>
          </Stack>
        )}
      {whereUsed}
    </Box>
  );
};

/**
 * The question the section asks, in place above its cards, before deleting a blueprint with no copies: a button to go
 * ahead and one to keep it. Nothing else waits on it; Enter on the focused button deletes, and Escape keeps it.
 * @param {{ name: string, onDelete: () => void, onKeep: () => void }} props The blueprint's name and the two answers.
 * @returns {React.JSX.Element} The question.
 */
const DeleteConfirm = (props: { readonly name: string; readonly onDelete: () => void; readonly onKeep: () => void }) =>
{
  const { name, onDelete, onKeep } = props;
  return (
    <Alert
      severity={'warning'}
      data-testid={'blueprint-delete-confirm'}
      onKeyDown={event =>
      {
        if (event.key === 'Escape')
        {
          event.stopPropagation();
          onKeep();
        }
      }}
      action={(
        <Stack direction={'row'} spacing={0.5}>
          <Button color={'inherit'} size={'small'} autoFocus onClick={onDelete}>
            Delete
          </Button>
          <Button color={'inherit'} size={'small'} onClick={onKeep}>
            Keep
          </Button>
        </Stack>
      )}
      sx={{ mx: 1, py: 0, alignItems: 'center' }}
    >
      {`Delete the blueprint "${name}"?`}
    </Alert>
  );
};

/**
 * Writes the blueprints to disk once an edit to them has gone through, so every window and every later session has
 * them, as the "goes on top" marks are written; the history the edit joined stays where it is, and an undo leaves the
 * document unsaved until the next save. Blueprints waiting for a choice about changes made elsewhere are not written,
 * which the author hears, as is a write that fails.
 * @param {WorkspaceController} controller The workspace, for its documents and its notices.
 */
const writeBlueprints = (controller: WorkspaceController) =>
{
  saveBlueprints(controller.services.hub)
    .then(outcome =>
    {
      if (outcome.ok === false)
      {
        controller.notify(outcome.message, 'error');
      }
    })
    .catch((error: unknown) =>
    {
      controller.notify(`The blueprints could not be saved: ${messageOf(error)}`, 'error');
    });
};

/**
 * Settles an edit to the blueprints: a refusal is said, and a step taken is written to disk, its blueprint's history
 * becoming the one undo acts on, so the next undo takes it back, and the author hears what was done.
 * @param {WorkspaceController} controller The workspace.
 * @param {BlueprintOutcome} outcome What the edit came to.
 * @param {string} blueprintId The blueprint edited.
 * @param {string} done What to say once it went through.
 */
const settleEdit = (controller: WorkspaceController, outcome: BlueprintOutcome, blueprintId: string, done: string) =>
{
  if (outcome.ok === false)
  {
    controller.notify(outcome.message, 'error');
    return;
  }

  if (outcome.step !== null)
  {
    writeBlueprints(controller);
    controller.focusHistory(blueprintHistoryKey(blueprintId));
    controller.notify(done);
  }
};

/**
 * The panel's blueprints, by name, each with its picture and how many copies of it stand across every map, a placement
 * of its tiles counting as one copy, as each copy of one of its events does: clicking one takes it up as the brush, so
 * each click on a map places copies linked to it, and clicking it again, or Esc, puts it down. Each can be renamed in
 * place, and deleted once nothing is a copy of it, after a question; one with copies says how many and on which maps
 * instead. Each can show where it is used, map by map, a click opening the map there, and a placement no longer where
 * it was saying why, to be forgotten. The event copies are counted from every map's notes, held maps as they stand here,
 * and the placements come from the record of where blueprints are placed.
 * @param {{ blueprints: readonly Blueprint[], spots: readonly PlacedSpot[], painting: PaintState }} props The
 * blueprints, every placement the record holds, and the paint they are taken up for.
 * @returns {React.JSX.Element} The section.
 */
const BlueprintsSection = (props: { readonly blueprints: readonly Blueprint[]; readonly spots: readonly PlacedSpot[]; readonly painting: PaintState }) =>
{
  const { blueprints, spots, painting } = props;
  const controller = useWorkspace();
  const { hub, blueprintCopies } = controller.services;
  const eventCounts = useSyncExternalStore(blueprintCopies.subscribe, blueprintCopies.getSnapshot);
  const counts = useMemo(() => countsWithPlacements(eventCounts, spots), [ eventCounts, spots ]);
  const settings = usePaintSettings(painting);
  const [ confirming, setConfirming ] = useState<Blueprint | null>(null);
  const [ showing, setShowing ] = useState<string | null>(null);
  const pickedId = settings.tool === 'stamp' && settings.blueprint !== null ? settings.blueprint.id : null;

  /**
   * Takes up a blueprint as the brush, or puts it down when it is the one in hand.
   * @param {Blueprint} blueprint The blueprint clicked.
   */
  const pick = (blueprint: Blueprint) =>
  {
    if (blueprint.id === pickedId)
    {
      painting.putDownStamp();
      return;
    }

    painting.takeUpBlueprint(blueprint);
  };

  /**
   * Renames a blueprint, its name following in the words beside the tools when it is the one picked.
   * @param {Blueprint} blueprint The blueprint.
   * @param {string} name Its new name.
   */
  const rename = (blueprint: Blueprint, name: string) =>
  {
    const outcome = renameBlueprint(hub, blueprint.id, name);
    if (outcome.ok && outcome.blueprint !== null)
    {
      painting.renameBlueprint(blueprint.id, outcome.blueprint.name);
    }

    settleEdit(controller, outcome, blueprint.id, `Renamed "${blueprint.name}" to "${name.trim()}".`);
  };

  /**
   * Deletes a blueprint, as the question's answer asks; its copies are counted once more first, since another window
   * may have placed one since the question was asked.
   * @param {Blueprint} blueprint The blueprint.
   */
  const remove = (blueprint: Blueprint) =>
  {
    setConfirming(null);
    const outcome = deleteBlueprint(hub, blueprint.id, usedCopiesOf(blueprintCopies, hub, blueprint.id), mapId => controller.mapName(mapId));
    settleEdit(controller, outcome, blueprint.id, `Deleted the blueprint "${blueprint.name}".`);
  };

  /**
   * Asks before deleting a blueprint nothing is a copy of; one with copies, its placements among them, or whose copies
   * cannot be told yet, says why it cannot be deleted at once instead, and nothing changes.
   * @param {Blueprint} blueprint The blueprint.
   */
  const askToDelete = (blueprint: Blueprint) =>
  {
    const copies = usedCopiesOf(blueprintCopies, hub, blueprint.id);
    if (copies !== null && copies.total === 0)
    {
      setConfirming(blueprint);
      return;
    }

    // the delete refuses such a blueprint, changing nothing, and says why.
    const refused = deleteBlueprint(hub, blueprint.id, copies, mapId => controller.mapName(mapId));
    if (refused.ok === false)
    {
      controller.notify(refused.message, 'error');
    }
  };

  /**
   * Forgets a placement no longer where it was, as one step in its blueprint's history, which becomes the one undo acts
   * on; the workspace's keeper of the record takes it off the disk at once, and nothing else of its map.
   * @param {Blueprint} blueprint The blueprint.
   * @param {PlacedSpot} spot The placement.
   */
  const forget = (blueprint: Blueprint, spot: PlacedSpot) =>
  {
    if (forgetPlacement(hub, blueprint, spot) === null)
    {
      return;
    }

    controller.focusHistory(blueprintHistoryKey(blueprint.id));
    controller.notify(`Forgot a copy of "${blueprint.name}" on ${controller.mapName(spot.mapId)}.`);
  };

  return (
    <Box data-testid={'blueprints-section'}>
      <Typography variant={'subtitle2'} sx={{ px: 1.5, pt: 1 }}>
        Blueprints
      </Typography>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', px: 1.5 }}>
        {blueprints.length === 0
          ? 'Save a stamp as a blueprint to keep it. Copies placed from it stay linked to it.'
          : 'Click a blueprint to place a linked copy with each click on a map; Esc puts it down.'}
      </Typography>
      {confirming !== null && (
        <DeleteConfirm name={confirming.name} onDelete={() => remove(confirming)} onKeep={() => setConfirming(null)}/>
      )}
      <Box sx={CARD_GRID}>
        {blueprints.map(blueprint => (
          <BlueprintCard
            key={blueprint.id}
            blueprint={blueprint}
            picked={blueprint.id === pickedId}
            copies={copyCountWords(counts, blueprint.id)}
            onPick={() => pick(blueprint)}
            onRename={name => rename(blueprint, name)}
            onDelete={() => askToDelete(blueprint)}
            onToggleWhereUsed={() => setShowing(current => (current === blueprint.id ? null : blueprint.id))}
            whereUsed={showing === blueprint.id
              ? (
                <BlueprintWhereUsed
                  blueprint={blueprint}
                  spots={spots.filter(spot => spot.blueprintId === blueprint.id)}
                  copies={blueprintCopies.copiesOf(blueprint.id)}
                  counting={eventCounts.state !== 'counted'}
                  onForget={spot => forget(blueprint, spot)}
                />
              )
              : null}
          />
        ))}
      </Box>
    </Box>
  );
};

/**
 * Every stamp copied in this window this session, newest first, each with a picture of what it holds, and the window's
 * blueprints above them. Whatever Ctrl+C or Ctrl+X takes off a map lands among the stamps, the oldest dropping off once
 * more than the stamp history's cap are kept; any stamp can be saved as a blueprint, named in place, to keep it for good.
 * Clicking a stamp or a blueprint makes it the brush, so each click on a map places it, and clicking it again, or Esc,
 * puts it down and takes up the tool held before. It picks for its paint's window, as the palette does: the workspace's
 * own maps. A window with no project server keeps no blueprints, and shows its stamps alone.
 * @returns {React.JSX.Element} The panel.
 */
const StampsPanel = () =>
{
  const controller = useWorkspace();
  const { stamps, hub } = controller.services;
  const list = useSyncExternalStore(stamps.subscribe, stamps.getSnapshot);
  const blueprints = useBlueprints();
  const { painting } = usePaintScope();
  const settings = usePaintSettings(painting);
  const pickedId = settings.tool === 'stamp' && settings.stamp !== null ? settings.stamp.id : null;

  /**
   * Takes up a stamp as the brush, or puts it down when it is the one in hand.
   * @param {Stamp} stamp The stamp clicked.
   */
  const pick = (stamp: Stamp) =>
  {
    if (stamp.id === pickedId)
    {
      painting.putDownStamp();
      return;
    }

    painting.takeUpStamp(stamp);
  };

  /**
   * Saves a stamp as a blueprint under a name.
   * @param {Stamp} stamp The stamp.
   * @param {string} name The name.
   */
  const saveAs = (stamp: Stamp, name: string) =>
  {
    const outcome = saveBlueprint(hub, stamp, name, Math.random);
    const blueprintId = outcome.ok && outcome.blueprint !== null ? outcome.blueprint.id : '';
    settleEdit(controller, outcome, blueprintId, `Saved "${name.trim()}" as a blueprint.`);
  };

  /**
   * Puts the stamp or blueprint in hand down on Esc, while the panel has the keys.
   * @param {React.KeyboardEvent} event The key.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    if (event.key === 'Escape' && pickedId !== null)
    {
      event.preventDefault();
      painting.putDownStamp();
    }
  };

  return (
    <Box
      sx={{ height: '100%', overflowY: 'auto', minHeight: 0, bgcolor: 'background.default' }}
      data-testid={'stamps-panel'}
      onKeyDown={onKeyDown}
    >
      {blueprints.kind === 'open' && <BlueprintsSection blueprints={blueprints.blueprints} spots={blueprints.spots} painting={painting}/>}
      {blueprints.kind === 'opening' && (
        <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', px: 1.5, pt: 1 }}>
          Opening the blueprints
        </Typography>
      )}
      {blueprints.kind === 'failed' && (
        <Alert severity={'error'} sx={{ m: 1 }}>
          {blueprints.message}
        </Alert>
      )}
      <Typography variant={'subtitle2'} sx={{ px: 1.5, pt: 1 }}>
        Stamps
      </Typography>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', px: 1.5 }}>
        {list.length === 0
          ? 'Copy part of a map with Ctrl+C and it lands here as a stamp, ready to place again.'
          : 'Click a stamp to place it with each click on a map; Esc puts it down.'}
      </Typography>
      <Box sx={CARD_GRID}>
        {list.map(stamp => (
          <StampCard
            key={stamp.id}
            stamp={stamp}
            picked={stamp.id === pickedId}
            from={`From ${controller.mapName(stamp.mapId)}`}
            onClick={() => pick(stamp)}
            onSave={blueprints.kind === 'open' ? name => saveAs(stamp, name) : null}
          />
        ))}
      </Box>
    </Box>
  );
};

export { StampsPanel };
