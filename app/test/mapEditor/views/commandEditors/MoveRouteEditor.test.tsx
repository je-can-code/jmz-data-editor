/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MoveRouteMode } from '../../../../src/mapEditor/core/commands/editors/moveRoute.ts';
import type { RmmzMoveCommand, RmmzMoveRoute } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { RouteSetting } from '../../../../src/mapEditor/core/moveRoutes/routeStart.ts';
import { MoveRouteEditor } from '../../../../src/mapEditor/views/commandEditors/MoveRouteEditor.tsx';
import type { RoutePreviewProps } from '../../../../src/mapEditor/views/moveRoute/RoutePreview.tsx';

/**
 * What the stand-in preview was last handed.
 */
const stand = vi.hoisted(() => ({
  shown: null as Omit<RoutePreviewProps, 'onStartAt'> | null,
}));

// the preview is proved in its own tests; here it stands in as two buttons, one putting the walker at 3, 3 and one
// putting it back, and notes what it was handed.
vi.mock('../../../../src/mapEditor/views/moveRoute/RoutePreview.tsx', () =>
{
  /**
   * Stands in for the preview.
   * @param {RoutePreviewProps} props What it shows, and who hears clicks.
   * @returns {React.JSX.Element} Two buttons standing for clicks on it.
   */
  const RoutePreview = (props: RoutePreviewProps) =>
  {
    const { onStartAt, ...shown } = props;
    stand.shown = shown;
    return (
      <div>
        <button type={'button'} onClick={() => onStartAt({ x: 3, y: 3 })}>Start at 3, 3</button>
        <button type={'button'} onClick={() => onStartAt(null)}>Start where it was</button>
      </div>
    );
  };

  return { RoutePreview };
});

/*
 * The route editor owes the author a route that reads at a glance and edits without hunting. Its steps are listed as
 * runs of identical steps ("Move Left ×3"); a run selected can be made longer or shorter, moved past its neighbour,
 * taken away, or given new inputs for every step in it at once. A new step, from the pads or the number pad, goes after
 * the run selected or at the end, and the run holding it becomes the selection. The number pad walks as the pad is laid
 * out and turns with Shift held, leaving keys typed in a text field, and every other key, alone.
 *
 * Where the route runs is known, the editor shows it on the map, the walker standing where the selected run leaves it;
 * where the author put the walker is kept while the same walker walks on the same map, and forgotten otherwise. The
 * route's options are its own, and only a command's route can make its event wait.
 */
