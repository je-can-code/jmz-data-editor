/**
 * A picture a door is drawn with, from a character sheet: the sheet, which of its characters, and the frame a door shows
 * while it stands closed. A door sheet draws the door closed facing down, and its opening a step further with each turn
 * the door's route makes.
 */
type DoorLook = {
  readonly characterName: string;
  readonly characterIndex: number;
  readonly direction: number;
  readonly pattern: number;
};

/**
 * One picture the project's doors are drawn with, and how many doors use it, as the server counts them across every map.
 */
type DoorSprite = DoorLook & {
  readonly doors: number;
};

/**
 * The picture a door takes in a project none of whose doors the server found: the first door on MZ's own door sheet,
 * which every new project carries.
 */
const MZ_DOOR: DoorLook = { characterName: '!Door1', characterIndex: 0, direction: 2, pattern: 0 };

/**
 * Reads the picture of a counted door sprite, without its count.
 * @param {DoorLook} sprite The sprite.
 * @returns {DoorLook} The picture.
 */
const doorLookOf = (sprite: DoorLook): DoorLook =>
{
  const { characterName, characterIndex, direction, pattern } = sprite;
  return { characterName, characterIndex, direction, pattern };
};

/**
 * Picks the picture a new door starts with: the one the project's doors use most, which the server lists first, or MZ's
 * own door in a project with none.
 * @param {readonly DoorSprite[]} sprites The project's door sprites, the most used first.
 * @returns {DoorLook} The picture.
 */
const defaultDoorLook = (sprites: readonly DoorSprite[]): DoorLook =>
{
  return sprites.length === 0
    ? MZ_DOOR
    : doorLookOf(sprites[0]);
};

/**
 * Reports whether two pictures are the same: the same sheet, character and frame.
 * @param {DoorLook} left One picture.
 * @param {DoorLook} right The other.
 * @returns {boolean} True when they are the same.
 */
const sameDoorLook = (left: DoorLook, right: DoorLook): boolean =>
{
  return left.characterName === right.characterName
    && left.characterIndex === right.characterIndex
    && left.direction === right.direction
    && left.pattern === right.pattern;
};

/**
 * Keys a picture, for a list of choices.
 * @param {DoorLook} look The picture.
 * @returns {string} The key.
 */
const doorLookKey = (look: DoorLook): string =>
{
  return `${look.characterName}#${look.characterIndex}#${look.direction}#${look.pattern}`;
};

/**
 * Names a picture for the author: the sheet without the marks MZ reads in its name, and which of its characters, counted
 * from 1 as the sheet is read left to right and top to bottom.
 * @param {DoorLook} look The picture.
 * @returns {string} The name.
 */
const doorLookName = (look: DoorLook): string =>
{
  const sheet = look.characterName.replace(/^[!$]+/u, '');
  return look.characterName.includes('$')
    ? sheet
    : `${sheet} ${look.characterIndex + 1}`;
};

/**
 * Lists the pictures to offer for a door: the project's, the most used first, and the one chosen when the project's doors
 * do not use it, ahead of them, so a choice is never dropped from its own list.
 * @param {readonly DoorSprite[]} sprites The project's door sprites, the most used first.
 * @param {DoorLook} chosen The picture chosen now.
 * @returns {DoorSprite[]} The pictures, each with how many doors use it.
 */
const doorLookChoices = (sprites: readonly DoorSprite[], chosen: DoorLook): DoorSprite[] =>
{
  return sprites.some(sprite => sameDoorLook(sprite, chosen))
    ? [ ...sprites ]
    : [ { ...doorLookOf(chosen), doors: 0 }, ...sprites ];
};

export { defaultDoorLook, doorLookChoices, doorLookKey, doorLookName, doorLookOf, MZ_DOOR, sameDoorLook };
export type { DoorLook, DoorSprite };
