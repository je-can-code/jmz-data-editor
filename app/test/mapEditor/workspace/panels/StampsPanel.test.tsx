/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BlueprintCopyCounter, type EventNote } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { BLUEPRINTS_DOCUMENT, blueprintsOf } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { BLUEPRINT_USES_DOCUMENT, type PlacedSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { StampHistory } from '../../../../src/mapEditor/core/stamps/StampHistory.ts';
import { WindowPaints } from '../../../../src/mapEditor/core/tools/WindowPaint.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { StampsPanel } from '../../../../src/mapEditor/workspace/panels/StampsPanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { holdBlueprints, holdBlueprintUses, storedBlueprints, type BlueprintSeed } from '../../support/blueprintFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * The Stamps panel lists every stamp copied in the window this session, newest first, each with a picture and what it
 * holds, and the map it came from, a stamp copied while the panel is open joining at once. Clicking a stamp takes it up
 * as the brush, for the workspace's own maps, as the palette picks for them; clicking the stamp in hand again, or Esc
 * while the panel has the keys, puts it down and takes up the tool held before. The stamp in hand shows pressed. With
 * no stamp yet, it says how one is made.
 */
describe('StampsPanel', () =>
{
  /**
   * Renders the panel in a workspace with no project server, over a window's stamps.
   * @returns {object} The stamps, the window's paint and the controller.
   */
  const renderPanel = () =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    const stamps = new StampHistory('window-a');
    const paints = new WindowPaints(window);
    const services = { hub, api: null, stamps, paints } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <StampsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    return { stamps, painting: paints.main.painting, controller };
  };

  /**
   * Reads what each card says, top to bottom.
   * @returns {string[]} The cards' words.
   */
  const cards = (): string[] =>
  {
    return screen.queryAllByTestId('stamp-card').map(card => card.textContent ?? '');
  };

  /**
   * A stamp of three events copied off map 12.
   */
  const threeEvents = () => stampOf({ id: 'window-a:1', mapId: 12, width: 3, events: [ 1, 2, 3 ].map(id => createMapEvent(id, id - 1, 0)) });

  /**
   * A stamp of a piece of tiles from layer 4 copied off map 7.
   */
  const pieceOfLayerFour = () => stampOf({ id: 'window-a:2', mapId: 7, width: 2, events: [], tiles: { layers: [ 3 ], values: [ 10, 11 ], calledFor: [ -1, -1 ] } });

  it('says how a stamp is made while there is none', () =>
  {
    // Arrange: nothing beyond the panel.

    // Act.
    renderPanel();

    // Assert.
    expect([ cards(), screen.queryByText('Copy part of a map with Ctrl+C and it lands here as a stamp, ready to place again.') !== null ])
      .toStrictEqual([ [], true ]);
  });

  it('lists the stamps newest first, each with what it holds and the map it came from, one joining while it is open', () =>
  {
    // Arrange.
    const { stamps } = renderPanel();
    act(() =>
    {
      stamps.add(threeEvents());
    });

    // Act.
    act(() =>
    {
      stamps.add(pieceOfLayerFour());
    });

    // Assert.
    expect(cards())
      .toStrictEqual([ '2 by 1 tiles from layer 4From Map 7', '3 eventsFrom Map 12' ]);
  });

  it('takes a stamp clicked up as the brush, pressed, and puts it down when clicked again, back to the tool held before', () =>
  {
    // Arrange: the pen in hand.
    const { stamps, painting } = renderPanel();
    act(() =>
    {
      stamps.add(threeEvents());
      painting.setTool('pen');
    });

    // Act.
    fireEvent.click(screen.getByTestId('stamp-card'));
    const taken = [ painting.settings.tool, painting.settings.stamp?.id, screen.getByTestId('stamp-card').getAttribute('aria-pressed') ];
    fireEvent.click(screen.getByTestId('stamp-card'));

    // Assert.
    expect([ taken, painting.settings.tool, screen.getByTestId('stamp-card').getAttribute('aria-pressed') ])
      .toStrictEqual([ [ 'stamp', 'window-a:1', 'true' ], 'pen', 'false' ]);
  });

  it('draws each stamp\'s picture, loading the character sheets its events show through the project\'s images', async () =>
  {
    // Arrange: a project whose server has no such sheet, and canvases that record what is drawn on them.
    const drawn: string[] = [];
    const context = {
      clearRect: () => undefined,
      drawImage: () => drawn.push('image'),
      beginPath: () => undefined,
      arc: (x: number, y: number) => drawn.push(`dot ${x},${y}`),
      fill: () => undefined,
      stroke: () => undefined,
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as unknown as HTMLCanvasElement['getContext']);
    const loadImage = vi.fn(async () => null);
    const hub = new DocumentHub({ clientId: 'window-a' });
    const stamps = new StampHistory('window-a');
    const services = {
      hub,
      api: { loadImage },
      stamps,
      paints: new WindowPaints(window),
      openDocument: () => Promise.reject(new Error('no tilesets in this test')),
    } as unknown as MapEditorServices;
    const hero = { ...createMapEvent(1, 0, 0), pages: [ { ...createMapEvent(1, 0, 0).pages[0], image: { tileId: 0, characterName: 'Hero', direction: 2, pattern: 1, characterIndex: 0 } } ] };
    stamps.add(stampOf({ events: [ hero ] }));

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={new WorkspaceController(services)}>
          <StampsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    await act(async () =>
    {
      await Promise.resolve();
    });
    getContext.mockRestore();

    // Assert: the sheet asked for, and, missing, the event drawn as a dot in the middle of its one 48-pixel cell.
    expect([ loadImage.mock.calls, drawn.at(-1) ])
      .toStrictEqual([ [ [ 'characters', 'Hero' ] ], 'dot 24,24' ]);
  });

  it('takes up another stamp in place of the one in hand, and puts the one in hand down on Esc', () =>
  {
    // Arrange: two stamps, the older one in hand, with the events in hand before it.
    const { stamps, painting } = renderPanel();
    act(() =>
    {
      stamps.add(threeEvents());
      stamps.add(pieceOfLayerFour());
    });
    fireEvent.click(screen.getAllByTestId('stamp-card')[1]);

    // Act: the newer one clicked, then Esc, then Esc again with nothing in hand.
    fireEvent.click(screen.getAllByTestId('stamp-card')[0]);
    const swapped = painting.settings.stamp?.id;
    const escape = fireEvent.keyDown(screen.getByTestId('stamps-panel'), { key: 'Escape' });
    const again = fireEvent.keyDown(screen.getByTestId('stamps-panel'), { key: 'Escape' });

    // Assert: fireEvent answers false for a key the panel took.
    expect([ swapped, escape, again, painting.settings.tool ])
      .toStrictEqual([ 'window-a:2', false, true, 'events' ]);
  });

  it('keeps no blueprints, and offers to save no stamp as one, in a window with no project server', () =>
  {
    // Arrange: a stamp in the window.
    const { stamps } = renderPanel();

    // Act.
    act(() =>
    {
      stamps.add(threeEvents());
    });

    // Assert.
    expect([ screen.queryByTestId('blueprints-section'), screen.queryByRole('button', { name: 'Save as blueprint' }) ])
      .toStrictEqual([ null, null ]);
  });
});

