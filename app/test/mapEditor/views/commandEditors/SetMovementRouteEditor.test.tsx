/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { CommandWhereabouts } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { BUILT_IN_ENTRIES } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import type { CommandCatalogEntry } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { RouteSetting } from '../../../../src/mapEditor/core/moveRoutes/routeStart.ts';
import { SetMovementRouteEditor } from '../../../../src/mapEditor/views/commandEditors/SetMovementRouteEditor.tsx';
import type { RoutePreviewProps } from '../../../../src/mapEditor/views/moveRoute/RoutePreview.tsx';

/**
 * Where the stand-in preview was last told the route runs.
 */
const stand = vi.hoisted(() => ({
  setting: null as RouteSetting | null,
}));

// the preview is proved in its own tests; here it only notes where it was told the route runs.
vi.mock('../../../../src/mapEditor/views/moveRoute/RoutePreview.tsx', () => ({
  RoutePreview: (props: RoutePreviewProps) =>
  {
    stand.setting = props.setting;
    return null;
  },
}));

/*
 * Set Movement Route shows its route where it runs. On an event page that is the page's own map, the walker starting
 * where the commands before it on the page leave it; a common event runs wherever it is called from, so its route is
 * shown on a map the author picks, with nothing before it placing the walker; and an editor shown outside any list has
 * no map to show at all. Whoever moves is whoever the command names.
 */
describe('SetMovementRouteEditor', () =>
{
  /**
   * A wait, the command before the route.
   */
  const WAIT: RmmzEventCommand = { code: 230, indent: 0, parameters: [ 30 ] };

  /**
   * Renders the editor for a route with no steps, for a walker, where it sits.
   * @param {number} characterId Who moves.
   * @param {CommandWhereabouts | undefined} whereabouts Where the command sits, or nowhere.
   */
  const renderEditor = (characterId: number, whereabouts: CommandWhereabouts | undefined) =>
  {
    stand.setting = null;
    const entry = BUILT_IN_ENTRIES.find(each => each.code === 205) as CommandCatalogEntry;
    const command: RmmzEventCommand = {
      code: 205,
      indent: 0,
      parameters: [ characterId, { list: [ { code: 0 } ], repeat: false, skippable: false, wait: true } ] as JsonValue[],
    };
    render(<SetMovementRouteEditor entry={entry} command={command} continuation={[]} onChange={vi.fn()} whereabouts={whereabouts}/>);
  };

  it('shows a page\'s route on the page\'s own map, after the commands before it, for whoever the command names', () =>
  {
    // Arrange: event 3's first page on map 7, the player walking.
    const whereabouts: CommandWhereabouts = { documentKey: 'map:7', listPath: [ 'events', 3, 'pages', 0, 'list' ], before: [ WAIT ] };

    // Act.
    renderEditor(-1, whereabouts);

    // Assert: and no map to pick.
    expect([ stand.setting, screen.queryByLabelText('Show it on') ])
      .toStrictEqual([ { mapId: 7, page: { eventId: 3, pageIndex: 0 }, before: [ WAIT ], characterId: -1 }, null ]);
  });

  it('shows a common event\'s route on the map the author picks, with nothing before it placing the walker', () =>
  {
    // Arrange: common event 4.
    const whereabouts: CommandWhereabouts = { documentKey: 'common-events', listPath: [ 4, 'list' ], before: [ WAIT ] };
    renderEditor(0, whereabouts);
    const first = stand.setting;

    // Act.
    fireEvent.change(screen.getByLabelText('Show it on'), { target: { value: '5' } });

    // Assert.
    expect([ first, stand.setting ])
      .toStrictEqual([
        { mapId: 1, page: null, before: [], characterId: 0 },
        { mapId: 5, page: null, before: [], characterId: 0 },
      ]);
  });

  it('changes who moves, rewriting the command with the route as it was', () =>
  {
    // Arrange: this event walks a route with no steps.
    stand.setting = null;
    const entry = BUILT_IN_ENTRIES.find(each => each.code === 205) as CommandCatalogEntry;
    const route = { list: [ { code: 0 } ], repeat: false, skippable: false, wait: true };
    const onChange = vi.fn();
    render(<SetMovementRouteEditor entry={entry} command={{ code: 205, indent: 0, parameters: [ 0, route ] }} continuation={[]} onChange={onChange}/>);

    // Act.
    fireEvent.mouseDown(screen.getByLabelText('Who moves'));
    fireEvent.click(screen.getByRole('option', { name: 'Player' }));

    // Assert.
    expect(onChange.mock.calls)
      .toStrictEqual([ [ { code: 205, indent: 0, parameters: [ -1, route ] }, [] ] ]);
  });

  it('shows a command it cannot read as it stands, with no route to edit', () =>
  {
    // Arrange: a Set Movement Route whose route is not MZ-shaped.
    stand.setting = null;
    const entry = BUILT_IN_ENTRIES.find(each => each.code === 205) as CommandCatalogEntry;

    // Act.
    render(<SetMovementRouteEditor entry={entry} command={{ code: 205, indent: 0, parameters: [ 0, { list: [] } ] }} continuation={[]} onChange={vi.fn()}/>);

    // Assert.
    expect([ screen.queryByRole('button', { name: 'Move Down' }), stand.setting ])
      .toStrictEqual([ null, null ]);
  });

  it('shows no map for an editor outside any list', () =>
  {
    // Arrange: nothing beyond an editor shown on its own.

    // Act.
    renderEditor(0, undefined);

    // Assert: the route edits all the same.
    expect([ stand.setting, screen.getByRole('button', { name: 'Move Down' }) !== null ])
      .toStrictEqual([ null, true ]);
  });
});
