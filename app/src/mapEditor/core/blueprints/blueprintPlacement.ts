import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import type { TemplateMap } from '../modules/PluginModuleRegistry.ts';
import { commitStampPlan, planStamp, type StampOutcome, type StampPlacement } from '../stamps/stampPlacement.ts';
import { withBlueprintLink } from './blueprintLink.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from './blueprints.ts';
import { placedOn, readableUses } from './blueprintUses.ts';

/**
 * Says why a map may hold no copy of a blueprint, or null when it may: what every placement on a map asks before it
 * writes a link there, or carries one there inside a stamp.
 */
type LinkGate = (mapId: number) => string | null;

/**
 * What the link gate reads of the window's plugin modules: whether they have switched on yet, why the project's plugin
 * list could not be read when it could not, and which plugin, if any, copies a map's events while the game runs, with
 * what those events are to it. The plugin module registry is one.
 */
type TemplateMapSource = {
  readonly revision: number;
  readonly listProblem: string | null;
  templateMapOf(mapId: number): TemplateMap | null;
};

/**
 * Why no map takes a link before the window has read which plugins the project runs: until then it cannot tell which
 * maps a plugin copies its events from.
 */
const PLUGINS_UNREAD = 'the project\'s plugins are still being read; try again in a moment';

/**
 * Why no map takes a link when the project's plugin list could not be read: the window cannot tell which maps a plugin
 * copies its events from, and waiting will not tell it, so it says what went wrong instead.
 * @param {string} problem Why the list could not be read.
 * @returns {string} The reason.
 */
const pluginsUnreadable = (problem: string): string =>
{
  return `the project's plugin list could not be read (${problem})`;
};

/**
 * Builds the gate that keeps links off every map whose events a plugin copies while the game runs, notes and all, such
 * as J-ABS's action map (Map002 in Chef Adventure, named by J-ABS's Action Map Id). Nothing in the game reads an event's
 * note on any other map, which is why the note is where a copy's link lives; on those maps the plugin reads it, so a link
 * there is never written. Until the plugin modules have switched on, which maps those are is not known, so no map takes
 * a link: while the plugin list is still being read, and for as long as it cannot be, which the gate says, with why.
 * @param {TemplateMapSource} modules The window's plugin modules.
 * @returns {LinkGate} The gate.
 */
const linkGateFor = (modules: TemplateMapSource): LinkGate =>
{
  return (mapId: number) =>
  {
    if (modules.revision === 0)
    {
      return modules.listProblem === null
        ? PLUGINS_UNREAD
        : pluginsUnreadable(modules.listProblem);
    }

    // the author hears what the map holds and that the game reads it, which is all the reason there is.
    const template = modules.templateMapOf(mapId);
    return template === null
      ? null
      : `this map holds ${template.owner}'s ${template.holds}, which the game reads, so blueprints stay off it`;
  };
};

/**
 * Why a blueprint's tiles are not placed while the window holds no record of placements it can read: a placement nothing
 * records could never be found again.
 */
const USES_UNREAD = 'Blueprints with tiles can\'t be placed until the record of where blueprints are placed can be read.';

/**
 * Places a blueprint on a map as one step in its history: its tiles painted as a plain copy, with their autotile edges
 * refreshed, and its events where they stand inside it with fresh ids, exactly as placing its stamp would (see
 * {@link planStamp}), but every event placed carries a link in its note naming the blueprint and which of its events it
 * is a copy of. The link goes on a line of its own after whatever the note already says, and a note that would read any
 * other tag differently with it refuses the whole placement. When its tiles go down, the cell its corner lands on is
 * recorded as one of its placements, in the same step, so one undo takes the record back with the tiles, and when the
 * map's edge cuts some of it off, the part that went down with it; a blueprint of events alone, or one whose tiles a map
 * of another tileset leaves out, records nothing, its events' links being all there is to find. The step is named for
 * the blueprint.
 *
 * Refused whole, changing nothing: a blueprint no longer there; a map that may hold no link, with its reason; tiles to
 * place while the window holds no record of placements it can read; and anything placing its stamp would refuse.
 * @param {DocumentHub} hub The window's documents; the map and the blueprints document must be held.
 * @param {number} mapId The map.
 * @param {string} blueprintId The blueprint.
 * @param {StampPlacement} placement Where it goes and how, and whether the map may hold links.
 * @returns {StampOutcome} The step, the events placed and what was left out, or why it was refused.
 */
const placeBlueprint = (hub: DocumentHub, mapId: number, blueprintId: string, placement: StampPlacement): StampOutcome =>
{
  const blueprint = blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId);
  if (blueprint === null)
  {
    return { ok: false, message: 'That blueprint is no longer there.' };
  }

  if (placement.linkRefusal !== null)
  {
    return { ok: false, message: `Blueprints can't be placed here: ${placement.linkRefusal}.` };
  }

  // every event placed takes this blueprint's link, whatever its note held, so no link is told dead on the way; and the
  // placement recorded is this one alone, whatever its stamp was copied with.
  const { spots: _spots, ...stamp } = blueprint.stamp;
  const plan = planStamp(hub.map(mapDocumentKey(mapId)), stamp, placement, null);
  if (plan.ok === false)
  {
    return plan;
  }

  if (plan.tilesPlaced && readableUses(hub) === null)
  {
    return { ok: false, message: USES_UNREAD };
  }

  // each copy names the blueprint's event it was made from by the id that event has in the blueprint.
  const events = [];
  for (const [ index, event ] of plan.events.entries())
  {
    try
    {
      const link = { blueprintId, eventId: plan.sourceIds[index], differences: [] };
      events.push({ ...event, note: withBlueprintLink(event.note, link) });
    }
    catch (error)
    {
      return { ok: false, message: `"${blueprint.name}" can't be placed: in ${event.name}'s note, ${(error as Error).message}.` };
    }
  }

  // a placement hanging over the map's edge keeps the part of the blueprint that went down, which is all the match
  // check ever judges it by.
  const spot = plan.tilesPlaced ? placedOn({ blueprintId, x: placement.at.x, y: placement.at.y }, stamp, hub.map(mapDocumentKey(mapId))) : null;
  const spots = spot === null ? [] : [ spot ];
  return commitStampPlan(hub, mapId, { ...plan, events, spots }, `Place blueprint "${blueprint.name}"`);
};

export { linkGateFor, placeBlueprint };
export type { LinkGate, TemplateMapSource };
