/**
 * The shape of `data/config.omni.json`, the Omnipedia's configuration, and the decisions the board makes about what
 * gets written.
 *
 * Today the file holds the Monsterpedia's pages. Each page lists one kind of entry, which an enemy names on its own row:
 * the ordinary monsters on one page, the crates and trees and ore on another. A page is a key, the name shown above
 * the list while it is open, an icon, and whether its entries show their stats. Their order is the order the game
 * flips between them, and the first is the page the Monsterpedia opens on, so moving a page is as much an edit as
 * renaming one.
 */

/**
 * One page of the Monsterpedia: the key enemies name it by, the name it shows, its icon, and whether its entries show
 * their stats.
 */
type MonsterTypeDefinition = {
  key: string;
  name: string;
  iconIndex: number;
  showsStats: boolean;
};

/**
 * The whole file: the Monsterpedia's pages, in the order the game flips between them.
 */
type OmniConfigRoot = {
  monsterTypes: MonsterTypeDefinition[];
};

/**
 * The key a new page starts from, before it is told apart from any page already using it.
 */
const NEW_MONSTER_TYPE_KEY = 'newType';

/**
 * Fills out one page so every field is present in memory.
 *
 * A page that never said whether its entries show their stats leaves them out, because that is how the game reads it:
 * J-OMNI-Monsters shows stats only on a page that says it does.
 * @param {unknown} source One authored page.
 * @param {number} index Its position in the file, used to key a page that has no key.
 * @returns {MonsterTypeDefinition} A fully populated page.
 */
const hydrateMonsterType = (source: unknown, index: number): MonsterTypeDefinition =>
{
  const authored = (source ?? {}) as Partial<MonsterTypeDefinition>;

  return {
    key: String(authored.key ?? `type_${String(index)}`),
    name: String(authored.name ?? ''),
    iconIndex: Number(authored.iconIndex ?? 0),
    showsStats: Boolean(authored.showsStats ?? false),
  };
};

/**
 * Fills out the whole file, so the board never has to ask whether a field was written.
 * @param {unknown} source The parsed contents of the configuration file.
 * @returns {OmniConfigRoot} Every page, fully populated.
 */
const hydrateOmniConfig = (source: unknown): OmniConfigRoot =>
{
  const authored = (source ?? {}) as Partial<{ monsterTypes: unknown }>;

  if (!Array.isArray(authored.monsterTypes))
  {
    return { monsterTypes: [] };
  }

  return { monsterTypes: authored.monsterTypes.map(hydrateMonsterType) };
};

/**
 * A new, empty page whose key no existing page uses, so adding one can never take over a page enemies already name.
 * @param {MonsterTypeDefinition[]} monsterTypes The pages already in the file.
 * @returns {MonsterTypeDefinition} The new page.
 */
const createMonsterType = (monsterTypes: MonsterTypeDefinition[]): MonsterTypeDefinition =>
{
  // every key already taken.
  const taken = new Set(monsterTypes.map(monsterType => monsterType.key));

  // the plain key when it is free, or else the first numbered one that is.
  let key = NEW_MONSTER_TYPE_KEY;
  let suffix = 2;
  while (taken.has(key))
  {
    key = `${NEW_MONSTER_TYPE_KEY}${String(suffix)}`;
    suffix += 1;
  }

  return {
    key,
    name: '',
    iconIndex: 0,
    showsStats: true,
  };
};

/**
 * Moves one page a step earlier or later in the order the game flips between them.
 *
 * A page already at the end it is moving toward stays where it is; there is no wrapping, since the first page is also
 * the one the Monsterpedia opens on, and a page should only become that on purpose.
 * @param {MonsterTypeDefinition[]} monsterTypes The pages, in their current order.
 * @param {number} index The position of the page being moved.
 * @param {number} step -1 to move it earlier, 1 to move it later.
 * @returns {MonsterTypeDefinition[]} The pages in their new order.
 */
const moveMonsterType = (monsterTypes: MonsterTypeDefinition[], index: number, step: number): MonsterTypeDefinition[] =>
{
  const destination = index + step;

  // a page cannot move past either end.
  if (destination < 0 || destination >= monsterTypes.length)
  {
    return monsterTypes;
  }

  // swap the page with its neighbor on that side.
  const reordered = [ ...monsterTypes ];
  [ reordered[ index ], reordered[ destination ] ] = [ reordered[ destination ], reordered[ index ] ];

  return reordered;
};

export {
  createMonsterType,
  hydrateMonsterType,
  hydrateOmniConfig,
  moveMonsterType,
  NEW_MONSTER_TYPE_KEY,
};
export type {
  MonsterTypeDefinition,
  OmniConfigRoot,
};
