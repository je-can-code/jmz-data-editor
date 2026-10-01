import { describe, expect, it } from 'vitest';
import {
  chestLookFor,
  chestMessage,
  chestQuickModel,
  createChestEvent,
  DEFAULT_CHEST_LOOK,
  isChest,
  makeChestEdits,
  readChest,
  readReward,
} from '../../../../src/mapEditor/core/eventKinds/chestKind.ts';
import { editQuickField, runQuickAction } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import type { DatabaseNamesJson } from '../../../../src/mapEditor/core/commandList/databaseNames.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  applyEdits,
  chestRoute,
  CLOSED_GLASS,
  command,
  event,
  eventIn,
  hubWith,
  OPEN_GLASS,
  oreChest,
  page,
  text,
} from '../../support/eventKindFixtures.ts';

/*
 * A chest is MZ's two-page treasure pattern. Its closed page plays one sound, turns itself through one route, turns
 * one self switch on, and gives at least one thing (gold, an item, a weapon or an armor, a set amount of it), saying
 * whatever it likes along the way, in any order; a conditional branch may vary what is said, never what is given.
 * Its opened page waits for that same self switch and shows a picture. Anything more (a switch flipped, a reward
 * taken away or read from a variable, a third page) is a chest with an extra command, which is not a chest: the
 * panel could not show what else it does.
 *
 * The panel edits what a chest gives and how much, what it says, and how it looks, and each change rewrites only
 * the command it concerns, keeping its layout, as one step that one undo takes back exactly. A new chest is written
 * exactly in the pattern, key order included, the way the game's own chests hold it. An event made a chest has the
 * pattern written over its page, and only what the pattern changes is written: its conditions, trigger and movement
 * stay, and the opened page shares them, waiting for its self switch as well.
 */
