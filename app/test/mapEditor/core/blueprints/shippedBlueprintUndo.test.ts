import { describe, expect, it } from 'vitest';
import { MapEditorApiError, type BlueprintWrite } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BlueprintCopyCounter } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { saveBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintEdits.ts';
import { blueprintLinkOf } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { holdBlueprintMap } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { blueprintsKeptGuard } from '../../../../src/mapEditor/core/blueprints/blueprintMoves.ts';
import { placeBlueprint } from '../../../../src/mapEditor/core/blueprints/blueprintPlacement.ts';
import { blueprintPropagationCheck } from '../../../../src/mapEditor/core/blueprints/blueprintPropagation.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { blueprintShapeCheck } from '../../../../src/mapEditor/core/blueprints/blueprintShape.ts';
import { BLUEPRINT_USES_DOCUMENT, usedCopiesOf, usesOf } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { BlueprintWriter } from '../../../../src/mapEditor/core/blueprints/blueprintWriter.ts';
import { copiesLeftWords } from '../../../../src/mapEditor/core/blueprints/copiesLeft.ts';
import { CopyMaps } from '../../../../src/mapEditor/core/blueprints/copyMaps.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandListEditor } from '../../../../src/mapEditor/core/commandList/CommandListEditor.ts';
import { setPageImage } from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, eventHistoryKey, mapHistoryKey, type HistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { blueprintMapId, blueprintMapKey, mapDocumentKey, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { EditorDocument } from '../../../../src/mapEditor/core/model/EditorDocument.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent, RmmzMapInfo } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapCell } from '../../../../src/mapEditor/core/renderer/camera.ts';
import { captureAreaStamp, captureEventsStamp, type Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { INITIAL_PAINT_SETTINGS } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { ToolSession } from '../../../../src/mapEditor/core/tools/ToolSession.ts';
import { HistoryRouter, type HistoryOutcome } from '../../../../src/mapEditor/core/workspace/HistoryRouter.ts';
import { locateGameProject, readDataFile } from '../../../support/gameProject.ts';
import { drawsFor, holdBlueprints, holdBlueprintUses } from '../../support/blueprintFixtures.ts';
import { notesOn, settle } from '../../support/propagationFixtures.ts';

/*
 * Jeremy's first hands-on try at blueprints, replayed on Chef Adventure's own Foothills (Map 301), held in memory from the
 * game's files, a mirror nothing writes back to. He captured the battlers in a 5 by 5 square as a stamp (two ghastrooms, a
 * mountain orc, a driller and a negapine shrub), saved it as a blueprint, placed it four times, changed one ghastroom's
 * graphic in the blueprint, then raised one of that ghastroom's copies' J-ABS speed by hand in its own event window, and
 * Ctrl+Z on the map refused: "'Change graphic (page 1)' cannot be undone: 'Edit Comment' later changed what 'Change graphic
 * (page 1)' changed." The blueprint's change had reached each copy as a set of the whole event, so the speed typed into one
 * of its comments read as a change to the picture.
 *
 * So this owes him, in the same steps, on the same map: the undo, from the map or from the blueprint's tab, takes the
 * graphic back on every copy and leaves the speed alone, and the redo puts the graphic back. Where a copy's very graphic
 * was changed by hand since, that copy keeps its own graphic on the map and the rest go back, and he is told which copy,
 * and where; a redo does the same for a copy changed since the undo. The disk is judged apart from the map: the hand's
 * change reaches it only once saved, so until then the copy's file follows the blueprint with the rest, and throwing the
 * map's edits away shows every copy following it; a change saved by hand stays on disk. After every step the blueprints
 * on disk are the blueprints here. A step across two maps that no blueprint made, as a door pair is, still refuses an undo
 * a later edit stands in the way of.
 *
 * It runs against the project JMZ_PROJECT_ROOT names, or the sibling checkout, and skips when neither is there.
 */
const project = locateGameProject();

/**
 * Foothills.
 */
const MAP_ID = 301;

/**
 * The map beside Foothills that the step across two maps also changes.
 */
const OTHER_MAP_ID = 302;

/**
 * The blueprint his try made, by the id it was given.
 */
const BLUEPRINT = '555zclgm';

/**
 * The battlers in the 5 by 5 square he captured: two ghastrooms, a mountain orc, a driller and a negapine shrub.
 */
const CAPTURED = [ 20, 21, 22, 29, 35 ];

/**
 * Where he placed the blueprint four times, as the copies his try left on the map stand.
 */
const PLACEMENTS: readonly (readonly [ number, number ])[] = [ [ 19, 40 ], [ 17, 42 ], [ 21, 42 ], [ 22, 39 ] ];

/**
 * The copies of the ghastroom whose graphic he changed (the blueprint's event 21), one per placement.
 */
const GHASTROOM_COPIES = [ 57, 62, 67, 72 ];

/**
 * The copy whose speed he raised by hand.
 */
const SPED_UP = 67;

/**
 * One window over the mirror, wired as the map editor wires its own.
 */
type FoothillsWindow = {
  readonly hub: DocumentHub;
  readonly router: HistoryRouter;
  readonly disk: Map<number, RmmzMap>;
  readonly blueprintsOnDisk: () => JsonValue | null;
  readonly problems: string[];
};

/**
 * Reads Foothills as it stood before his try: the shipped file with the twenty copies his try put at the end taken off.
 * @returns {RmmzMap} The map.
 */
const foothillsBefore = (): RmmzMap =>
{
  const shipped = readDataFile(project as string, `Map${MAP_ID}.json`) as RmmzMap;
  return { ...structuredClone(shipped), events: structuredClone(shipped.events.slice(0, 56)) };
};

/**
 * Names a map as the project does.
 * @param {number} mapId The map.
 * @returns {string} Its name.
 */
const mapName = (mapId: number): string =>
{
  const infos = readDataFile(project as string, 'MapInfos.json') as (RmmzMapInfo | null)[];
  return infos[mapId]?.name ?? `Map ${mapId}`;
};

/**
 * Builds a window holding Foothills and the map beside it, the blueprints, none yet, and the record of placements, with
 * every check, the writer and the history router a map editor window has, over a disk of the two maps that takes each act
 * the way the server does: every map's patches checked against its file before anything is written.
 * @returns {FoothillsWindow} The window.
 */
const foothillsWindow = (): FoothillsWindow =>
{
  const disk = new Map<number, RmmzMap>([ [ MAP_ID, foothillsBefore() ], [ OTHER_MAP_ID, readDataFile(project as string, `Map${OTHER_MAP_ID}.json`) as RmmzMap ] ]);
  const store: DocumentStore = {
    load: async key => structuredClone(disk.get(Number(key.slice('map:'.length)))) as unknown as JsonValue,
    save: async (key, content) =>
    {
      disk.set(Number(key.slice('map:'.length)), structuredClone(content) as unknown as RmmzMap);
    },
  };
  const hub = new DocumentHub({ clientId: 'main', store });
  hub.addCommitCheck(blueprintShapeCheck(hub));
  holdBlueprints(hub, {});
  holdBlueprintUses(hub, []);
  [ MAP_ID, OTHER_MAP_ID ].forEach(mapId => hub.adopt(mapDocumentKey(mapId), structuredClone(disk.get(mapId)) as unknown as JsonValue));

  const counter = new BlueprintCopyCounter({ hub, readNotes: async () => notesOn(disk) });
  const maps = new CopyMaps({
    hub,
    copies: counter,
    holders: () => [],
    onHoldingChange: () => () => undefined,
    openDocument: (key: DocumentKey): Promise<EditorDocument> => (hub.has(key) ? Promise.resolve(hub.document(key)) : Promise.reject(new Error(`${key} is not to be opened here`))),
    readMap: async mapId => structuredClone(disk.get(mapId) as RmmzMap),
    templates: { revision: 1, listProblem: null, templateMapOf: () => null },
  });
  maps.start();
  hub.addCommitCheck(blueprintPropagationCheck({ hub, maps, tags: () => [] }));
  hub.setFileFit((key, patch) => maps.fileTakes(key, patch));
  hub.setFileWay((key, step, direction) => maps.fileWayOf(key, step, direction));

  let blueprints: JsonValue | null = null;
  const problems: string[] = [];
  const write = async (act: BlueprintWrite): Promise<void> =>
  {
    const staged = act.maps.map(({ map, patches }) =>
    {
      const file = MapDocument.fromJson(mapDocumentKey(map), structuredClone(disk.get(map) as RmmzMap));
      try
      {
        patches.forEach(patch => file.apply(patch));
      }
      catch (error)
      {
        throw new MapEditorApiError('PUT /api/blueprint-changes answered 409', 409, (error as Error).message);
      }

      return [ map, file.toJson() ] as const;
    });
    staged.forEach(([ map, file ]) => disk.set(map, file));
    blueprints = act.blueprints ?? blueprints;
  };
  const writer = new BlueprintWriter({ hub, maps, write, settleMs: 0, onProblem: message => problems.push(message) });
  const kept = blueprintsKeptGuard(hub, { start: () => counter.start(), countOf: blueprintId => usedCopiesOf(counter, hub, blueprintId) }, mapName);
  const router = new HistoryRouter(hub, null, (step, direction) => kept(step, direction) ?? writer.guard(step, direction), copiesLeftWords({ hub, mapName }));
  return { hub, router, disk, blueprintsOnDisk: () => blueprints, problems };
};

/**
 * Reads an event of Foothills, as the window holds it or as a file of it does.
 * @param {RmmzMap | MapDocument} map The map.
 * @param {number} eventId The event.
 * @returns {RmmzMapEvent} The event.
 */
const eventOf = (map: RmmzMap | MapDocument, eventId: number): RmmzMapEvent => map.events[eventId] as RmmzMapEvent;

/**
 * Reads which character of the sheet each ghastroom copy shows, in the window, then on disk.
 * @param {FoothillsWindow} window The window.
 * @returns {[ number[], number[] ]} The characters.
 */
const ghastroomFaces = (window: FoothillsWindow): [ number[], number[] ] =>
{
  const held = window.hub.map(mapDocumentKey(MAP_ID));
  const file = window.disk.get(MAP_ID) as RmmzMap;
  return [ GHASTROOM_COPIES.map(id => eventOf(held, id).pages[0].image.characterIndex), GHASTROOM_COPIES.map(id => eventOf(file, id).pages[0].image.characterIndex) ];
};

/**
 * Reads the J-ABS speed line of the copy he sped up, in the window, then on disk.
 * @param {FoothillsWindow} window The window.
 * @returns {[ JsonValue, JsonValue ]} The lines.
 */
const speedLines = (window: FoothillsWindow): [ JsonValue, JsonValue ] =>
{
  const held = eventOf(window.hub.map(mapDocumentKey(MAP_ID)), SPED_UP);
  const file = eventOf(window.disk.get(MAP_ID) as RmmzMap, SPED_UP);
  return [ held.pages[0].list[3].parameters[0], file.pages[0].list[3].parameters[0] ];
};

/**
 * Reports whether the disk holds what the window does: Foothills' file is the map with its unsaved edits taken back out,
 * and the blueprints on disk are the blueprints here.
 * @param {FoothillsWindow} window The window.
 * @param {readonly HistoryStep[]} unsaved The unsaved edits on Foothills, still applied.
 * @returns {boolean} True when they agree.
 */
const diskAgrees = (window: FoothillsWindow, unsaved: readonly HistoryStep[]): boolean =>
{
  const key = mapDocumentKey(MAP_ID);
  const patches = unsaved.flatMap(step => step.entries.filter(entry => entry.document === key).map(entry => entry.patch));
  const expected = window.hub.map(key).toJsonWithout(patches);
  return JSON.stringify(window.disk.get(MAP_ID)) === JSON.stringify(expected)
    && JSON.stringify(window.blueprintsOnDisk()) === JSON.stringify(window.hub.committedContent(BLUEPRINTS_DOCUMENT));
};

/**
 * Plays his first three steps: the stamp, the blueprint, four placements and a save of the map, then the blueprint opened.
 * @param {FoothillsWindow} window The window.
 * @returns {Promise<RmmzMap>} Foothills' file as the save left it.
 */
const placeFour = async (window: FoothillsWindow): Promise<RmmzMap> =>
{
  const { hub } = window;
  const key = mapDocumentKey(MAP_ID);
  const stamp = captureEventsStamp(hub.map(key), CAPTURED, 'stamp-1') as Stamp;
  saveBlueprint(hub, stamp, 'useless', drawsFor([ BLUEPRINT ]));
  PLACEMENTS.forEach(([ x, y ]) => placeBlueprint(hub, MAP_ID, BLUEPRINT, { at: { x, y }, shaping: 'auto', mode: 0, linkRefusal: null }));
  await hub.save(key);
  holdBlueprintMap(hub, BLUEPRINT);
  await settle();
  return structuredClone(window.disk.get(MAP_ID) as RmmzMap);
};

/**
 * Plays his fourth step on the blueprint already placed: the second ghastroom's graphic changed in its event's own window,
 * from the seventh character to the fifth.
 * @param {FoothillsWindow} window The window.
 * @returns {Promise<HistoryStep>} The graphic change, once written.
 */
const changePlacedGraphic = async (window: FoothillsWindow): Promise<HistoryStep> =>
{
  const { hub } = window;
  const [ { image } ] = eventOf(hub.map(blueprintMapKey(BLUEPRINT)), 21).pages;
  const changed = setPageImage(hub, { mapId: blueprintMapId(BLUEPRINT), eventId: 21 }, 0, { ...image, characterIndex: 5 });
  await settle();
  return (changed.ok ? changed.step : null) as HistoryStep;
};

/**
 * Plays his first four steps: the blueprint placed four times and saved, then its second ghastroom's graphic changed.
 * @param {FoothillsWindow} window The window.
 * @returns {Promise<HistoryStep>} The graphic change, once written.
 */
const changeGraphic = async (window: FoothillsWindow): Promise<HistoryStep> =>
{
  await placeFour(window);
  return changePlacedGraphic(window);
};

/**
 * Builds the Select tool on Foothills, every layer carried, as a map view's painting has it.
 * @param {FoothillsWindow} window The window.
 * @returns {ToolSession} The tool.
 */
const selectToolOn = (window: FoothillsWindow): ToolSession =>
{
  const settings = { ...INITIAL_PAINT_SETTINGS, tool: 'select' as const };
  return new ToolSession({
    hub: window.hub,
    map: () => window.hub.map(mapDocumentKey(MAP_ID)),
    layering: () => ({ mode: 0, marks: { tiles: new Set(), kinds: new Set() } }),
    settings: () => settings,
    pickBrush: () => undefined,
    pickTool: () => undefined,
    linkRefusal: () => null,
  });
};

/**
 * Drags the left button from one cell to another, as a hand on the map does.
 * @param {ToolSession} session The tool.
 * @param {MapCell} from Where the button goes down.
 * @param {MapCell} to Where it comes up.
 */
const dragOn = (session: ToolSession, from: MapCell, to: MapCell): void =>
{
  const pointer = (cell: MapCell) => ({ cell, quarter: { x: cell.x, y: cell.y, quarter: 0 as const }, shift: false, copy: false, override: false });
  session.press(pointer(from));
  session.move(pointer(to));
  session.release(pointer(to));
};

/**
 * Throws away Foothills' unsaved edits, the map taking its file again, as choosing the version on disk does.
 * @param {FoothillsWindow} window The window.
 */
const discardFoothills = (window: FoothillsWindow): void =>
{
  window.hub.reload(mapDocumentKey(MAP_ID), structuredClone(window.disk.get(MAP_ID)) as unknown as JsonValue);
};

/**
 * Plays his fifth step: the copy's J-ABS speed raised from 4.2 to 5.2 in its own event window's command list, as the
 * comment's editor does.
 * @param {FoothillsWindow} window The window.
 * @returns {HistoryStep} The edit.
 */
const raiseSpeed = (window: FoothillsWindow): HistoryStep =>
{
  const catalog = new CommandCatalog();
  registerBuiltInCommands(catalog);
  const histories: HistoryKey[] = [ eventHistoryKey(MAP_ID, SPED_UP) ];
  const editor = new CommandListEditor(window.hub, catalog, { documentKey: mapDocumentKey(MAP_ID), path: [ 'events', SPED_UP, 'pages', 0, 'list' ], histories });
  const draft = editor.draftAt(2);
  return editor.edit(2, { ...draft, continuation: [ { ...draft.continuation[0], parameters: [ '<moveSpeed:5.2>' ] } ] }) as HistoryStep;
};

/**
 * Changes one ghastroom copy's graphic by hand, in its own event window, to the third character.
 * @param {FoothillsWindow} window The window.
 * @param {number} eventId The copy.
 * @returns {HistoryStep} The edit.
 */
const changeCopyGraphic = (window: FoothillsWindow, eventId: number): HistoryStep =>
{
  const [ { image } ] = eventOf(window.hub.map(mapDocumentKey(MAP_ID)), eventId).pages;
  const changed = setPageImage(window.hub, { mapId: MAP_ID, eventId }, 0, { ...image, characterIndex: 3 });
  return (changed.ok ? changed.step : null) as HistoryStep;
};

/**
 * Reads the blueprint's own second ghastroom's character, as the blueprints keep it.
 * @param {FoothillsWindow} window The window.
 * @returns {number | undefined} The character.
 */
const blueprintFace = (window: FoothillsWindow): number | undefined =>
{
  return blueprintIn(window.hub.document(BLUEPRINTS_DOCUMENT), BLUEPRINT)?.stamp.events.find(event => event.id === 21)?.pages[0].image.characterIndex;
};

describe.skipIf(project === null)('undoing a blueprint\'s change on the shipped Foothills', () =>
{
  it('plays his six steps as he did: the graphic reaches every copy by its picture alone, and the speed lives in its window', async () =>
  {
    // Arrange.
    const window = foothillsWindow();

    // Act.
    const graphic = await changeGraphic(window);
    const speed = raiseSpeed(window);

    // Assert: the change's patch on the copy he sped up is its picture, never the whole event; the speed edit is in the
    // copy's own window's history alone, so the map's history goes straight from the speed edit's past to the graphic.
    const onCopy = graphic.entries.filter(entry => entry.document === 'map:301' && 'path' in entry.patch && entry.patch.path[1] === SPED_UP).map(entry => entry.patch);
    expect([
      onCopy.map(patch => ('path' in patch ? patch.path : [])),
      [ speed.label, speed.histories ],
      window.hub.history(mapHistoryKey(MAP_ID)).rows.map(row => row.label).slice(-1),
      ghastroomFaces(window),
      speedLines(window),
      diskAgrees(window, [ speed ]),
    ])
      .toStrictEqual([
        [ [ 'events', SPED_UP, 'pages', 0, 'image' ] ],
        [ 'Edit Comment', [ 'event:301:67' ] ],
        [ 'Change graphic (page 1)' ],
        [ [ 5, 5, 5, 5 ], [ 5, 5, 5, 5 ] ],
        [ '<moveSpeed:5.2>', '<moveSpeed:4.2>' ],
        true,
      ]);
  });

  it('undoes the graphic from the map on every copy, the speed staying, and redoes it, the disk keeping up', async () =>
  {
    // Arrange.
    const window = foothillsWindow();
    await changeGraphic(window);
    const speed = raiseSpeed(window);

    // Act.
    const undone = await window.router.undo(mapHistoryKey(MAP_ID));
    await settle();
    const afterUndo = [ ghastroomFaces(window), speedLines(window), blueprintFace(window), diskAgrees(window, [ speed ]) ];
    const redone = await window.router.redo(mapHistoryKey(MAP_ID));
    await settle();

    // Assert.
    expect([ undone, afterUndo, redone, ghastroomFaces(window), speedLines(window), blueprintFace(window), diskAgrees(window, [ speed ]), window.problems ])
      .toStrictEqual([
        { ok: true },
        [ [ [ 7, 7, 7, 7 ], [ 7, 7, 7, 7 ] ], [ '<moveSpeed:5.2>', '<moveSpeed:4.2>' ], 7, true ],
        { ok: true },
        [ [ 5, 5, 5, 5 ], [ 5, 5, 5, 5 ] ],
        [ '<moveSpeed:5.2>', '<moveSpeed:4.2>' ],
        5,
        true,
        [],
      ]);
  });

  it('undoes the graphic from the blueprint\'s tab on every copy, the speed staying, and redoes it, the disk keeping up', async () =>
  {
    // Arrange.
    const window = foothillsWindow();
    await changeGraphic(window);
    const speed = raiseSpeed(window);

    // Act.
    const undone = await window.router.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();
    const afterUndo = [ ghastroomFaces(window), speedLines(window), blueprintFace(window), diskAgrees(window, [ speed ]) ];
    const redone = await window.router.redo(blueprintHistoryKey(BLUEPRINT));
    await settle();

    // Assert.
    expect([ undone, afterUndo, redone, ghastroomFaces(window), speedLines(window), blueprintFace(window), diskAgrees(window, [ speed ]), window.problems ])
      .toStrictEqual([
        { ok: true },
        [ [ [ 7, 7, 7, 7 ], [ 7, 7, 7, 7 ] ], [ '<moveSpeed:5.2>', '<moveSpeed:4.2>' ], 7, true ],
        { ok: true },
        [ [ 5, 5, 5, 5 ], [ 5, 5, 5, 5 ] ],
        [ '<moveSpeed:5.2>', '<moveSpeed:4.2>' ],
        5,
        true,
        [],
      ]);
  });

  it('leaves on the map a copy whose graphic was changed by hand since when the change is undone, naming it, its file following the blueprint back', async () =>
  {
    // Arrange: the copy he sped up given the third character by hand after the blueprint's change, and not saved.
    const window = foothillsWindow();
    const saved = await placeFour(window);
    await changePlacedGraphic(window);
    const byHand = changeCopyGraphic(window, SPED_UP);

    // Act.
    const undone = await window.router.undo(mapHistoryKey(MAP_ID));
    await settle();
    const afterUndo = [ ghastroomFaces(window), blueprintFace(window), JSON.stringify(window.disk.get(MAP_ID)) === JSON.stringify(saved) ];
    const redone = await window.router.redo(mapHistoryKey(MAP_ID));
    await settle();

    // Assert: on the map the copy keeps the hand's third character; on disk, where the hand's change never went, every
    // copy goes back with the blueprint, the whole file byte for byte as it was saved, and comes forward again on redo.
    expect([ undone, afterUndo, redone, ghastroomFaces(window), diskAgrees(window, [ byHand ]), window.hub.isDirty(mapDocumentKey(MAP_ID)), window.problems ])
      .toStrictEqual([
        { ok: true, message: 'Undone, except on 1 copy changed since, which keeps your change: ghastroom (event 67) on Foothills.' },
        [ [ [ 7, 7, 3, 7 ], [ 7, 7, 7, 7 ] ], 7, true ],
        { ok: true },
        [ [ 5, 5, 3, 5 ], [ 5, 5, 5, 5 ] ],
        true,
        true,
        [],
      ]);
  });

  it('shows the copy following the blueprint on the map and on disk once the map\'s unsaved edits are thrown away after the undo', async () =>
  {
    // Arrange: as above, the change undone with the hand's third character still unsaved on the copy.
    const window = foothillsWindow();
    const saved = await placeFour(window);
    await changePlacedGraphic(window);
    changeCopyGraphic(window, SPED_UP);
    await window.router.undo(mapHistoryKey(MAP_ID));
    await settle();

    // Act.
    discardFoothills(window);

    // Assert.
    expect([ ghastroomFaces(window), blueprintFace(window), window.hub.isDirty(mapDocumentKey(MAP_ID)), JSON.stringify(window.disk.get(MAP_ID)) === JSON.stringify(saved) ])
      .toStrictEqual([ [ [ 7, 7, 7, 7 ], [ 7, 7, 7, 7 ] ], 7, false, true ]);
  });

  it('keeps on disk a copy\'s graphic changed by hand and saved since, when the change is undone', async () =>
  {
    // Arrange: the copy he sped up given the third character by hand, and the map saved.
    const window = foothillsWindow();
    await changeGraphic(window);
    changeCopyGraphic(window, SPED_UP);
    await window.hub.save(mapDocumentKey(MAP_ID));

    // Act.
    await window.router.undo(mapHistoryKey(MAP_ID));
    await settle();

    // Assert: the file holds the hand's third character as the map does, and the map reads saved.
    expect([ ghastroomFaces(window), diskAgrees(window, []), window.hub.isDirty(mapDocumentKey(MAP_ID)), window.problems ])
      .toStrictEqual([ [ [ 7, 7, 3, 7 ], [ 7, 7, 3, 7 ] ], true, false, [] ]);
  });

  it('leaves out of a redo a copy whose graphic was changed by hand since the undo, naming it, its file following the blueprint forward', async () =>
  {
    // Arrange: the change undone whole, then the second placement's ghastroom given the third character by hand.
    const window = foothillsWindow();
    await changeGraphic(window);
    await window.router.undo(blueprintHistoryKey(BLUEPRINT));
    await settle();
    changeCopyGraphic(window, 62);

    // Act: redone, then the map's unsaved edits thrown away.
    const redone: HistoryOutcome = await window.router.redo(blueprintHistoryKey(BLUEPRINT));
    await settle();
    const afterRedo = [ ghastroomFaces(window), blueprintFace(window) ];
    discardFoothills(window);

    // Assert: the copy keeps the hand's character on the map, and takes the blueprint's fifth on disk, which is what the
    // map shows once its edits are thrown away.
    expect([ redone, afterRedo, ghastroomFaces(window), window.problems ])
      .toStrictEqual([
        { ok: true, message: 'Redone, except on 1 copy changed since, which keeps your change: ghastroom (event 62) on Foothills.' },
        [ [ [ 5, 3, 5, 5 ], [ 5, 5, 5, 5 ] ], 5 ],
        [ [ 5, 5, 5, 5 ], [ 5, 5, 5, 5 ] ],
        [],
      ]);
  });

  it('moves a placed copy with the Select tool, its battlers, their links and its spot together, and undoes it byte for byte', () =>
  {
    // Arrange: the battlers' square, tiles and all, saved as a blueprint and placed at 19, 40, then selected whole.
    const window = foothillsWindow();
    const { hub } = window;
    const key = mapDocumentKey(MAP_ID);
    const stamp = captureAreaStamp(hub.map(key), { x: 6, y: 24, width: 4, height: 4 }, 'auto', 0, 'stamp-1') as Stamp;
    saveBlueprint(hub, stamp, 'battlers', drawsFor([ BLUEPRINT ]));
    const placed = placeBlueprint(hub, MAP_ID, BLUEPRINT, { at: { x: 19, y: 40 }, shaping: 'auto', mode: 0, linkRefusal: null });
    const copies = placed.ok ? placed.eventIds : [];
    const before = [ JSON.stringify(hub.map(key).toJson()), JSON.stringify(hub.committedContent(BLUEPRINT_USES_DOCUMENT)) ];
    const linksBefore = copies.map(id => blueprintLinkOf(eventOf(hub.map(key), id).note));
    const session = selectToolOn(window);
    dragOn(session, { x: 19, y: 40 }, { x: 22, y: 43 });

    // Act: dragged twelve tiles right, then undone.
    dragOn(session, { x: 19, y: 40 }, { x: 31, y: 40 });
    const moved = copies.map(id => [ eventOf(hub.map(key), id).x, eventOf(hub.map(key), id).y ]);
    const linksMoved = copies.map(id => blueprintLinkOf(eventOf(hub.map(key), id).note));
    const spots = usesOf(hub.document(BLUEPRINT_USES_DOCUMENT));
    hub.undo(mapHistoryKey(MAP_ID));

    // Assert: the battlers went with the tiles, links unchanged, and the spot with them; undo leaves the map and the
    // record exactly as they were.
    expect([
      copies.length,
      moved,
      linksMoved,
      spots,
      [ JSON.stringify(hub.map(key).toJson()), JSON.stringify(hub.committedContent(BLUEPRINT_USES_DOCUMENT)) ],
    ])
      .toStrictEqual([
        5,
        [ [ 33, 40 ], [ 34, 41 ], [ 32, 42 ], [ 31, 43 ], [ 31, 40 ] ],
        linksBefore,
        [ { blueprintId: BLUEPRINT, x: 31, y: 40, mapId: MAP_ID } ],
        before,
      ]);
  });

  it('still refuses to undo a step across two maps that no blueprint made, once a later edit changed what it changed', async () =>
  {
    // Arrange: a door pair across Foothills and the map beside it, then the Foothills end renamed by hand.
    const window = foothillsWindow();
    const { hub } = window;
    hub.edit('Place door pair', [ mapHistoryKey(MAP_ID), mapHistoryKey(OTHER_MAP_ID) ], tx =>
    {
      tx.set(mapDocumentKey(MAP_ID), [ 'events', 1, 'name' ], 'Door to the pass');
      tx.set(mapDocumentKey(OTHER_MAP_ID), [ 'note' ], 'paired with Foothills');
    });
    hub.edit('Rename door', [ eventHistoryKey(MAP_ID, 1) ], tx => tx.set(mapDocumentKey(MAP_ID), [ 'events', 1, 'name' ], 'Gate'));

    // Act.
    const undone = await window.router.undo(mapHistoryKey(OTHER_MAP_ID));

    // Assert.
    expect([ undone.ok === false && undone.message, hub.map(mapDocumentKey(OTHER_MAP_ID)).property('note') ])
      .toStrictEqual([ '"Place door pair" cannot be undone: "Rename door" later changed what "Place door pair" changed.', 'paired with Foothills' ]);
  });
});
