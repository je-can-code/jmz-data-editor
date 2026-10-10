import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { PassabilityQuery, PassabilityRule } from '../../core/modules/PluginModule.ts';
import { TileFlag } from '../../render/engine/tileIds.ts';

/**
 * J-RegionEffects' say over every map, from its parameters: the regions no one may step onto, the regions anyone may step
 * onto whatever the tiles say, and the terrain tags no one may step off or onto.
 */
type RegionSettings = {
  readonly denyRegions: readonly number[];
  readonly allowRegions: readonly number[];
  readonly denyTerrainTags: readonly number[];
};

/**
 * One map's own regions, from its note: those no one may step onto, and those anyone may.
 */
type MapRegions = {
  readonly deny: readonly number[];
  readonly allow: readonly number[];
};

/**
 * A map's note tag naming regions no one may step onto there, as J.REGIONS.RegExp.DenyRegions reads it.
 */
const DENY_REGIONS_TAG = /<denyRegions: ?(\[[\d, ]+\])>/iu;

/**
 * A map's note tag naming regions anyone may step onto there, as J.REGIONS.RegExp.AllowRegions reads it.
 */
const ALLOW_REGIONS_TAG = /<allowRegions: ?(\[[\d, ]+\])>/iu;

/**
 * How far a step in each direction moves, as Game_Map#projectCoordinatesByDirection, J-RegionEffects' own, moves it:
 * one tile, never wrapping round a map that loops.
 */
const STEP_OFFSETS: Readonly<Record<PassabilityQuery['direction'], readonly [ number, number ]>> = {
  2: [ 0, 1 ],
  4: [ -1, 0 ],
  6: [ 1, 0 ],
  8: [ 0, -1 ],
};

/**
 * Reads one of J-RegionEffects' list parameters as J.REGIONS.Helpers.translateRegionIds does: the JSON list MZ writes,
 * each entry read with parseInt. An entry that reads as no number can never equal a region or a terrain tag, so it is
 * left out; a parameter that is missing or is no list, which stops the plugin as the game starts, names nothing here.
 * @param {string | undefined} text The parameter, as js/plugins.js holds it.
 * @returns {number[]} The ids.
 */
const parameterIds = (text: string | undefined): number[] =>
{
  let parsed: unknown = null;
  try
  {
    parsed = JSON.parse(text ?? '');
  }
  catch
  {
    return [];
  }

  // parseInt without a radix, as the plugin calls it, so "0x10" is 16 there and here alike.
  return Array.isArray(parsed)
    ? parsed.map(entry => Number.parseInt(String(entry))).filter(id => Number.isNaN(id) === false)
    : [];
};

/**
 * Reads J-RegionEffects' settings from its entry in js/plugins.js.
 * @param {PluginsJsEntry} plugin J-RegionEffects, as js/plugins.js lists it.
 * @returns {RegionSettings} The settings.
 */
const regionSettingsOf = (plugin: PluginsJsEntry): RegionSettings =>
{
  const { parameters } = plugin;
  return {
    denyRegions: parameterIds(parameters['globalDenyRegions']),
    allowRegions: parameterIds(parameters['globalAllowRegions']),
    denyTerrainTags: parameterIds(parameters['globalDenyTerrainTags']),
  };
};

/**
 * Reads the region list a map's note names with one tag, as J-Base's RPGManager#getArrayFromNotesByRegex reads it for
 * J-RegionEffects: line by line, the last line carrying the tag winning outright, and only the first tag on that line
 * read. The list is read as JsonMapper#parseArrayFromString reads it: the brackets peeled off, the rest split at each
 * comma, and each piece read with parseFloat, so "[1 2]" names region 1 alone. A piece that reads as no number stays
 * text there and can never equal a region, so it is left out.
 * @param {string} note The note.
 * @param {RegExp} tag The tag.
 * @returns {number[]} The regions; none when no line carries the tag.
 */
