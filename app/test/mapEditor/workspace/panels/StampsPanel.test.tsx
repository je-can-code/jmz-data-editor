/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { DockviewApi } from 'dockview-react';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BlueprintCopyCounter, type EventNote } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { BlueprintWriter } from '../../../../src/mapEditor/core/blueprints/blueprintWriter.ts';
import { BLUEPRINTS_DOCUMENT, blueprintsOf } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { BLUEPRINT_USES_DOCUMENT, usesOf, type PlacedSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { StampHistory } from '../../../../src/mapEditor/core/stamps/StampHistory.ts';
import { WindowPaints } from '../../../../src/mapEditor/core/tools/WindowPaint.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { StampsPanel } from '../../../../src/mapEditor/workspace/panels/StampsPanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { holdBlueprints, holdBlueprintUses, storedBlueprints, storedUses, type BlueprintSeed } from '../../support/blueprintFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { UsesServer } from '../../support/usesServer.ts';

/*
 * The Stamps panel lists every stamp copied in the window this session, newest first, each with a picture and what it
 * holds, and the map it came from, a stamp copied while the panel is open joining at once, brought into view rather than
 * landing out of sight below the blueprints. Clicking a stamp takes it up
 * as the brush, for the workspace's own maps, as the palette picks for them; clicking the stamp in hand again, or Esc
 * while the panel has the keys, puts it down and takes up the tool held before. The stamp in hand shows pressed. With
 * no stamp yet, it says how one is made.
 */
describe('StampsPanel', () =>
{
  /**
   * Renders the panel in a workspace with no project server, over a window's stamps.
   * @param {StampHistory} stamps The window's stamps, none by default.
   * @returns {object} The stamps, the window's paint and the controller.
   */
  const renderPanel = (stamps = new StampHistory('window-a')) =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
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

  it('brings each stamp joining into view, so it never lands out of sight below the blueprints, and moves nothing as it opens', () =>
  {
    // Arrange: a stamp kept before the panel opens, and every card brought into view noted.
    const brought: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: HTMLElement, options: ScrollIntoViewOptions)
      {
        brought.push(`${this.textContent ?? ''} ${options.block ?? ''}`);
      },
    });
    try
    {
      const stamps = new StampHistory('window-a');
      stamps.add(threeEvents());
      renderPanel(stamps);
      const opened = [ ...brought ];

      // Act.
      act(() =>
      {
        stamps.add(pieceOfLayerFour());
      });

      // Assert.
      expect([ opened, brought ])
        .toStrictEqual([ [], [ '2 by 1 tiles from layer 4From Map 7 nearest' ] ]);
    }
    finally
    {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
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
 * picture, its name and where it is used across every map, its linked events still being counted until the server
 * answers, never its placements and its linked events under one name. Any stamp can be saved as a blueprint, named in
 * place, which writes the blueprints at once and hands undo the new blueprint's history; Escape, or a name of nothing but
 * spaces, saves nothing. A blueprint is renamed in place, its name following in the paint settings while it is picked.
 * Deleting one still used says how and on which maps, and deleting one whose linked events are still being counted says
 * so, both changing nothing; one used nowhere is deleted after a question, Keep leaving it be. Clicking a blueprint takes it up as the brush, and clicking it again puts it down.
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
    const hub = new DocumentHub({ clientId: 'window-a', store: { load: async () => null, save: async () => undefined } });
    if (open === 'held')
    {
      holdBlueprints(hub, blueprints);
      holdBlueprintUses(hub, uses);
    }

    // every edit to the blueprints reaches disk through the window's writer, which writes them whole.
    const blueprintWriter = new BlueprintWriter({
      hub,
      maps: { follow: () => new Map(), landed: () => undefined, misfit: () => null },
      write: async write =>
      {
        if (failSaves)
        {
          throw new Error('the disk is full');
        }

        if (write.blueprints !== undefined)
        {
          saved.push(BLUEPRINTS_DOCUMENT);
        }
      },
    });
    const stamps = new StampHistory('window-a');
    const paints = new WindowPaints(window);
    const blueprintCopies = new BlueprintCopyCounter({ hub, readNotes });
    const services = {
      hub,
      api: { loadImage: vi.fn(async () => null) },
      stamps,
      paints,
      blueprintCopies,
      blueprintWriter,
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
    // whatever the panel set going settles once the copies are counted and every write asked for has landed.
    const settling = { settled: () => blueprintCopies.settled().then(() => blueprintWriter.whenWritten()) };
    return { hub, stamps, painting: paints.main.painting, controller, saved, blueprintCopies: settling };
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
  const settle = async (counter: Pick<BlueprintCopyCounter, 'settled'>): Promise<void> =>
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
        [ 'Bat roostCounting linked events', 'Goblin campCounting linked events' ],
        [ 'Bat roostNo linked events yet', 'Goblin camp3 linked events on 2 maps' ],
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
        [ 'Goblin campNo linked events yet' ],
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
      .toStrictEqual([ [ 'Bat roostNo linked events yet', 'Goblin denNo linked events yet' ], { id: 'aa22', name: 'Goblin den' }, [ BLUEPRINTS_DOCUMENT ] ]);
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
      .toStrictEqual([ '"Goblin camp" still has 2 linked events, on Map 3 and Map 7, so it can\'t be deleted.', null, [ 'Goblin camp2 linked events on 2 maps' ], [] ]);
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
      .toStrictEqual([ '"Goblin camp" can\'t be deleted until its linked events have been counted.', [ 'Goblin campCounting linked events' ] ]);
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
        [ [ 'Bat roostNo linked events yet', 'Goblin campNo linked events yet' ], null ],
        [ 'Goblin campNo linked events yet' ],
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
      .toStrictEqual([ 'Give the blueprint a name.', [ 'Goblin campNo linked events yet' ], [] ]);
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
      .toStrictEqual([ 'The blueprints could not be saved: the disk is full. They are tried again with the next save.', [ 'Goblin campNo linked events yet' ] ]);
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
        [ 'Goblin campNo linked events yet' ],
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
      .toStrictEqual([ true, null, [ 'Goblin campNo linked events yet' ] ]);
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

  it('opens a blueprint in a tab of its own from its card, taking up nothing as the brush', async () =>
  {
    // Arrange: the camp beside a lamp, the dock ready.
    const { controller, painting, blueprintCopies } = renderWithBlueprints({ aa22: { name: 'Goblin camp', stamp: goblin() }, bb33: { name: 'Lamp', stamp: goblin() } });
    await settle(blueprintCopies);
    const added: string[] = [];
    const dock = {
      panels: [],
      getPanel: () => undefined,
      addPanel: (options: { id: string }) =>
      {
        added.push(options.id);
        return null;
      },
    };
    controller.attach(dock as unknown as DockviewApi);

    // Act.
    const [ camp ] = screen.getAllByTestId('blueprint');
    fireEvent.click(within(camp).getByRole('button', { name: 'Open' }));

    // Assert.
    expect([ added, painting.settings.tool ])
      .toStrictEqual([ [ 'blueprint-aa22' ], 'events' ]);
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

/*
 * Where each blueprint is used, which its card shows on asking, stretched across the panel: map by map, each placement of
 * its tiles at the cell its corner went down at, checked against the blueprint, so one no longer where it was says why,
 * in plain words, and can be forgotten; and each copy of its events. A click on either opens the map there. A placement
 * counts as one copy of the blueprint, as each copy of one of its events does, on the card and in a refused delete.
 * Forgetting is a step in the blueprint's own history, written at once. A record that cannot be read says so, and shows
 * no blueprint, since none could be placed with no record to write into.
 *
 * Each copy a change to the blueprint no longer reaches says why under the map's copies: one whose map shows it drifted,
 * and one the last change to the blueprint found it could not reach.
 *
 * The camp (aa22) is two objects side by side on layer 4, and a guard of one page. It is placed on map 3, held here, at
 * 1, 0, where its objects stand, and at 0, 1, where they do not; on map 7, which only the disk holds, with its objects
 * there; and on map 8, which is gone. On disk, event 5 on map 9, which is gone too, is a copy of its guard.
 */
describe('StampsPanel: where a blueprint is used', () =>
{
  /**
   * Builds a map file of a size with objects on layer 4.
   * @param {number} width The width.
   * @param {number} height The height.
   * @param {readonly [ number, number, number ][]} objects Each object's column, row and tile.
   * @returns {RmmzMap} The file.
   */
  const mapWithObjects = (width: number, height: number, objects: readonly [ number, number, number ][]): RmmzMap =>
  {
    const file = mapWithEvents(width, height, [ null ]);
    objects.forEach(([ x, y, tileId ]) =>
    {
      file.data[(3 * height + y) * width + x] = tileId;
    });

    return file;
  };

  /**
   * The camp's stamp: its two objects, on layer 4 alone, and its guard, event 1, of one page.
   */
  const CAMP = stampOf({ width: 2, tiles: { layers: [ 3 ], values: [ 10, 11 ], calledFor: [ -1, -1 ] }, events: [ { ...createMapEvent(1, 0, 0), name: 'Guard' } ] });

  /**
   * What the where-used fixture may hold beyond the camp: copies of its guard standing on map 7, from event 1 on, and
   * why the last change to the camp could not reach a copy, when it could not.
   */
  type UsesExtras = {
    readonly copiesOnMap7?: readonly RmmzMapEvent[];
    readonly driftOf?: (mapId: number, eventId: number) => string | null;
  };

  /**
   * Renders the panel with the camp, its placements, and the maps as the fixture says, its card's list showing.
   * @param {readonly PlacedSpot[]} uses The placements the record holds.
   * @param {UsesExtras} extras Copies on map 7, and the reasons the last change gave, when the test has any.
   * @returns {Promise<object>} The window's documents, the controller, what was saved, and what the dock was asked.
   */
  const renderUses = async (uses: readonly PlacedSpot[], extras: UsesExtras = {}) =>
  {
    const { copiesOnMap7 = [], driftOf = () => null } = extras;
    const saved: DocumentKey[] = [];
    const hub = new DocumentHub({
      clientId: 'window-a',
      store: {
        load: async key =>
        {
          if (key !== 'map:7')
          {
            throw new MapEditorApiError(`GET /api/maps/${key} answered 404`, 404);
          }

          const file = mapWithObjects(4, 4, [ [ 2, 2, 10 ], [ 3, 2, 11 ] ]);
          return { ...file, events: [ null, ...copiesOnMap7 ] } as unknown as JsonValue;
        },
        save: async key =>
        {
          saved.push(key);
        },
      },
    });
    hub.adopt('map:3', mapWithObjects(4, 3, [ [ 1, 0, 10 ], [ 2, 0, 11 ] ]) as unknown as JsonValue);
    holdBlueprints(hub, { aa22: { name: 'Goblin camp', stamp: CAMP } });
    holdBlueprintUses(hub, uses);
    const notes = [
      { mapId: 9, eventId: 5, note: '<blueprint:[aa22, 1]>' },
      ...copiesOnMap7.map(copy => ({ mapId: 7, eventId: copy.id, note: copy.note })),
    ];
    const blueprintCopies = new BlueprintCopyCounter({ hub, readNotes: async () => notes });
    const sync = { whenHeldOrDiscovered: async () => undefined, holders: () => [], requestSnapshot: async () => null };
    const server = new UsesServer(storedUses(uses));
    const services = {
      hub,
      sync,
      api: { loadImage: vi.fn(async () => null), ...server.api },
      stamps: new StampHistory('window-a'),
      paints: new WindowPaints(window),
      blueprintCopies,
      copyMaps: { driftOf },
      openDocument: async (key: DocumentKey) => hub.document(key),
    } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);
    const added: string[] = [];
    const dock = {
      panels: [],
      getPanel: () => undefined,
      addPanel: (options: { id: string }) =>
      {
        added.push(options.id);
        return null;
      },
    };
    controller.attach(dock as unknown as DockviewApi);
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <StampsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    await act(async () =>
    {
      await blueprintCopies.settled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Where used' }));
    await act(async () =>
    {
      await new Promise(resolve =>
      {
        setTimeout(resolve, 0);
      });
    });
    return { hub, controller, saved, added, server };
  };

  /**
   * The camp's four placements.
   */
  const PLACED: readonly PlacedSpot[] = [
    { blueprintId: 'aa22', mapId: 3, x: 1, y: 0 },
    { blueprintId: 'aa22', mapId: 3, x: 0, y: 1 },
    { blueprintId: 'aa22', mapId: 7, x: 2, y: 2 },
    { blueprintId: 'aa22', mapId: 8, x: 0, y: 0 },
  ];

  /**
   * Reads what the list says, map by map.
   * @returns {string[]} Each map's words.
   */
  const listed = (): string[] =>
  {
    return screen.queryAllByTestId('where-used-map').map(map => map.textContent ?? '');
  };

  it('lists where the blueprint is used map by map, each placement checked against it, and each copy of its events', async () =>
  {
    // Arrange: nothing beyond the fixture.

    // Act.
    await renderUses(PLACED);

    // Assert: a placement in place says nothing more; one no longer there says why, and offers to forget it.
    expect([ listed(), screen.getByRole('button', { name: 'Where used' }).getAttribute('aria-expanded') ])
      .toStrictEqual([
        [
          'Map 3Placed at 1, 0Placed at 0, 1No longer where it was: none of the tiles there match the blueprint any more.Forget',
          'Map 7Placed at 2, 2',
          'Map 8Placed at 0, 0No longer where it was: the map is gone.Forget',
          'Map 9Event 5',
        ],
        'true',
      ]);
  });

  it('says under a map\'s copies which ones a change to the blueprint no longer reaches, and why', async () =>
  {
    // Arrange: on map 7, a copy of the guard with a page more than the guard (1), one the last change could not reach
    // (2), and one that follows (3).
    const copyOfGuard = (eventId: number, pages: number): RmmzMapEvent =>
    {
      const event = createMapEvent(eventId, eventId - 1, 0);
      return { ...event, note: '<blueprint:[aa22, 1]>', pages: Array.from({ length: pages }, () => event.pages[0]) };
    };
    const copiesOnMap7 = [ copyOfGuard(1, 2), copyOfGuard(2, 1), copyOfGuard(3, 1) ];
    const driftOf = (mapId: number, eventId: number) => (mapId === 7 && eventId === 2 ? 'on page 1, its tag line cannot take the sight it must follow to' : null);

    // Act.
    await renderUses(PLACED, { copiesOnMap7, driftOf });

    // Assert: the copy that follows says nothing more.
    expect([ listed()[1], screen.getAllByTestId('copy-drifted').map(line => line.textContent) ])
      .toStrictEqual([
        'Map 7Placed at 2, 2Event 1Event 2Event 3'
        + 'Event 1 no longer follows its blueprint: it has 2 pages and its blueprint has 1 page.'
        + 'Event 2 no longer follows its blueprint: on page 1, its tag line cannot take the sight it must follow to.',
        [
          'Event 1 no longer follows its blueprint: it has 2 pages and its blueprint has 1 page.',
          'Event 2 no longer follows its blueprint: on page 1, its tag line cannot take the sight it must follow to.',
        ],
      ]);
  });

  it('counts the placements apart from the linked events, and refuses to delete a blueprint still placed, in the words the refusal uses', async () =>
  {
    // Arrange.
    const { controller } = await renderUses(PLACED);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // Assert: four placements on three maps, and the linked event on map 9, which the refusal names among the maps.
    expect([ screen.getByTestId('blueprint-copies').textContent, controller.getState().notice?.text ])
      .toStrictEqual([
        'Placed 4 times on 3 maps, 1 linked event',
        '"Goblin camp" is still placed 4 times and has 1 linked event, on Map 3, Map 7, Map 8 and Map 9, so it can\'t be deleted.',
      ]);
  });

  it('forgets a placement no longer where it was as a step in the blueprint\'s history, taking it off the disk at once', async () =>
  {
    // Arrange.
    const { hub, controller, saved, server } = await renderUses(PLACED);

    // Act: the placement on map 8, whose map is gone.
    fireEvent.click(within(screen.getAllByTestId('where-used-map')[2]).getByRole('button', { name: 'Forget' }));
    await act(async () =>
    {
      await controller.placements?.whenWritten();
    });

    // Assert: that one placement merged out of the record on disk, and nothing saved whole.
    expect([
      usesOf(hub.document(BLUEPRINT_USES_DOCUMENT)).map(spot => spot.mapId),
      server.merges,
      saved,
      controller.getState().activeHistory,
      controller.getState().notice?.text,
    ])
      .toStrictEqual([
        [ 3, 3, 7 ],
        [ { schemaVersion: 2, remove: [ { map: 8, blueprint: 'aa22', x: 0, y: 0 } ] } ],
        [],
        'blueprint:aa22',
        'Forgot a placement of "Goblin camp" on Map 8.',
      ]);
  });

  it('opens the map at a placement\'s middle, or at a copy of its events, when either is clicked', async () =>
  {
    // Arrange.
    const { controller, added } = await renderUses(PLACED);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Placed at 2, 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Event 5' }));

    // Assert: the camp is two wide, so its middle is a cell to the right of its corner.
    expect([ added, controller.getState().cellFocus[7]?.cell, controller.getState().eventFocus[9]?.eventId ])
      .toStrictEqual([ [ 'map-7', 'map-9' ], { x: 3, y: 2 }, 5 ]);
  });

  it('says a blueprint used nowhere is not placed yet, and hides the list on asking again', async () =>
  {
    // Arrange: no placements, and an event copy no longer on disk.
    await renderUses([]);
    const unplaced = screen.getByTestId('blueprint-where-used').textContent;

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Where used' }));

    // Assert: the copy of its events on map 9 still lists.
    expect([ unplaced, screen.queryByTestId('blueprint-where-used') ])
      .toStrictEqual([ 'Map 9Event 5', null ]);
  });

  it('says where blueprints are placed could not be read, showing no blueprint', () =>
  {
    // Arrange: a record holding a list where its maps should be.
    const hub = new DocumentHub({ clientId: 'window-a' });
    holdBlueprints(hub, { aa22: { name: 'Goblin camp', stamp: CAMP } });
    hub.adopt(BLUEPRINT_USES_DOCUMENT, { schemaVersion: 1, data: { maps: [] } });
    const services = {
      hub,
      api: {},
      stamps: new StampHistory('window-a'),
      paints: new WindowPaints(window),
      blueprintCopies: new BlueprintCopyCounter({ hub, readNotes: null }),
      openDocument: async (key: DocumentKey) => hub.document(key),
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
    expect([ screen.queryByText('Where blueprints are placed could not be read: the saved blueprint placements are not a record of placements') !== null, screen.queryByTestId('blueprint-card') ])
      .toStrictEqual([ true, null ]);
  });
});
