import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';

/**
 * The symbols a marker shows. An event whose page draws no picture (a story sequence running on autorun, a parallel
 * process tracking enemies or the weather, a spawner, a trigger under the floor) would be invisible on the map, so it
 * draws a marker instead: a square a little smaller than its tile, holding the symbol of what it is. A kind the editor
 * recognises names its own symbol (a chest, a transfer, dialogue, decor, a J-ABS battler, a light); any other event
 * shows what starts it running, by its trigger.
 */
type EventMarkerSymbol =
  | 'chest'
  | 'transfer'
  | 'dialogue'
  | 'decor'
  | 'battler'
  | 'light'
  | 'action-button'
  | 'player-touch'
  | 'event-touch'
  | 'autorun'
  | 'parallel';

/**
 * How a marker looks beyond its symbol: the colour it is filled with, as a CSS colour, and the words for it, as the
 * events list and a legend show it.
 */
type MarkerStyle = {
  readonly colour: string;
  readonly label: string;
};

/**
 * What a marker's symbol is chosen by: the kind that claims the event, which may name a symbol of its own.
 */
type MarkedKind = {
  readonly marker?: EventMarkerSymbol;
};

/**
 * Every symbol, in the order the marker atlas lays them out: the kinds first, then the triggers in MZ's own order.
 */
const MARKER_SYMBOLS: readonly EventMarkerSymbol[] = [
  'chest',
  'transfer',
  'dialogue',
  'decor',
  'battler',
  'light',
  'action-button',
  'player-touch',
  'event-touch',
  'autorun',
  'parallel',
];

/**
 * The symbol each trigger shows, by MZ's trigger number: action button, player touch, event touch, autorun, parallel.
 */
const TRIGGER_MARKERS: readonly EventMarkerSymbol[] = [ 'action-button', 'player-touch', 'event-touch', 'autorun', 'parallel' ];

/**
 * The colour every trigger symbol shares: a quiet slate, so the events the editor recognises stand out by colour and
 * the rest read by their symbol alone.
 */
const TRIGGER_COLOUR = '#546e7a';

/**
 * How each symbol's marker looks. Every kind has a colour of its own, picked so that a map full of battlers reads as a
 * field of red at a glance, and each holds a white symbol over it.
 */
const MARKER_STYLES: Readonly<Record<EventMarkerSymbol, MarkerStyle>> = {
  'chest': { colour: '#795548', label: 'Chest' },
  'transfer': { colour: '#2e7d32', label: 'Transfer' },
  'dialogue': { colour: '#1976d2', label: 'Dialogue' },
  'decor': { colour: '#00897b', label: 'Decor' },
  'battler': { colour: '#d32f2f', label: 'Battler' },
  'light': { colour: '#f9a825', label: 'Light' },
  'action-button': { colour: TRIGGER_COLOUR, label: 'Action button' },
  'player-touch': { colour: TRIGGER_COLOUR, label: 'Player touch' },
  'event-touch': { colour: TRIGGER_COLOUR, label: 'Event touch' },
  'autorun': { colour: TRIGGER_COLOUR, label: 'Autorun' },
  'parallel': { colour: TRIGGER_COLOUR, label: 'Parallel' },
};

/**
 * Finds the symbol a trigger shows. A trigger MZ never writes shows the action button, MZ's own default.
 * @param {number} trigger The page's trigger.
 * @returns {EventMarkerSymbol} The symbol.
 */
const triggerMarker = (trigger: number): EventMarkerSymbol =>
{
  return TRIGGER_MARKERS[trigger] ?? 'action-button';
};

/**
 * Picks the symbol an event's marker shows: the symbol its kind names when a kind claims it and names one, and
 * otherwise the trigger of the page the editor shows, its first unless the page shown is given, as a map shows the page
 * the game shows at the clock's time. An event with no pages at all starts like a fresh page, on the action button.
 * @param {RmmzMapEvent} event The event.
 * @param {MarkedKind | null} kind The kind that claims it, or null when none does.
 * @param {RmmzEventPage | undefined} page The page shown; left out, the event's first.
 * @returns {EventMarkerSymbol} The symbol.
 */
const markerSymbolFor = (
  event: RmmzMapEvent,
  kind: MarkedKind | null,
  page: RmmzEventPage | undefined = event.pages[0]): EventMarkerSymbol =>
{
  if (kind !== null && kind.marker !== undefined)
  {
    return kind.marker;
  }

  return triggerMarker(page === undefined ? 0 : page.trigger);
};

export { MARKER_STYLES, MARKER_SYMBOLS, markerSymbolFor, TRIGGER_MARKERS, triggerMarker };
export type { EventMarkerSymbol, MarkedKind, MarkerStyle };
