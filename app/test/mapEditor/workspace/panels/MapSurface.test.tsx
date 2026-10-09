/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { IDockviewPanelProps } from 'dockview-react';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { MapSurface } from '../../../../src/mapEditor/workspace/panels/MapSurface.tsx';
import { withWindowScope } from '../../../../src/mapEditor/workspace/windowScope.tsx';
import { buildMapJson } from '../../support/fixtures.ts';

/**
 * Every map view the surface mounted, in order: which map it was asked for, each event it was handed to pick out,
 * whether it was on screen each time that changed, and whether it has been taken down since.
 */
const views = vi.hoisted(() => ({
  lives: [] as { mapId: number; picks: (number | null)[]; shown: boolean[]; unmounted: boolean }[],
  requests: [] as number[],
  looks: [] as string[],
}));

// the map view draws on the GPU, which a test page has none of; what the surface owes is which views it mounts, for
// which map, in which window, with which event picked out and whether on screen, so each view's life is recorded.
vi.mock('../../../../src/mapEditor/render/MapView.tsx', async () =>
{
  const { useEffect, useState } = await import('react');

  /**
   * Stands in for the map view, recording its life, and every ask to pick out an event or centre on a cell it is handed.
   * @param {object} props The map, the event to pick out and the ask that named it, the cell to centre on and the ask
   * that named it, and whether the view is on screen.
   * @returns {React.JSX.Element} A line naming the map.
   */
  const MapView = (props: {
    mapId: number;
    pickedEventId?: number | null;
    pickRequest?: number;
    lookAtCell?: { x: number; y: number } | null;
    lookRequest?: number;
    visible?: boolean;
  }) =>
  {
    const { mapId, pickedEventId = null, pickRequest = 0, lookAtCell = null, lookRequest = 0, visible = true } = props;

    useEffect(() =>
    {
      views.looks.push(lookAtCell === null ? 'none' : `${lookAtCell.x},${lookAtCell.y} #${lookRequest}`);
    }, [ lookAtCell, lookRequest ]);
    const [ life ] = useState(() => ({ mapId, picks: [] as (number | null)[], shown: [] as boolean[], unmounted: false }));

    useEffect(() =>
    {
      views.lives.push(life);
      return () =>
      {
        life.unmounted = true;
      };
    }, [ life ]);

    useEffect(() =>
    {
      life.picks.push(pickedEventId);
    }, [ life, pickedEventId ]);

    useEffect(() =>
    {
      views.requests.push(pickRequest);
    }, [ pickRequest ]);

    useEffect(() =>
    {
      life.shown.push(visible);
    }, [ life, visible ]);

    return <div data-testid={'map-view'}>{`Map ${mapId}`}</div>;
  };

  return { MapView };
});

/*
 * The map surface is where the real renderer, the map view, plugs into a map panel. It owes the panel one view of the
 * panel's map, handed the event to pick out, and it owes that view a window of its own: a view's canvas, GPU context,
 * size and frames all come from the window it was mounted in, so tearing the panel out, or putting it back, takes the
 * old view down and mounts a fresh one in the window the panel now lives in. The same goes for the panel's map coming
 * back as a new document. A newly picked event, on the other hand, goes to the view already there, which must not
 * start again for it, or the map would reload and lose its place. So does the panel going behind another tab and
 * coming back: the view hears it, to let its GPU context go and take it back, and keeps everything else, its camera
 * included, which a fresh view would lose.
 */
