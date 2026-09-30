import type { CommandFieldKind } from '../commands/catalogTypes.ts';
import type { NameLookup } from '../commands/sentence.ts';

/**
 * The names a project gives its switches, variables and database rows, each list indexed by id with an empty
 * name where there is no row: what {@code GET /api/database-names} answers.
 */
type DatabaseNamesJson = {
  readonly switches: readonly string[];
  readonly variables: readonly string[];
  readonly actors: readonly string[];
  readonly classes: readonly string[];
  readonly skills: readonly string[];
  readonly items: readonly string[];
  readonly weapons: readonly string[];
  readonly armors: readonly string[];
  readonly enemies: readonly string[];
  readonly troops: readonly string[];
  readonly states: readonly string[];
  readonly animations: readonly string[];
  readonly tilesets: readonly string[];
  readonly commonEvents: readonly string[];
  readonly maps: readonly string[];
  readonly equipTypes: readonly string[];
};

/**
 * Which list names each kind of id a field can hold.
 */
const LIST_BY_KIND: Readonly<Partial<Record<CommandFieldKind, keyof DatabaseNamesJson>>> = {
  'switch': 'switches',
  'variable': 'variables',
  'actor': 'actors',
  'class': 'classes',
  'skill': 'skills',
  'item': 'items',
  'weapon': 'weapons',
  'armor': 'armors',
  'enemy': 'enemies',
  'troop': 'troops',
  'state': 'states',
  'animation': 'animations',
  'tileset': 'tilesets',
  'common-event': 'commonEvents',
  'map': 'maps',
};

/**
 * One row a picker offers: an id and its name.
 */
type NamedRow = {
  readonly id: number;
  readonly name: string;
};

/**
 * Builds the lookup sentences name rows with.
 * @param {DatabaseNamesJson | null} names The project's names, or null before they arrive, when ids read as numbers.
 * @returns {NameLookup} The lookup.
 */
const nameLookup = (names: DatabaseNamesJson | null): NameLookup =>
{
  return (kind, id) =>
  {
    const list = LIST_BY_KIND[kind];
    if (names === null || list === undefined)
    {
      return null;
    }

    return names[list][id] ?? null;
  };
};

/**
 * Lists the rows a picker for a kind of id offers: every id from 1 that has a row, with its name.
 * @param {DatabaseNamesJson | null} names The project's names, or null before they arrive.
 * @param {CommandFieldKind} kind The kind of id.
 * @returns {NamedRow[]} The rows; empty for a kind no list names, or before the names arrive.
 */
const namedRows = (names: DatabaseNamesJson | null, kind: CommandFieldKind): NamedRow[] =>
{
  const list = LIST_BY_KIND[kind];
  if (names === null || list === undefined)
  {
    return [];
  }

  return names[list]
    .map((name, id) => ({ id, name }))
    .filter(row => row.id > 0);
};

/**
 * Reports whether a kind of field holds an id that a database list names.
 * @param {CommandFieldKind} kind The kind.
 * @returns {boolean} True for switches, variables and every database row kind.
 */
const isNamedKind = (kind: CommandFieldKind): boolean =>
{
  return LIST_BY_KIND[kind] !== undefined;
};

export { isNamedKind, nameLookup, namedRows };
export type { DatabaseNamesJson, NamedRow };
