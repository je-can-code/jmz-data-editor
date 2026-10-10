import { useEffect, useSyncExternalStore } from 'react';
import type { EnemyRow, MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { EnemyRecord } from './battlerReading.ts';

/**
 * One enemy the battler pickers offer: its id and its name.
 */
type EnemyOption = {
  readonly id: number;
  readonly label: string;
};

/**
 * How long after one read of the enemies a window coming back into focus reads them again, so switching back from the
 * data editor shows what was saved there without reading the file on every click.
 */
const REFRESH_GAP_MS = 1_000;

/**
 * No enemies, for a window with no server, or before the first read lands.
 */
const NO_ENEMIES: readonly (EnemyRecord | null)[] = [];

/**
 * The enemies one window reads, from Enemies.json on disk: read once something first needs them, and again whenever the
 * window comes back into focus, as when the author returns from saving an enemy in the data editor. A read that fails
 * leaves the enemies as they were, which before the first read is none.
 */
class EnemyBook
{
  #load: () => Promise<(EnemyRow | null)[]>;

  #rows: readonly (EnemyRecord | null)[] = NO_ENEMIES;

  #read = false;

  #reading = false;

  #readAt = 0;

  #listeners = new Set<() => void>();

  /**
   * @param {() => Promise<(EnemyRow | null)[]>} load Reads Enemies.json.
   */
  constructor(load: () => Promise<(EnemyRow | null)[]>)
  {
    this.#load = load;
  }

  /**
   * The enemies as last read, by id, with an empty slot where the database has no row; none before the first read.
   * @returns {readonly (EnemyRecord | null)[]} The enemies; replaced, never changed, whenever a read lands.
   */
  getSnapshot = (): readonly (EnemyRecord | null)[] =>
  {
    return this.#rows;
  };

  /**
   * Listens for each read landing.
   * @param {() => void} listener Called after each.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: () => void): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Reads the enemies, unless they have been read already or are being read.
   */
  read(): void
  {
    if (this.#read === false)
    {
      this.#readNow();
    }
  }

  /**
   * Reads the enemies again, unless a read is under way or one landed a moment ago.
   * @param {number} now The time, in milliseconds.
   */
  refresh(now: number): void
  {
    if (now - this.#readAt >= REFRESH_GAP_MS)
    {
      this.#readNow();
    }
  }

  /**
   * Reads the enemies now, unless a read is already under way, keeping what lands and telling whoever listens.
   */
  #readNow(): void
  {
    if (this.#reading)
    {
      return;
    }

    this.#read = true;
    this.#reading = true;
    this.#load()
      .then(rows =>
      {
        // a row that is not an enemy, such as the null MZ keeps at index 0, holds no slot of its own.
        this.#rows = rows.map(row => (row === null ? null : { id: row.id, name: row.name, note: row.note }));
        this.#listeners.forEach(listener => listener());
      })
      .catch(() => undefined)
      .finally(() =>
      {
        this.#reading = false;
        this.#readAt = Date.now();
      });
  }
}

/**
 * Every server's enemies, one book per window however many panels read them.
 */
const booksByServer = new WeakMap<MapEditorApi, EnemyBook>();

/**
 * Finds a server's enemy book, made the first time anything asks, which reads nothing yet.
 * @param {MapEditorApi} api The server.
 * @returns {EnemyBook | null} The book, or null for a server that cannot read the enemies.
 */
const enemyBookOf = (api: MapEditorApi): EnemyBook | null =>
{
  const known = booksByServer.get(api);
  if (known !== undefined)
  {
    return known;
  }

  const load = api.loadEnemies;
  if (load === undefined)
  {
    return null;
  }

  const book = new EnemyBook(() => load.call(api));
  booksByServer.set(api, book);
  return book;
};

/**
 * Hears nothing, for a window that cannot read the enemies.
 * @returns {() => void} Stops hearing nothing.
 */
const hearNothing = (): (() => void) => () => undefined;

/**
 * Reads the enemies a window's battler panels show: read the first time a panel needs them, and again each time the
 * window comes back into focus.
 * @param {MapEditorApi | null} api The server, or null without one.
 * @returns {readonly (EnemyRecord | null)[]} The enemies by id; none until they arrive.
 */
const useEnemies = (api: MapEditorApi | null): readonly (EnemyRecord | null)[] =>
{
  const book = api === null ? null : enemyBookOf(api);
  useEffect(() =>
  {
    if (book === null)
    {
      return undefined;
    }

    book.read();
    const onFocus = () => book.refresh(Date.now());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [ book ]);

  return useSyncExternalStore(book === null ? hearNothing : book.subscribe, book === null ? () => NO_ENEMIES : book.getSnapshot);
};

/**
 * Reports whether an enemy row is one of the database's separators, a row named to head a group of enemies rather than
 * an enemy, which the data editor's pickers leave out too: one named with nothing, or starting with two equals signs.
 * @param {EnemyRecord} enemy The row.
 * @returns {boolean} True for a separator.
 */
const isSeparator = (enemy: EnemyRecord): boolean =>
{
  return enemy.name.trim() === '' || enemy.name.startsWith('==');
};

/**
 * Names an enemy as a picker lists it: its id, padded the way MZ pads them, then its name.
 * @param {number} id The enemy's id.
 * @param {EnemyRecord | null} enemy Its row, or null when the database has none by that id.
 * @returns {string} Such as "0012 Cave Bat", or "0012 (no such enemy)".
 */
const enemyLabel = (id: number, enemy: EnemyRecord | null): string =>
{
  const name = enemy === null ? '(no such enemy)' : enemy.name;
  return `${String(id).padStart(4, '0')} ${name}`;
};

/**
 * Lists the enemies a battler picker offers, by name, in id order: every row but the separators. An enemy a battler
 * already names is offered whatever its row holds, so the picker never shows a battler's own enemy as missing.
 * @param {readonly (EnemyRecord | null)[]} enemies The enemies, by id.
 * @param {readonly number[]} kept Enemies to offer whatever their rows hold, such as those the picked battlers name.
 * @returns {EnemyOption[]} The options.
 */
const enemyOptions = (enemies: readonly (EnemyRecord | null)[], kept: readonly number[] = []): EnemyOption[] =>
{
  const offered = enemies.flatMap(enemy => (enemy === null || (isSeparator(enemy) && kept.includes(enemy.id) === false) ? [] : [ enemy ]));
  const listed = offered.map(enemy => ({ id: enemy.id, label: enemyLabel(enemy.id, enemy) }));
  const missing = kept.filter(id => offered.some(enemy => enemy.id === id) === false).map(id => ({ id, label: enemyLabel(id, null) }));
  return [ ...listed, ...missing ].sort((left, right) => left.id - right.id);
};

export { EnemyBook, enemyBookOf, enemyLabel, enemyOptions, isSeparator, REFRESH_GAP_MS, useEnemies };
export type { EnemyOption };