describe('MapSurface', () =>
{
  beforeEach(() =>
  {
    views.lives.splice(0);
    views.requests.splice(0);
    views.looks.splice(0);
  });

  /**
   * The surface inside a panel scoped to its window, the way the workspace mounts it.
   */
  const ScopedSurface = withWindowScope((props: IDockviewPanelProps) =>
  {
    const { document, focusEventId, focusRequest, focusCell, focusCellRequest, visible } = props.params as {
      document: MapDocument;
      focusEventId: number | null;
      focusRequest?: number;
      focusCell?: { x: number; y: number } | null;
      focusCellRequest?: number;
      visible: boolean;
    };
    return (
      <MapSurface
        document={document}
        focusEventId={focusEventId}
        focusRequest={focusRequest}
        focusCell={focusCell}
        focusCellRequest={focusCellRequest}
        visible={visible}
      />
    );
  });

  /**
   * Builds a stand-in for a dock panel's api that can be moved from one window to another, as tearing it out does.
   * @returns {object} The api, and a way to move the panel to another window.
   */
  const buildPanel = () =>
  {
    let current: Window = window;
    const listeners = new Set<() => void>();
    const api = {
      getWindow: () => current,
      onDidLocationChange: (listener: () => void) =>
      {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
    } as unknown as IDockviewPanelProps['api'];

    /**
     * Moves the panel to another window and says so, as dockview does once a torn-out window is wired up.
     * @param {Window} next The window.
     */
    const moveTo = (next: Window) =>
    {
      current = next;
      listeners.forEach(listener => listener());
    };

    return { api, moveTo };
  };

  /**
   * Opens a second window on the test page, standing in for a torn-out panel's window.
   * @returns {Window} The window.
   */
  const openSecondWindow = (): Window =>
  {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentWindow as Window;
  };

  /**
   * Builds the panel's props for a map, an event to pick out, and whether the panel is on screen.
   * @param {IDockviewPanelProps['api']} api The panel's api.
   * @param {MapDocument} map The map.
   * @param {number | null} focusEventId The event to pick out.
   * @param {boolean} visible Whether the panel is on screen.
   * @returns {IDockviewPanelProps} The props.
   */
  const panelProps = (api: IDockviewPanelProps['api'], map: MapDocument, focusEventId: number | null, visible = true): IDockviewPanelProps =>
  {
    return { api, containerApi: {}, params: { document: map, focusEventId, visible } } as unknown as IDockviewPanelProps;
  };

  it('mounts one map view of the panel\'s map, handing it the event to pick out', () =>
  {
    // Arrange.
    const { api } = buildPanel();
    const map = MapDocument.fromJson('map:5', buildMapJson());

    // Act.
    render(<ScopedSurface {...panelProps(api, map, 3)}/>);

    // Assert.
    expect(views.lives)
      .toStrictEqual([ { mapId: 5, picks: [ 3 ], shown: [ true ], unmounted: false } ]);
  });

  it('hands its view the cell to centre on and each new ask for it, centring on nothing unless asked, without mounting another', () =>
  {
    // Arrange: no cell asked for at first.
    const { api } = buildPanel();
    const map = MapDocument.fromJson('map:5', buildMapJson());
    const props = panelProps(api, map, null);
    const { rerender } = render(<ScopedSurface {...props}/>);
    const cell = { x: 4, y: 7 };

    // Act: the middle of a placement asked for, then asked for again.
    rerender(<ScopedSurface {...{ ...props, params: { ...props.params, focusCell: cell, focusCellRequest: 1 } }}/>);
    rerender(<ScopedSurface {...{ ...props, params: { ...props.params, focusCell: cell, focusCellRequest: 2 } }}/>);

    // Assert.
    expect([ views.looks, views.lives.length ])
      .toStrictEqual([ [ 'none', '4,7 #1', '4,7 #2' ], 1 ]);
  });

  it('tells its view when the panel goes behind another tab and comes back, without mounting another', () =>
  {
    // Arrange: the panel opens behind another tab, as the layout restores it.
    const { api } = buildPanel();
    const map = MapDocument.fromJson('map:5', buildMapJson());
    const { rerender } = render(<ScopedSurface {...panelProps(api, map, null, false)}/>);

    // Act.
    rerender(<ScopedSurface {...panelProps(api, map, null, true)}/>);
    rerender(<ScopedSurface {...panelProps(api, map, null, false)}/>);

    // Assert.
    expect(views.lives)
      .toStrictEqual([ { mapId: 5, picks: [ null ], shown: [ false, true, false ], unmounted: false } ]);
  });

  it('takes its view down and mounts a fresh one when the panel is torn out, and again when it comes back', () =>
  {
    // Arrange.
    const { api, moveTo } = buildPanel();
    const map = MapDocument.fromJson('map:5', buildMapJson());
    render(<ScopedSurface {...panelProps(api, map, null)}/>);
    const popout = openSecondWindow();

    // Act.
    act(() => moveTo(popout));
    const afterTearOut = views.lives.map(life => life.unmounted);
    act(() => moveTo(window));

    // Assert.
    expect([ afterTearOut, views.lives.map(life => life.unmounted), views.lives.map(life => life.mapId) ])
      .toStrictEqual([ [ true, false ], [ true, true, false ], [ 5, 5, 5 ] ]);
  });

  it('hands a newly picked event to the view it has, without mounting another', () =>
  {
    // Arrange: the same window and the same document throughout, so only the pick changes.
    const { api } = buildPanel();
    const map = MapDocument.fromJson('map:5', buildMapJson());
    const { rerender } = render(<ScopedSurface {...panelProps(api, map, 3)}/>);

    // Act.
    rerender(<ScopedSurface {...panelProps(api, map, 1)}/>);

    // Assert.
    expect(views.lives)
      .toStrictEqual([ { mapId: 5, picks: [ 3, 1 ], shown: [ true ], unmounted: false } ]);
  });

  it('hands the view it has a second ask for the same event, so the view picks it out again', () =>
  {
    // Arrange: event 3 asked for once.
    const { api } = buildPanel();
    const map = MapDocument.fromJson('map:5', buildMapJson());
    const asked = (request: number): IDockviewPanelProps => ({ ...panelProps(api, map, 3), params: { document: map, focusEventId: 3, focusRequest: request, visible: true } });
    const { rerender } = render(<ScopedSurface {...asked(1)}/>);

    // Act: the same event asked for again.
    rerender(<ScopedSurface {...asked(2)}/>);

    // Assert: one view, the event unchanged, and both asks heard.
    expect([ views.lives.length, views.lives[0].picks, views.requests ])
      .toStrictEqual([ 1, [ 3 ], [ 1, 2 ] ]);
  });

  it('mounts a fresh view when the panel\'s map comes back as a new document', () =>
  {
    // Arrange: the same window and the same pick throughout, so only the document changes.
    const { api } = buildPanel();
    const { rerender } = render(<ScopedSurface {...panelProps(api, MapDocument.fromJson('map:5', buildMapJson()), 3)}/>);

    // Act.
    rerender(<ScopedSurface {...panelProps(api, MapDocument.fromJson('map:5', buildMapJson()), 3)}/>);

    // Assert.
    expect(views.lives.map(life => life.unmounted))
      .toStrictEqual([ true, false ]);
  });
});
