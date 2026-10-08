import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_ID_LENGTH,
  BLUEPRINTS_DOCUMENT,
  blueprintIn,
  blueprintsOf,
  blueprintStampId,
  newBlueprintId,
  readBlueprints,
  savedBlueprintOf,
} from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { drawsFor, holdBlueprints, storedBlueprints } from '../../support/blueprintFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * The blueprints live in one editor-only document, jmz-editor/blueprints.json, each under its own id, never in a list,
 * so an edit to one never moves another and every blueprint's own history can undo its steps whatever happened to the
 * others. An id is lowercase letters and digits, drawn at random so no two windows or sessions ever make the same one,
 * and drawn again on the rare one already taken; it never changes, so every copy's link keeps naming its blueprint
 * through any rename. A blueprint is a name and the stamp it was saved from, kept in the stamp's own shape without the
 * stamp's id, and read back with an id of its own that no window's stamp ever has. The panel lists them by name, as a
 * person sorts words. Anything in the document that is not a blueprint is refused loudly, never read as none, since
 * saving over it would lose it.
 */
describe('blueprints', () =>
{
  /**
   * A stamp of one event, copied off map 12.
   */
  const goblin = () => stampOf({ id: 'window-a:3', mapId: 12, events: [ { ...createMapEvent(4, 0, 0), name: 'Goblin', note: '' } ] });

  /**
   * Reads what a call throws.
   * @param {() => unknown} call The call.
   * @returns {string} Its error's message, or "no error" when it threw nothing.
   */
  const thrownBy = (call: () => unknown): string =>
  {
    try
    {
      call();
      return 'no error';
    }
    catch (error)
    {
      return (error as Error).message;
    }
  };

  describe('blueprintStampId', () =>
  {
    it('names a blueprint\'s stamp apart from every stamp a window copies', () =>
    {
      // Arrange: a window's stamp id beside.
      const windowStamp = goblin().id;

      // Act.
      const id = blueprintStampId('k3x9q2mf');

      // Assert.
      expect([ id, id === windowStamp ])
        .toStrictEqual([ 'blueprint:k3x9q2mf', false ]);
    });
  });

  describe('savedBlueprintOf', () =>
  {
    it('keeps the name and the stamp without its id, in the order a captured stamp keeps its fields', () =>
    {
      // Arrange.
      const stamp = goblin();

      // Act.
      const saved = savedBlueprintOf('Goblin', stamp);

      // Assert.
      expect([ saved, Object.keys(saved['stamp'] as object) ])
        .toStrictEqual([
          { name: 'Goblin', stamp: { mapId: 12, tilesetId: 4, origin: { x: 0, y: 0 }, width: 1, height: 1, tiles: null, events: stamp.events } },
          [ 'mapId', 'tilesetId', 'origin', 'width', 'height', 'tiles', 'events' ],
        ]);
    });
  });

  describe('readBlueprints', () =>
  {
    it('reads every blueprint with its id and its stamp, by name as a person sorts words, ids breaking a tie', () =>
    {
      // Arrange: written out of order, with a name in capitals and two of one name.
      const stored = storedBlueprints({
        zz11: { name: 'orc camp', stamp: goblin() },
        aa22: { name: 'Goblin', stamp: goblin() },
        bb33: { name: 'ORC CAMP', stamp: goblin() },
        cc44: { name: 'bat roost', stamp: goblin() },
      });

      // Act.
      const read = readBlueprints((stored['data'] as JsonValue));

      // Assert.
      expect(read.map(blueprint => [ blueprint.id, blueprint.name, blueprint.stamp.id, blueprint.stamp.mapId ]))
        .toStrictEqual([
          [ 'cc44', 'bat roost', 'blueprint:cc44', 12 ],
          [ 'aa22', 'Goblin', 'blueprint:aa22', 12 ],
          [ 'bb33', 'ORC CAMP', 'blueprint:bb33', 12 ],
          [ 'zz11', 'orc camp', 'blueprint:zz11', 12 ],
        ]);
    });

    it('reads a project that never saved one as holding none', () =>
    {
      // Arrange: the empty document every project starts with.
      const stored = storedBlueprints();

      // Act.
      const read = readBlueprints(stored['data'] as JsonValue);

      // Assert.
      expect(read)
        .toStrictEqual([]);
    });

    it('refuses data that is not a blueprints document, a list of them included', () =>
    {
      // Arrange.
      const documents: (JsonValue | undefined)[] = [ undefined, null, {}, { blueprints: [] }, { blueprints: 'x' } ];

      // Act.
      const reads = documents.map(data => () => readBlueprints(data));

      // Assert.
      reads.forEach(read => expect(read)
        .toThrow('the saved blueprints are not a blueprints document'));
    });

    it('refuses an entry that is not a blueprint: an id of other characters, no name, or a stamp that is not one', () =>
    {
      // Arrange: each beside a good one.
      const good = savedBlueprintOf('Goblin', goblin());
      const entries: Record<string, JsonValue>[] = [
        { 'Bad-Id': good },
        { k3x9q2mf: { stamp: good['stamp'] } },
        { k3x9q2mf: { name: 'Goblin', stamp: { ...good['stamp'] as object, width: 0 } } },
        { k3x9q2mf: 'Goblin' },
      ];

      // Act.
      const refusals = entries.map(entry => thrownBy(() => readBlueprints({ blueprints: { aa22: good, ...entry } })));

      // Assert.
      expect(refusals)
        .toStrictEqual([
          'the saved blueprints hold an entry under "Bad-Id" that is not a blueprint',
          'the saved blueprints hold an entry under "k3x9q2mf" that is not a blueprint',
          'the saved blueprints hold an entry under "k3x9q2mf" that is not a blueprint',
          'the saved blueprints hold an entry under "k3x9q2mf" that is not a blueprint',
        ]);
    });
  });

  describe('blueprintsOf', () =>
  {
    it('reads the blueprints out of the document a window holds, in its stored form', () =>
    {
      // Arrange.
      const hub = new DocumentHub({ clientId: 'window-a' });
      holdBlueprints(hub, { k3x9q2mf: { name: 'Goblin', stamp: goblin() } });

      // Act.
      const read = blueprintsOf(hub.document(BLUEPRINTS_DOCUMENT));

      // Assert.
      expect(read.map(blueprint => [ blueprint.id, blueprint.name ]))
        .toStrictEqual([ [ 'k3x9q2mf', 'Goblin' ] ]);
    });
  });

  describe('blueprintIn', () =>
  {
    it('finds one blueprint by its id, and none for an id the document does not hold', () =>
    {
      // Arrange.
      const hub = new DocumentHub({ clientId: 'window-a' });
      holdBlueprints(hub, { k3x9q2mf: { name: 'Goblin', stamp: goblin() }, aa22: { name: 'Bat', stamp: goblin() } });
      const document = hub.document(BLUEPRINTS_DOCUMENT);

      // Act.
      const found = [ blueprintIn(document, 'aa22'), blueprintIn(document, 'zz99') ];

      // Assert.
      expect([ found[0]?.name, found[0]?.stamp.id, found[1] ])
        .toStrictEqual([ 'Bat', 'blueprint:aa22', null ]);
    });
  });

  describe('newBlueprintId', () =>
  {
    it('draws an id of lowercase letters and digits, as long as an id is', () =>
    {
      // Arrange: draws spelling an id, from both ends of the alphabet.
      const random = drawsFor([ 'a0z9q2mf' ]);

      // Act.
      const id = newBlueprintId(() => false, random);

      // Assert.
      expect([ id, id.length ])
        .toStrictEqual([ 'a0z9q2mf', BLUEPRINT_ID_LENGTH ]);
    });

    it('draws again when the id drawn is taken, and keeps the first free one', () =>
    {
      // Arrange: the first id drawn is in use.
      const random = drawsFor([ 'k3x9q2mf', 'b7c8d9e0' ]);

      // Act.
      const id = newBlueprintId(candidate => candidate === 'k3x9q2mf', random);

      // Assert.
      expect(id)
        .toBe('b7c8d9e0');
    });
  });
});
