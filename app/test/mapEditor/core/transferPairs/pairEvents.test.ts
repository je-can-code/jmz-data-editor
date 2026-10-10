import { describe, expect, it } from 'vitest';
import { doorEvent, exitEvent, stripEvent, transferName } from '../../../../src/mapEditor/core/transferPairs/pairEvents.ts';

/*
 * The events a placed transfer is made of must be the events Jeremy makes by hand, down to the byte, so the game, MZ and
 * every tool reading the maps take them for his own. Each builder is held against a shipped event, given the same id,
 * tile, name and landing, written in the same key order MZ writes:
 *
 * - a door is the Comfy Bear Inn's door (Map020, event 1): same as characters, touched by the player, drawn from its sheet
 *   with its walking pose still, and a page playing the creak, the door's opening on itself, the player's step in, the
 *   sound of passing through, and the transfer;
 * - a way out is the inn bathroom's (Map358, event 2): drawn as nothing, below the characters, walked onto, its page the
 *   sound of passing through and the transfer back;
 * - an edge strip is Map350's bottom strip (event 28): the area tag first, then the sound and the transfer.
 *
 * Each sound is a choice, and a sound chosen as none leaves its command out rather than playing nothing, so each builder
 * is pinned with its sounds and without them.
 */
describe('pairEvents', () =>
{
  /**
   * The conditions and the page settings every shipped transfer page has, up to its picture.
   */
  const CONDITIONS = '{"actorId":1,"actorValid":false,"itemId":1,"itemValid":false,"selfSwitchCh":"A","selfSwitchValid":false,"switch1Id":1,'
    + '"switch1Valid":false,"switch2Id":1,"switch2Valid":false,"variableId":1,"variableValid":false,"variableValue":0}';

  /**
   * The inn's door as Map020's file holds it.
   */
  const INN_DOOR = `{"id":1,"name":"door to inn","note":"","pages":[{"conditions":${CONDITIONS},"directionFix":false,`
    + '"image":{"characterIndex":0,"characterName":"!doors","direction":2,"pattern":1,"tileId":0},"list":['
    + '{"code":250,"indent":0,"parameters":[{"name":"Open1","volume":90,"pitch":100,"pan":0}]},'
    + '{"code":205,"indent":0,"parameters":[0,{"repeat":false,"skippable":false,"wait":true,"list":[{"code":17},{"code":15,"parameters":[3]},'
    + '{"code":18},{"code":15,"parameters":[3]},{"code":19},{"code":37},{"code":0}]}]},'
    + '{"code":505,"indent":0,"parameters":[{"code":17}]},{"code":505,"indent":0,"parameters":[{"code":15,"parameters":[3]}]},'
    + '{"code":505,"indent":0,"parameters":[{"code":18}]},{"code":505,"indent":0,"parameters":[{"code":15,"parameters":[3]}]},'
    + '{"code":505,"indent":0,"parameters":[{"code":19}]},{"code":505,"indent":0,"parameters":[{"code":37}]},'
    + '{"code":205,"indent":0,"parameters":[-1,{"repeat":false,"skippable":true,"wait":true,"list":[{"code":12},{"code":0}]}]},'
    + '{"code":505,"indent":0,"parameters":[{"code":12}]},'
    + '{"code":250,"indent":0,"parameters":[{"name":"Move1","volume":90,"pitch":100,"pan":0}]},'
    + '{"code":201,"indent":0,"parameters":[0,28,8,13,8,0]},{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,'
    + '"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},"moveSpeed":3,"moveType":0,"priorityType":1,'
    + '"stepAnime":false,"through":false,"trigger":1,"walkAnime":false}],"x":14,"y":6}';

  /**
   * The inn bathroom's way out as Map358's file holds it.
   */
  const BATHROOM_EXIT = `{"id":2,"name":"Transfer (Entrance)","note":"","pages":[{"conditions":${CONDITIONS},"directionFix":false,`
    + '"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0},"list":['
    + '{"code":250,"indent":0,"parameters":[{"name":"Move1","volume":90,"pitch":100,"pan":0}]},'
    + '{"code":201,"indent":0,"parameters":[0,28,15,8,2,0]},{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,'
    + '"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},"moveSpeed":3,"moveType":0,"priorityType":0,'
    + '"stepAnime":false,"through":false,"trigger":1,"walkAnime":true}],"x":14,"y":9}';

  /**
   * Map350's bottom strip as its file holds it.
   */
  const BOTTOM_STRIP = `{"id":28,"name":"Transfer (E Side)","note":"","pages":[{"conditions":${CONDITIONS},"directionFix":false,`
    + '"image":{"characterIndex":0,"characterName":"","direction":2,"pattern":0,"tileId":0},"list":['
    + '{"code":108,"indent":0,"parameters":["<areaEvent:[3, 1]>"]},'
    + '{"code":250,"indent":0,"parameters":[{"name":"Move1","volume":90,"pitch":100,"pan":0}]},'
    + '{"code":201,"indent":0,"parameters":[0,349,31,1,2,0]},{"code":0,"indent":0,"parameters":[]}],"moveFrequency":3,'
    + '"moveRoute":{"list":[{"code":0,"parameters":[]}],"repeat":true,"skippable":false,"wait":false},"moveSpeed":3,"moveType":0,"priorityType":0,'
    + '"stepAnime":false,"through":false,"trigger":1,"walkAnime":true}],"x":30,"y":49}';

  /**
   * The inn's door picture.
   */
  const DOORS_0 = { characterName: '!doors', characterIndex: 0, direction: 2, pattern: 1 };

  describe('doorEvent', () =>
  {
    it('builds the inn\'s door byte for byte, given its tile, name, picture, sounds and landing', () =>
    {
      // Arrange: what the inn's door was placed with.
      const sounds = { door: 'Open1', movement: 'Move1' };

      // Act.
      const door = doorEvent(1, { x: 14, y: 6 }, 'door to inn', DOORS_0, sounds, { mapId: 28, x: 8, y: 13, facing: 8 });

      // Assert.
      expect(JSON.stringify(door))
        .toBe(INN_DOOR);
    });

    it('leaves out each sound chosen as none, keeping the opening and the step in', () =>
    {
      // Arrange: no creak and no sound of passing through.
      const sounds = { door: '', movement: '' };

      // Act.
      const door = doorEvent(1, { x: 14, y: 6 }, 'door to inn', DOORS_0, sounds, { mapId: 28, x: 8, y: 13, facing: 8 });

      // Assert.
      expect(door.pages[0].list.map(command => command.code))
        .toStrictEqual([ 205, 505, 505, 505, 505, 505, 505, 205, 505, 201, 0 ]);
    });

    it('plays the creak alone when no sound of passing through is chosen, and that alone when no creak is', () =>
    {
      // Arrange: each sound on its own.
      const destination = { mapId: 28, x: 8, y: 13, facing: 8 as const };

      // Act.
      const creakOnly = doorEvent(1, { x: 14, y: 6 }, 'door', DOORS_0, { door: 'Door1', movement: '' }, destination);
      const passingOnly = doorEvent(1, { x: 14, y: 6 }, 'door', DOORS_0, { door: '', movement: 'Move1' }, destination);

      // Assert: the creak opens the page; the passing plays just before the transfer.
      const sounds = (list: typeof creakOnly.pages[0]['list']) => list.flatMap((command, index) => (command.code === 250 ? [ [ index, (command.parameters[0] as { name: string }).name ] ] : []));
      expect([ sounds(creakOnly.pages[0].list), sounds(passingOnly.pages[0].list) ])
        .toStrictEqual([ [ [ 0, 'Door1' ] ], [ [ 9, 'Move1' ] ] ]);
    });
  });

  describe('exitEvent', () =>
  {
    it('builds the inn bathroom\'s way out byte for byte, given its tile, name, sound and landing', () =>
    {
      // Arrange: what the bathroom's way out was placed with.
      const destination = { mapId: 28, x: 15, y: 8, facing: 2 as const };

      // Act.
      const exit = exitEvent(2, { x: 14, y: 9 }, 'Transfer (Entrance)', 'Move1', destination);

      // Assert.
      expect(JSON.stringify(exit))
        .toBe(BATHROOM_EXIT);
    });

    it('sends the player straight back with no sound when none is chosen', () =>
    {
      // Arrange.
      const destination = { mapId: 28, x: 15, y: 8, facing: 2 as const };

      // Act.
      const exit = exitEvent(2, { x: 14, y: 9 }, 'Transfer (Entrance)', '', destination);

      // Assert.
      expect(exit.pages[0].list)
        .toStrictEqual([ { code: 201, indent: 0, parameters: [ 0, 28, 15, 8, 2, 0 ] }, { code: 0, indent: 0, parameters: [] } ]);
    });
  });

  describe('stripEvent', () =>
  {
    it('builds Map350\'s bottom strip byte for byte, given its tiles, name, sound and landing', () =>
    {
      // Arrange: the strip's three tiles along the bottom of a map 50 tall.
      const strip = { x: 30, y: 49, width: 3, height: 1 };

      // Act.
      const event = stripEvent(28, strip, 'Transfer (E Side)', 'Move1', { mapId: 349, x: 31, y: 1, facing: 2 });

      // Assert.
      expect(JSON.stringify(event))
        .toBe(BOTTOM_STRIP);
    });

    it('spreads a strip down a side as one tile wide, and leaves the sound out when none is chosen', () =>
    {
      // Arrange: a strip of seven tiles down a map's left side.
      const strip = { x: 0, y: 23, width: 1, height: 7 };

      // Act.
      const event = stripEvent(2, strip, 'Transfer (Way to the Forest)', '', { mapId: 339, x: 98, y: 26, facing: 4 });

      // Assert.
      expect([ event.x, event.y, event.pages[0].list.map(command => command.parameters) ])
        .toStrictEqual([ 0, 23, [ [ '<areaEvent:[1, 7]>' ], [ 0, 339, 98, 26, 4, 0 ], [] ] ]);
    });
  });

  describe('transferName', () =>
  {
    it('names a transfer by the map it leads to, as the newer shipped maps do', () =>
    {
      // Arrange: the map's name.
      const mapName = 'NE Corner';

      // Act.
      const name = transferName(mapName);

      // Assert.
      expect(name)
        .toBe('Transfer (NE Corner)');
    });
  });
});
