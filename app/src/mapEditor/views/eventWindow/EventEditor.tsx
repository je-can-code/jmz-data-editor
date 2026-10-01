import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Divider, Snackbar, Stack, Typography } from '@mui/material';
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
import { namedRows } from '../../core/commandList/databaseNames.ts';
import { parseEventMovement, type EventMovementFields } from '../../core/eventPage/eventMovement.ts';
import { setPageCondition, type ConditionChange } from '../../core/eventWindow/pageConditions.ts';
import { setPageImage, setPageMovement, setPageOption, setPagePriority, setPageTrigger } from '../../core/eventWindow/pageSettings.ts';
import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import { TILESETS_KEY } from '../../core/model/documentKeys.ts';
import type { TilesetsDocument } from '../../core/model/JsonDocument.ts';
import type { RmmzEventImage, RmmzTileset } from '../../core/model/rmmzTypes.ts';
import { HistoryRouter, type HistoryOutcome } from '../../core/workspace/HistoryRouter.ts';
import { isTextEntry } from '../../core/workspace/shortcuts.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { EditorEnvironmentProvider, type HandBuiltEditorEnvironment } from '../commandEditors/editorEnvironment.tsx';
import { CommandList } from '../commandList/CommandList.tsx';
import { useCommandListResources } from '../commandList/commandListResources.ts';
import { useDocumentRevision, useHubChanges } from '../commandList/useCommandListState.ts';
import { GraphicPicker } from '../eventPage/GraphicPicker.tsx';
import { MovementSettings } from '../eventPage/MovementSettings.tsx';
import { eventWindowTitle } from '../mapEditorViews.ts';
import { EventHeader } from './EventHeader.tsx';
import { useReadyMark } from './eventWindowMarks.ts';
import { PageConditions } from './PageConditions.tsx';
import { PageOptions, PagePriorityTrigger } from './PageSettings.tsx';
import { PageTabs } from './PageTabs.tsx';
import { useEventWindowKeys } from './useEventWindowKeys.ts';

/**
 * A message for the author: what happened, and, for a step a later edit blocks, the step they can forget to go on.
 */
type Notice = {
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'success';
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
 * Reads the tileset a map draws with, once the window holds the tilesets: the graphic picker cuts tile pictures from it.
 * @param {DocumentHub} hub The window's documents.
 * @param {number} tilesetId The map's tileset.
 * @returns {RmmzTileset | null} The tileset, or null while the tilesets are still on their way.
 */
const heldTileset = (hub: DocumentHub, tilesetId: number): RmmzTileset | null =>
{
  return hub.has(TILESETS_KEY)
    ? (hub.document(TILESETS_KEY) as TilesetsDocument).tileset(tilesetId)
    : null;
};

/**
 * Commits whatever the author is typing before a save, so Ctrl+S in the middle of a name or a line of dialogue saves
 * what they typed: the field hands its value over as it loses focus, and gets focus straight back.
 */
const commitTyping = (): void =>
{
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTextEntry(active))
  {
    active.blur();
    active.focus();
  }
};

/**
 * The full editor of one event, in its own window: its name and note, its pages as tabs, and on the page shown its
 * conditions, graphic, movement, options, priority, trigger and commands. Every change is one step in the event's own
 * history (Ctrl+Z and Ctrl+Y move it, and the header lists it), lands at once in every other window holding the map,
 * and Ctrl+S saves the map. The map must be held by the window's hub; an event that goes from the map while its window
 * is open says so, and comes back if an undo elsewhere brings it back.
 * @param {{ target: EventWindowTarget }} props The event.
 * @returns {React.JSX.Element} The editor.
 */
const EventEditor = (props: { readonly target: EventWindowTarget }) =>
{
  const { target } = props;
  const { hub, api, pluginHeaders } = useMapEditorServices();
  const key = targetDocument(target);
  const history = targetHistory(target);
  useDocumentRevision(hub, key);
  useHubChanges(hub);
  const { names } = useCommandListResources(api);
  const router = useMemo(() => new HistoryRouter(hub, null), [ hub ]);

  // the graphic picker reads the server and the names the way the hand-built command editors do.
  const environment = useMemo<HandBuiltEditorEnvironment>(() => ({ api, headers: pluginHeaders, names: kind => namedRows(names, kind) }), [ api, pluginHeaders, names ]);
  const [ selected, setSelected ] = useState(0);
  const [ notice, setNotice ] = useState<Notice | null>(null);
  const [ saving, setSaving ] = useState(false);

  const event = readTargetEvent(hub, target);
  const eventName = event === null ? null : event.name;
  const mapName = names?.maps[target.mapId] || `Map ${target.mapId}`;
  useReadyMark(event !== null);

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
      setSelected(outcome.page);
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
   * Tells the author when an undo, a redo or a jump stopped short; an empty history says nothing.
   * @param {HistoryOutcome} outcome What it came to.
   */
  const takeHistory = (outcome: HistoryOutcome) =>
  {
    if (outcome.ok === false && outcome.nothing === false)
    {
      setNotice({ message: outcome.message, severity: 'warning', ...(outcome.stuckStepId === null ? {} : { stuckStepId: outcome.stuckStepId }) });
    }
  };

  /**
   * Saves the map, with whatever the author is typing.
   */
  const save = () =>
  {
    commitTyping();
    if (hub.isDirty(key) === false || saving)
    {
      return;
    }

    setSaving(true);
    hub.save(key)
      .then(() => setNotice({ message: 'Saved.', severity: 'success' }))
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

  // the page shown follows the pages there are, which an undo or another window may have changed.
  const pageIndex = Math.min(selected, event.pages.length - 1);
  const page = event.pages[pageIndex];
  const tileset = heldTileset(hub, hub.map(key).tilesetId);

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
        onSelect={setSelected}
        onOutcome={take}
        onNotice={message => setNotice({ message, severity: 'warning' })}
      />
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box sx={{ width: 420, flex: 'none', overflowY: 'auto', borderRight: 1, borderColor: 'divider' }} data-testid={'page-settings'}>
          <Section title={'Conditions'}>
            <PageConditions
              conditions={page.conditions}
              names={names}
              onChange={(change: ConditionChange) => run(() => setPageCondition(hub, target, pageIndex, change))}
            />
          </Section>
          <Divider/>
          <Section title={'Graphic'}>
            <EditorEnvironmentProvider environment={environment}>
              <GraphicPicker
                key={pageIndex}
                value={page.image}
                tileset={tileset}
                onChange={(image: RmmzEventImage) => run(() => setPageImage(hub, target, pageIndex, image))}
              />
            </EditorEnvironmentProvider>
          </Section>
          <Section title={'Movement'}>
            <MovementSettings
              key={pageIndex}
              value={parseEventMovement(page)}
              onChange={(movement: EventMovementFields) => run(() => setPageMovement(hub, target, pageIndex, movement))}
            />
          </Section>
          <Divider/>
          <Section title={'Options'}>
            <PageOptions page={page} onChange={(option, on) => run(() => setPageOption(hub, target, pageIndex, option, on))}/>
          </Section>
          <Section title={'Priority and trigger'}>
            <PagePriorityTrigger
              page={page}
              onPriority={priority => run(() => setPagePriority(hub, target, pageIndex, priority))}
              onTrigger={trigger => run(() => setPageTrigger(hub, target, pageIndex, trigger))}
            />
          </Section>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', p: 1 }}>
          <CommandList
            key={pageIndex}
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
