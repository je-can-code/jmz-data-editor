import React, { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress } from '@mui/material';
import { BLUEPRINTS_DOCUMENT } from '../core/blueprints/blueprints.ts';
import { isBlueprintMapId, mapDocumentKey } from '../core/model/documentKeys.ts';
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
 * event editor, which shares that one live map with every other window. The map is the only document it holds: what
 * else the editor reads, such as the graphic picker's tileset, it reads without holding. An event of a blueprint opened
 * as a map holds the blueprints too, which name the blueprint and say what it keeps.
 * @param {EventWindowViewProps} props The map and event.
 * @returns {React.JSX.Element} The window's content.
 */
const EventWindowView = (props: EventWindowViewProps) =>
{
  const { mapId, eventId } = props;
  const { hub, openDocument } = useMapEditorServices();
  const key = mapDocumentKey(mapId);
  const blueprint = isBlueprintMapId(mapId);
  const [ ready, setReady ] = useState(() => hub.has(key));
  const [ problem, setProblem ] = useState<string | null>(null);

  useEffect(() =>
  {
    if (ready)
    {
      return undefined;
    }

    // an answer arriving after the window has gone is dropped; a blueprint's event holds the blueprints first.
    let live = true;
    const opening = blueprint
      ? openDocument(BLUEPRINTS_DOCUMENT).then(() => openDocument(key))
      : openDocument(key);
    opening
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
  }, [ ready, key, blueprint, openDocument ]);

  if (problem !== null)
  {
    return <Alert severity={'error'} sx={{ m: 2 }}>{`${blueprint ? 'The blueprint' : `Map ${mapId}`} could not be opened: ${problem}`}</Alert>;
  }

  return ready
    ? <EventEditor target={{ mapId, eventId }}/>
    : <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress aria-label={'Opening the event'}/></Box>;
};

export { EventWindowView };
