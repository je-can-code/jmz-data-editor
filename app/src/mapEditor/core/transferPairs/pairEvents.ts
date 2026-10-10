import type { JsonValue } from '../model/json.ts';
import type { RmmzEventCommand, RmmzEventImage, RmmzEventPage, RmmzMapEvent, RmmzMoveCommand } from '../model/rmmzTypes.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import type { DoorLook } from './doorSprites.ts';
import type { Facing } from './pairShapes.ts';

/**
 * Where a transfer sends the player: the map, the tile, and the way they face on arriving.
 */
type Destination = {
  readonly mapId: number;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
};

/**
 * The sounds a transfer plays: the door's creak as it opens, which only a door plays, and the sound of passing through,
 * played just before the transfer. Each is a sound's name in {@code audio/se}, or empty for none.
 */
type TransferSounds = {
  readonly door: string;
  readonly movement: string;
};

/**
 * The command codes the events are built from.
 */
const Code = {
  end: 0,
  comment: 108,
  transfer: 201,
  movementRoute: 205,
  routeStep: 505,
  playSound: 250,
} as const;

/**
 * The move command codes a door's opening and a player's step in are built from.
 */
const Move = {
  end: 0,
  forward: 12,
  wait: 15,
  turnLeft: 17,
  turnRight: 18,
  turnUp: 19,
  throughOn: 37,
} as const;

/**
 * The character a movement route moves: the event running it, or the player.
 */
const Mover = {
  thisEvent: 0,
  player: -1,
} as const;

/**
 * The fade a transfer plays: to black, as 95% of the shipped transfers do.
 */
const FADE_BLACK = 0;

/**
 * How loud and how high every sound plays, as the shipped transfers play Open1 and Move1.
 */
const SOUND_VOLUME = 90;
const SOUND_PITCH = 100;

/**
 * Builds the empty command every command list ends with.
 * @returns {RmmzEventCommand} The command.
 */
const endOfList = (): RmmzEventCommand =>
{
  return { code: Code.end, indent: 0, parameters: [] };
};

/**
 * Builds a Play SE of a sound, at the volume and pitch the shipped transfers play theirs.
 * @param {string} name The sound's name in {@code audio/se}.
 * @returns {RmmzEventCommand} The command.
 */
const playSound = (name: string): RmmzEventCommand =>
{
  return { code: Code.playSound, indent: 0, parameters: [ { name, volume: SOUND_VOLUME, pitch: SOUND_PITCH, pan: 0 } ] };
};

/**
 * Builds the Play SE for a sound when there is one: nothing for none.
 * @param {string} name The sound's name, or empty for none.
 * @returns {RmmzEventCommand[]} The command, or none.
 */
const soundIfAny = (name: string): RmmzEventCommand[] =>
{
  return name === ''
    ? []
    : [ playSound(name) ];
};

/**
 * Builds a Transfer Player naming its map and tile outright, fading to black.
 * @param {Destination} destination Where it sends the player.
 * @returns {RmmzEventCommand} The command.
 */
const transferTo = (destination: Destination): RmmzEventCommand =>
{
  const { mapId, x, y, facing } = destination;
  return { code: Code.transfer, indent: 0, parameters: [ 0, mapId, x, y, facing, FADE_BLACK ] };
};

/**
 * Builds a Set Movement Route and the lines MZ lists its steps on after it, as MZ writes one: the route's settings before
 * its steps, and a step without parameters written without them.
 * @param {number} mover Whom it moves: this event, or the player.
 * @param {readonly RmmzMoveCommand[]} steps The steps, without the route's end.
 * @param {boolean} skippable Whether the route gives up on a step it cannot take.
 * @returns {RmmzEventCommand[]} The command and its step lines.
 */
const movementRoute = (mover: number, steps: readonly RmmzMoveCommand[], skippable: boolean): RmmzEventCommand[] =>
{
  const route = { repeat: false, skippable, wait: true, list: [ ...steps, { code: Move.end } ] } as unknown as JsonValue;
  const lines = steps.map(step => ({ code: Code.routeStep, indent: 0, parameters: [ step as unknown as JsonValue ] }));
  return [ { code: Code.movementRoute, indent: 0, parameters: [ mover, route ] }, ...lines ];
};

/**
 * Builds a door's opening, played on the door itself and waited on, as every shipped door plays it: turn left, wait,
 * turn right, wait, turn up, then Through on, so the player can walk into the doorway it leaves. A door sheet draws the
 * door a step further open with each turn.
 * @returns {RmmzEventCommand[]} The commands.
 */
const doorOpening = (): RmmzEventCommand[] =>
{
  const wait = { code: Move.wait, parameters: [ 3 ] };
  return movementRoute(Mover.thisEvent, [ { code: Move.turnLeft }, wait, { code: Move.turnRight }, wait, { code: Move.turnUp }, { code: Move.throughOn } ], false);
};

/**
 * Builds the player's step through an opened door, waited on and skipped if blocked, as every shipped door has it.
 * @returns {RmmzEventCommand[]} The commands.
 */
const playerStepsIn = (): RmmzEventCommand[] =>
{
  return movementRoute(Mover.player, [ { code: Move.forward } ], true);
};

/**
 * Builds the comment that spreads an event over a strip of tiles (J-Pixelistics' area tag), as the shipped edges spell it.
 * @param {number} width The strip's width in tiles.
 * @param {number} height Its height in tiles.
 * @returns {RmmzEventCommand} The comment.
 */
const areaComment = (width: number, height: number): RmmzEventCommand =>
{
  return { code: Code.comment, indent: 0, parameters: [ `<areaEvent:[${width}, ${height}]>` ] };
};

