import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { SYSTEM_HISTORY_KEY } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { SYSTEM_KEY } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonObject, JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { SystemDocument } from '../../../../src/mapEditor/core/model/JsonDocument.ts';
import {
  clampMaximum,
  maximumOf,
  nameRows,
  renameEntry,
  setMaximum,
} from '../../../../src/mapEditor/core/system/systemNames.ts';
import { locateGameProject } from '../../../support/gameProject.ts';

/*
 * The switch and variable names are real edits to System.json, made in the Switches & Variables window. Each list shows
 * every id from 1 up to its maximum, named or not, and a search finds an id by its number and a name by any text it
 * holds. A rename is one named step in the history of the switch and variable names, so undo takes it back and redo
 * makes it again, and nothing is recorded when the name was already that. Changing the maximum adds unnamed ones at the
 * end or takes the last ones away, names and all, as one step undo brings back; it stays within what MZ's own list
 * allows.
 *
 * Only the name renamed may change in System.json: everything else must come back exactly as it was. That is held
 * against the game's real System.json, read and never written, through a save whose writing is caught: written as
 * MZ writes it, one line from JSON.stringify, the saved file is the real file with that one name replaced.
 */
describe('systemNames', () =>
{
  /**
   * A small System.json: three switches, one of them unnamed, and two variables, besides the rest of the settings.
   * @returns {JsonObject} The settings.
   */
  const buildSystem = (): JsonObject => ({
    gameTitle: 'Chef Adventure',
    switches: [ '', 'partner-visible', '', 'mayor wolf defeated.' ],
    variables: [ '', 'Enemies Defeated', 'Parries (all kinds)' ],
    windowTone: [ 0, 0, 0, 0 ],
  });

  /**
   * Builds a window's hub holding a System.json, with a store that keeps what a save writes.
   * @param {JsonValue} system The settings.
   * @returns {{ hub: DocumentHub, saved: () => JsonValue | null }} The hub, and what was last saved.
   */
  const hubHolding = (system: JsonValue) =>
  {
    let written: JsonValue | null = null;
    const hub = new DocumentHub({
      clientId: 'window-a',
      store: {
        load: async () => system,
        save: async (_key, content) =>
        {
          written = content;
        },
      },
    });
    hub.adopt(SYSTEM_KEY, system);
    return { hub, saved: () => written };
  };

  /**
   * Reads one list's names from the system document a hub holds.
   * @param {DocumentHub} hub The hub.
   * @param {'switches' | 'variables'} list Which list.
   * @returns {readonly string[]} The names.
   */
  const namesIn = (hub: DocumentHub, list: 'switches' | 'variables'): readonly string[] =>
  {
    return (hub.document(SYSTEM_KEY) as SystemDocument).names(list);
  };

  describe('nameRows', () =>
  {
    it('lists every id from 1, the unnamed ones too, leaving out the empty first slot', () =>
    {
      // Arrange.
      const names = buildSystem()['switches'] as string[];

      // Act.
      const rows = nameRows(names, '');

      // Assert.
      expect(rows)
        .toStrictEqual([ { id: 1, name: 'partner-visible' }, { id: 2, name: '' }, { id: 3, name: 'mayor wolf defeated.' } ]);
    });

    it('finds an id by its number, and a name by any text it holds in any case', () =>
    {
      // Arrange: switch 11 named for the 3rd floor, beside switch 3 and switch 13.
      const names = [ '', 'a', 'b', 'Door', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'third floor 3', 'l', 'Trapdoor' ];

      // Act: 3, then " DOOR ", then nothing it holds.
      const found = [ '3', ' DOOR ', 'cellar' ].map(search => nameRows(names, search).map(row => row.id));

      // Assert: 3 finds switch 3 and the name holding a 3, never switch 13.
      expect(found)
        .toStrictEqual([ [ 3, 11 ], [ 3, 13 ], [] ]);
    });
  });

  describe('maximumOf', () =>
  {
    it('counts the ids a list holds, and none for an empty one', () =>
    {
      // Arrange: three switches, and a list with nothing at all.
      const lists = [ buildSystem()['switches'] as string[], [] ];

      // Act.
      const maximums = lists.map(maximumOf);

      // Assert.
      expect(maximums)
        .toStrictEqual([ 3, 0 ]);
    });
  });

  describe('clampMaximum', () =>
  {
    it('keeps a maximum from 1 to 5000, as a whole number', () =>
    {
      // Arrange.
      const asked = [ 0, -4, 1, 420.4, 5000, 99999 ];

      // Act.
      const kept = asked.map(clampMaximum);

      // Assert.
      expect(kept)
        .toStrictEqual([ 1, 1, 1, 420, 5000, 5000 ]);
    });
  });

  describe('renameEntry', () =>
  {
    it('renames a switch as one named step in the names\' history, leaving the variable of the same id alone', () =>
    {
      // Arrange.
      const { hub } = hubHolding(buildSystem());

      // Act.
      const step = renameEntry(hub, 'switches', 2, 'after the vampire');

      // Assert.
      expect([ step?.label, step?.histories, namesIn(hub, 'switches'), namesIn(hub, 'variables'), hub.isDirty(SYSTEM_KEY) ])
        .toStrictEqual([
          'Rename switch 2',
          [ SYSTEM_HISTORY_KEY ],
          [ '', 'partner-visible', 'after the vampire', 'mayor wolf defeated.' ],
          [ '', 'Enemies Defeated', 'Parries (all kinds)' ],
          true,
        ]);
    });

    it('renames a variable, and empties a name', () =>
    {
      // Arrange.
      const { hub } = hubHolding(buildSystem());

      // Act.
      const steps = [ renameEntry(hub, 'variables', 2, 'Parries'), renameEntry(hub, 'variables', 1, '') ];

      // Assert.
      expect([ steps.map(step => step?.label), namesIn(hub, 'variables') ])
        .toStrictEqual([ [ 'Rename variable 2', 'Rename variable 1' ], [ '', '', 'Parries' ] ]);
    });

    it('records nothing when the name was already that', () =>
    {
      // Arrange.
      const { hub } = hubHolding(buildSystem());

      // Act.
      const step = renameEntry(hub, 'switches', 1, 'partner-visible');

      // Assert.
      expect([ step, hub.history(SYSTEM_HISTORY_KEY).rows.length, hub.isDirty(SYSTEM_KEY) ])
        .toStrictEqual([ null, 0, false ]);
    });

    it('undoes and redoes a rename, the document clean again once undone', () =>
    {
      // Arrange: switch 3 renamed.
      const { hub } = hubHolding(buildSystem());
      renameEntry(hub, 'switches', 3, 'wolf gone');

      // Act: undo, then redo.
      const undone = hub.undo(SYSTEM_HISTORY_KEY);
      const afterUndo = [ namesIn(hub, 'switches')[3], hub.isDirty(SYSTEM_KEY) ];
      const redone = hub.redo(SYSTEM_HISTORY_KEY);

      // Assert.
      expect([ undone.ok, afterUndo, redone.ok, namesIn(hub, 'switches')[3], hub.isDirty(SYSTEM_KEY) ])
        .toStrictEqual([ true, [ 'mayor wolf defeated.', false ], true, 'wolf gone', true ]);
    });

    it('refuses an id the list does not hold, changing nothing', () =>
    {
      // Arrange.
      const { hub } = hubHolding(buildSystem());

      // Act: the empty first slot, one past the last switch, and half a switch.
      const attempts = [ 0, 4, 1.5 ].map(id => () => renameEntry(hub, 'switches', id, 'nope'));

      // Assert.
      attempts.forEach(attempt => expect(attempt)
        .toThrow('there is no switch'));
      expect(namesIn(hub, 'switches'))
        .toStrictEqual([ '', 'partner-visible', '', 'mayor wolf defeated.' ]);
    });
  });

  describe('setMaximum', () =>
  {
    it('adds unnamed switches at the end as one step when the maximum rises', () =>
    {
      // Arrange.
      const { hub } = hubHolding(buildSystem());

      // Act.
      const step = setMaximum(hub, 'switches', 5);

      // Assert.
      expect([ step?.label, namesIn(hub, 'switches') ])
        .toStrictEqual([ 'Change the switch maximum to 5', [ '', 'partner-visible', '', 'mayor wolf defeated.', '', '' ] ]);
    });

    it('takes the last variables away when the maximum falls, and brings them back, names and all, on undo', () =>
    {
      // Arrange.
      const { hub } = hubHolding(buildSystem());

      // Act: down to 1, then undone.
      const step = setMaximum(hub, 'variables', 1);
      const lowered = [ ...namesIn(hub, 'variables') ];
      hub.undo(SYSTEM_HISTORY_KEY);

      // Assert.
      expect([ step?.label, lowered, namesIn(hub, 'variables') ])
        .toStrictEqual([ 'Change the variable maximum to 1', [ '', 'Enemies Defeated' ], [ '', 'Enemies Defeated', 'Parries (all kinds)' ] ]);
    });

    it('records nothing when there are that many already, and keeps a maximum asked past the limits within them', () =>
    {
      // Arrange.
      const { hub } = hubHolding(buildSystem());

      // Act: three switches asked for, which there are; then none, which keeps one.
      const same = setMaximum(hub, 'switches', 3);
      const least = setMaximum(hub, 'switches', 0);

      // Assert.
      expect([ same, least?.label, namesIn(hub, 'switches') ])
        .toStrictEqual([ null, 'Change the switch maximum to 1', [ '', 'partner-visible' ] ]);
    });
  });

  describe('the real System.json', () =>
  {
    const project = locateGameProject();

    it.skipIf(project === null)('saves a rename with that one name changed and every other byte as MZ wrote it', async () =>
    {
      // Arrange: the game's System.json, read and never written, held by a window whose saves are caught; the switch
      // renamed is the first named one whose name the file holds just once.
      const text = readFileSync(`${project}/data/System.json`, 'utf8');
      const system = JSON.parse(text) as JsonObject;
      const switches = system['switches'] as string[];
      const id = switches.findIndex(name => name !== '' && text.split(JSON.stringify(name)).length === 2);
      const { hub, saved } = hubHolding(system);

      // Act.
      renameEntry(hub, 'switches', id, 'Vampire\'s <gone> & "dusted"');
      await hub.save(SYSTEM_KEY);

      // Assert: the file as MZ would write what was saved, against the real file with that one name replaced.
      const expected = text.replace(JSON.stringify(switches[id]), '"Vampire\'s <gone> & \\"dusted\\""');
      expect([ id > 0, JSON.stringify(saved()) === expected, hub.isDirty(SYSTEM_KEY) ])
        .toStrictEqual([ true, true, false ]);
    });
  });
});
