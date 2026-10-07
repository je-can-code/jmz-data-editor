import { describe, expect, it } from 'vitest';
import { GamePreview, switchKey, variableKey } from '../../../../src/mapEditor/core/preview/GamePreview.ts';

/*
 * A preview is how far along the story the author asks every map to show the game: switches turned on, variables set,
 * and whatever kind of state a plugin module adds. What it leaves unset reads as a fresh save holds it, every switch off
 * and every variable 0, and it never lists a thing at that value, so a switch turned off or a variable put back to 0
 * leaves it exactly as though it had never been touched, and a preview setting nothing is a fresh save's.
 *
 * A preview never changes once made: each change makes another, and a change that changes nothing hands back the same
 * one. Two previews say which pieces of state they set otherwise, by key, which is what judges again exactly the events
 * reading those pieces. It is remembered between sessions as JSON, and a remembered record is read leniently: whatever
 * of it a preview could not set is dropped rather than stopping the editor.
 */
describe('GamePreview', () =>
{
  describe('keys', () =>
  {
    it('names a switch and a variable by their kind and id', () =>
    {
      // Arrange: switch 74 and variable 74, which must never be taken for one another.
      const ids = [ 74, 74 ];

      // Act.
      const keys = [ switchKey(ids[0]), variableKey(ids[1]) ];

      // Assert.
      expect(keys)
        .toStrictEqual([ 'switch:74', 'variable:74' ]);
    });
  });

  describe('switches', () =>
  {
    it('reads every switch off on a fresh save, and a switch on once turned on, leaving its neighbours off', () =>
    {
      // Arrange.
      const preview = GamePreview.FRESH.withSwitch(74, true);

      // Act.
      const read = [ GamePreview.FRESH.isSwitchOn(74), preview.isSwitchOn(74), preview.isSwitchOn(47), preview.isSwitchOn(75) ];

      // Assert.
      expect(read)
        .toStrictEqual([ false, true, false, false ]);
    });

    it('lists the switches on in order of their ids, and drops one turned off again', () =>
    {
      // Arrange: switches 147, 24 and 9 turned on in that order, then 24 off.
      const preview = GamePreview.FRESH.withSwitch(147, true).withSwitch(24, true).withSwitch(9, true).withSwitch(24, false);

      // Act.
      const on = preview.switchesOn();

      // Assert.
      expect([ on, preview.count('switch') ])
        .toStrictEqual([ [ 9, 147 ], 2 ]);
    });
  });

  describe('variables', () =>
  {
    it('reads every variable 0 on a fresh save, and a variable at what it is set to, leaving its neighbours at 0', () =>
    {
      // Arrange.
      const preview = GamePreview.FRESH.withVariable(74, 99);

      // Act.
      const read = [ GamePreview.FRESH.variable(74), preview.variable(74), preview.variable(47), preview.variable(75) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 0, 99, 0, 0 ]);
    });

    it('keeps a variable set below 0, and drops one set back to 0', () =>
    {
      // Arrange: variable 13 at -4, and variable 74 at 99 then back at 0.
      const preview = GamePreview.FRESH.withVariable(13, -4).withVariable(74, 99).withVariable(74, 0);

      // Act.
      const read = [ preview.variable(13), preview.count('variable'), preview.toJson() ];

      // Assert.
      expect(read)
        .toStrictEqual([ -4, 1, { variable: { 13: -4 } } ]);
    });
  });

  describe('with', () =>
  {
    it('hands back the very same preview for a change that changes nothing', () =>
    {
      // Arrange.
      const preview = GamePreview.FRESH.withSwitch(74, true);

      // Act: switch 74 on again, switch 47 off again, and variable 9 at 0 again.
      const same = [ preview.withSwitch(74, true), preview.withSwitch(47, false), preview.withVariable(9, 0) ];

      // Assert.
      expect(same.every(each => each === preview))
        .toBe(true);
    });

    it('is a fresh save again once everything set is put back', () =>
    {
      // Arrange.
      const preview = GamePreview.FRESH.withSwitch(74, true).withVariable(74, 99);

      // Act.
      const back = preview.withSwitch(74, false).withVariable(74, 0);

      // Assert.
      expect([ preview.isFresh, back === GamePreview.FRESH, back.isFresh, back.kinds() ])
        .toStrictEqual([ false, true, true, [] ]);
    });

    it('sets a module\'s own kind of state, and puts it back on undefined or null', () =>
    {
      // Arrange: quest CHEF_01 under way, CHEF_02 done.
      const preview = GamePreview.FRESH.with('quest.states', 'CHEF_01', 'active').with('quest.states', 'CHEF_02', 'done');

      // Act: CHEF_01 put back with undefined, CHEF_02 with null.
      const back = [ preview.with('quest.states', 'CHEF_01', undefined), preview.with('quest.states', 'CHEF_02', null) ];

      // Assert.
      expect([ preview.value('quest.states', 'CHEF_01'), preview.count('quest.states'), back.map(each => each.toJson()) ])
        .toStrictEqual([ 'active', 2, [ { 'quest.states': { CHEF_02: 'done' } }, { 'quest.states': { CHEF_01: 'active' } } ] ]);
    });

    it('never sets a switch to anything but on, or a variable to anything but a number', () =>
    {
      // Arrange.
      const preview = GamePreview.FRESH;

      // Act: switch 4 set to 1 and to 'yes', variable 5 set to '9' and to infinity.
      const set = [
        preview.with('switch', '4', 1),
        preview.with('switch', '4', 'yes'),
        preview.with('variable', '5', '9'),
        preview.with('variable', '5', Number.POSITIVE_INFINITY),
      ];

      // Assert.
      expect(set.every(each => each === preview))
        .toBe(true);
    });
  });

  describe('changedKeys', () =>
  {
    it('names every piece of state two previews set otherwise, and nothing they set alike', () =>
    {
      // Arrange: switch 24 on in both; switch 74 on in one alone; variable 74 at 99 in one and 98 in the other; a quest
      // done in the other alone.
      const left = GamePreview.FRESH.withSwitch(24, true).withSwitch(74, true).withVariable(74, 99);
      const right = GamePreview.FRESH.withSwitch(24, true).withVariable(74, 98).with('quest.states', 'CHEF_01', 'done');

      // Act.
      const changed = left.changedKeys(right);

      // Assert.
      expect([ ...changed ].sort())
        .toStrictEqual([ 'quest.states:CHEF_01', 'switch:74', 'variable:74' ]);
    });

    it('names nothing for two previews setting the same things alike, so they are equal', () =>
    {
      // Arrange: the same switches turned on in another order.
      const left = GamePreview.FRESH.withSwitch(24, true).withSwitch(147, true);
      const right = GamePreview.FRESH.withSwitch(147, true).withSwitch(24, true);

      // Act.
      const changed = left.changedKeys(right);

      // Assert.
      expect([ changed.size, left.equals(right), left.equals(GamePreview.FRESH) ])
        .toStrictEqual([ 0, true, false ]);
    });
  });

  describe('fromJson', () =>
  {
    it('reads back a preview written as JSON', () =>
    {
      // Arrange: switches 24 and 147 on, variable 74 at 99, and a quest done.
      const written = GamePreview.FRESH.withSwitch(24, true).withSwitch(147, true).withVariable(74, 99).with('quest.states', 'CHEF_01', 'done').toJson();

      // Act.
      const read = GamePreview.fromJson(JSON.parse(JSON.stringify(written)));

      // Assert.
      expect([ read.switchesOn(), read.variable(74), read.value('quest.states', 'CHEF_01'), read.toJson() ])
        .toStrictEqual([ [ 24, 147 ], 99, 'done', { switch: { 24: true, 147: true }, variable: { 74: 99 }, 'quest.states': { CHEF_01: 'done' } } ]);
    });

    it('drops whatever a preview could not set, keeping the rest', () =>
    {
      // Arrange: a switch set to 1, a switch named by no id, a variable set to text, a variable at 0, a kind that is no
      // object, and one switch set as it should be.
      const json = {
        switch: { 4: 1, 'zero': true, 0: true, 9: true },
        variable: { 5: '12', 6: 0, '-2': 7 },
        'quest.states': 'all done',
      };

      // Act.
      const read = GamePreview.fromJson(json);

      // Assert.
      expect(read.toJson())
        .toStrictEqual({ switch: { 9: true } });
    });

    it('reads anything that is no object, or keeps nothing, as a fresh save', () =>
    {
      // Arrange: nothing remembered, a list, text, and an object whose every kind is empty.
      const records: unknown[] = [ null, [ 1, 2 ], 'switch:74', { switch: {} } ];

      // Act.
      const read = records.map(record => GamePreview.fromJson(record));

      // Assert.
      expect(read.every(each => each === GamePreview.FRESH))
        .toBe(true);
    });
  });
});