/**
 * Builds a page as MZ writes one, in MZ's own key order, so a file holding it reads as one MZ wrote: no conditions, fixed
 * in place, touched by the player, with the picture, priority and command list given.
 * @param {RmmzEventImage} image The picture.
 * @param {number} priorityType Below characters (0) or the same as characters (1).
 * @param {boolean} walkAnime Whether the picture steps while it moves; a door's never does.
 * @param {readonly RmmzEventCommand[]} commands The commands, without the list's end.
 * @returns {RmmzEventPage} The page.
 */
const touchPage = (image: RmmzEventImage, priorityType: number, walkAnime: boolean, commands: readonly RmmzEventCommand[]): RmmzEventPage =>
{
  return {
    conditions: {
      actorId: 1,
      actorValid: false,
      itemId: 1,
      itemValid: false,
      selfSwitchCh: 'A',
      selfSwitchValid: false,
      switch1Id: 1,
      switch1Valid: false,
      switch2Id: 1,
      switch2Valid: false,
      variableId: 1,
      variableValid: false,
      variableValue: 0,
    },
    directionFix: false,
    image,
    list: [ ...commands, endOfList() ],
    moveFrequency: 3,
    moveRoute: { list: [ { code: 0, parameters: [] } ], repeat: true, skippable: false, wait: false },
    moveSpeed: 3,
    moveType: 0,
    priorityType,
    stepAnime: false,
    through: false,
    trigger: 1,
    walkAnime,
  };
};

/**
 * Builds the picture of an event drawn as nothing, in MZ's own key order.
 * @returns {RmmzEventImage} The picture.
 */
const noImage = (): RmmzEventImage =>
{
  return { characterIndex: 0, characterName: '', direction: 2, pattern: 0, tileId: 0 };
};

/**
 * Builds the picture of a door, in MZ's own key order.
 * @param {DoorLook} look The door's sheet, character and closed frame.
 * @returns {RmmzEventImage} The picture.
 */
const doorImage = (look: DoorLook): RmmzEventImage =>
{
  const { characterIndex, characterName, direction, pattern } = look;
  return { characterIndex, characterName, direction, pattern, tileId: 0 };
};

/**
 * Builds an event in MZ's own key order, with its one page.
 * @param {number} id The event's id.
 * @param {string} name Its name.
 * @param {MapCell} cell The tile it stands on.
 * @param {RmmzEventPage} page Its page.
 * @returns {RmmzMapEvent} The event.
 */
const eventOf = (id: number, name: string, cell: MapCell, page: RmmzEventPage): RmmzMapEvent =>
{
  return { id, name, note: '', pages: [ page ], x: cell.x, y: cell.y };
};

/**
 * Names a transfer the way the newer shipped maps do: by the map it leads to.
 * @param {string} mapName The name of the map it leads to.
 * @returns {string} The name.
 */
const transferName = (mapName: string): string =>
{
  return `Transfer (${mapName})`;
};

/**
 * Builds a building's door, as the shipped doors are built: drawn as the door, standing with the characters so the player
 * walks up against it, and touched by the player. Its page plays the door's creak, opens the door, steps the player
 * through, plays the sound of passing through, and sends them in.
 * @param {number} id The event's id.
 * @param {MapCell} cell The door's tile.
 * @param {string} name Its name.
 * @param {DoorLook} look The door's picture.
 * @param {TransferSounds} sounds The creak and the sound of passing through.
 * @param {Destination} destination Where it sends the player.
 * @returns {RmmzMapEvent} The event.
 */
const doorEvent = (id: number, cell: MapCell, name: string, look: DoorLook, sounds: TransferSounds, destination: Destination): RmmzMapEvent =>
{
  const commands = [ ...soundIfAny(sounds.door), ...doorOpening(), ...playerStepsIn(), ...soundIfAny(sounds.movement), transferTo(destination) ];
  return eventOf(id, name, cell, touchPage(doorImage(look), 1, false, commands));
};

/**
 * Builds a building's way out, as the shipped exits are built: drawn as nothing, below the characters, and walked onto by
 * the player. Its page plays the sound of passing through and sends them out.
 * @param {number} id The event's id.
 * @param {MapCell} cell The exit's tile.
 * @param {string} name Its name.
 * @param {string} movementSound The sound of passing through, or empty for none.
 * @param {Destination} destination Where it sends the player.
 * @returns {RmmzMapEvent} The event.
 */
const exitEvent = (id: number, cell: MapCell, name: string, movementSound: string, destination: Destination): RmmzMapEvent =>
{
  return eventOf(id, name, cell, touchPage(noImage(), 0, true, [ ...soundIfAny(movementSound), transferTo(destination) ]));
};

/**
 * Builds a map's edge exit, as the shipped edges are built: one event spread over a strip of tiles by J-Pixelistics' area
 * tag, drawn as nothing, below the characters, and walked onto by the player. Its page carries the area tag first, then
 * the sound of passing through, then the transfer.
 * @param {number} id The event's id.
 * @param {CellRect} strip The strip's tiles; the event stands on its top-left tile.
 * @param {string} name Its name.
 * @param {string} movementSound The sound of passing through, or empty for none.
 * @param {Destination} destination Where it sends the player.
 * @returns {RmmzMapEvent} The event.
 */
const stripEvent = (id: number, strip: CellRect, name: string, movementSound: string, destination: Destination): RmmzMapEvent =>
{
  const commands = [ areaComment(strip.width, strip.height), ...soundIfAny(movementSound), transferTo(destination) ];
  return eventOf(id, name, { x: strip.x, y: strip.y }, touchPage(noImage(), 0, true, commands));
};

export { doorEvent, exitEvent, FADE_BLACK, playSound, stripEvent, transferName, transferTo };
export type { Destination, TransferSounds };
