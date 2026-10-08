import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import { commitStampPlan, planStamp, type StampOutcome, type StampPlacement } from '../stamps/stampPlacement.ts';
import { withBlueprintLink } from './blueprintLink.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from './blueprints.ts';

/**
 * Says why a map may hold no copy of a blueprint, or null when it may: what every placement on a map asks before it
 * writes a link there, or carries one there inside a stamp.
 */
type LinkGate = (mapId: number) => string | null;

/**
 * What the link gate reads of the window's plugin modules: whether they have switched on yet, why the project's plugin
 * list could not be read when it could not, and which plugin, if any, copies a map's events while the game runs. The
 * plugin module registry is one.
 */
type TemplateMapSource = {
  readonly revision: number;
  readonly listProblem: string | null;
  templateMapOwner(mapId: number): string | null;
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

    const owner = modules.templateMapOwner(mapId);
    return owner === null
      ? null
      : `this map's events are patterns ${owner} copies while the game runs`;
  };
};

/**
 * Places a blueprint on a map as one step in its history: its tiles painted as a plain copy, with their autotile edges
 * refreshed, and its events where they stand inside it with fresh ids, exactly as placing its stamp would (see
 * {@link planStamp}), but every event placed carries a link in its note naming the blueprint and which of its events it
 * is a copy of. The link goes on a line of its own after whatever the note already says, and a note that would read any
 * other tag differently with it refuses the whole placement. The step is named for the blueprint.
 *
 * Refused whole, changing nothing: a blueprint no longer there; a map that may hold no link, with its reason; and
 * anything placing its stamp would refuse.
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

  const plan = planStamp(hub.map(mapDocumentKey(mapId)), blueprint.stamp, placement);
  if (plan.ok === false)
  {
    return plan;
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

  return commitStampPlan(hub, mapId, { ...plan, events }, `Place blueprint "${blueprint.name}"`);
};

export { linkGateFor, placeBlueprint };
export type { LinkGate, TemplateMapSource };
