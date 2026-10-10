import { describe, expect, it, vi } from 'vitest';
import { asRowLinkMessage, openDataEditorRow, RowLinkHost, rowLocation } from '../../../../src/core/infrastructure/shell/RowLink.ts';
import { WindowShell, type OpenBrowserWindow } from '../../../../src/core/infrastructure/shell/WindowShell.ts';
import { MemoryChannelNetwork } from '../../../mapEditor/support/standIns.ts';

/*
 * A battler's open button owes the author its enemy's row in the data editor, as the data editor's own search opens a
 * row: the board's route with the key the board selects the row by. A data editor not open yet opens straight at the row
 * from its address; one already open, which bringing forward never moves, hears the request on the shell channel and goes
 * there. A message that is not a row link's, or names a row no board link could, is ignored.
 */
describe('RowLink', () =>
{
  describe('asRowLinkMessage', () =>
  {
    it('reads a row link\'s message and refuses anything naming a row no board link could', () =>
    {
      // Arrange: the real message, then near misses on each part.
      const messages: unknown[] = [
        { type: 'open-row', path: '/enemies', key: 'enemyId', id: 12 },
        { type: 'open-map', path: '/enemies', key: 'enemyId', id: 12 },
        { type: 'open-row', path: 'enemies', key: 'enemyId', id: 12 },
        { type: 'open-row', path: '/enemies?x=1', key: 'enemyId', id: 12 },
        { type: 'open-row', path: '/enemies', key: 'enemy-id', id: 12 },
        { type: 'open-row', path: '/enemies', key: 'enemyId', id: 0 },
        { type: 'open-row', path: '/enemies', key: 'enemyId', id: 1.5 },
        null,
        'open-row',
      ];

      // Act.
      const read = messages.map(asRowLinkMessage);

      // Assert.
      expect(read)
        .toStrictEqual([ { type: 'open-row', path: '/enemies', key: 'enemyId', id: 12 }, null, null, null, null, null, null, null, null ]);
    });
  });

  describe('openDataEditorRow', () =>
  {
    it('asks an open data editor on the shell channel and opens the data editor at the row', () =>
    {
      // Arrange: a page with no NW.js shell, opening windows itself, and a data editor listening on the channel.
      const network = new MemoryChannelNetwork();
      const target = { location: { href: 'about:blank' }, focus: vi.fn() };
      const openWindow = vi.fn<OpenBrowserWindow>(() => target as unknown as Window);
      const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow });
      const heard: string[] = [];
      const host = new RowLinkHost(network.open('jmz-shell'), location => heard.push(location));
      host.start();

      // Act.
      const result = openDataEditorRow(shell, network.open('jmz-shell'), { path: '/enemies', key: 'enemyId', id: 12 });
      network.flush();

      // Assert.
      expect([ result, openWindow.mock.calls[0][1], target.location.href, heard ])
        .toStrictEqual([ 'opened', 'jmz-data-editor', 'http://127.0.0.1:3000/#/enemies?enemyId=12', [ '/enemies?enemyId=12' ] ]);
    });
  });

  describe('RowLinkHost', () =>
  {
    it('shows each row asked for, hears nothing else, and stops hearing once stopped', () =>
    {
      // Arrange.
      const network = new MemoryChannelNetwork();
      const sender = network.open('jmz-shell');
      const heard: string[] = [];
      const host = new RowLinkHost(network.open('jmz-shell'), location => heard.push(location));
      host.start();

      // Act.
      sender.postMessage({ type: 'open-row', path: '/skills', key: 'skillId', id: 3 });
      sender.postMessage({ type: 'open-map', requestId: 'x', mapId: 3, eventId: null });
      network.flush();
      host.stop();
      sender.postMessage({ type: 'open-row', path: '/enemies', key: 'enemyId', id: 4 });
      network.flush();

      // Assert.
      expect(heard)
        .toStrictEqual([ '/skills?skillId=3' ]);
    });
  });

  describe('rowLocation', () =>
  {
    it('names a row as the data editor\'s own search does', () =>
    {
      // Arrange.

      // Act.
      const location = rowLocation({ path: '/enemies', key: 'enemyId', id: 600 });

      // Assert.
      expect(location)
        .toBe('/enemies?enemyId=600');
    });
  });
});