const noteRegions = (note: string, tag: RegExp): number[] =>
{
  let regions: number[] = [];
  note.split(/[\r\n]+/u).forEach(line =>
  {
    const match = tag.exec(line);
    if (match === null)
    {
      return;
    }

    const [ , list ] = match;
    regions = list.slice(1, -1)
      .split(/, |,/u)
      .map(piece => Number.parseFloat(piece))
      .filter(region => Number.isNaN(region) === false);
  });

  return regions;
};

/**
 * Keeps each map's regions as last read, with the note they were read from, so a map is read again only once its note
 * changes, never once for every step the overlay asks about.
 */
const mapRegionsRead = new WeakMap<MapDocument, { readonly note: string; readonly regions: MapRegions }>();

/**
 * Reads a map's own regions from its note, as J-RegionEffects does when the map is set up.
 * @param {MapDocument} map The map.
 * @returns {MapRegions} The regions no one may step onto there, and those anyone may.
 */
const mapRegionsOf = (map: MapDocument): MapRegions =>
{
  const note = map.property('note');
  const read = mapRegionsRead.get(map);
  if (read !== undefined && read.note === note)
  {
    return read.regions;
  }

  const regions = { deny: noteRegions(note, DENY_REGIONS_TAG), allow: noteRegions(note, ALLOW_REGIONS_TAG) };
  mapRegionsRead.set(map, { note, regions });
  return regions;
};

/**
 * Finds the terrain tag of the tile that decides a step, as J-RegionEffects' Game_Map#checkPassage reads it: the first
 * tile, top first, without the star flag. The rule is only asked about steps the engine lets through, so that tile is
 * always there.
 * @param {PassabilityQuery} query The step.
 * @returns {number} The tile's terrain tag.
 */
const decidingTerrainTag = (query: PassabilityQuery): number =>
{
  const { flags } = query.tileset;
  const tile = query.tiles.find(each => ((flags[each] ?? 0) & TileFlag.star) === 0) as number;
  return (flags[tile] ?? 0) >> 12;
};

/**
 * J-RegionEffects' rules forbidding the player a step, mirrored from its Game_Map#isPassable and #checkPassage, in their
 * order:
 *
 * 1. a step onto a tile whose region no one may step onto, on every map or on this one, is forbidden. The region read is
 *    the next tile's, one step on without wrapping round a map that loops, and a tile off the map is region 0;
 * 2. a step onto a tile whose region anyone may step onto goes, before the tiles are read at all;
 * 3. a step through tiles whose deciding tile carries a terrain tag no one may step on is forbidden.
 *
 * A step's reason names the region or the tag, since a landing reads it from either side: a region no one may step onto
 * refuses every step back onto a tile in it, so no step ever leaves that tile. The second rule only ever lets a step
 * through, which a rule here cannot do for a step the engine's tiles already stop; this rule keeps it to what it does to
 * the third, so such a step still reads as blocked by its tiles.
 * @param {RegionSettings} settings J-RegionEffects' settings.
 * @returns {PassabilityRule} The rule.
 */
const regionRule = (settings: RegionSettings): PassabilityRule =>
{
  return {
    id: 'regions.passage',
    title: 'Regions and terrain',
    deny: query =>
    {
      const { document, x, y, direction } = query;
      const [ dx, dy ] = STEP_OFFSETS[direction];
      const region = document.cellAt(x + dx, y + dy, 5);
      const regions = mapRegionsOf(document);
      if (settings.denyRegions.includes(region) || regions.deny.includes(region))
      {
        return `Region ${region} keeps everyone out.`;
      }

      // a region anyone may step onto lets the step through before the plugin reads a single tile.
      if (settings.allowRegions.includes(region) || regions.allow.includes(region))
      {
        return null;
      }

      const tag = decidingTerrainTag(query);
      return settings.denyTerrainTags.includes(tag)
        ? `Terrain tag ${tag} keeps everyone off.`
        : null;
    },
  };
};

export { noteRegions, parameterIds, regionRule, regionSettingsOf };
export type { MapRegions, RegionSettings };
