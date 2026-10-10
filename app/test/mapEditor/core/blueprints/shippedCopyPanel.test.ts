import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LINE_VALUE, type CommentTagDefinition } from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { blueprintLinkOf, withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { blueprintStampId, readBlueprints, type Blueprint } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { noteBoxOf } from '../../../../src/mapEditor/core/blueprints/copyActions.ts';
import { followCopy, pinCopyField, unlinkCopy, unpinCopyField, type CopyTarget } from '../../../../src/mapEditor/core/blueprints/copyEdits.ts';
import { readCopy, type CopyContext, type CopyReading } from '../../../../src/mapEditor/core/blueprints/copyReading.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { cloneJson, type JsonObject, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { battlerTagFields } from '../../../../src/mapEditor/modules/jabs/battlerFields.ts';
import { isBattler } from '../../../../src/mapEditor/modules/jabs/jabsModule.ts';
import { lightTagFields } from '../../../../src/mapEditor/modules/lighting/lightFields.ts';
import { PLUGIN_DEFAULTS } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { listMapFiles, locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * The copy panel held against the maps the game ships, read from the game's files and held in memory only, a mirror
 * nothing writes back to.
 *
 * Every battler on Foothills (Map 301) not already a copy is planted as a copy of a blueprint of its own holding it as it
 * ships, its note keeping its text before its link. Each reads as following its blueprint in every field. Pinning and
 * unpinning each of its numbers never moves a value, and pinning then unpinning leaves its note byte for byte; a speed or
 * a J-ABS move speed changed by hand reads as an offset, and following the blueprint again brings the map back to the very
 * text it was planted as; unlinking leaves the battler exactly as it ships; and every step undoes byte for byte.
 *
 * The copies the game itself holds, on any map, are read against its own blueprints, with J-ABS, J-LevelMaster and
 * J-Lighting's tags, as a window with those plugins on reads them; each follows its blueprint again and is unlinked, its
 * Note box writing its own text back changes nothing, and every step undoes byte for byte.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * Foothills, where the battlers are planted.
 */
const FOOTHILLS = 301;

/**
 * The tags a window with the game's plugins on reads from comments as fields: J-ABS's with J-LevelMaster's level, and
 * J-Lighting's light.
 */
const TAGS: readonly CommentTagDefinition[] = [ ...battlerTagFields(true), lightTagFields(PLUGIN_DEFAULTS) ];

/**
 * A window holding one map from the mirror, and what its copies are read against.
 */
type Mirror = {
  readonly hub: DocumentHub;
  readonly mapId: number;
  readonly context: CopyContext;
  readonly copies: readonly number[];
};

/**
 * Builds a window holding a map file.
 * @param {number} mapId The map.
 * @param {RmmzMap} file Its file.
 * @returns {DocumentHub} The window's documents.
 */
const holding = (mapId: number, file: RmmzMap): DocumentHub =>
{
  const hub = new DocumentHub({ clientId: 'mirror' });
  hub.adopt(mapDocumentKey(mapId), file as unknown as JsonValue);
  return hub;
};

/**
 * Builds what copies are read against: the blueprints given, by id, and the game's tags.
 * @param {readonly Blueprint[]} blueprints The blueprints.
 * @returns {CopyContext} The context.
 */
const contextFor = (blueprints: readonly Blueprint[]): CopyContext =>
{
  return { blueprint: blueprintId => blueprints.find(each => each.id === blueprintId) ?? null, tags: TAGS };
};

/**
 * Plants every battler on Foothills not already a copy as a copy of a blueprint of its own holding it as it ships, its id
 * ship and its event's id, a battler whose note could not take a link left as it is.
 * @returns {Mirror} The window holding the planted map, and the planted copies.
 */
const plantedFoothills = (): Mirror =>
{
  const file = cloneJson(readDataFile(project as string, `Map${FOOTHILLS}.json`) as RmmzMap);
  const blueprints: Blueprint[] = [];
  const copies: number[] = [];
  file.events.forEach((event, index) =>
  {
    if (event === null || isBattler(event) === false || blueprintLinkOf(event.note) !== null)
    {
      return;
    }

    try
    {
      const id = `ship${event.id}`;
      file.events[index] = { ...event, note: withBlueprintLink(event.note, { blueprintId: id, eventId: event.id, differences: [] }) };
      blueprints.push({ id, name: event.name, stamp: stampOf({ id: blueprintStampId(id), mapId: FOOTHILLS, events: [ { ...cloneJson(event), x: 0, y: 0 } ] }) });
      copies.push(event.id);
    }
    catch
    {
      // a note a link would read otherwise in is no place to plant one.
    }
  });

  return { hub: holding(FOOTHILLS, file), mapId: FOOTHILLS, context: contextFor(blueprints), copies };
};

/**
 * Writes a held map as its file's text.
 * @param {Mirror} mirror The window.
 * @returns {string} The text.
 */
const textOf = (mirror: Mirror): string => JSON.stringify(mirror.hub.document(mapDocumentKey(mirror.mapId)).toJson());

/**
 * Reads one copy as the window holds it now, as a copy of its own.
 * @param {Mirror} mirror The window.
 * @param {number} eventId The copy.
 * @returns {RmmzMapEvent} The copy.
 */
const copyIn = (mirror: Mirror, eventId: number): RmmzMapEvent => cloneJson(mirror.hub.map(mapDocumentKey(mirror.mapId)).event(eventId) as RmmzMapEvent);

/**
 * Reads one copy against its blueprint as the window holds it now.
 * @param {Mirror} mirror The window.
 * @param {number} eventId The copy.
 * @returns {CopyReading} The reading.
 */
const readingOf = (mirror: Mirror, eventId: number): CopyReading => readCopy(copyIn(mirror, eventId), mirror.context);

/**
 * Lists every field of a reading standing apart from its blueprint, by key and standing.
 * @param {CopyReading} reading The reading.
 * @returns {string[]} Each such field, such as {@code p1.speed offset}; the reading's kind when it read no fields.
 */
const apart = (reading: CopyReading): string[] =>
{
  return reading.kind === 'read'
    ? reading.fields.filter(field => field.state.kind !== 'follows').map(field => `${field.key} ${field.state.kind}`)
    : [ reading.kind ];
};

/**
 * Names where one copy's steps go: its own window's history.
 * @param {Mirror} mirror The window.
 * @param {number} eventId The copy.
 * @returns {CopyTarget} The target.
 */
const targetOf = (mirror: Mirror, eventId: number): CopyTarget => ({ mapId: mirror.mapId, eventId, history: eventHistoryKey(mirror.mapId, eventId) });

describe.skipIf(project === null)('the copy panel on the shipped maps', () =>
{
  it('plants a copy of every battler on Foothills, and reads each as following its blueprint in every field', () =>
  {
    // Arrange.
    const mirror = plantedFoothills();

    // Act.
    const standing = mirror.copies.flatMap(eventId => apart(readingOf(mirror, eventId)).map(each => `${eventId} ${each}`));

    // Assert: there are battlers to plant, and none stands apart.
    expect([ mirror.copies.length > 0, standing ])
      .toStrictEqual([ true, [] ]);
  });

  it('pins and unpins every number of every planted copy without moving a value, each step undone byte for byte', () =>
  {
    // Arrange.
    const mirror = plantedFoothills();
    const planted = textOf(mirror);
    const problems: string[] = [];

    // Act: on each copy, every number pinned then unpinned, checked as it goes, then both steps undone.
    mirror.copies.forEach(eventId =>
    {
      const reading = readingOf(mirror, eventId);
      const numbers = reading.kind === 'read' ? reading.fields.filter(field => field.kind.kind === 'number') : [];
      numbers.forEach(field =>
      {
        const before = copyIn(mirror, eventId);
        const pinned = pinCopyField(mirror.hub, targetOf(mirror, eventId), mirror.context, field.key);
        const read = readingOf(mirror, eventId);
        const state = read.kind === 'read' ? read.fields.find(each => each.key === field.key)?.state : null;
        const unpinned = unpinCopyField(mirror.hub, targetOf(mirror, eventId), mirror.context, field.key);
        const after = copyIn(mirror, eventId);
        if (pinned.ok === false || unpinned.ok === false || state?.kind !== 'pinned' || JSON.stringify(after) !== JSON.stringify(before))
        {
          problems.push(`event ${eventId} ${field.key}: pinned and unpinned to ${after.note}, standing ${JSON.stringify(state)}`);
        }

        mirror.hub.undo(targetOf(mirror, eventId).history);
        mirror.hub.undo(targetOf(mirror, eventId).history);
      });
    });

    // Assert.
    expect([ problems, textOf(mirror) === planted ])
      .toStrictEqual([ [], true ]);
  });

  it('reads a speed and a move speed changed by hand on every planted copy as offsets, and follows again to the very map planted', () =>
  {
    // Arrange: each copy's first page one faster by hand, and its J-ABS move speed, where it has one, one more.
    const mirror = plantedFoothills();
    const planted = textOf(mirror);
    const moveSpeed = TAGS.find(tag => tag.id === 'jabs.moveSpeed') as CommentTagDefinition;
    const problems: string[] = [];

    // Act.
    mirror.copies.forEach(eventId =>
    {
      const [ first ] = copyIn(mirror, eventId).pages;
      const [ line ] = moveSpeed.read(first);
      mirror.hub.edit('By hand', [ mapHistoryKey(mirror.mapId) ], tx =>
      {
        tx.set(mapDocumentKey(mirror.mapId), [ 'events', eventId, 'pages', 0, 'moveSpeed' ], first.moveSpeed === 6 ? 5 : first.moveSpeed + 1);
        if (line !== undefined)
        {
          const [ text ] = first.list[line.listIndex].parameters;
          const [ field ] = line.fields;
          tx.set(mapDocumentKey(mirror.mapId), [ 'events', eventId, 'pages', 0, 'list', line.listIndex, 'parameters', 0 ], moveSpeed.write(text as string, LINE_VALUE, (field.value as number) + 1));
        }
      });

      const handled = apart(readingOf(mirror, eventId));
      const outcome = followCopy(mirror.hub, targetOf(mirror, eventId), mirror.context);
      const expected = line === undefined ? [ 'p1.speed offset' ] : [ 'p1.speed offset', 'p1.moveSpeed offset' ];
      if (JSON.stringify(handled) !== JSON.stringify(expected) || outcome.ok === false || apart(readingOf(mirror, eventId)).length > 0)
      {
        problems.push(`event ${eventId}: by hand ${handled.join(', ')}, then ${outcome.ok ? apart(readingOf(mirror, eventId)).join(', ') : outcome.message}`);
      }
    });
    const followed = textOf(mirror);

    // Assert.
    expect([ problems, followed === planted ])
      .toStrictEqual([ [], true ]);
  });

  it('unlinks every planted copy back to the battler as it ships, each step undone byte for byte', () =>
  {
    // Arrange.
    const mirror = plantedFoothills();
    const planted = textOf(mirror);
    const shipped = readDataFile(project as string, `Map${FOOTHILLS}.json`) as RmmzMap;

    // Act.
    const outcomes = mirror.copies.map(eventId => unlinkCopy(mirror.hub, targetOf(mirror, eventId), mirror.context).ok);
    const unlinked = textOf(mirror);
    mirror.copies.forEach(eventId => mirror.hub.undo(targetOf(mirror, eventId).history));

    // Assert.
    expect([ outcomes.every(ok => ok), unlinked === JSON.stringify(shipped), textOf(mirror) === planted ])
      .toStrictEqual([ true, true, true ]);
  });

  it('reads the game\'s own copies against its own blueprints, and follows each again, unlinks it and rewrites its note, byte for byte', () =>
  {
    // Arrange: every map holding a link, and the game's blueprints, when it keeps any.
    const stored = `${project as string}/jmz-editor/blueprints.json`;
    const blueprints = existsSync(stored) ? readBlueprints((JSON.parse(readFileSync(stored, 'utf8')) as JsonObject)['data']) : [];
    const maps = listMapFiles(project as string)
      .filter(name => readFileSync(`${project as string}/data/${name}`, 'utf8').includes('<blueprint:'))
      .map(name => Number(name.slice(3, -5)));
    const problems: string[] = [];

    // Act: each copy followed again, then the follow undone; unlinked, then undone; its Note box written back.
    maps.forEach(mapId =>
    {
      const file = readDataFile(project as string, `Map${String(mapId).padStart(3, '0')}.json`) as RmmzMap;
      const copies = file.events.flatMap(event => (event === null || blueprintLinkOf(event.note) === null ? [] : [ event.id ]));
      const mirror: Mirror = { hub: holding(mapId, file), mapId, context: contextFor(blueprints), copies };
      const before = textOf(mirror);
      copies.forEach(eventId =>
      {
        const reading = readingOf(mirror, eventId);
        const target = targetOf(mirror, eventId);
        if (reading.kind === 'read' || reading.kind === 'drifted')
        {
          const followed = followCopy(mirror.hub, target, mirror.context);
          const after = apart(readingOf(mirror, eventId));
          if (followed.ok === false || after.length > 0)
          {
            problems.push(`map ${mapId} event ${eventId} followed: ${followed.ok ? after.join(', ') : followed.message}`);
          }

          mirror.hub.undo(target.history);
        }

        const unlinked = unlinkCopy(mirror.hub, target, mirror.context);
        if (unlinked.ok === false || blueprintLinkOf(copyIn(mirror, eventId).note) !== null)
        {
          problems.push(`map ${mapId} event ${eventId} unlinked: ${unlinked.ok ? 'still linked' : unlinked.message}`);
        }

        mirror.hub.undo(target.history);
        const box = noteBoxOf(copyIn(mirror, eventId));
        if (box.keepsLink === false)
        {
          problems.push(`map ${mapId} event ${eventId}: its Note box shows its link`);
        }
      });

      if (textOf(mirror) !== before)
      {
        problems.push(`map ${mapId} did not undo back to its file`);
      }
    });

    // Assert.
    expect(problems)
      .toStrictEqual([]);
  });
});
