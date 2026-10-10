import { describe, expect, it, vi } from 'vitest';
import type { EnemyRow, MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { EnemyBook, enemyBookOf, enemyLabel, enemyOptions, isSeparator, REFRESH_GAP_MS } from '../../../../src/mapEditor/modules/jabs/enemyBook.ts';

/*
 * The battler panels read the enemies from Enemies.json on disk, once per window and again when the window comes back
 * into focus, as when the author returns from saving an enemy in the data editor, but never more often than a moment
 * apart, and never two reads at once. A read that fails leaves the enemies as they were. The pickers offer every enemy by
 * name but the database's separator rows (a name empty, or starting with two equals signs), as the data editor's own
 * pickers leave them out, while an enemy a picked battler already fights as is offered whatever its row holds.
 */
describe('enemyBook', () =>
{
  /**
   * Waits for the reads under way to land.
   * @returns {Promise<void>} Settles once they have.
   */
  const settle = (): Promise<void> => new Promise(resolve =>
  {
    setTimeout(resolve, 0);
  });

  /**
   * The enemies a project holds.
   */
  const ROWS: (EnemyRow | null)[] = [ null, { id: 1, name: 'Slime', note: '<sight:3>' }, { id: 2, name: '=== CAVE', note: '' }, { id: 3, name: '', note: '' }, { id: 4, name: 'Bat', note: '' } ];

  describe('EnemyBook', () =>
  {
    it('reads the enemies once however often it is asked, keeping each row\'s id, name and note', async () =>
    {
      // Arrange.
      const load = vi.fn(async () => ROWS);
      const book = new EnemyBook(load);
      const heard = vi.fn();
      book.subscribe(heard);

      // Act.
      book.read();
      book.read();
      await settle();
      book.read();

      // Assert.
      expect([ load.mock.calls.length, heard.mock.calls.length, book.getSnapshot()[1], book.getSnapshot()[0] ])
        .toStrictEqual([ 1, 1, { id: 1, name: 'Slime', note: '<sight:3>' }, null ]);
    });

    it('reads again on a refresh a moment after the last read, and not before', async () =>
    {
      // Arrange.
      const load = vi.fn(async () => ROWS);
      const book = new EnemyBook(load);
      book.read();
      await settle();
      const now = Date.now();

      // Act.
      book.refresh(now);
      book.refresh(now + REFRESH_GAP_MS);
      await settle();

      // Assert: the first came too soon after the read.
      expect(load.mock.calls.length)
        .toBe(2);
    });

    it('keeps the enemies as they were when a read fails', async () =>
    {
      // Arrange: a read that lands, then one that fails.
      const load = vi.fn<() => Promise<(EnemyRow | null)[]>>()
        .mockResolvedValueOnce(ROWS)
        .mockRejectedValueOnce(new Error('gone'));
      const book = new EnemyBook(load);
      book.read();
      await settle();
      const before = book.getSnapshot();

      // Act.
      book.refresh(Date.now() + REFRESH_GAP_MS);
      await settle();

      // Assert.
      expect([ load.mock.calls.length, book.getSnapshot() === before ])
        .toStrictEqual([ 2, true ]);
    });
  });

  describe('enemyBookOf', () =>
  {
    it('keeps one book for each server, and none for a server that cannot read the enemies', () =>
    {
      // Arrange.
      const reading = { loadEnemies: async () => ROWS } as unknown as MapEditorApi;
      const blind = {} as MapEditorApi;

      // Act.
      const books = [ enemyBookOf(reading), enemyBookOf(reading), enemyBookOf(blind) ];

      // Assert.
      expect([ books[0] === books[1], books[0] !== null, books[2] ])
        .toStrictEqual([ true, true, null ]);
    });
  });

  describe('enemyOptions', () =>
  {
    it('offers every enemy by name in id order but the separators, and any enemy kept whatever its row holds', () =>
    {
      // Arrange: enemy 2, a separator, kept as a battler fights as it; enemy 9, which the database lacks, kept too.
      const enemies = ROWS.map(row => (row === null ? null : { ...row }));

      // Act.
      const plain = enemyOptions(enemies);
      const kept = enemyOptions(enemies, [ 2, 9 ]);

      // Assert.
      expect([ plain, kept ])
        .toStrictEqual([
          [ { id: 1, label: '0001 Slime' }, { id: 4, label: '0004 Bat' } ],
          [ { id: 1, label: '0001 Slime' }, { id: 2, label: '0002 === CAVE' }, { id: 4, label: '0004 Bat' }, { id: 9, label: '0009 (no such enemy)' } ],
        ]);
    });
  });

  describe('isSeparator', () =>
  {
    it('takes a name empty or starting with two equals signs for a separator, and nothing else', () =>
    {
      // Arrange: one equals sign is a name like any other.
      const names = [ '', '   ', '==', '=== OPEN', '=Odd', 'Slime' ];

      // Act.
      const separators = names.map(name => isSeparator({ id: 1, name, note: '' }));

      // Assert.
      expect(separators)
        .toStrictEqual([ true, true, true, true, false, false ]);
    });
  });

  describe('enemyLabel', () =>
  {
    it('pads the id as MZ does and names an enemy the database lacks as missing', () =>
    {
      // Arrange.

      // Act.
      const labels = [ enemyLabel(12, { id: 12, name: 'Cave Bat', note: '' }), enemyLabel(12345, null) ];

      // Assert.
      expect(labels)
        .toStrictEqual([ '0012 Cave Bat', '12345 (no such enemy)' ]);
    });
  });
});
