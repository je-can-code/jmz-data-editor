import { describe, expect, it } from 'vitest';
import { WindowShell } from '../../../src/core/infrastructure/shell/WindowShell.ts';
import { blueprintMapId } from '../../../src/mapEditor/core/model/documentKeys.ts';
import {
  eventWindowTitle,
  mapEditorPath,
  openCommonEventsWindow,
  openEventWindow,
  openSwitchesVariablesWindow,
  parseMapEditorView,
  titleFor,
} from '../../../src/mapEditor/views/mapEditorViews.ts';
import { MemoryChannelNetwork } from '../support/standIns.ts';

/*
 * Every map editor window is map.html; its query string says whether it is the workspace or one event's editor.
 * The helpers owe the shell a URL that is the same every time for the same event, which is what lets a second
 * double-click on an event focus its window rather than open a twin, and they owe the window a view it can trust:
 * anything incomplete or malformed shows the workspace, never an event window for event NaN.
 */
describe('mapEditorViews', () =>
{
  describe('parseMapEditorView', () =>
  {
    it('reads an event window\'s map and event', () =>
    {
      // Arrange: an event window's query.

      // Act.
      const view = parseMapEditorView('?view=event&map=12&event=5');

      // Assert.
      expect(view)
        .toStrictEqual({ kind: 'event', mapId: 12, eventId: 5 });
    });

    it('reads the common events window', () =>
    {
      // Arrange: its query, beside a near miss.

      // Act.
      const views = [ parseMapEditorView('?view=common-events'), parseMapEditorView('?view=common-event') ];

      // Assert.
      expect(views)
        .toStrictEqual([ { kind: 'common-events' }, { kind: 'workspace' } ]);
    });

    it('reads the switches and variables window', () =>
    {
      // Arrange: its query, beside a near miss.

      // Act.
      const views = [ parseMapEditorView('?view=switches-variables'), parseMapEditorView('?view=switches') ];

      // Assert.
      expect(views)
        .toStrictEqual([ { kind: 'switches-variables' }, { kind: 'workspace' } ]);
    });

    it('shows the workspace for anything incomplete or malformed', () =>
    {
      // Arrange: near misses of an event window's query.
      const searches = [ '', '?view=workspace', '?view=event&map=12', '?view=event&map=0&event=5', '?view=event&map=12&event=5x', '?view=event&map=-1&event=2' ];

      // Act.
      const views = searches.map(parseMapEditorView);

      // Assert.
      expect(views.map(view => view.kind))
        .toStrictEqual([ 'workspace', 'workspace', 'workspace', 'workspace', 'workspace', 'workspace' ]);
    });

    it('reads an event of a blueprint by the blueprint\'s id, as the map id the blueprint takes, and nothing for an id no map id can spell', () =>
    {
      // Arrange: the camp's event 5, beside an id too long and an uppercase one.

      // Act.
      const views = [
        parseMapEditorView('?view=event&blueprint=k3x9q2mf&event=5'),
        parseMapEditorView('?view=event&blueprint=k3x9q2mf123&event=5'),
        parseMapEditorView('?view=event&blueprint=K3X9&event=5'),
      ];

      // Assert.
      expect(views)
        .toStrictEqual([ { kind: 'event', mapId: blueprintMapId('k3x9q2mf'), eventId: 5 }, { kind: 'workspace' }, { kind: 'workspace' } ]);
    });
  });

  describe('mapEditorPath', () =>
  {
    it('builds a path that parses back to the view it came from', () =>
    {
      // Arrange.
      const views = [
        { kind: 'workspace' as const },
        { kind: 'event' as const, mapId: 3, eventId: 44 },
        { kind: 'event' as const, mapId: blueprintMapId('k3x9q2mf'), eventId: 2 },
        { kind: 'common-events' as const },
        { kind: 'switches-variables' as const },
      ];

      // Act.
      const paths = views.map(mapEditorPath);

      // Assert.
      expect([ paths, paths.map(path => parseMapEditorView(path.slice(path.indexOf('?') + 1 || path.length))) ])
        .toStrictEqual([
          [
            '/map.html',
            '/map.html?view=event&map=3&event=44',
            '/map.html?view=event&blueprint=k3x9q2mf&event=2',
            '/map.html?view=common-events',
            '/map.html?view=switches-variables',
          ],
          views,
        ]);
    });
  });

  describe('titleFor', () =>
  {
    it('titles the workspace jmz-map-editor, and an event window after its event', () =>
    {
      // Arrange: both kinds of view, an event of a blueprint among them.

      // Act.
      const titles = [
        titleFor({ kind: 'workspace' }),
        titleFor({ kind: 'event', mapId: 12, eventId: 5 }),
        titleFor({ kind: 'event', mapId: blueprintMapId('k3x9q2mf'), eventId: 2 }),
        titleFor({ kind: 'common-events' }),
        titleFor({ kind: 'switches-variables' }),
      ];

      // Assert.
      expect(titles)
        .toStrictEqual([
          'jmz-map-editor',
          'Event 5 on map 12 - jmz-map-editor',
          'Event 2 of a blueprint - jmz-map-editor',
          'Common events - jmz-map-editor',
          'Switches & Variables - jmz-map-editor',
        ]);
    });
  });

  describe('eventWindowTitle', () =>
  {
    it('titles an event window after its event and its map, once they are known', () =>
    {
      // Arrange: an event and the map it is on.

      // Act.
      const title = eventWindowTitle('Gate Guard', 'Nimbus Gate');

      // Assert.
      expect(title)
        .toBe('Gate Guard - Nimbus Gate - jmz-map-editor');
    });
  });

  describe('openCommonEventsWindow', () =>
  {
    it('asks the shell for the common events window by one URL', () =>
    {
      // Arrange.
      const network = new MemoryChannelNetwork();
      const relay = network.open('jmz-shell');
      const heard: unknown[] = [];
      relay.addEventListener('message', event => heard.push(event.data));
      const shell = new WindowShell({ channel: network.open('jmz-shell'), origin: 'http://127.0.0.1:3000', openWindow: () => null });
      relay.postMessage({ type: 'shell-ready' });
      network.flush();
      heard.length = 0;

      // Act.
      openCommonEventsWindow(shell);
      network.flush();

      // Assert.
      expect(heard.map(message => (message as { url: string }).url))
        .toStrictEqual([ 'http://127.0.0.1:3000/map.html?view=common-events' ]);
    });
  });

  describe('openSwitchesVariablesWindow', () =>
  {
    it('asks the shell for the switches and variables window by one URL, the same however often asked', () =>
    {
      // Arrange.
      const network = new MemoryChannelNetwork();
      const relay = network.open('jmz-shell');
      const heard: unknown[] = [];
      relay.addEventListener('message', event => heard.push(event.data));
      const shell = new WindowShell({ channel: network.open('jmz-shell'), origin: 'http://127.0.0.1:3000', openWindow: () => null });
      relay.postMessage({ type: 'shell-ready' });
      network.flush();
      heard.length = 0;

      // Act: asked from the workspace's button, then from a map's preview chip.
      openSwitchesVariablesWindow(shell);
      openSwitchesVariablesWindow(shell);
      network.flush();

      // Assert.
      expect(heard.map(message => (message as { url: string }).url))
        .toStrictEqual([ 'http://127.0.0.1:3000/map.html?view=switches-variables', 'http://127.0.0.1:3000/map.html?view=switches-variables' ]);
    });
  });

  describe('openEventWindow', () =>
  {
    it('asks the shell for the event\'s window by the same URL every time', () =>
    {
      // Arrange.
      const network = new MemoryChannelNetwork();
      const relay = network.open('jmz-shell');
      const heard: unknown[] = [];
      relay.addEventListener('message', event => heard.push(event.data));
      const shell = new WindowShell({ channel: network.open('jmz-shell'), origin: 'http://127.0.0.1:3000', openWindow: () => null });
      relay.postMessage({ type: 'shell-ready' });
      network.flush();
      heard.length = 0;

      // Act.
      openEventWindow(shell, 12, 5);
      openEventWindow(shell, 12, 5);
      openEventWindow(shell, 12, 6);
      network.flush();

      // Assert.
      expect(heard.map(message => (message as { url: string }).url))
        .toStrictEqual([
          'http://127.0.0.1:3000/map.html?view=event&map=12&event=5',
          'http://127.0.0.1:3000/map.html?view=event&map=12&event=5',
          'http://127.0.0.1:3000/map.html?view=event&map=12&event=6',
        ]);
    });

    it('asks for a window wide enough for a page\'s settings beside its commands', () =>
    {
      // Arrange.
      const network = new MemoryChannelNetwork();
      const relay = network.open('jmz-shell');
      const heard: unknown[] = [];
      relay.addEventListener('message', event => heard.push(event.data));
      const shell = new WindowShell({ channel: network.open('jmz-shell'), origin: 'http://127.0.0.1:3000', openWindow: () => null });
      relay.postMessage({ type: 'shell-ready' });
      network.flush();
      heard.length = 0;

      // Act.
      openEventWindow(shell, 12, 5);
      network.flush();

      // Assert.
      expect(heard.map(message => [ (message as { width: number }).width, (message as { height: number }).height ]))
        .toStrictEqual([ [ 1240, 820 ] ]);
    });

    it('asks for a blueprint\'s event\'s window by the blueprint, its window named apart from any map\'s', () =>
    {
      // Arrange: a page with no shell, which opens windows itself, by name.
      const opened: string[] = [];
      const shell = new WindowShell({ channel: null, origin: 'http://127.0.0.1:3000', openWindow: (_url, name) =>
      {
        opened.push(name);
        return null;
      } });

      // Act.
      openEventWindow(shell, blueprintMapId('k3x9q2mf'), 2);
      openEventWindow(shell, 12, 2);

      // Assert.
      expect(opened)
        .toStrictEqual([ 'jmz-blueprint-event-k3x9q2mf-2', 'jmz-event-12-2' ]);
    });
  });
});
