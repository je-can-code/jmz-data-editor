import type { CommentTagDefinition } from '../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { withBlueprintLink, type BlueprintLink } from '../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { blueprintStampId, type Blueprint } from '../../../src/mapEditor/core/blueprints/blueprints.ts';
import type { CopyContext, CopyField, CopyReading } from '../../../src/mapEditor/core/blueprints/copyReading.ts';
import { cloneJson } from '../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { battlerTagFields } from '../../../src/mapEditor/modules/jabs/battlerFields.ts';
import { lightTagFields } from '../../../src/mapEditor/modules/lighting/lightFields.ts';
import { PLUGIN_DEFAULTS } from '../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, event, page, text } from './eventKindFixtures.ts';
import { stampOf } from './stampFixtures.ts';

/**
 * The blueprint every copy test reads its copies against.
 */
const NEST_ID = 'k3x9q2mf';

/**
 * The tags a window with J-ABS and J-Lighting on reads from comments as fields.
 */
const COPY_TAGS: readonly CommentTagDefinition[] = [ ...battlerTagFields(false), lightTagFields(PLUGIN_DEFAULTS) ];

/**
 * Builds a comment's first line.
 * @param {string} words The line.
 * @returns {RmmzEventCommand} The command.
 */
const comment = (words: string): RmmzEventCommand => command(108, [ words ]);

/**
 * Builds a later line of a comment, which MZ writes under the comment's first.
 * @param {string} words The line.
 * @returns {RmmzEventCommand} The command.
 */
const later = (words: string): RmmzEventCommand => command(408, [ words ]);

/**
 * The commands of the needler's page: its enemy and its sight on one comment, a torch, a motion no module reads, and a
 * buzz.
 * @returns {RmmzEventCommand[]} The commands, without the closing one.
 */
const needlerCommands = (): RmmzEventCommand[] => [
  comment('<enemyId:12>'),
  later('<sight:4>'),
  comment('<light:[4, #ffbb73, 30, flicker]>'),
  comment('<motion:[stretch]>'),
  ...text([ 'Bzz.' ]),
];

/**
 * The blueprint's needler, its event 2: a J-ABS battler of enemy 12 with a sight of 4, carrying a torch, that stretches
 * and buzzes, at speed and frequency 3.
 * @param {Partial<RmmzEventPage>} overrides Anything to change on its page.
 * @returns {RmmzMapEvent} The event.
 */
const needler = (overrides: Partial<RmmzEventPage> = {}): RmmzMapEvent =>
{
  return event(2, [ page(needlerCommands(), overrides) ], { name: 'Needler' });
};

/**
 * The blueprint "Needler nest", of events alone: the needler, and whatever other events the test gives it, the stamp
 * reaching just far enough to hold every one where it stands, as a stamp read back from the blueprints must.
 * @param {readonly RmmzMapEvent[]} events Its events; the needler alone by default.
 * @returns {Blueprint} The blueprint.
 */
const needlerNest = (events: readonly RmmzMapEvent[] = [ needler() ]): Blueprint =>
{
  const width = Math.max(...events.map(each => each.x)) + 1;
  const height = Math.max(...events.map(each => each.y)) + 1;
  return { id: NEST_ID, name: 'Needler nest', stamp: stampOf({ id: blueprintStampId(NEST_ID), width, height, events: [ ...events ] }) };
};

/**
 * Builds a copy of one of the nest's events as placing it would: under id 12, standing elsewhere, its note holding its
 * link after the note's own text, keeping the values given.
 * @param {RmmzMapEvent} source The event as the copy holds it, its own differences already made.
 * @param {readonly string[]} differences The values its link keeps after the blueprint's id and its event's.
 * @returns {RmmzMapEvent} The copy.
 */
const copyOf = (source: RmmzMapEvent, differences: readonly string[] = []): RmmzMapEvent =>
{
  const link: BlueprintLink = { blueprintId: NEST_ID, eventId: source.id, differences };
  return { ...cloneJson(source), id: 12, x: 7, y: 9, note: withBlueprintLink(source.note, link) };
};

/**
 * Builds what a copy is read against: the blueprint given, found by its id, the tags J-ABS and J-Lighting read, and the
 * copy's group when the test gives one.
 * @param {Blueprint | null} blueprint The one blueprint the window keeps, or null for none.
 * @param {ReadonlyMap<number, number>} references The copy's group, by the blueprint's ids.
 * @returns {CopyContext} The context.
 */
const contextOf = (blueprint: Blueprint | null, references?: ReadonlyMap<number, number>): CopyContext =>
{
  return {
    blueprint: blueprintId => (blueprint !== null && blueprintId === blueprint.id ? blueprint : null),
    tags: COPY_TAGS,
    ...(references === undefined ? {} : { references }),
  };
};

/**
 * Builds a Set Movement Route turning an event to face down, a command naming an event by its id.
 * @param {number} eventId The event turned.
 * @returns {RmmzEventCommand} The command.
 */
const turnOf = (eventId: number): RmmzEventCommand =>
{
  return command(205, [ eventId, { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: false } ]);
};

/**
 * Finds one field of a reading by its key.
 * @param {CopyReading} reading The reading, which must have read the copy field by field.
 * @param {string} key The field's key.
 * @returns {CopyField} The field.
 * @throws {Error} When the reading has no such field.
 */
const fieldOf = (reading: CopyReading, key: string): CopyField =>
{
  const field = reading.kind === 'read' ? reading.fields.find(each => each.key === key) : undefined;
  if (field === undefined)
  {
    throw new Error(`the reading, ${reading.kind}, has no field ${key}`);
  }

  return field;
};

export { comment, contextOf, COPY_TAGS, copyOf, fieldOf, later, NEST_ID, needler, needlerCommands, needlerNest, turnOf };
