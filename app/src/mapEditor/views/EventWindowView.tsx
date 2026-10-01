import React, { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import { mapDocumentKey, TILESETS_KEY } from '../core/model/documentKeys.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import { EventEditor } from './eventWindow/EventEditor.tsx';
import { EVENT_WINDOW_MARKS, markOnce } from './eventWindow/eventWindowMarks.ts';

/**
 * What an event window is showing.
 */
type EventWindowViewProps = {
  readonly mapId: number;
  readonly eventId: number;
};

/**
 * An event's own window, opened by double-clicking the event on the map. It holds the event's map first (the live copy
 * from the map's window, unsaved edits and history included, or the file when no window holds it), then shows the full
 * event editor, which shares that one live map with every other window. The tilesets come alongside, for the graphic
 * picker's tile pictures, and the editor shows before they arrive.
 * @param {EventWindowViewProps} props The map and event.
 * @returns {React.JSX.Element} The window's content.
 */
const EventWindowView = (props: EventWindowViewProps) =>
{
  const { mapId, eventId } = props;
  const { hub, openDocument } = useMapEditorServices();
  const key = mapDocumentKey(mapId);
  const [ ready, setReady ] = useState(() => hub.has(key));
  const [ problem, setProblem ] = useState<string | null>(null);

  // the tilesets only feed the tile half of the graphic picker, which offers a typed tile id until they arrive.
  useEffect(() =>
  {
    openDocument(TILESETS_KEY).catch(() => undefined);
  }, [ openDocument ]);

  useEffect(() =>
  {
    if (ready)
    {
      return undefined;
    }

    // an answer arriving after the window has gone is dropped.
    let live = true;
    openDocument(key)
      .then(() =>
      {
        markOnce(EVENT_WINDOW_MARKS.document);
        if (live)
        {
          setReady(true);
        }
      })
      .catch((error: unknown) =>
      {
        if (live)
        {
          setProblem((error as Error).message);
        }
      });
    return () =>
    {
      live = false;
    };
  }, [ ready, key, openDocument ]);

  if (problem !== null)
  {
    return <Alert severity={'error'} sx={{ m: 2 }}>{`Map ${mapId} could not be opened: ${problem}`}</Alert>;
  }

  return ready
    ? <EventEditor target={{ mapId, eventId }}/>
    : <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress aria-label={'Opening the event'}/></Box>;
};

export { EventWindowView };