describe('chestKind', () =>
{
  /**
   * Builds a chest whose closed page runs the given commands, with the ore chest's opened page.
   * @param {ReturnType<typeof command>[]} opening The closed page's commands.
   * @returns {RmmzMapEvent} The chest.
   */
  const chestWith = (opening: ReturnType<typeof command>[]): RmmzMapEvent => oreChest(3, opening);

  /**
   * The sound every chest plays.
   * @returns {ReturnType<typeof command>} The Play SE command.
   */
  const sound = () => command(250, [ { name: 'Chest1', volume: 90, pitch: 100, pan: 0 } ]);

  describe('readChest', () =>
  {
    it('reads the game\'s chest pattern: its switch, its reward, its messages and its two pictures', () =>
    {
      // Arrange.
      const chest = oreChest(3);

      // Act.
      const read = readChest(chest);

      // Assert.
      expect([ read?.letter, read?.rewards.map(spot => [ spot.listIndex, spot.reward ]), read?.messages.map(message => message.model.lines), read?.closed, read?.opened ])
        .toStrictEqual([
          'A',
          [ [ 12, { kind: 'item', id: 32, amount: 10 } ] ],
          [ [ 'A bundle of ore!' ], [ '"Silver Ore" x10 was found!' ], [ 'We will make', 'a weapon of it.' ] ],
          CLOSED_GLASS,
          OPEN_GLASS,
        ]);
    });

    it('reads a chest whose switch comes last, one giving several things, and one whose talk depends on a condition', () =>
    {
      // Arrange.
      const switchLast = chestWith([ sound(), ...chestRoute(), ...text([ 'Leg weights!' ]), command(128, [ 124, 0, 0, 1, false ]), command(123, [ 'A', 0 ]) ]);
      const several = chestWith([ sound(), ...chestRoute(), command(123, [ 'A', 0 ]), command(127, [ 11, 0, 0, 1, false ]), command(125, [ 0, 0, 500 ]) ]);
      const branching = chestWith([
        sound(),
        ...chestRoute(),
        command(123, [ 'A', 0 ]),
        command(111, [ 0, 90, 0 ]),
        ...text([ 'We know this one.' ], 1),
        command(0, [], 1),
        command(411),
        ...text([ 'What is this?' ], 1),
        command(0, [], 1),
        command(412),
        command(126, [ 133, 0, 0, 1 ]),
      ]);

      // Act.
      const rewards = [ switchLast, several, branching ].map(chest => readChest(chest)?.rewards.map(spot => spot.reward));

      // Assert.
      expect(rewards)
        .toStrictEqual([
          [ { kind: 'armor', id: 124, amount: 1 } ],
          [ { kind: 'weapon', id: 11, amount: 1 }, { kind: 'gold', id: 0, amount: 500 } ],
          [ { kind: 'item', id: 133, amount: 1 } ],
        ]);
    });

    it('refuses a chest with an extra command, which does more than a chest does', () =>
    {
      // Arrange: the ore chest, flipping a switch as well.
      const extra = chestWith([ sound(), ...chestRoute(), command(123, [ 'A', 0 ]), command(121, [ 5, 5, 0 ]), command(126, [ 32, 0, 0, 10 ]) ]);

      // Act.
      const chest = isChest(extra);

      // Assert.
      expect(chest)
        .toBe(false);
    });

    it('refuses a chest whose reward depends on a condition, or that gives nothing', () =>
    {
      // Arrange.
      const conditional = chestWith([
        sound(),
        ...chestRoute(),
        command(123, [ 'A', 0 ]),
        command(111, [ 0, 90, 0 ]),
        command(126, [ 32, 0, 0, 10 ], 1),
        command(0, [], 1),
        command(412),
      ]);
      const empty = chestWith([ sound(), ...chestRoute(), command(123, [ 'A', 0 ]), ...text([ '5,000G was found!' ]) ]);

      // Act.
      const answers = [ isChest(conditional), isChest(empty) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false ]);
    });

    it('wants exactly one sound, one route turning the chest itself and one switch turned on', () =>
    {
      // Arrange: two sounds; no route; a route moving the player; a switch turned off; an unknown switch letter.
      const openings = [
        [ sound(), sound(), ...chestRoute(), command(123, [ 'A', 0 ]), command(126, [ 1, 0, 0, 1 ]) ],
        [ sound(), command(123, [ 'A', 0 ]), command(126, [ 1, 0, 0, 1 ]) ],
        [ sound(), command(205, [ -1, { repeat: false, skippable: false, wait: true, list: [ { code: 0 } ] } ]), command(123, [ 'A', 0 ]), command(126, [ 1, 0, 0, 1 ]) ],
        [ sound(), ...chestRoute(), command(123, [ 'A', 1 ]), command(126, [ 1, 0, 0, 1 ]) ],
        [ sound(), ...chestRoute(), command(123, [ 'E', 0 ]), command(126, [ 1, 0, 0, 1 ]) ],
      ];

      // Act.
      const answers = openings.map(opening => isChest(chestWith(opening)));

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false, false, false, false ]);
    });

    it('refuses a reward that takes away, or reads its amount from a variable', () =>
    {
      // Arrange.
      const taking = chestWith([ sound(), ...chestRoute(), command(123, [ 'A', 0 ]), command(126, [ 32, 1, 0, 10 ]) ]);
      const variable = chestWith([ sound(), ...chestRoute(), command(123, [ 'A', 0 ]), command(125, [ 0, 1, 7 ]) ]);

      // Act.
      const answers = [ isChest(taking), isChest(variable) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false ]);
    });

    it('wants the opened page to wait for the opening\'s switch, show a picture and do nothing but talk', () =>
    {
      // Arrange.
      const chest = oreChest(3);
      const [ closed, opened ] = chest.pages;
      const variants = [
        { ...opened, conditions: { ...opened.conditions, selfSwitchCh: 'B' } },
        { ...opened, conditions: { ...opened.conditions, selfSwitchValid: false } },
        { ...opened, image: { ...opened.image, characterName: '' } },
        { ...opened, list: [ command(126, [ 32, 0, 0, 10 ]), command(0) ] },
      ];

      // Act.
      const answers = variants.map(variant => isChest({ ...chest, pages: [ closed, variant ] }));

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false, false, false ]);
    });

    it('accepts an opened page that says nothing at all', () =>
    {
      // Arrange.
      const chest = oreChest(3);
      const [ closed, opened ] = chest.pages;

      // Act.
      const answer = isChest({ ...chest, pages: [ closed, { ...opened, list: [ command(0) ] } ] });

      // Assert.
      expect(answer)
        .toBe(true);
    });

    it('refuses a third page, a single page, and a closed page waiting for a self switch itself', () =>
    {
      // Arrange.
      const chest = oreChest(3);
      const [ closed, opened ] = chest.pages;
      const events = [
        { ...chest, pages: [ closed, opened, page([]) ] },
        { ...chest, pages: [ closed ] },
        { ...chest, pages: [ { ...closed, conditions: { ...closed.conditions, selfSwitchValid: true, selfSwitchCh: 'B' } }, opened ] },
      ];

      // Act.
      const answers = events.map(isChest);

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false, false ]);
    });
  });

  describe('readReward', () =>
  {
    it('reads each kind of giving command, and refuses one shaped otherwise', () =>
    {
      // Arrange.
      const commands = [
        command(125, [ 0, 0, 15000 ]),
        command(126, [ 32, 0, 0, 10 ]),
        command(127, [ 11, 0, 0, 1, false ]),
        command(128, [ 124, 0, 0, 1, true ]),
        command(126, [ 32, 0, 0 ]),
        command(127, [ 11, 0, 0, 1 ]),
        command(126, [ 0, 0, 0, 1 ]),
        command(121, [ 1, 1, 0 ]),
      ];

      // Act.
      const rewards = commands.map(readReward);

      // Assert.
      expect(rewards)
        .toStrictEqual([
          { kind: 'gold', id: 0, amount: 15000 },
          { kind: 'item', id: 32, amount: 10 },
          { kind: 'weapon', id: 11, amount: 1 },
          { kind: 'armor', id: 124, amount: 1 },
          null,
          null,
          null,
          null,
        ]);
    });
  });

  describe('chestQuickModel', () =>
  {
    it('offers what the chest gives and how much, what it says, and how it looks', () =>
    {
      // Arrange.
      const chest = oreChest(3);

      // Act.
      const model = chestQuickModel(chest);

      // Assert.
      expect([ model.fields.map(field => [ field.key, field.value ]), model.actions.map(action => action.key) ])
        .toStrictEqual([
          [
            [ 'reward.0.kind', 126 ],
            [ 'reward.0.item', 32 ],
            [ 'reward.0.amount', 10 ],
            [ 'message.0', 'A bundle of ore!' ],
            [ 'message.1', '"Silver Ore" x10 was found!' ],
            [ 'message.2', 'We will make\na weapon of it.' ],
            [ 'look.closed.graphic', { characterName: '$chest-glass-2', characterIndex: 0, tileId: 0 } ],
            [ 'look.closed.direction', 2 ],
            [ 'look.closed.pattern', 0 ],
            [ 'look.opened.graphic', { characterName: '$chest-glass-2', characterIndex: 0, tileId: 0 } ],
            [ 'look.opened.direction', 6 ],
            [ 'look.opened.pattern', 2 ],
          ],
          [ 'reward.add' ],
        ]);
    });

    it('offers nothing for an event that is not a chest', () =>
    {
      // Arrange.
      const door = event(4, [ page([ command(201, [ 0, 5, 3, 4, 2, 0 ]) ]) ]);

      // Act.
      const model = chestQuickModel(door);

      // Assert.
      expect(model)
        .toStrictEqual({ fields: [], actions: [] });
    });

    it('changes which item it gives, rewriting only that command, and one undo puts the chest back', () =>
    {
      // Arrange.
      const chest = oreChest(3);
      const { hub } = hubWith([ chest ]);

      // Act.
      const step = editQuickField(hub, 1, [ 3 ], chestQuickModel, { events: [], names: null }, 'reward.0.item', 7);
      const changed = eventIn(hub, 3)?.pages[0].list[12];
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, changed, eventIn(hub, 3) ])
        .toStrictEqual([ 'Change chest reward', { code: 126, indent: 0, parameters: [ 7, 0, 0, 10 ] }, chest ]);
    });

    it('changes how much it gives, within what one command can give', () =>
    {
      // Arrange.
      const gold = chestWith([ sound(), ...chestRoute(), command(123, [ 'A', 0 ]), command(125, [ 0, 0, 15000 ]) ]);
      const model = chestQuickModel(gold);
      const amount = model.fields.find(field => field.key === 'reward.0.amount');

      // Act.
      const edited = applyEdits(gold, amount?.write(250) ?? []);

      // Assert.
      expect([ amount?.label, amount?.control, edited.pages[0].list[8] ])
        .toStrictEqual([ 'Gold', { kind: 'number', min: 0, max: 9999999 }, { code: 125, indent: 0, parameters: [ 0, 0, 250 ] } ]);
    });

    it('changes the kind of reward, starting the new kind from its first row and keeping the amount', () =>
    {
      // Arrange.
      const chest = oreChest(3);
      const kind = chestQuickModel(chest).fields.find(field => field.key === 'reward.0.kind');

      // Act.
      const asWeapon = applyEdits(chest, kind?.write(127) ?? []).pages[0].list.at(12);
      const asGold = applyEdits(chest, kind?.write(125) ?? []).pages[0].list.at(12);
      const unchanged = kind?.write(126);

      // Assert.
      expect([ asWeapon, asGold, unchanged ])
        .toStrictEqual([
          { code: 127, indent: 0, parameters: [ 1, 0, 0, 10, false ] },
          { code: 125, indent: 0, parameters: [ 0, 0, 10 ] },
          [],
        ]);
    });

    it('keeps a weapon\'s equipment flag, and caps an amount too large for its new kind', () =>
    {
      // Arrange.
      const flagged = chestWith([ sound(), ...chestRoute(), command(123, [ 'A', 0 ]), command(127, [ 11, 0, 0, 1, true ]), command(125, [ 0, 0, 50000 ]) ]);
      const { fields } = chestQuickModel(flagged);
      const weaponRow = fields.find(field => field.key === 'reward.0.weapon');
      const goldKind = fields.find(field => field.key === 'reward.1.kind');

      // Act.
      const renamed = applyEdits(flagged, weaponRow?.write(12) ?? []).pages[0].list.at(8);
      const asItem = applyEdits(flagged, goldKind?.write(126) ?? []).pages[0].list.at(9);

      // Assert.
      expect([ renamed, asItem ])
        .toStrictEqual([
          { code: 127, indent: 0, parameters: [ 12, 0, 0, 1, true ] },
          { code: 126, indent: 0, parameters: [ 1, 0, 0, 9999 ] },
        ]);
    });

    it('offers removing a reward only while another would remain, and removes exactly that one', () =>
    {
      // Arrange.
      const several = chestWith([ sound(), ...chestRoute(), command(123, [ 'A', 0 ]), command(127, [ 11, 0, 0, 1, false ]), command(125, [ 0, 0, 500 ]) ]);
      const single = oreChest(4);

      // Act.
      const removals = [ several, single ].map(chest => chestQuickModel(chest).actions.map(action => action.key));
      const remove = chestQuickModel(several).actions.find(action => action.key === 'reward.0.remove');
      const after = readChest(applyEdits(several, remove?.run() ?? []))?.rewards.map(spot => spot.reward);

      // Assert.
      expect([ removals, remove?.section, after ])
        .toStrictEqual([
          [ [ 'reward.0.remove', 'reward.1.remove', 'reward.add' ], [ 'reward.add' ] ],
          'Reward 1',
          [ { kind: 'gold', id: 0, amount: 500 } ],
        ]);
    });

    it('adds a reward right after the last one, and one undo takes it back', () =>
    {
      // Arrange.
      const chest = oreChest(3);
      const { hub } = hubWith([ chest ]);

      // Act.
      const step = runQuickAction(hub, 1, [ 3 ], chestQuickModel, { events: [], names: null }, 'reward.add');
      const added = eventIn(hub, 3)?.pages[0].list.slice(12, 14);
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, added, eventIn(hub, 3) ])
        .toStrictEqual([
          'Add chest reward',
          [ { code: 126, indent: 0, parameters: [ 32, 0, 0, 10 ] }, { code: 126, indent: 0, parameters: [ 1, 0, 0, 1 ] } ],
          chest,
        ]);
    });

    it('rewrites a message\'s text however many lines it now runs to, keeping who says it', () =>
    {
      // Arrange.
      const chest = oreChest(3);
      const message = chestQuickModel(chest).fields.find(field => field.key === 'message.2');

      // Act.
      const edited = applyEdits(chest, message?.write('One line only.') ?? []);

      // Assert: the closing message is now one line, and the reward before it is untouched.
      expect([ message?.hint, edited.pages[0].list.slice(12) ])
        .toStrictEqual([
          'face_je 1',
          [
            { code: 126, indent: 0, parameters: [ 32, 0, 0, 10 ] },
            { code: 101, indent: 0, parameters: [ 'face_je', 0, 0, 2, '' ] },
            { code: 401, indent: 0, parameters: [ 'One line only.' ] },
            { code: 0, indent: 0, parameters: [] },
          ],
        ]);
    });

    it('changes how the chest looks open, leaving it closed as it was', () =>
    {
      // Arrange.
      const chest = oreChest(3);
      const { fields } = chestQuickModel(chest);
      const openGraphic = fields.find(field => field.key === 'look.opened.graphic');
      const openFacing = fields.find(field => field.key === 'look.opened.direction');

      // Act.
      const regraphed = applyEdits(chest, openGraphic?.write({ characterName: '!Chest', characterIndex: 2, tileId: 0 }) ?? []);
      const turned = applyEdits(regraphed, openFacing?.write(8) ?? []);

      // Assert.
      expect([ turned.pages[1].image, turned.pages[0].image ])
        .toStrictEqual([ { tileId: 0, characterName: '!Chest', direction: 8, pattern: 2, characterIndex: 2 }, CLOSED_GLASS ]);
    });
  });

  describe('createChestEvent', () =>
  {
    it('writes a chest exactly in the treasure pattern, key order included', () =>
    {
      // Arrange.
      const chest = { look: { closed: CLOSED_GLASS, opened: OPEN_GLASS }, reward: { kind: 'item' as const, id: 32, amount: 10 }, message: '"Silver Ore" x10 was found!' };
      const { conditions } = createEventPage();
      const expected = {
        id: 7,
        name: 'EV007',
        note: '',
        pages: [
          {
            conditions,
            directionFix: true,
            image: { tileId: 0, characterName: '$chest-glass-2', direction: 2, pattern: 0, characterIndex: 0 },
            list: [
              { code: 250, indent: 0, parameters: [ { name: 'Chest1', volume: 90, pitch: 100, pan: 0 } ] },
              { code: 205, indent: 0, parameters: [ 0, { repeat: false, skippable: false, wait: true, list: [ { code: 36 }, { code: 17 }, { code: 15, parameters: [ 3 ] }, { code: 18 }, { code: 15, parameters: [ 3 ] }, { code: 0 } ] } ] },
              { code: 505, indent: 0, parameters: [ { code: 36 } ] },
              { code: 505, indent: 0, parameters: [ { code: 17 } ] },
              { code: 505, indent: 0, parameters: [ { code: 15, parameters: [ 3 ] } ] },
              { code: 505, indent: 0, parameters: [ { code: 18 } ] },
              { code: 505, indent: 0, parameters: [ { code: 15, parameters: [ 3 ] } ] },
              { code: 123, indent: 0, parameters: [ 'A', 0 ] },
              { code: 101, indent: 0, parameters: [ '', 0, 1, 1, '' ] },
              { code: 401, indent: 0, parameters: [ '"Silver Ore" x10 was found!' ] },
              { code: 126, indent: 0, parameters: [ 32, 0, 0, 10 ] },
              { code: 0, indent: 0, parameters: [] },
            ],
            moveFrequency: 3,
            moveRoute: { list: [ { code: 0, parameters: [] } ], repeat: true, skippable: false, wait: false },
            moveSpeed: 3,
            moveType: 0,
            priorityType: 1,
            stepAnime: false,
            through: false,
            trigger: 0,
            walkAnime: false,
          },
          {
            conditions: { ...conditions, selfSwitchValid: true },
            directionFix: true,
            image: { tileId: 0, characterName: '$chest-glass-2', direction: 6, pattern: 2, characterIndex: 0 },
            list: [ { code: 0, indent: 0, parameters: [] } ],
            moveFrequency: 3,
            moveRoute: { list: [ { code: 0, parameters: [] } ], repeat: true, skippable: false, wait: false },
            moveSpeed: 3,
            moveType: 0,
            priorityType: 1,
            stepAnime: false,
            through: false,
            trigger: 0,
            walkAnime: false,
          },
        ],
        x: 4,
        y: 5,
      };

      // Act.
      const created = createChestEvent(7, 4, 5, chest);

      // Assert.
      expect([ created, JSON.stringify(created) ])
        .toStrictEqual([ expected, JSON.stringify(expected) ]);
    });

    it('writes each kind of reward as MZ writes its command, and reads back as the chest it was made as', () =>
    {
      // Arrange.
      const look = { closed: CLOSED_GLASS, opened: OPEN_GLASS };
      const rewards = [
        { kind: 'gold' as const, id: 0, amount: 150 },
        { kind: 'weapon' as const, id: 11, amount: 1 },
        { kind: 'armor' as const, id: 3, amount: 2 },
      ];

      // Act.
      const chests = rewards.map(reward => createChestEvent(2, 0, 0, { look, reward, message: 'Found.' }));

      // Assert.
      expect(chests.map(chest => [ chest.pages[0].list[10], readChest(chest)?.rewards[0].reward ]))
        .toStrictEqual([
          [ { code: 125, indent: 0, parameters: [ 0, 0, 150 ] }, rewards[0] ],
          [ { code: 127, indent: 0, parameters: [ 11, 0, 0, 1, false ] }, rewards[1] ],
          [ { code: 128, indent: 0, parameters: [ 3, 0, 0, 2, false ] }, rewards[2] ],
        ]);
    });
  });

  describe('chestMessage', () =>
  {
    it('names the reward from the project\'s names, with how many, and gold as an amount', () =>
    {
      // Arrange.
      const names = { items: [ '', 'Potion' ], weapons: [ '', 'Sword' ], armors: [ '', '' ] } as unknown as DatabaseNamesJson;

      // Act.
      const messages = [
        chestMessage({ kind: 'item', id: 1, amount: 1 }, names),
        chestMessage({ kind: 'weapon', id: 1, amount: 3 }, names),
        chestMessage({ kind: 'armor', id: 1, amount: 1 }, names),
        chestMessage({ kind: 'item', id: 1, amount: 2 }, null),
        chestMessage({ kind: 'gold', id: 0, amount: 150 }, names),
      ];

      // Assert.
      expect(messages)
        .toStrictEqual([ 'Potion was found!', 'Sword x3 was found!', 'Armor 1 was found!', 'Item 1 x2 was found!', '150 gold was found!' ]);
    });
  });

  describe('chestLookFor', () =>
  {
    it('keeps an event\'s own picture closed, opening it the way a chest on the map with that picture opens', () =>
    {
      // Arrange.
      const placed = event(9, [ page([], { image: { ...CLOSED_GLASS, pattern: 1 } }) ]);
      const onMap = oreChest(3);

      // Act.
      const look = chestLookFor(placed, [ null, null, null, onMap, null, null, null, null, null, placed ]);

      // Assert.
      expect(look)
        .toStrictEqual({ closed: { ...CLOSED_GLASS, pattern: 1 }, opened: OPEN_GLASS });
    });

    it('turns its own picture to face up when no chest on the map shares it', () =>
    {
      // Arrange.
      const image = { tileId: 0, characterName: '!Chest', direction: 2, pattern: 1, characterIndex: 3 };
      const placed = event(9, [ page([], { image }) ]);

      // Act.
      const look = chestLookFor(placed, [ null, oreChest(1) ]);

      // Assert.
      expect(look)
        .toStrictEqual({ closed: image, opened: { ...image, direction: 8 } });
    });

    it('borrows a chest\'s look from the map for an event showing nothing, and takes MZ\'s chest when there is none', () =>
    {
      // Arrange.
      const blank = event(9, [ page([]) ]);

      // Act.
      const looks = [ chestLookFor(blank, [ null, oreChest(1), blank ]), chestLookFor(blank, [ null, blank ]) ];

      // Assert.
      expect(looks)
        .toStrictEqual([ { closed: CLOSED_GLASS, opened: OPEN_GLASS }, DEFAULT_CHEST_LOOK ]);
    });
  });

  describe('makeChestEdits', () =>
  {
    it('turns an event into a chest giving the first item, keeping its id, name, note and place', () =>
    {
      // Arrange.
      const placed = event(9, [ page([], { image: { ...CLOSED_GLASS } }) ], { name: 'loot', note: 'kept', x: 4, y: 2 });
      const names = { items: [ '', 'Potion' ] } as unknown as DatabaseNamesJson;

      // Act.
      const made = applyEdits(placed, makeChestEdits(placed, { events: [ null, oreChest(1) ], names }));
      const read = readChest(made);

      // Assert.
      expect([ made.id, made.name, made.note, made.x, made.y, read?.rewards[0].reward, read?.messages[0].model.lines, read?.opened ])
        .toStrictEqual([ 9, 'loot', 'kept', 4, 2, { kind: 'item', id: 1, amount: 1 }, [ 'Potion was found!' ], OPEN_GLASS ]);
    });

    it('keeps the page\'s conditions, trigger and movement on both pages, and writes only what the pattern changes', () =>
    {
      // Arrange: a chest graphic shown while switch 12 is on and variable 4 is at least 3, opened by touch, walking a
      // route of its own, with a self switch letter stored but unused.
      const conditions = { ...createEventPage().conditions, selfSwitchCh: 'C', switch1Id: 12, switch1Valid: true, variableId: 4, variableValid: true, variableValue: 3 };
      const moveRoute = { list: [ { code: 19 }, { code: 0 } ], repeat: false, skippable: true, wait: false };
      const placed = event(9, [ page([], { conditions, image: { ...CLOSED_GLASS }, moveFrequency: 4, moveRoute, moveSpeed: 5, moveType: 3, through: true, trigger: 1 }) ]);

      // Act.
      const edits = makeChestEdits(placed, { events: [ null ], names: null });
      const made = applyEdits(placed, edits);

      // Assert: the picture was already a chest's, so it is not written; the opened page waits for self switch A too.
      const route = { list: [ { code: 19 }, { code: 0 } ], repeat: false, skippable: true, wait: false };
      const kept = { actorId: 1, actorValid: false, itemId: 1, itemValid: false, switch1Id: 12, switch1Valid: true, switch2Id: 1, switch2Valid: false, variableId: 4, variableValid: true, variableValue: 3 };
      expect([
        edits.map(edit => edit.path.join('.')),
        made.pages.map(each => [ each.conditions, each.trigger, each.moveType, each.moveSpeed, each.moveFrequency, each.moveRoute, each.through, each.directionFix, each.priorityType, each.walkAnime ]),
        readChest(made)?.letter,
      ])
        .toStrictEqual([
          [ 'pages.0.directionFix', 'pages.0.list', 'pages.0.priorityType', 'pages.0.walkAnime', 'pages' ],
          [
            [ { ...kept, selfSwitchCh: 'C', selfSwitchValid: false }, 1, 3, 5, 4, route, true, true, 1, false ],
            [ { ...kept, selfSwitchCh: 'A', selfSwitchValid: true }, 1, 3, 5, 4, route, true, true, 1, false ],
          ],
          'A',
        ]);
    });
  });
});
