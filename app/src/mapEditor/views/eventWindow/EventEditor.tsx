import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Divider, Snackbar, Stack, Typography } from '@mui/material';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../core/blueprints/blueprints.ts';
import { copiesLeftWords } from '../../core/blueprints/copiesLeft.ts';
import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import { blueprintIdOfMap } from '../../core/model/documentKeys.ts';
import {
  pageListPath,
  readTargetEvent,
  renameEvent,
  setEventNote,
  targetDocument,
  targetHistory,
  type EditOutcome,
  type EventWindowTarget,
  type PageOutcome,
} from '../../core/eventWindow/eventWindowTarget.ts';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import { namedRows } from '../../core/commandList/databaseNames.ts';
import { parseEventMovement, type EventMovementFields } from '../../core/eventPage/eventMovement.ts';
import { saveTargetMap } from '../../core/eventWindow/eventWindowSave.ts';
import { setPageCondition, type ConditionChange } from '../../core/eventWindow/pageConditions.ts';
import { editPageItself, pageKey, placeOfShownPage, shownPageAt, type ShownPage } from '../../core/eventWindow/pageIdentity.ts';
import { setPageImage, setPageMovement, setPageOption, setPagePriority, setPageTrigger } from '../../core/eventWindow/pageSettings.ts';
import { loadTilesetRow } from '../../core/eventWindow/tilesetRow.ts';
import type { RmmzEventImage, RmmzTileset } from '../../core/model/rmmzTypes.ts';
import { HistoryRouter, type HistoryOutcome } from '../../core/workspace/HistoryRouter.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { EditorEnvironmentProvider, type HandBuiltEditorEnvironment } from '../commandEditors/editorEnvironment.tsx';
import { CommandList } from '../commandList/CommandList.tsx';
import { useCommandListResources } from '../commandList/commandListResources.ts';
import { useDocumentRevision, useHubChanges } from '../commandList/useCommandListState.ts';
import { commitTyping } from '../commitTyping.ts';
import { GraphicPicker } from '../eventPage/GraphicPicker.tsx';
import { MovementSettings } from '../eventPage/MovementSettings.tsx';
import { eventWindowTitle } from '../mapEditorViews.ts';
import { EventHeader } from './EventHeader.tsx';
import { useReadyMark } from './eventWindowMarks.ts';
import { KindPageSection } from './KindPageSection.tsx';
import { PageConditions } from './PageConditions.tsx';
import { PageOptions, PagePriorityTrigger } from './PageSettings.tsx';
import { PageTabs } from './PageTabs.tsx';
import { useEventWindowKeys } from './useEventWindowKeys.ts';

/**
 * A message for the author: what happened, and, for a step a later edit blocks, the step they can forget to go on.
 */
type Notice = {
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'success' | 'info';
  readonly stuckStepId?: string;
};

/**
 * One section of the page column, under its heading.
 * @param {{ title: string, children: React.ReactNode }} props The heading and what sits under it.
 * @returns {React.JSX.Element} The section.
 */
