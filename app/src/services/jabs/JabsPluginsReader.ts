import type { RmmzMapJson } from '@core/types/RmmzMapJson.ts';
import { getJmzHttpApiBase } from '../../constants/jmzHttpApiBase.ts';
import { parsePluginsJsArray } from '../plugins/PluginsJsReader.ts';

const DEFAULT_JABS_ACTION_MAP_ID = 2;

function isRecord(x: unknown): x is Record<string, unknown>
{
  return typeof x === 'object' && x !== null;
}

/**
 * Reads JABS {@code actionMapId} from {@code js/plugins.js} under the project root (plugin name still contains {@code J-ABS}).
 * @returns Parsed id, or {@link DEFAULT_JABS_ACTION_MAP_ID} when missing or unreadable.
 */
async function readJabsActionMapIdFromPluginsJs(_projectRoot: string): Promise<number>
{
  try
  {
    const apiBase = getJmzHttpApiBase();
    if (apiBase === null)
    {
      return DEFAULT_JABS_ACTION_MAP_ID;
    }

    const url = `${apiBase}/api/plugin-metadata`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok)
    {
      return DEFAULT_JABS_ACTION_MAP_ID;
    }

    const text = await response.text();
    const arr = parsePluginsJsArray(text);
    for (const entry of arr)
    {
      if (!isRecord(entry))
      {
        continue;
      }
      const { name } = entry;
      // Core plugin path in plugins.js is still "abs/J-ABS" (hyphenated filename).
      if (typeof name !== 'string' || name.includes('J-ABS') === false)
      {
        continue;
      }
      const { parameters } = entry;
      if (!isRecord(parameters))
      {
        continue;
      }
      const raw = parameters[ 'actionMapId' ];
      if (typeof raw === 'number')
      {
        if (!Number.isNaN(raw) && raw > 0)
        {
          return Math.trunc(raw);
        }
        continue;
      }
      if (typeof raw === 'string')
      {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n > 0)
        {
          return n;
        }
      }
    }
  }
  catch
  {
    return DEFAULT_JABS_ACTION_MAP_ID;
  }

  return DEFAULT_JABS_ACTION_MAP_ID;
}

/**
 * Builds picker rows from {@link RmmzMapJson.events} (index {@code 0} is unused in RMMZ).
 */
function buildActionMapEventRows(map: RmmzMapJson): { id: number; label: string }[]
{
  const { events } = map;
  if (!Array.isArray(events))
  {
    return [];
  }

  const rows: { id: number; label: string }[] = [];
  for (let i = 1; i < events.length; i++)
  {
    const ev = events[ i ];
    if (ev === null || typeof ev !== 'object')
    {
      continue;
    }
    const id = typeof ev.id === 'number'
      ? ev.id
      : i;
    const name = typeof ev.name === 'string' && ev.name.length > 0
      ? ev.name
      : `Event ${id}`;
    rows.push({
      id,
      label: `${id}: ${name}`,
    });
  }
  return rows;
}

export {
  DEFAULT_JABS_ACTION_MAP_ID,
  buildActionMapEventRows,
  readJabsActionMapIdFromPluginsJs,
};
