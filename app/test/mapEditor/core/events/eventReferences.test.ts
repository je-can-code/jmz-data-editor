import { describe, expect, it } from 'vitest';
import { rewireGroupReferences } from '../../../../src/mapEditor/core/events/eventReferences.ts';
import { cloneJson, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * Pasted events that name each other must keep naming each other once they take new ids: a door moving its own guard,
 * a lever swapping places with a crate. So every command parameter the engine reads as a character, and only those,
 * follows the group to its new ids: Set Movement Route, Show Animation, Show Balloon Icon, Set Event Location (the
 * event, and the other one when they exchange places), Conditional Branch on a character's direction, Control
 * Variables from a character's data, and Get Location Info by a character. The same parameter is a tile, a variable,
 * a switch or an actor in other forms of those commands, and is never touched there. The player (-1), the event itself
 * (0) and events outside the group stay as they are, and the event handed in is never changed.
 *
 * The group is events 1 and 2, pasted as 5 and 6. Event 4 stays behind.
 */
describe('rewireGroupReferences', () =>
{
  /**
   * The group's old ids, to their copies' new ones.
   */
  const NEW_IDS: ReadonlyMap<number, number> = new Map([ [ 1, 5 ], [ 2, 6 ] ]);

  /**
   * A move route that does nothing, for the commands that carry one.
   */
  const ROUTE: JsonValue = { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: true };

  /**
   * Builds event 1 running the given commands on one page.
   * @param {[ number, JsonValue[] ][]} commands Each command as its code and its parameters.
   * @returns {RmmzMapEvent} The event.
   */
  const running = (commands: [ number, JsonValue[] ][]): RmmzMapEvent =>
  {
    return event(1, [ page(commands.map(([ code, parameters ]) => command(code, parameters))) ]);
  };

  /**
   * Reads every command's parameters off an event's first page, leaving out the closing command.
   * @param {RmmzMapEvent} target The event.
   * @returns {JsonValue[][]} The parameters, command by command.
   */
  const parametersOf = (target: RmmzMapEvent): JsonValue[][] =>
  {
    return target.pages[0].list.slice(0, -1).map(each => each.parameters);
  };

  it('points every command naming one of the group at that event\'s copy', () =>
  {
    // Arrange: one command of each kind, naming event 2, or event 1 itself by its id.
    const original = running([
      [ 205, [ 2, ROUTE ] ],
      [ 212, [ 2, 7, false ] ],
      [ 213, [ 1, 1, false ] ],
      [ 203, [ 2, 0, 3, 3, 0 ] ],
      [ 203, [ 1, 2, 2, 0, 0 ] ],
      [ 111, [ 6, 2, 4 ] ],
      [ 122, [ 5, 5, 0, 3, 5, 1, 0 ] ],
      [ 285, [ 7, 0, 2, 2, 0 ] ],
    ]);

    // Act.
    const rewired = rewireGroupReferences(original, NEW_IDS);

    // Assert.
    expect(parametersOf(rewired))
      .toStrictEqual([
        [ 6, ROUTE ],
        [ 6, 7, false ],
        [ 5, 1, false ],
        [ 6, 0, 3, 3, 0 ],
        [ 5, 2, 6, 0, 0 ],
        [ 6, 6, 4 ],
        [ 5, 5, 0, 3, 5, 5, 0 ],
        [ 7, 0, 2, 6, 0 ],
      ]);
  });

  it('leaves the player, the event itself and events outside the group as they are', () =>
  {
    // Arrange.
    const original = running([
      [ 205, [ -1, ROUTE ] ],
      [ 212, [ 0, 7, false ] ],
      [ 213, [ 4, 1, false ] ],
      [ 203, [ 4, 2, -1, 0, 0 ] ],
    ]);

    // Act.
    const rewired = rewireGroupReferences(original, NEW_IDS);

    // Assert.
    expect(parametersOf(rewired))
      .toStrictEqual([
        [ -1, ROUTE ],
        [ 0, 7, false ],
        [ 4, 1, false ],
        [ 4, 2, -1, 0, 0 ],
      ]);
  });

  it('never touches the same parameter where the command reads it as a tile, a variable, a switch or an actor', () =>
  {
    // Arrange: every value that could be mistaken for a group member's id is 1 or 2.
    const original = running([
      [ 203, [ 4, 0, 1, 2, 0 ] ],
      [ 203, [ 4, 1, 2, 1, 0 ] ],
      [ 111, [ 0, 2, 0 ] ],
      [ 122, [ 5, 5, 0, 3, 3, 1, 0 ] ],
      [ 122, [ 5, 5, 0, 1, 2 ] ],
      [ 285, [ 7, 0, 0, 2, 1 ] ],
      [ 285, [ 7, 0, 1, 1, 2 ] ],
      [ 357, [ 'J-ABS', 'Spawn Enemy', 'Spawn Enemy', { enemyEventId: '2' } ] ],
    ]);
    const before = parametersOf(original);

    // Act.
    const rewired = rewireGroupReferences(original, NEW_IDS);

    // Assert.
    expect(parametersOf(rewired))
      .toStrictEqual(before);
  });

  it('rewires every page, and leaves the event it was handed as it was', () =>
  {
    // Arrange: a second page balloons over event 2 too.
    const original = event(1, [ page([ command(205, [ 2, ROUTE ]) ]), page([ command(213, [ 2, 1, false ]) ]) ]);
    const untouched = cloneJson(original);

    // Act.
    const rewired = rewireGroupReferences(original, NEW_IDS);

    // Assert.
    expect([ rewired.pages.map(each => each.list[0].parameters[0]), original ])
      .toStrictEqual([ [ 6, 6 ], untouched ]);
  });
});