const Section = (props: { readonly title: string; readonly children: React.ReactNode }) =>
{
  const { title, children } = props;
  return (
    <Box component={'section'} aria-label={title} sx={{ px: 1.5, py: 1.25 }}>
      <Typography variant={'overline'} color={'text.secondary'} component={'h2'} sx={{ display: 'block', lineHeight: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
};

/**
 * Reads the tileset a map draws with from the server, for the graphic picker's tile pictures, without the window ever
 * holding the tilesets (see {@link loadTilesetRow}).
 * @param {MapEditorApi | null} api The server, or null when the window has none.
 * @param {number} tilesetId The map's tileset.
 * @returns {RmmzTileset | null} The tileset, or null until it arrives, without a server, or when the project has none
 * by that id.
 */
const useTilesetRow = (api: MapEditorApi | null, tilesetId: number): RmmzTileset | null =>
{
  const [ loaded, setLoaded ] = useState<{ id: number; row: RmmzTileset | null } | null>(null);
  useEffect(() =>
  {
    if (api === null)
    {
      return undefined;
    }

    // an answer arriving after the map moved to another tileset, or the window went, is dropped.
    let live = true;
    loadTilesetRow(api, tilesetId)
      .then(row =>
      {
        if (live)
        {
          setLoaded({ id: tilesetId, row });
        }
      })
      .catch(() => undefined);
    return () =>
    {
      live = false;
    };
  }, [ api, tilesetId ]);

  return loaded !== null && loaded.id === tilesetId
    ? loaded.row
    : null;
};

/**
 * Names the map an event window's event is on, for its title and its messages: the map's name as the project names it,
 * or, for a blueprint opened as a map, the blueprint's own.
 * @param {DocumentHub} hub The window's documents.
 * @param {number} mapId The map, or the id a blueprint opened as a map takes.
 * @param {readonly string[] | null} mapNames The project's map names by id, or null until read.
 * @returns {string} The name, such as "Forest Path", or "Map 12" while it is not known.
 */
const mapNameOf = (hub: DocumentHub, mapId: number, mapNames: readonly string[] | null): string =>
{
  const blueprintId = blueprintIdOfMap(mapId);
  if (blueprintId === null)
  {
    return (mapNames === null ? '' : mapNames[mapId] ?? '') || `Map ${mapId}`;
  }

  const blueprint = hub.has(BLUEPRINTS_DOCUMENT) ? blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId) : null;
  return blueprint === null
    ? 'a blueprint'
    : blueprint.name;
};

/**
 * The full editor of one event, in its own window: its name and note, its pages as tabs, and on the page shown its
 * conditions, graphic, movement, options, priority, trigger and commands. Every change is one step in the event's own
 * history (Ctrl+Z and Ctrl+Y move it, and the header lists it), lands at once in every other window holding the map,
 * and Ctrl+S saves the map. The page shown is followed by the page itself rather than its place, so pages added or
 * taken away in front of it, in any window, never put another page in its stead. The map must be held by the window's
 * hub; an event that goes from the map while its window is open says so, and comes back if an undo elsewhere brings it
 * back.
 * @param {{ target: EventWindowTarget }} props The event.
 * @returns {React.JSX.Element} The editor.
 */
const EventEditor = (props: { readonly target: EventWindowTarget }) =>
{
  const { target } = props;
  const services = useMapEditorServices();
  const { hub, api, pluginHeaders } = services;

  // a window built without a writer, as a stand-in for one, writes no blueprint's change.
  const blueprintWriter = services.blueprintWriter ?? null;
  const key = targetDocument(target);
  const history = targetHistory(target);
  useDocumentRevision(hub, key);
  useHubChanges(hub);
  const { names } = useCommandListResources(api);

  // a change to a blueprint whose files no longer hold what it would take back or put back stays where it is, and one
  // that moved leaving copies changed since as they stand names them, on their maps as the project names them.
  const mapNames = names?.maps ?? null;
  const router = useMemo(() => new HistoryRouter(
    hub,
    null,
    blueprintWriter === null ? null : (step, direction) => blueprintWriter.guard(step, direction),
    copiesLeftWords({ hub, mapName: mapId => mapNameOf(hub, mapId, mapNames) }),
  ), [ hub, blueprintWriter, mapNames ]);

  // the graphic picker reads the server and the names the way the hand-built command editors do.
  const environment = useMemo<HandBuiltEditorEnvironment>(() => ({ api, headers: pluginHeaders, names: kind => namedRows(names, kind) }), [ api, pluginHeaders, names ]);
  const [ shown, setShown ] = useState<ShownPage>({ page: null, place: 0 });
  const [ notice, setNotice ] = useState<Notice | null>(null);
  const [ saving, setSaving ] = useState(false);

  const event = readTargetEvent(hub, target);
  const eventName = event === null ? null : event.name;
  const mapName = mapNameOf(hub, target.mapId, names?.maps ?? null);
  useReadyMark(event !== null);

  // an edit the window's checks refused, such as a page taken off a blueprint's event that would take the event with it,
  // says why, whichever part of the window made it.
  useEffect(() => hub.subscribe(hubEvent =>
  {
    if (hubEvent.type === 'refused')
    {
      setNotice({ message: hubEvent.message, severity: 'warning' });
    }
  }), [ hub ]);

  // a change to a blueprint that could not be written says why too.
  useEffect(() => (blueprintWriter === null ? undefined : blueprintWriter.onProblem(message => setNotice({ message, severity: 'error' }))), [ blueprintWriter ]);

  // an event on the map means its map is held; the picker's tileset follows the map's own.
  const tileset = useTilesetRow(api, event === null ? 0 : hub.map(key).tilesetId);

  // the window's title names the event and its map, so a row of event windows reads as the events they edit.
  useEffect(() =>
  {
    if (eventName !== null)
    {
      document.title = eventWindowTitle(eventName, mapName);
    }
  }, [ eventName, mapName ]);

  /**
   * Takes an edit's outcome: a refusal is told, and a page edit shows the page it names.
   * @param {EditOutcome | PageOutcome} outcome The outcome.
   */
  const take = (outcome: EditOutcome | PageOutcome) =>
  {
    if (outcome.ok === false)
    {
      setNotice({ message: outcome.message, severity: 'warning' });
      return;
    }

    if ('page' in outcome)
    {
      setShown(shownPageAt(hub, target, outcome.page));
    }
  };

  /**
   * Runs an edit, telling an unexpected failure rather than losing it.
   * @param {() => EditOutcome | PageOutcome} edit The edit.
   */
  const run = (edit: () => EditOutcome | PageOutcome) =>
  {
    try
    {
      take(edit());
    }
    catch (error)
    {
      setNotice({ message: (error as Error).message, severity: 'error' });
    }
  };

  /**
   * Tells the author when an undo, a redo or a jump stopped short, or moved leaving copies of a blueprint changed since as
   * they stand; an empty history says nothing.
   * @param {HistoryOutcome} outcome What it came to.
   */
  const takeHistory = (outcome: HistoryOutcome) =>
  {
    if (outcome.ok && outcome.message !== undefined)
    {
      setNotice({ message: outcome.message, severity: 'info' });
      return;
    }

    if (outcome.ok === false && outcome.nothing === false)
    {
      setNotice({ message: outcome.message, severity: 'warning', ...(outcome.stuckStepId === null ? {} : { stuckStepId: outcome.stuckStepId }) });
    }
  };

  /**
   * Saves the map, with whatever the author is typing; a map waiting for a choice about changes made elsewhere is held
   * back, and says so. An event of a blueprint is written with its copies as it changes, so saving it waits for that.
   */
  const save = () =>
  {
    commitTyping();
    if (saving)
    {
      return;
    }

    setSaving(true);
    saveTargetMap(hub, target, blueprintWriter === null ? null : () => blueprintWriter.whenWritten())
      .then(outcome =>
      {
        if (outcome.ok === false)
        {
          setNotice({ message: outcome.message, severity: 'error' });
          return;
        }

        if (outcome.saved)
        {
          setNotice({ message: 'Saved.', severity: 'success' });
        }
      })
      .catch((error: unknown) => setNotice({ message: `The map was not saved: ${(error as Error).message}`, severity: 'error' }))
      .finally(() => setSaving(false));
  };

  const undo = () => router.undo(history).then(takeHistory).catch(() => undefined);
  const redo = () => router.redo(history).then(takeHistory).catch(() => undefined);
  useEventWindowKeys({ save, undo, redo });

  if (event === null)
  {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity={'info'}>{`Event ${target.eventId} is no longer on ${mapName}. Undoing its deletion in the map brings it back here.`}</Alert>
      </Box>
    );
  }

  // the page shown is followed by the page itself, wherever pages added or taken away in front of it have moved it.
  const pageIndex = placeOfShownPage(event.pages, shown);
  const page = event.pages[pageIndex];
  if (shown.page !== page || shown.place !== pageIndex)
  {
    // remember it as it stands now, so the next change to the pages finds it from here.
    setShown({ page, place: pageIndex });
  }

  // what is drawn for the page is keyed by the page, so a half-typed value never passes to another page.
  const shownKey = pageKey(page);

  /**
   * Runs an edit on the page shown, wherever that page stands by the time the edit lands.
   * @param {(at: number) => PageOutcome} edit The edit, given the page's place.
   */
  const runOnPage = (edit: (at: number) => PageOutcome) =>
  {
    run(() => editPageItself(hub, target, page, edit));
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }} data-testid={'event-editor'}>
      <EventHeader
        event={event}
        history={hub.history(history)}
        dirty={hub.isDirty(key)}
        saving={saving}
        onRename={name => run(() => renameEvent(hub, target, name))}
        onNote={note => run(() => setEventNote(hub, target, note))}
        onUndo={undo}
        onRedo={redo}
        onJump={stepId => router.jumpTo(history, stepId).then(takeHistory).catch(() => undefined)}
        onSave={save}
      />
      <PageTabs
        target={target}
        event={event}
        page={pageIndex}
        names={names}
        onSelect={place => setShown(shownPageAt(hub, target, place))}
        onOutcome={take}
        onNotice={message => setNotice({ message, severity: 'warning' })}
      />
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box key={shownKey} sx={{ width: 420, flex: 'none', overflowY: 'auto', borderRight: 1, borderColor: 'divider' }} data-testid={'page-settings'}>
          <Section title={'Conditions'}>
            <PageConditions
              conditions={page.conditions}
              names={names}
              onChange={(change: ConditionChange) => runOnPage(at => setPageCondition(hub, target, at, change))}
            />
          </Section>
          <Divider/>
          <Section title={'Graphic'}>
            <EditorEnvironmentProvider environment={environment}>
              <GraphicPicker
                value={page.image}
                tileset={tileset}
                onChange={(image: RmmzEventImage) => runOnPage(at => setPageImage(hub, target, at, image))}
              />
            </EditorEnvironmentProvider>
          </Section>
          <Section title={'Movement'}>
            <MovementSettings
              value={parseEventMovement(page)}
              setting={{ mapId: target.mapId, page: { eventId: target.eventId, pageIndex }, before: [], characterId: 0 }}
              onChange={(movement: EventMovementFields) => runOnPage(at => setPageMovement(hub, target, at, movement))}
            />
          </Section>
          <Divider/>
          <Section title={'Options'}>
            <PageOptions page={page} onChange={(option, on) => runOnPage(at => setPageOption(hub, target, at, option, on))}/>
          </Section>
          <Section title={'Priority and trigger'}>
            <PagePriorityTrigger
              page={page}
              onPriority={priority => runOnPage(at => setPagePriority(hub, target, at, priority))}
              onTrigger={trigger => runOnPage(at => setPageTrigger(hub, target, at, trigger))}
            />
          </Section>
          <KindPageSection target={target} event={event} pageIndex={pageIndex}/>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', p: 1 }}>
          <CommandList
            key={shownKey}
            documentKey={key}
            path={pageListPath(target, pageIndex)}
            histories={[ history ]}
            label={`Commands of page ${pageIndex + 1}`}
          />
        </Box>
      </Box>
      <Snackbar
        open={notice !== null}
        autoHideDuration={notice?.severity === 'success' ? 2000 : 8000}
        onClose={(_close, reason) => reason !== 'clickaway' && setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={notice?.severity ?? 'success'}
          variant={'filled'}
          onClose={() => setNotice(null)}
          action={notice?.stuckStepId === undefined
            ? undefined
            : (
              <Stack direction={'row'}>
                <Button
                  color={'inherit'}
                  size={'small'}
                  onClick={() =>
                  {
                    router.forget(notice.stuckStepId as string);
                    setNotice(null);
                  }}
                >
                  Forget it
                </Button>
              </Stack>
            )}
        >
          {notice?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export { EventEditor };