/*
 * The panel's blueprints, above its stamps, in a window with a project server: every blueprint by name, each with its
 * picture, its name and how many copies of it stand across every map, still being counted until the server answers.
 * Any stamp can be saved as a blueprint, named in place, which writes the blueprints at once and hands undo the new
 * blueprint's history; Escape, or a name of nothing but spaces, saves nothing. A blueprint is renamed in place, its name
 * following in the paint settings while it is picked. Deleting one with copies says how many and on which maps, and
 * deleting one whose copies are still being counted says so, both changing nothing; one with no copies is deleted after
 * a question, Keep leaving it be. Clicking a blueprint takes it up as the brush, and clicking it again puts it down.
 * Blueprints that cannot be read say so, as do blueprints that could not be written, and blueprints held back from disk
 * while they wait for a choice about changes made elsewhere.
 */
describe('StampsPanel: blueprints', () =>
{
  /**
   * How the blueprints and the record of where they are placed reach the window: held from the start, opened only once
   * asked for, or never to be had; whether writing them fails; and the placements the record holds.
   */
  type BlueprintsSource = {
    readonly readNotes?: () => Promise<readonly EventNote[]>;
    readonly open?: 'held' | 'on-ask' | 'never';
    readonly failSaves?: boolean;
    readonly uses?: readonly PlacedSpot[];
  };

  /**
   * Renders the panel in a workspace with a project server, holding the blueprints given, whose copies on disk are those
   * the notes say, and whose placements are those the record holds.
   * @param {BlueprintSeed} blueprints The blueprints, by id.
   * @param {BlueprintsSource} source How the notes are read, how the blueprints and the record reach the window, whether
   * saves fail, and the placements.
   * @returns {object} The window's documents and stamps, its paint, the controller, what was saved and the counter.
   */
  const renderWithBlueprints = (blueprints: BlueprintSeed, source: BlueprintsSource = {}) =>
  {
    const { readNotes = async () => [], open = 'held', failSaves = false, uses = [] } = source;
    const saved: DocumentKey[] = [];
    const hub = new DocumentHub({
      clientId: 'window-a',
      store: {
        load: async () => null,
        save: async key =>
        {
          if (failSaves)
          {
            throw new Error('the disk is full');
          }

          saved.push(key);
        },
      },
    });
    if (open === 'held')
    {
      holdBlueprints(hub, blueprints);
      holdBlueprintUses(hub, uses);
    }

    const stamps = new StampHistory('window-a');
    const paints = new WindowPaints(window);
    const blueprintCopies = new BlueprintCopyCounter({ hub, readNotes });
    const services = {
      hub,
      api: { loadImage: vi.fn(async () => null) },
      stamps,
      paints,
      blueprintCopies,
      openDocument: async (key: DocumentKey) =>
      {
        if (open === 'on-ask' && hub.has(key) === false && key === BLUEPRINTS_DOCUMENT)
        {
          holdBlueprints(hub, blueprints);
        }

        if (open === 'on-ask' && hub.has(key) === false && key === BLUEPRINT_USES_DOCUMENT)
        {
          holdBlueprintUses(hub, uses);
        }

        if (hub.has(key))
        {
          return hub.document(key);
        }

        throw new Error(`${key} is not on disk`);
      },
    } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <StampsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    return { hub, stamps, painting: paints.main.painting, controller, saved, blueprintCopies };
  };

  /**
   * A stamp of one goblin, copied off map 12.
   * @returns {Stamp} The stamp.
   */
  const goblin = (): Stamp => stampOf({ id: 'window-a:1', mapId: 12, events: [ { ...createMapEvent(4, 0, 0), name: 'Goblin', note: '' } ] });

  /**
   * Waits for whatever the panel set going to settle: the copies' count, and any save.
   * @param {BlueprintCopyCounter} counter The window's counter.
   * @returns {Promise<void>} Settles once it has.
   */
  const settle = async (counter: BlueprintCopyCounter): Promise<void> =>
  {
    await act(async () =>
    {
      await counter.settled();
    });
  };

  /**
   * Reads what each blueprint's card says, top to bottom.
   * @returns {string[]} The cards' words.
   */
  const blueprintCards = (): string[] =>
  {
    return screen.queryAllByTestId('blueprint-card').map(card => card.textContent ?? '');
  };

  it('lists the blueprints by name, each with how many copies stand across every map once they are counted', async () =>
  {
    // Arrange: three copies of the camp on two maps, one of them under words.
    const notes = [
      { mapId: 3, eventId: 1, note: '<blueprint:[aa22, 4]>' },
      { mapId: 3, eventId: 2, note: '<blueprint:[aa22, 4]>' },
      { mapId: 7, eventId: 5, note: 'Guard\n<blueprint:[aa22, 4]>' },
    ];
    const { blueprintCopies } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() }, k3x9q2mf: { name: 'Bat roost', stamp: goblin() } }, { readNotes: async () => notes });
    const counting = blueprintCards();

    // Act.
    await settle(blueprintCopies);

    // Assert.
    expect([ counting, blueprintCards() ])
      .toStrictEqual([
        [ 'Bat roostCounting copies', 'Goblin campCounting copies' ],
        [ 'Bat roostNo copies yet', 'Goblin camp3 copies on 2 maps' ],
      ]);
  });

  it('saves a stamp as a blueprint under the name typed, writing the blueprints and handing undo its history', async () =>
  {
    // Arrange.
    const { hub, stamps, controller, saved, blueprintCopies } = renderWithBlueprints({});
    act(() =>
    {
      stamps.add(goblin());
    });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Save as blueprint' }));
    const field = screen.getByLabelText('Name the blueprint');
    fireEvent.change(field, { target: { value: '  Goblin camp ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle(blueprintCopies);

    // Assert.
    const [ camp ] = blueprintsOf(hub.document(BLUEPRINTS_DOCUMENT));
    expect([ blueprintCards(), saved, controller.getState().activeHistory, controller.getState().notice?.text, camp.stamp.events ])
      .toStrictEqual([
        [ 'Goblin campNo copies yet' ],
        [ BLUEPRINTS_DOCUMENT ],
        `blueprint:${camp.id}`,
        'Saved "Goblin camp" as a blueprint.',
        goblin().events,
      ]);
  });

  it('saves nothing when the naming is given up with Escape, or the name is nothing but spaces', async () =>
  {
    // Arrange.
    const { hub, stamps, saved, painting, blueprintCopies } = renderWithBlueprints({});
    act(() =>
    {
      stamps.add(goblin());
      painting.takeUpStamp(stamps.newest() as Stamp);
    });

    // Act: Escape first, which must not put the stamp in hand down; then a name of spaces.
    fireEvent.click(screen.getByRole('button', { name: 'Save as blueprint' }));
    fireEvent.keyDown(screen.getByLabelText('Name the blueprint'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Save as blueprint' }));
    const field = screen.getByLabelText('Name the blueprint');
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle(blueprintCopies);

    // Assert.
    expect([ blueprintsOf(hub.document(BLUEPRINTS_DOCUMENT)), saved, painting.settings.tool ])
      .toStrictEqual([ [], [], 'stamp' ]);
  });

  it('renames a blueprint in place, its new name following in the paint settings while it is picked', async () =>
  {
    // Arrange: the camp picked.
    const { saved, painting, blueprintCopies } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() }, k3x9q2mf: { name: 'Bat roost', stamp: goblin() } });
    await settle(blueprintCopies);
    fireEvent.click(screen.getAllByTestId('blueprint-card')[1]);

    // Act.
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[1]);
    const field = screen.getByLabelText('Blueprint name');
    fireEvent.change(field, { target: { value: 'Goblin den' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle(blueprintCopies);

    // Assert: renamed, it sorts after the bat roost still.
    expect([ blueprintCards(), painting.settings.blueprint, saved ])
      .toStrictEqual([ [ 'Bat roostNo copies yet', 'Goblin denNo copies yet' ], { id: 'aa22', name: 'Goblin den' }, [ BLUEPRINTS_DOCUMENT ] ]);
  });

  it('refuses to delete a blueprint with copies, saying how many and on which maps, and asks nothing', async () =>
  {
    // Arrange.
    const notes = [ { mapId: 3, eventId: 1, note: '<blueprint:[aa22, 4]>' }, { mapId: 7, eventId: 5, note: '<blueprint:[aa22, 4]>' } ];
    const { controller, saved, blueprintCopies } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() } }, { readNotes: async () => notes });
    await settle(blueprintCopies);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // Assert.
    expect([ controller.getState().notice?.text, screen.queryByTestId('blueprint-delete-confirm'), blueprintCards(), saved ])
      .toStrictEqual([ '"Goblin camp" still has 2 copies, on Map 3 (1) and Map 7 (1), so it can\'t be deleted.', null, [ 'Goblin camp2 copies on 2 maps' ], [] ]);
  });

  it('refuses to delete a blueprint while its copies are still being counted', () =>
  {
    // Arrange: a server that has not answered yet, and never does here.
    const unanswered = (): Promise<readonly EventNote[]> => new Promise(() =>
    {
      // the answer never comes.
    });
    const { controller } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() } }, { readNotes: unanswered });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // Assert.
    expect([ controller.getState().notice?.text, blueprintCards() ])
      .toStrictEqual([ '"Goblin camp" can\'t be deleted until its copies have been counted.', [ 'Goblin campCounting copies' ] ]);
  });

  it('asks before deleting a blueprint with no copies, keeping it on Keep or Escape and deleting it on Delete', async () =>
  {
    // Arrange.
    const { controller, saved, blueprintCopies } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() }, k3x9q2mf: { name: 'Bat roost', stamp: goblin() } });
    await settle(blueprintCopies);

    // Act: asked about the bat roost and kept with Keep, asked again and kept with Escape, then asked once more and deleted.
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const asked = screen.getByTestId('blueprint-delete-confirm').textContent;
    fireEvent.click(within(screen.getByTestId('blueprint-delete-confirm')).getByRole('button', { name: 'Keep' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    fireEvent.keyDown(screen.getByTestId('blueprint-delete-confirm'), { key: 'Escape' });
    const kept = [ blueprintCards(), screen.queryByTestId('blueprint-delete-confirm') ];
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    fireEvent.click(within(screen.getByTestId('blueprint-delete-confirm')).getByRole('button', { name: 'Delete' }));
    await settle(blueprintCopies);

    // Assert.
    expect([ asked, kept, blueprintCards(), saved, controller.getState().notice?.text, controller.getState().activeHistory ])
      .toStrictEqual([
        'Delete the blueprint "Bat roost"?DeleteKeep',
        [ [ 'Bat roostNo copies yet', 'Goblin campNo copies yet' ], null ],
        [ 'Goblin campNo copies yet' ],
        [ BLUEPRINTS_DOCUMENT ],
        'Deleted the blueprint "Bat roost".',
        'blueprint:k3x9q2mf',
      ]);
  });

  it('says why a rename was refused, changing nothing', async () =>
  {
    // Arrange.
    const { controller, saved, blueprintCopies } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() } });
    await settle(blueprintCopies);

    // Act: a name of nothing but spaces kept by leaving the field.
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = screen.getByLabelText('Blueprint name');
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);
    await settle(blueprintCopies);

    // Assert.
    expect([ controller.getState().notice?.text, blueprintCards(), saved ])
      .toStrictEqual([ 'Give the blueprint a name.', [ 'Goblin campNo copies yet' ], [] ]);
  });

  it('says the blueprints could not be written, keeping the edit in the window', async () =>
  {
    // Arrange: a disk that refuses every write.
    const { stamps, controller, blueprintCopies } = renderWithBlueprints({}, { failSaves: true });
    act(() =>
    {
      stamps.add(goblin());
    });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Save as blueprint' }));
    const field = screen.getByLabelText('Name the blueprint');
    fireEvent.change(field, { target: { value: 'Goblin camp' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle(blueprintCopies);

    // Assert.
    expect([ controller.getState().notice?.text, blueprintCards() ])
      .toStrictEqual([ 'The blueprints could not be saved: the disk is full', [ 'Goblin campNo copies yet' ] ]);
  });

  it('writes nothing over blueprints waiting for a choice about changes made elsewhere, saying so and keeping the edit', async () =>
  {
    // Arrange: the blueprints' file changed somewhere else, waiting for the author's choice.
    const { hub, stamps, controller, saved, blueprintCopies } = renderWithBlueprints({});
    act(() =>
    {
      hub.flagConflict(BLUEPRINTS_DOCUMENT, { kind: 'disk', content: storedBlueprints({ k3x9q2mf: { name: 'Bat roost', stamp: goblin() } }) as JsonValue });
      stamps.add(goblin());
    });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Save as blueprint' }));
    const field = screen.getByLabelText('Name the blueprint');
    fireEvent.change(field, { target: { value: 'Goblin camp' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle(blueprintCopies);

    // Assert.
    expect([ controller.getState().notice?.text, blueprintCards(), saved, hub.isDirty(BLUEPRINTS_DOCUMENT) ])
      .toStrictEqual([
        'The blueprints were not saved: they are waiting for a choice about changes made elsewhere.',
        [ 'Goblin campNo copies yet' ],
        [],
        true,
      ]);
  });

  it('opens the blueprints when the window does not hold them yet, listing them once they are open', async () =>
  {
    // Arrange.
    const { blueprintCopies } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() } }, { open: 'on-ask' });
    const opening = screen.queryByText('Opening the blueprints') !== null;

    // Act.
    await settle(blueprintCopies);

    // Assert.
    expect([ opening, screen.queryByText('Opening the blueprints'), blueprintCards() ])
      .toStrictEqual([ true, null, [ 'Goblin campNo copies yet' ] ]);
  });

  it('says the blueprints could not be read when the document holds something else', () =>
  {
    // Arrange: a document holding a list where the blueprints should be, held before the panel shows, beside an empty
    // record of placements.
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt(BLUEPRINTS_DOCUMENT, { schemaVersion: 1, data: { blueprints: [] } });
    holdBlueprintUses(hub);
    const services = {
      hub,
      api: {},
      stamps: new StampHistory('window-a'),
      paints: new WindowPaints(window),
      blueprintCopies: new BlueprintCopyCounter({ hub, readNotes: null }),
    } as unknown as MapEditorServices;

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={new WorkspaceController(services)}>
          <StampsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );

    // Assert.
    expect(screen.queryByText('The blueprints could not be read: the saved blueprints are not a blueprints document') !== null)
      .toBe(true);
  });

  it('takes a blueprint clicked up as the brush, pressed, and puts it down when clicked again', async () =>
  {
    // Arrange: the pen in hand.
    const { painting, blueprintCopies } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() } });
    await settle(blueprintCopies);
    act(() => painting.setTool('pen'));

    // Act.
    fireEvent.click(screen.getByTestId('blueprint-card'));
    const taken = [ painting.settings.tool, painting.settings.stamp?.id, painting.settings.blueprint, screen.getByTestId('blueprint-card').getAttribute('aria-pressed') ];
    fireEvent.click(screen.getByTestId('blueprint-card'));

    // Assert.
    expect([ taken, painting.settings.tool, screen.getByTestId('blueprint-card').getAttribute('aria-pressed') ])
      .toStrictEqual([ [ 'stamp', 'blueprint:aa22', { id: 'aa22', name: 'Goblin camp' }, 'true' ], 'pen', 'false' ]);
  });

  it('says why the blueprints could not be read, and offers to save no stamp as one', async () =>
  {
    // Arrange: blueprints that cannot be opened.
    const { stamps } = renderWithBlueprints({}, { open: 'never' });

    // Act.
    await act(async () =>
    {
      stamps.add(goblin());
      await Promise.resolve();
    });

    // Assert.
    expect([ screen.getByText('The blueprints could not be read: editor-data:blueprints is not on disk') !== null, screen.queryByRole('button', { name: 'Save as blueprint' }) ])
      .toStrictEqual([ true, null ]);
  });
});
