import { describe, expect, it } from 'vitest';
import { withBlueprintLink, type BlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { planCopyChange, type BlueprintEventChange, type CopyChange } from '../../../../src/mapEditor/core/blueprints/copyChanges.ts';
import { rewireGroupReferences } from '../../../../src/mapEditor/core/events/eventReferences.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { lightTagFields } from '../../../../src/mapEditor/modules/lighting/lightFields.ts';
import { lightLines, PLUGIN_DEFAULTS } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { withColor, withRadius } from '../../../../src/mapEditor/modules/lighting/lightTagWriter.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';

/*
 * The change planner held against every event the game ships, each read from the game's files and held in memory only,
 * a mirror nothing writes back to, and each taken for its own blueprint's event, changed in a few fields, with a copy of
 * it placed under another id somewhere else, its commands naming it by id rewired as placing rewires them.
 *
 * A copy in line with its blueprint follows every field the blueprint changes (its name, a page's speed and trigger, its
 * command list, its first light's reach and colour, its last page's direction fix) and nothing else of it moves: the
 * copy comes out as the blueprint's changed event, byte for byte, but for its id, where it stands and its note. A copy
 * holding its own name, speed and light colour keeps all three while following the rest, its link unchanged. A copy
 * kept 2 faster than its blueprint is held at the top of the range when the blueprint reaches it, keeps its offset whole,
 * and sits 2 faster again when the blueprint drops to the bottom. A page the blueprint adds reaches every copy as the
 * blueprint has it, and one it takes away goes from every copy, nothing else moving.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * The tags the copies are planned with: J-Lighting's light, read with the plugin's own defaults.
 */
const OPTIONS = { tags: [ lightTagFields(PLUGIN_DEFAULTS) ] };

/**
 * How far from the original each copy's id sits.
 */
const ID_GAP = 1000;

/**
 * One shipped event, and the map it is on.
 */
type ShippedEvent = {
  readonly mapId: number;
  readonly event: RmmzMapEvent;
};

/**
 * Reads every event on every map the game ships, in map and id order.
 * @returns {ShippedEvent[]} The events.
 */
const shippedEvents = (): ShippedEvent[] =>
{
  return listMapFiles(project as string).flatMap(file =>
  {
    const map = readDataFile(project as string, file) as RmmzMap;
    const mapId = Number(file.slice(3, -5));
    return map.events.flatMap(event => (event === null ? [] : [ { mapId, event } ]));
  });
};

/**
 * Builds a copy of an event as placing it from a blueprint would: under another id, standing elsewhere, its commands
 * naming it by id naming the copy, its note holding its link, keeping the values given.
 * @param {RmmzMapEvent} source The event as the copy holds it, its own differences already made, under the blueprint's id.
 * @param {string[]} differences The values its link keeps.
 * @returns {RmmzMapEvent} The copy.
 */
const copyOf = (source: RmmzMapEvent, differences: string[] = []): RmmzMapEvent =>
{
  const link: BlueprintLink = { blueprintId: 'k3x9q2mf', eventId: source.id, differences };
  return placed(source, { ...source, note: withBlueprintLink(source.note, link) });
};

/**
 * Builds what a copy holds of an event, as placing it rewires it: under the copy's id, standing elsewhere, its commands
 * naming it by id naming the copy, its note as given.
 * @param {RmmzMapEvent} source The event, under the blueprint's id.
 * @param {RmmzMapEvent} noted The event holding the note the copy holds.
 * @returns {RmmzMapEvent} The copy's event.
 */
const placed = (source: RmmzMapEvent, noted: RmmzMapEvent): RmmzMapEvent =>
{
  const id = source.id + ID_GAP;
  return { ...rewireGroupReferences(noted, new Map([ [ source.id, id ] ])), id, x: source.x + 1, y: source.y + 1 };
};

/**
 * Changes one page of an event.
 * @param {RmmzMapEvent} source The event.
 * @param {number} pageIndex The page, counted from 0.
 * @param {(page: RmmzEventPage) => RmmzEventPage} change What to make of the page.
 * @returns {RmmzMapEvent} The event changed.
 */
const withPage = (source: RmmzMapEvent, pageIndex: number, change: (page: RmmzEventPage) => RmmzEventPage): RmmzMapEvent =>
{
  return { ...source, pages: source.pages.map((page, index) => (index === pageIndex ? change(page) : page)) };
};

/**
 * Rewrites the first light on an event's first page, when it has one.
 * @param {RmmzMapEvent} source The event.
 * @param {(text: string) => string} change What to make of the light's line.
 * @returns {RmmzMapEvent} The event changed; the very event when its first page gives no light.
 */
const withFirstLight = (source: RmmzMapEvent, change: (text: string) => string): RmmzMapEvent =>
{
  const [ light ] = lightLines(source.pages[0], PLUGIN_DEFAULTS);
  if (light === undefined)
  {
    return source;
  }

  return withPage(source, 0, page => ({
    ...page,
    list: page.list.map((command, index) => (index === light.listIndex ? { ...command, parameters: [ change(light.text) ] } : command)),
  }));
};

/**
 * Adds a comment to the end of a page's commands, before the empty command closing them.
 * @param {RmmzEventPage} page The page.
 * @returns {RmmzEventPage} The page changed.
 */
const withComment = (page: RmmzEventPage): RmmzEventPage =>
{
  const added: RmmzEventCommand = { code: 108, indent: 0, parameters: [ 'Changed by the blueprint.' ] };
  return { ...page, list: [ ...page.list.slice(0, -1), added, ...page.list.slice(-1) ] };
};

/**
 * Moves a light's reach out by a tile.
 * @param {string} text The light's line.
 * @returns {string} The line reaching a tile further.
 */
const furtherReach = (text: string): string =>
{
  const [ light ] = lightLines({ ...createEventPage(), list: [ { code: 108, indent: 0, parameters: [ text ] } ] }, PLUGIN_DEFAULTS);
  return withRadius(text, light.light.radius + 1, PLUGIN_DEFAULTS);
};

/**
 * The blueprint's change every event is put through: its name, its first page's speed and trigger and command list, its
 * first light's reach and colour, and its last page's direction fix, when it has more than one.
 * @param {RmmzMapEvent} before The event.
 * @returns {RmmzMapEvent} The event changed.
 */
const blueprintChange = (before: RmmzMapEvent): RmmzMapEvent =>
{
  const { moveSpeed, trigger } = before.pages[0];
  const firstPage = withPage(before, 0, page => withComment({ ...page, moveSpeed: moveSpeed === 6 ? 5 : moveSpeed + 1, trigger: (trigger + 1) % 5 }));
  const lit = withFirstLight(firstPage, text => withColor(furtherReach(text), '#123456', PLUGIN_DEFAULTS));
  const last = before.pages.length - 1;
  const fixed = last > 0 ? withPage(lit, last, page => ({ ...page, directionFix: page.directionFix === false })) : lit;
  return { ...fixed, name: `${before.name}*` };
};

/**
 * Says what is wrong with a plan, if anything: it must change the copy into exactly the event given, byte for byte.
 * @param {ShippedEvent} shipped The event and its map.
 * @param {CopyChange} outcome The plan.
 * @param {RmmzMapEvent} expected The copy it must come to.
 * @returns {string[]} What is wrong; none when nothing is.
 */
const wrongPlan = (shipped: ShippedEvent, outcome: CopyChange, expected: RmmzMapEvent): string[] =>
{
  if (outcome.kind !== 'changes' || JSON.stringify(outcome.event) !== JSON.stringify(expected))
  {
    return [ `Map${shipped.mapId} event ${shipped.event.id}: ${outcome.kind}` ];
  }

  return [];
};

describe.skipIf(project === null)('copy changes on the shipped maps', () =>
{
  const events = project === null ? [] : shippedEvents();

  it('follows every field the blueprint changes on a copy in line with it, and moves nothing else, on every event', () =>
  {
    // Arrange: every event, its copy, and its changed blueprint.
    const cases = events.map(shipped => ({ shipped, copy: copyOf(shipped.event), after: blueprintChange(shipped.event) }));

    // Act.
    const wrong = cases.flatMap(({ shipped, copy, after }) =>
    {
      const outcome = planCopyChange({ before: shipped.event, after }, copy, OPTIONS);
      return wrongPlan(shipped, outcome, placed(after, { ...after, note: copy.note }));
    });

    // Assert: thousands of events, hundreds of them lit on their first page, and not one moved otherwise.
    const lit = events.filter(({ event }) => lightLines(event.pages[0], PLUGIN_DEFAULTS).length > 0).length;
    expect([ events.length > 7000, lit > 500, wrong ])
      .toStrictEqual([ true, true, [] ]);
  });

  it('keeps a copy\'s own name, speed and light colour while following the rest, its link unchanged, on every event', () =>
  {
    // Arrange: every event's copy holding its own name, a speed 2 off, and a green light; the blueprint changing the
    // trigger, the frequency, the command list and the light's reach.
    const cases = events.map(({ mapId, event }) =>
    {
      const { moveSpeed, moveFrequency, trigger } = event.pages[0];
      const own = withFirstLight(withPage({ ...event, name: `${event.name} (own)` }, 0, page => ({ ...page, moveSpeed: moveSpeed >= 4 ? moveSpeed - 2 : moveSpeed + 2 })), text => withColor(text, '#abcdef', PLUGIN_DEFAULTS));
      const changed = withPage(event, 0, page => withComment({ ...page, trigger: (trigger + 1) % 5, moveFrequency: moveFrequency === 5 ? 4 : moveFrequency + 1 }));
      const after = withFirstLight(changed, furtherReach);
      const expected = withFirstLight(withPage({ ...after, name: own.name }, 0, page => ({ ...page, moveSpeed: own.pages[0].moveSpeed })), () =>
      {
        const [ light ] = lightLines(own.pages[0], PLUGIN_DEFAULTS);
        return furtherReach(light.text);
      });
      return { shipped: { mapId, event }, copy: copyOf(own), after, expected };
    });

    // Act.
    const wrong = cases.flatMap(({ shipped, copy, after, expected }) =>
    {
      const outcome = planCopyChange({ before: shipped.event, after }, copy, OPTIONS);
      return wrongPlan(shipped, outcome, placed(expected, { ...expected, note: copy.note }));
    });

    // Assert.
    expect([ cases.length > 7000, wrong ])
      .toStrictEqual([ true, [] ]);
  });

  it('keeps a copy\'s offset whole through the top of the range and back, on every event', () =>
  {
    // Arrange: every event's copy kept 2 faster than its blueprint; the blueprint goes to the top speed, then the bottom.
    const cases = events.map(({ mapId, event }) =>
    {
      const { moveSpeed } = event.pages[0];
      const own = withPage(event, 0, page => ({ ...page, moveSpeed: Math.min(moveSpeed + 2, 6) }));
      const top = withPage(event, 0, page => ({ ...page, moveSpeed: 6 }));
      const bottom = withPage(event, 0, page => ({ ...page, moveSpeed: 1 }));
      return { shipped: { mapId, event }, copy: copyOf(own, [ 'p1.speed+2' ]), top, bottom };
    });

    // Act: the second change planned on what the first made of the copy.
    const wrong = cases.flatMap(({ shipped, copy, top, bottom }) =>
    {
      const raised: CopyChange = planCopyChange({ before: shipped.event, after: top }, copy, OPTIONS);
      const held = raised.kind === 'changes' ? raised.event : copy;
      const lowered = planCopyChange({ before: top, after: bottom }, held, OPTIONS);
      const expected = withPage(copy, 0, page => ({ ...page, moveSpeed: 3 }));
      return [
        ...(held.pages[0].moveSpeed === 6 && held.note === copy.note ? [] : [ `Map${shipped.mapId} event ${shipped.event.id}: not held at 6` ]),
        ...wrongPlan(shipped, lowered, expected),
      ];
    });

    // Assert.
    expect([ cases.length > 7000, wrong ])
      .toStrictEqual([ true, [] ]);
  });

  it('gives every copy a page the blueprint adds, and takes away one it takes away, moving nothing else, on every event', () =>
  {
    // Arrange: every event gaining a page at the end, and every event of several pages losing its first.
    const added = events.map(shipped =>
    {
      const after = { ...shipped.event, pages: [ ...shipped.event.pages, createEventPage() ] };
      const change: BlueprintEventChange = { before: shipped.event, after, pages: [ ...shipped.event.pages.map((_page, index) => index), null ] };
      return { shipped, change };
    });
    const takenAway = events.filter(({ event }) => event.pages.length > 1).map(shipped =>
    {
      const after = { ...shipped.event, pages: shipped.event.pages.slice(1) };
      const change: BlueprintEventChange = { before: shipped.event, after, pages: after.pages.map((_page, index) => index + 1) };
      return { shipped, change };
    });

    // Act.
    const wrong = [ ...added, ...takenAway ].flatMap(({ shipped, change }) =>
    {
      const copy = copyOf(shipped.event);
      const outcome = planCopyChange(change, copy, OPTIONS);
      return wrongPlan(shipped, outcome, placed(change.after, { ...change.after, note: copy.note }));
    });

    // Assert.
    expect([ added.length > 7000, takenAway.length > 600, wrong ])
      .toStrictEqual([ true, true, [] ]);
  });
});