describe('MoveRouteEditor', () =>
{
  /**
   * Builds a route from its steps, ending as MZ ends a command's route.
   * @param {readonly RmmzMoveCommand[]} steps The steps.
   * @returns {RmmzMoveRoute} The route.
   */
  const routeOf = (steps: readonly RmmzMoveCommand[]): RmmzMoveRoute => ({ list: [ ...steps, { code: 0 } ], repeat: false, skippable: false, wait: true });

  /**
   * Left three times, down, then a 60-frame wait.
   */
  const WALK: readonly RmmzMoveCommand[] = [ { code: 2 }, { code: 2 }, { code: 2 }, { code: 1 }, { code: 15, parameters: [ 60 ] } ];

  /**
   * Event 1 on map 7, walking itself.
   */
  const SETTING: RouteSetting = { mapId: 7, page: { eventId: 1, pageIndex: 0 }, before: [], characterId: 0 };

  /**
   * Holds the route the editor hands back, as the list holding it would.
   * @param {{ initial: RmmzMoveRoute, mode?: MoveRouteMode, setting?: RouteSetting | null }} props The route to start
   * from, where it lives, and where it runs.
   * @returns {React.JSX.Element} The editor.
   */
  const Holder = (props: { readonly initial: RmmzMoveRoute; readonly mode?: MoveRouteMode; readonly setting?: RouteSetting | null }) =>
  {
    const { initial, mode = 'command', setting } = props;
    const [ route, setRoute ] = useState(initial);
    return (
      <>
        <MoveRouteEditor route={route} mode={mode} setting={setting} onChange={setRoute}/>
        <output data-testid={'route'}>{JSON.stringify(route)}</output>
      </>
    );
  };

  /**
   * Reads the route as it stands, without the step ending it.
   * @returns {RmmzMoveCommand[]} The steps.
   */
  const heldSteps = (): RmmzMoveCommand[] => (JSON.parse(screen.getByTestId('route').textContent as string) as RmmzMoveRoute).list.slice(0, -1);

  /**
   * Reads the rows the list shows.
   * @returns {string[]} Each row's words.
   */
  const rows = (): string[] => within(screen.getByRole('list', { name: 'Route steps' })).queryAllByRole('button').map(row => row.textContent as string);

  /**
   * Reads the row selected.
   * @returns {string | null} Its words, or null with none selected.
   */
  const selectedRow = (): string | null =>
  {
    const rowButtons = within(screen.getByRole('list', { name: 'Route steps' })).queryAllByRole('button');
    const chosen = rowButtons.find(row => row.classList.contains('Mui-selected'));
    return chosen === undefined ? null : chosen.textContent;
  };

  /**
   * Selects a row by its words.
   * @param {string} words The row's words.
   */
  const select = (words: string) =>
  {
    fireEvent.click(within(screen.getByRole('list', { name: 'Route steps' })).getByRole('button', { name: words }));
  };

  it('lists the route as runs of identical steps, counting the repeats', () =>
  {
    // Arrange: nothing beyond the walk.

    // Act.
    render(<Holder initial={routeOf(WALK)}/>);

    // Assert.
    expect(rows())
      .toStrictEqual([ 'Move Left ×3', 'Move Down', 'Wait: 60 frames' ]);
  });

  it('says how to start a route with no steps', () =>
  {
    // Arrange: nothing beyond an empty route.

    // Act.
    render(<Holder initial={routeOf([])}/>);

    // Assert.
    expect(screen.getByText('No steps yet. Add one from the pads below, or type it on the number pad.'))
      .toBeInTheDocument();
  });

  it('adds a step at the end with nothing selected, then after the run selected, selecting the run that holds it', () =>
  {
    // Arrange.
    render(<Holder initial={routeOf(WALK)}/>);

    // Act: a step up at the end, then a step right after the lefts.
    fireEvent.click(screen.getByRole('button', { name: 'Move Up' }));
    const ended = heldSteps().map(step => step.code);
    select('Move Left ×3');
    fireEvent.click(screen.getByRole('button', { name: 'Move Right' }));

    // Assert: the right step follows the lefts, and is the run selected now.
    expect([ ended, heldSteps().map(step => step.code), selectedRow() ])
      .toStrictEqual([ [ 2, 2, 2, 1, 15, 4 ], [ 2, 2, 2, 3, 1, 15, 4 ], 'Move Right' ]);
  });

  it('grows a run when the step added matches it', () =>
  {
    // Arrange: the lefts selected.
    render(<Holder initial={routeOf(WALK)}/>);
    select('Move Left ×3');

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Move Left' }));

    // Assert.
    expect(rows())
      .toStrictEqual([ 'Move Left ×4', 'Move Down', 'Wait: 60 frames' ]);
  });

  it('makes the run selected longer with its count', () =>
  {
    // Arrange.
    render(<Holder initial={routeOf(WALK)}/>);
    select('Move Left ×3');

    // Act.
    fireEvent.change(screen.getByLabelText('Times'), { target: { value: '5' } });

    // Assert.
    expect(rows())
      .toStrictEqual([ 'Move Left ×5', 'Move Down', 'Wait: 60 frames' ]);
  });

  it('moves the run selected up past its neighbour, and down again, keeping it selected', () =>
  {
    // Arrange: the step down selected.
    render(<Holder initial={routeOf(WALK)}/>);
    select('Move Down');

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Move step up' }));
    const raised = rows();
    fireEvent.click(screen.getByRole('button', { name: 'Move step down' }));

    // Assert.
    expect([ raised, rows(), selectedRow() ])
      .toStrictEqual([ [ 'Move Down', 'Move Left ×3', 'Wait: 60 frames' ], [ 'Move Left ×3', 'Move Down', 'Wait: 60 frames' ], 'Move Down' ]);
  });

  it('cannot move the first run up nor the last run down', () =>
  {
    // Arrange: nothing beyond the walk.
    render(<Holder initial={routeOf(WALK)}/>);

    // Act.
    select('Move Left ×3');
    const firstUp = (screen.getByRole('button', { name: 'Move step up' }) as HTMLButtonElement).disabled;
    select('Wait: 60 frames');
    const lastDown = (screen.getByRole('button', { name: 'Move step down' }) as HTMLButtonElement).disabled;

    // Assert.
    expect([ firstUp, lastDown ])
      .toStrictEqual([ true, true ]);
  });

  it('takes the run selected away, selecting nothing after', () =>
  {
    // Arrange.
    render(<Holder initial={routeOf(WALK)}/>);
    select('Move Left ×3');

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Remove step' }));

    // Assert.
    expect([ rows(), screen.queryByLabelText('Times') ])
      .toStrictEqual([ [ 'Move Down', 'Wait: 60 frames' ], null ]);
  });

  it('gives every step of the run selected its new inputs at once', () =>
  {
    // Arrange: two 60-frame waits.
    render(<Holder initial={routeOf([ { code: 15, parameters: [ 60 ] }, { code: 15, parameters: [ 60 ] } ])}/>);
    select('Wait: 60 frames ×2');

    // Act.
    fireEvent.change(screen.getByLabelText('Frames'), { target: { value: '20' } });

    // Assert.
    expect(heldSteps())
      .toStrictEqual([ { code: 15, parameters: [ 20 ] }, { code: 15, parameters: [ 20 ] } ]);
  });

  it('types moves on the number pad, and turns with Shift held', () =>
  {
    // Arrange: focus on a pad key, as after pressing one.
    render(<Holder initial={routeOf([])}/>);
    const key = screen.getByRole('button', { name: 'Jump' });

    // Act: 8 walks up, 3 lower right, 5 waits; Shift and 4 turns left.
    fireEvent.keyDown(key, { code: 'Numpad8' });
    fireEvent.keyDown(key, { code: 'Numpad3' });
    fireEvent.keyDown(key, { code: 'Numpad5' });
    fireEvent.keyDown(key, { code: 'Numpad4', shiftKey: true });

    // Assert.
    expect(heldSteps().map(step => step.code))
      .toStrictEqual([ 4, 6, 15, 17 ]);
  });

  it('leaves the number pad typing into a text field, and every other key, alone', () =>
  {
    // Arrange: a wait selected, its frames field showing.
    render(<Holder initial={routeOf([ { code: 15, parameters: [ 60 ] } ])}/>);
    select('Wait: 60 frames');

    // Act.
    fireEvent.keyDown(screen.getByLabelText('Frames'), { code: 'Numpad8' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Jump' }), { code: 'KeyW' });

    // Assert.
    expect(heldSteps())
      .toStrictEqual([ { code: 15, parameters: [ 60 ] } ]);
  });

  it('shows the route on the map where it runs, the walker where the selected run leaves it', () =>
  {
    // Arrange.
    render(<Holder initial={routeOf(WALK)} setting={SETTING}/>);
    const before = stand.shown;

    // Act.
    select('Move Down');

    // Assert: nothing selected shows the start; the step down is the fourth step.
    expect([ before?.shownStep, before?.setting, before?.steps.length, before?.skippable, stand.shown?.shownStep ])
      .toStrictEqual([ null, SETTING, 5, false, 3 ]);
  });

  it('shows no map where the route has nowhere to run', () =>
  {
    // Arrange: the preview has not been shown in this test.
    stand.shown = null;

    // Act.
    render(<Holder initial={routeOf(WALK)} setting={null}/>);

    // Assert.
    expect([ stand.shown, screen.queryByRole('button', { name: 'Start at 3, 3' }) ])
      .toStrictEqual([ null, null ]);
  });

  it('keeps where the author put the walker, and puts it back', () =>
  {
    // Arrange.
    render(<Holder initial={routeOf(WALK)} setting={SETTING}/>);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Start at 3, 3' }));
    const put = stand.shown?.startAt;
    fireEvent.click(screen.getByRole('button', { name: 'Start where it was' }));

    // Assert.
    expect([ put, stand.shown?.startAt ])
      .toStrictEqual([ { x: 3, y: 3 }, null ]);
  });

  it('forgets where the author put the walker once another walker walks the route', () =>
  {
    // Arrange: the walker put at 3, 3 for event 1.
    const { rerender } = render(<MoveRouteEditor route={routeOf(WALK)} mode={'command'} setting={SETTING} onChange={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Start at 3, 3' }));

    // Act: the player walks it now.
    rerender(<MoveRouteEditor route={routeOf(WALK)} mode={'command'} setting={{ ...SETTING, characterId: -1 }} onChange={vi.fn()}/>);

    // Assert.
    expect(stand.shown?.startAt)
      .toBeNull();
  });

  it('forgets where the author put the walker once the route shows on another map', () =>
  {
    // Arrange: the walker put at 3, 3 on map 7.
    const { rerender } = render(<MoveRouteEditor route={routeOf(WALK)} mode={'command'} setting={SETTING} onChange={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Start at 3, 3' }));

    // Act: the route shows on map 8 now.
    rerender(<MoveRouteEditor route={routeOf(WALK)} mode={'command'} setting={{ ...SETTING, mapId: 8 }} onChange={vi.fn()}/>);

    // Assert.
    expect(stand.shown?.startAt)
      .toBeNull();
  });

  it('lets go of the run selected when it is chosen again, showing the walker where it starts', () =>
  {
    // Arrange: the step down selected.
    render(<Holder initial={routeOf(WALK)} setting={SETTING}/>);
    select('Move Down');

    // Act.
    select('Move Down');

    // Assert.
    expect([ selectedRow(), screen.queryByLabelText('Times'), stand.shown?.shownStep ])
      .toStrictEqual([ null, null, null ]);
  });

  it('edits a step\'s choice', () =>
  {
    // Arrange: a speed change selected.
    render(<Holder initial={routeOf([ { code: 29, parameters: [ 4 ] } ])}/>);
    select('Change Speed: 4: Normal');

    // Act.
    fireEvent.mouseDown(screen.getByLabelText('Speed'));
    fireEvent.click(screen.getByRole('option', { name: '6: x4 Faster' }));

    // Assert.
    expect(heldSteps())
      .toStrictEqual([ { code: 29, parameters: [ 6 ] } ]);
  });

  it('edits a step\'s switch', () =>
  {
    // Arrange: a switch turned on, selected.
    render(<Holder initial={routeOf([ { code: 27, parameters: [ 1 ] } ])}/>);
    select('Switch ON: #0001');

    // Act.
    fireEvent.change(screen.getByLabelText('Switch'), { target: { value: '7' } });
    fireEvent.blur(screen.getByLabelText('Switch'));

    // Assert.
    expect(heldSteps())
      .toStrictEqual([ { code: 27, parameters: [ 7 ] } ]);
  });

  it('edits a step\'s sound, keeping what it does not change', () =>
  {
    // Arrange: a sound selected.
    render(<Holder initial={routeOf([ { code: 44, parameters: [ { name: 'Door1', volume: 90, pitch: 100, pan: 0 } ] } ])}/>);
    select('Play SE: Door1 (90, 100, 0)');

    // Act.
    fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '60' } });

    // Assert.
    expect(heldSteps())
      .toStrictEqual([ { code: 44, parameters: [ { name: 'Door1', volume: 60, pitch: 100, pan: 0 } ] } ]);
  });

  it('starts a sound that is not one from nothing, at the engine\'s own volume and pitch', () =>
  {
    // Arrange: a sound step whose sound is missing.
    render(<Holder initial={routeOf([ { code: 44, parameters: [ '' ] } ])}/>);
    select('Play SE:');

    // Act.
    fireEvent.change(screen.getByLabelText('Pan'), { target: { value: '10' } });

    // Assert.
    expect(heldSteps())
      .toStrictEqual([ { code: 44, parameters: [ { name: '', volume: 90, pitch: 100, pan: 10 } ] } ]);
  });

  it('edits a step\'s script and picture by typing', () =>
  {
    // Arrange: a script and a picture change.
    render(<Holder initial={routeOf([ { code: 45, parameters: [ 'a();' ] }, { code: 41, parameters: [ 'Actor1', 0 ] } ])}/>);
    select('Script: a();');

    // Act: the script's own box, not the pads' Script key.
    fireEvent.change(screen.getByRole('textbox', { name: 'Script' }), { target: { value: 'b();' } });
    select('Change Image: Actor1 (0)');
    fireEvent.change(screen.getByRole('textbox', { name: 'Image' }), { target: { value: 'Actor2' } });

    // Assert.
    expect(heldSteps())
      .toStrictEqual([ { code: 45, parameters: [ 'b();' ] }, { code: 41, parameters: [ 'Actor2', 0 ] } ]);
  });

  it('changes the route\'s options, offering to wait for a command\'s route only', () =>
  {
    // Arrange: a page's route, which cannot make its event wait.
    render(<Holder initial={routeOf(WALK)} mode={'page'}/>);

    // Act.
    fireEvent.click(screen.getByLabelText('Repeat'));
    fireEvent.click(screen.getByLabelText('Skip steps that cannot be taken'));

    // Assert.
    const held = JSON.parse(screen.getByTestId('route').textContent as string) as RmmzMoveRoute;
    expect([ held.repeat, held.skippable, screen.queryByLabelText('Wait until it finishes') ])
      .toStrictEqual([ true, true, null ]);
  });

  it('offers to wait until a command\'s route finishes', () =>
  {
    // Arrange: a command's route that waits.
    render(<Holder initial={routeOf(WALK)}/>);

    // Act.
    fireEvent.click(screen.getByLabelText('Wait until it finishes'));

    // Assert.
    const held = JSON.parse(screen.getByTestId('route').textContent as string) as RmmzMoveRoute;
    expect(held.wait)
      .toBe(false);
  });
});
