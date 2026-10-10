import type { EventNote } from '../blueprints/blueprintCopies.ts';
import type { BlueprintUsesMerge } from '../blueprints/blueprintUsesWriter.ts';
import type { Patch } from '../model/patches.ts';
import type { CommandUsageCounts } from '../commandList/commandUsage.ts';
import type { DatabaseNamesJson } from '../commandList/databaseNames.ts';
import { isEditorDataName } from '../model/documentKeys.ts';
import { isJsonObject, type JsonValue } from '../model/json.ts';
import type { RmmzCommonEvent, RmmzEventPage, RmmzMap, RmmzMapInfo, RmmzSystem, RmmzTileset } from '../model/rmmzTypes.ts';
import type { FreshSave } from '../pageRule/freshSave.ts';
import type { MapArrival } from '../properties/arrivals.ts';

/**
 * The image folders the map editor draws from: tilesets, character sheets, faces, parallaxes and system sheets, and the
 * pictures J-Weather draws its particles with.
 */
type ImageFolder = 'tilesets' | 'characters' | 'faces' | 'parallaxes' | 'system' | 'weather';

/**
 * The audio folders RMMZ keeps sounds in.
 */
type AudioFolder = 'bgm' | 'bgs' | 'me' | 'se';

/**
 * The header every save carries with the saving window's id; the server repeats it on the change events the
 * save causes, so a window can tell its own saves from anyone else's.
 */
const CLIENT_HEADER = 'X-Jmz-Client';

/**
 * One change to a blueprint as it is written to disk, made, undone or redone (PUT /api/blueprint-changes): the blueprints
 * given whole, when they change, and the patches each map file the change reached takes, in the order they go, each map
 * named once. With {@code check} set, nothing is written; every patch is only tried against its file.
 */
type BlueprintWrite = {
  readonly check?: boolean;
  readonly blueprints?: JsonValue;
  readonly maps: readonly { readonly map: number; readonly patches: readonly Patch[] }[];
};

/**
 * One enemy of Enemies.json, as much of it as the map editor reads: its id, its name and its note.
 */
type EnemyRow = {
  readonly id: number;
  readonly name: string;
  readonly note: string;
};

/**
 * One map event standing as a battler of an enemy, with the first of its pages naming that enemy, whole (GET
 * /api/enemies/{enemyId}/battler-pages).
 */
type EnemyBattlerPage = {
  readonly mapId: number;
  readonly eventId: number;
  readonly eventName: string;
  readonly page: RmmzEventPage;
};

/**
 * Every call the map editor makes to the server, behind one seam so tests can stand in for it. Nothing in the
 * map editor calls {@code fetch} directly.
 */
interface MapEditorApi
{
  /**
   * This window's id, sent with every save.
   */
  readonly clientId: string;

  /**
   * Reads a map file.
   * @param {number} mapId The map id.
   * @returns {Promise<RmmzMap>} The file's content.
   */
  loadMap(mapId: number): Promise<RmmzMap>;

  /**
   * Writes a map file, creating it when new.
   * @param {number} mapId The map id.
   * @param {RmmzMap} map The complete map, in its exact file shape.
   * @returns {Promise<void>} Settles once written.
   */
  saveMap(mapId: number, map: RmmzMap): Promise<void>;

  /**
   * Writes a new map's file, in MZ's layout as a save would, but only where no file is: the server refuses with a 412
   * while a file exists, whoever wrote it, and writes nothing.
   * @param {number} mapId The map id.
   * @param {RmmzMap} map The complete map, in its exact file shape.
   * @returns {Promise<void>} Settles once written.
   */
  createMap(mapId: number, map: RmmzMap): Promise<void>;

  /**
   * Removes a map file. The server refuses while the map tree still lists the map, so the tree's row goes first.
   * @param {number} mapId The map id.
   * @returns {Promise<void>} Settles once the file is gone.
   */
  deleteMap(mapId: number): Promise<void>;

  /**
   * Reads a map file exactly as it sits on disk, byte for byte, for putting it back exactly after a delete.
   * @param {number} mapId The map id.
   * @returns {Promise<string | null>} The file's text, or null when the file is missing.
   */
  loadMapFile(mapId: number): Promise<string | null>;

  /**
   * Brings a removed map's file back from its former text, written byte for byte. The server refuses while the file
   * exists.
   * @param {number} mapId The map id.
   * @param {string} text The file's former text, as {@link loadMapFile} read it.
   * @returns {Promise<void>} Settles once the file is back.
   */
  restoreMapFile(mapId: number, text: string): Promise<void>;

  /**
   * Reads every transfer on disk, on any map, that names outright a tile of a map as where it lands: what a resize
   * of that map must warn about, since it leaves them pointing at the old spots.
   * @param {number} mapId The map landed on.
   * @returns {Promise<MapArrival[]>} The transfers, by the map they are on, then event and page; empty when none.
   */
  loadArrivals(mapId: number): Promise<MapArrival[]>;

  /**
   * Reads every event note on disk, on any map, that holds anything, exactly as written: what the copies of every
   * blueprint are counted from, since a copy's link to its blueprint lives in its note. Optional, so a client that
   * cannot read them still serves everything else; the copies then cannot be counted.
   * @returns {Promise<EventNote[]>} The notes, by map and then event; empty when none holds anything.
   */
  loadEventNotes?(): Promise<EventNote[]>;

  /**
   * Reads the map tree.
   * @returns {Promise<(RmmzMapInfo | null)[]>} The rows, index 0 null.
   */
  loadMapInfos(): Promise<(RmmzMapInfo | null)[]>;

  /**
   * Writes the map tree.
   * @param {readonly (RmmzMapInfo | null)[]} infos The complete array.
   * @returns {Promise<void>} Settles once written.
   */
  saveMapInfos(infos: readonly (RmmzMapInfo | null)[]): Promise<void>;

  /**
   * Reads the tilesets.
   * @returns {Promise<(RmmzTileset | null)[]>} The rows, index 0 null.
   */
  loadTilesets(): Promise<(RmmzTileset | null)[]>;

  /**
   * Writes the tilesets.
   * @param {readonly (RmmzTileset | null)[]} tilesets The complete array.
   * @returns {Promise<void>} Settles once written.
   */
  saveTilesets(tilesets: readonly (RmmzTileset | null)[]): Promise<void>;

  /**
   * Builds the address of a project image, for anything that loads images by URL.
   * @param {ImageFolder} folder The folder under {@code img/}.
   * @param {string} name The file name without {@code .png}.
   * @returns {string} The URL.
   */
  imageUrl(folder: ImageFolder, name: string): string;

  /**
   * Reads a project image.
   * @param {ImageFolder} folder The folder under {@code img/}.
   * @param {string} name The file name without {@code .png}.
   * @returns {Promise<Blob | null>} The image, or null when the file is missing.
   */
  loadImage(folder: ImageFolder, name: string): Promise<Blob | null>;

  /**
   * Lists the images in a folder, for pickers such as the face picker. Optional, so a client that cannot list
   * folders still serves everything else; a picker without it takes a typed name instead.
   * @param {ImageFolder} folder The folder under {@code img/}.
   * @returns {Promise<string[]>} The file names without {@code .png}, sorted; empty when the folder is missing.
   */
  listImages?(folder: ImageFolder): Promise<string[]>;

  /**
   * Builds the address of a project sound, for anything that plays sounds by URL.
   * @param {AudioFolder} folder The folder under {@code audio/}.
   * @param {string} name The file name without {@code .ogg}.
   * @returns {string} The URL.
   */
  audioUrl(folder: AudioFolder, name: string): string;

  /**
   * Reads a plugin's source, for its headers.
   * @param {string} path The plugin's path under {@code js/plugins/}, without {@code .js}; may hold subfolders.
   * @returns {Promise<string | null>} The source, or null when the file is missing.
   */
  loadPluginSource(path: string): Promise<string | null>;

  /**
   * Reads {@code js/plugins.js}, the list of installed plugins and whether each is enabled.
   * @returns {Promise<string>} The file's text.
   */
  loadPluginList(): Promise<string>;

  /**
   * Reads one of the project's plugin config files, such as {@code data/config.lighting.json}, which the plugin modules
   * draw with. Optional, so a client that cannot read them still serves everything else; a module without its config
   * falls back as its plugin would.
   * @param {string} name The name the server serves the file under: {@code lighting} for config.lighting.json.
   * @returns {Promise<JsonValue>} The file's content; rejects for a project without the file.
   */
  loadPluginConfig?(name: string): Promise<JsonValue>;

  /**
   * Reads an editor-only document.
   * @param {string} key Its name: lowercase letters, digits and hyphens.
   * @returns {Promise<JsonValue | null>} The document, or null when none has been saved yet.
   */
  loadEditorData(key: string): Promise<JsonValue | null>;

  /**
   * Writes an editor-only document.
   * @param {string} key Its name: lowercase letters, digits and hyphens.
   * @param {JsonValue} document The complete document.
   * @returns {Promise<void>} Settles once written.
   */
  saveEditorData(key: string, document: JsonValue): Promise<void>;

  /**
   * Merges some maps' placements of blueprints into the record of where blueprints are placed, as it stands on disk at
   * that moment, every map the merge does not name staying exactly as the file holds it: the record is never written
   * whole, so two windows saving two maps at once both land. The server refuses a record of a newer shape with a 409,
   * and never writes over a file that is not a record of placements.
   * @param {BlueprintUsesMerge} merge What to merge.
   * @returns {Promise<void>} Settles once written.
   */
  mergeBlueprintUses(merge: BlueprintUsesMerge): Promise<void>;

  /**
   * Writes one change to a blueprint in one act: the blueprints given whole, and the patches every map file the change
   * reached takes, each map's applied to its file as it stands and checked first against what the file holds where it
   * lands. Nothing is written unless every one fits: a map changed on disk since is refused with a 409 naming it. With
   * {@code check} set, every patch is tried and nothing is written. Optional, so a client that cannot write them still
   * serves everything else; a blueprint's changes then reach no file.
   * @param {BlueprintWrite} write What to write.
   * @returns {Promise<void>} Settles once written, or checked.
   */
  writeBlueprintChanges?(write: BlueprintWrite): Promise<void>;

  /**
   * Builds the address of the server's file-change stream.
   * @returns {string} The URL.
   */
  fileChangesUrl(): string;

  /**
   * Reads the common events, {@code data/CommonEvents.json}, through the database route the data editor uses.
   * @returns {Promise<(RmmzCommonEvent | null)[]>} The rows, index 0 null.
   */
  loadCommonEvents(): Promise<(RmmzCommonEvent | null)[]>;

  /**
   * Writes the common events the way every map editor save is written: in MZ's own layout, and announced on the
   * change stream as this window's, so its own save never comes back as an outside change.
   * @param {readonly (RmmzCommonEvent | null)[]} commonEvents The complete array.
   * @returns {Promise<void>} Settles once written.
   */
  saveCommonEvents(commonEvents: readonly (RmmzCommonEvent | null)[]): Promise<void>;

  /**
   * Reads the game's settings, {@code data/System.json}, through the database route the data editor uses: the map editor
   * holds them for the names of the switches and variables.
   * @returns {Promise<RmmzSystem>} The settings.
   */
  loadSystem(): Promise<RmmzSystem>;

  /**
   * Writes the game's switch and variable names, announced on the change stream as this window's: they go into
   * System.json as it stands on disk, every other setting staying as the file holds it, in whichever layout the file
   * already has, on one line as MZ keeps it or indented as the data editor leaves it. So a renamed switch changes that
   * name in the file and nothing else, however old this window's copy of the other settings is.
   * @param {RmmzSystem} system The whole of the settings, of which the server takes the two lists of names.
   * @returns {Promise<void>} Settles once written.
   */
  saveSystem(system: RmmzSystem): Promise<void>;

  /**
   * Reads where the project the server serves lives on this machine, which names it: what the editor remembers between
   * sessions for one project is kept apart from another's by it. Optional, so a client that cannot say still serves
   * everything else; nothing is then remembered.
   * @returns {Promise<string>} The project's root folder, or an empty string when the server has none.
   */
  loadProjectRoot?(): Promise<string>;

  /**
   * Reads how many of the project's events use each command, which the command search ranks by.
   * @returns {Promise<CommandUsageCounts>} The counts.
   */
  loadCommandUsage(): Promise<CommandUsageCounts>;

  /**
   * Reads the names of the project's switches, variables and database rows, which command rows read with.
   * @returns {Promise<DatabaseNamesJson>} The names, each list indexed by id.
   */
  loadDatabaseNames(): Promise<DatabaseNamesJson>;

  /**
   * Reads what a new game starts with, which is the party it seats: the map views show each event's page as a fresh
   * save would, and a page can wait for an actor in the party. Optional, so a client that cannot read it still serves
   * everything else; the page rule then seats nobody.
   * @returns {Promise<FreshSave>} The new game's party.
   */
  loadNewGame?(): Promise<FreshSave>;

  /**
   * Reads the enemies, {@code data/Enemies.json}, through the database route the data editor uses: J-ABS's battler panel
   * reads each one's name and the note its battler tags fall back to. Optional, so a client that cannot read them still
   * serves everything else; the panel then names enemies by id and reads no note.
   * @returns {Promise<(EnemyRow | null)[]>} The rows, index 0 null.
   */
  loadEnemies?(): Promise<(EnemyRow | null)[]>;

  /**
   * Reads every map event on disk standing as a battler of an enemy, each with the first of its pages naming it, which
   * J-ABS's battler brush shapes a new battler of that enemy after. Optional, so a client that cannot read them still
   * serves everything else; the brush then shapes every battler after the game's most common one.
   * @param {number} enemyId The enemy.
   * @returns {Promise<EnemyBattlerPage[]>} The battlers, by map and then event; empty when the enemy stands nowhere.
   */
  loadEnemyBattlerPages?(enemyId: number): Promise<EnemyBattlerPage[]>;
}

/**
 * A request the server answered with something other than success.
 */
class MapEditorApiError extends Error
{
  /**
   * The HTTP status, or 0 when the answer was not understood at all.
   */
  readonly status: number;

  /**
   * What the server said went wrong, in its own words, such as the file it could not read and why: the error its
   * envelope carried, or the text of its answer. Empty when it said nothing, or nothing was asked of it.
   */
  readonly detail: string;

  /**
   * @param {string} message What went wrong, naming the route.
   * @param {number} status The HTTP status.
   * @param {string} detail What the server said, or empty.
   */
  constructor(message: string, status: number, detail = '')
  {
    super(message);
    this.name = 'MapEditorApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Reads what a failed answer says went wrong: the error its envelope carries when it is one, as every JSON route
 * answers, or else its text as it stands.
 * @param {string} text The answer's text, trimmed.
 * @returns {string} The server's words, or empty when it said nothing.
 */
const serverWords = (text: string): string =>
{
  let envelope: unknown = null;
  try
  {
    envelope = JSON.parse(text);
  }
  catch
  {
    return text;
  }

  return isJsonObject(envelope) && typeof envelope['path'] === 'string' && typeof envelope['error'] === 'string' && envelope['error'] !== ''
    ? envelope['error']
    : text;
};

/**
 * Options for the HTTP client.
 */
type HttpMapEditorApiOptions = {
  /**
   * The server's origin, such as {@code http://127.0.0.1:8080}.
   */
  apiBase: string;

  /**
   * This window's id.
   */
  clientId: string;

  /**
   * The fetch to use; the global one by default.
   */
  fetch?: typeof fetch;
};

/**
 * Encodes each segment of a path for a URL, keeping the slashes between them.
 * @param {string} path The path.
 * @returns {string} The encoded path.
 */
const encodePath = (path: string): string =>
{
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
};

/**
 * Checks a map id before it becomes part of a URL.
 * @param {number} mapId The map id.
 * @returns {number} The same id.
 */
const requireMapId = (mapId: number): number =>
{
  if (Number.isInteger(mapId) === false || mapId < 1)
  {
    throw new MapEditorApiError(`a map id is a positive integer, not ${mapId}`, 0);
  }

  return mapId;
};

/**
 * Checks an enemy id before it becomes part of a URL.
 * @param {number} enemyId The enemy id.
 * @returns {number} The same id.
 */
const requireEnemyId = (enemyId: number): number =>
{
  if (Number.isInteger(enemyId) === false || enemyId < 1)
  {
    throw new MapEditorApiError(`an enemy id is a positive integer, not ${enemyId}`, 0);
  }

  return enemyId;
};

/**
 * Checks an editor-data key before it becomes part of a URL; the server would refuse anything else.
 * @param {string} key The key.
 * @returns {string} The same key.
 */
const requireEditorDataKey = (key: string): string =>
{
  if (isEditorDataName(key) === false)
  {
    throw new MapEditorApiError(`an editor-data key is lowercase letters, digits and hyphens, not "${key}"`, 0);
  }

  return key;
};

/**
 * Checks a plugin config's name before it becomes part of a URL: the server serves each config under a name of
 * lowercase letters, digits and hyphens, so nothing else could name one.
 * @param {string} name The name.
 * @returns {string} The same name.
 */
const requireConfigName = (name: string): string =>
{
  if (/^[a-z0-9-]+$/u.test(name) === false)
  {
    throw new MapEditorApiError(`a config's name is lowercase letters, digits and hyphens, not "${name}"`, 0);
  }

  return name;
};

/**
 * The map editor's client for the Go server. JSON reads come back in the server's envelope
 * ({@code {path, error, data}}), which is unwrapped here; anything else is an error rather than a guess, so a
 * route that changed shape fails loudly on the first call instead of handing the editor {@code undefined}.
 * Saves are {@code PUT}s of the exact RMMZ shape, carrying this window's id.
 */
class HttpMapEditorApi implements MapEditorApi
{
  readonly clientId: string;

  #base: string;

  #fetch: typeof fetch;

  /**
   * @param {HttpMapEditorApiOptions} options Where the server is, and who this window is.
   */
  constructor(options: HttpMapEditorApiOptions)
  {
    this.#base = options.apiBase.replace(/\/+$/u, '');
    this.clientId = options.clientId;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  async loadMap(mapId: number): Promise<RmmzMap>
  {
    return this.#getJson<RmmzMap>(`/api/maps/${requireMapId(mapId)}`);
  }

  async saveMap(mapId: number, map: RmmzMap): Promise<void>
  {
    return this.#put(`/api/maps/${requireMapId(mapId)}`, map);
  }

  async createMap(mapId: number, map: RmmzMap): Promise<void>
  {
    // HTTP's own way of saying "only where nothing is yet", which the server checks and writes under one lock.
    return this.#put(`/api/maps/${requireMapId(mapId)}`, map, { 'If-None-Match': '*' });
  }

  async deleteMap(mapId: number): Promise<void>
  {
    const route = `/api/maps/${requireMapId(mapId)}`;
    const response = await this.#fetch(`${this.#base}${route}`, {
      method: 'DELETE',
      headers: { [CLIENT_HEADER]: this.clientId },
    });
    await this.#requireOk(response, `DELETE ${route}`);
  }

  async loadMapFile(mapId: number): Promise<string | null>
  {
    const route = `/api/maps/${requireMapId(mapId)}/file`;
    const response = await this.#fetch(`${this.#base}${route}`, { method: 'GET' });
    if (response.status === 404)
    {
      return null;
    }

    await this.#requireOk(response, `GET ${route}`);
    return response.text();
  }

  async restoreMapFile(mapId: number, text: string): Promise<void>
  {
    // the text goes as it is, never parsed and encoded again, since its exact bytes are the point.
    const route = `/api/maps/${requireMapId(mapId)}/file`;
    const response = await this.#fetch(`${this.#base}${route}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        [CLIENT_HEADER]: this.clientId,
      },
      body: text,
    });
    await this.#requireOk(response, `PUT ${route}`);
  }

  async loadArrivals(mapId: number): Promise<MapArrival[]>
  {
    // the answer names the map it is about, so a late answer for another map is never taken for this one's.
    const answer = await this.#getJson<{ mapId: number; arrivals: MapArrival[] }>(`/api/maps/${requireMapId(mapId)}/arrivals`);
    if (answer.mapId !== mapId)
    {
      throw new MapEditorApiError(`GET /api/maps/${mapId}/arrivals answered about map ${answer.mapId}`, 0);
    }

    return answer.arrivals;
  }

  async loadEventNotes(): Promise<EventNote[]>
  {
    const answer = await this.#getJson<{ notes: EventNote[] }>('/api/event-notes');
    return answer.notes;
  }

  async loadMapInfos(): Promise<(RmmzMapInfo | null)[]>
  {
    return this.#getJson<(RmmzMapInfo | null)[]>('/api/mapinfos');
  }

  async saveMapInfos(infos: readonly (RmmzMapInfo | null)[]): Promise<void>
  {
    return this.#put('/api/mapinfos', infos);
  }

  async loadTilesets(): Promise<(RmmzTileset | null)[]>
  {
    return this.#getJson<(RmmzTileset | null)[]>('/api/tilesets');
  }

  async saveTilesets(tilesets: readonly (RmmzTileset | null)[]): Promise<void>
  {
    return this.#put('/api/tilesets', tilesets);
  }

  imageUrl(folder: ImageFolder, name: string): string
  {
    return `${this.#base}/api/img/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
  }

  async loadImage(folder: ImageFolder, name: string): Promise<Blob | null>
  {
    const response = await this.#fetch(this.imageUrl(folder, name), { method: 'GET' });
    if (response.status === 404)
    {
      return null;
    }

    await this.#requireOk(response, `GET img/${folder}/${name}`);
    return response.blob();
  }

  async listImages(folder: ImageFolder): Promise<string[]>
  {
    // the server leaves an empty list out of its envelope, as it does every empty answer.
    const names = await this.#getJson<string[] | undefined>(`/api/img/${encodeURIComponent(folder)}`);
    return names ?? [];
  }

  audioUrl(folder: AudioFolder, name: string): string
  {
    return `${this.#base}/api/audio/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`;
  }

  async loadPluginSource(path: string): Promise<string | null>
  {
    const response = await this.#fetch(`${this.#base}/api/plugin-source/${encodePath(path)}`, { method: 'GET' });
    if (response.status === 404)
    {
      return null;
    }

    await this.#requireOk(response, `GET plugin-source/${path}`);
    return response.text();
  }

  async loadPluginList(): Promise<string>
  {
    const response = await this.#fetch(`${this.#base}/api/plugin-metadata`, { method: 'GET' });
    await this.#requireOk(response, 'GET plugin-metadata');
    return response.text();
  }

  async loadPluginConfig(name: string): Promise<JsonValue>
  {
    return this.#getJson<JsonValue>(`/api/config/${requireConfigName(name)}`);
  }

  async loadEditorData(key: string): Promise<JsonValue | null>
  {
    return this.#getJson<JsonValue>(`/api/editor-data/${requireEditorDataKey(key)}`, true);
  }

  async saveEditorData(key: string, document: JsonValue): Promise<void>
  {
    return this.#put(`/api/editor-data/${requireEditorDataKey(key)}`, document);
  }

  async mergeBlueprintUses(merge: BlueprintUsesMerge): Promise<void>
  {
    return this.#put('/api/editor-data/blueprint-uses/maps', merge);
  }

  async writeBlueprintChanges(write: BlueprintWrite): Promise<void>
  {
    return this.#put('/api/blueprint-changes', write);
  }

  fileChangesUrl(): string
  {
    return `${this.#base}/api/file-changes`;
  }

  async loadCommonEvents(): Promise<(RmmzCommonEvent | null)[]>
  {
    return this.#getJson<(RmmzCommonEvent | null)[]>('/api/common-events');
  }

  async saveCommonEvents(commonEvents: readonly (RmmzCommonEvent | null)[]): Promise<void>
  {
    return this.#put('/api/common-events', commonEvents);
  }

  async loadSystem(): Promise<RmmzSystem>
  {
    return this.#getJson<RmmzSystem>('/api/system');
  }

  async saveSystem(system: RmmzSystem): Promise<void>
  {
    return this.#put('/api/system', system);
  }

  async loadProjectRoot(): Promise<string>
  {
    // the health route says where the project is; a server started without one leaves it out.
    const health = await this.#getJson<{ projectRoot?: string }>('/api/health');
    return health.projectRoot ?? '';
  }

  async loadCommandUsage(): Promise<CommandUsageCounts>
  {
    return this.#getJson<CommandUsageCounts>('/api/command-usage');
  }

  async loadDatabaseNames(): Promise<DatabaseNamesJson>
  {
    return this.#getJson<DatabaseNamesJson>('/api/database-names');
  }

  async loadNewGame(): Promise<FreshSave>
  {
    return this.#getJson<FreshSave>('/api/new-game');
  }

  async loadEnemies(): Promise<(EnemyRow | null)[]>
  {
    return this.#getJson<(EnemyRow | null)[]>('/api/enemies');
  }

  async loadEnemyBattlerPages(enemyId: number): Promise<EnemyBattlerPage[]>
  {
    // the answer names the enemy it is about, so a late answer for another enemy is never taken for this one's.
    const answer = await this.#getJson<{ enemyId: number; battlers: EnemyBattlerPage[] }>(`/api/enemies/${requireEnemyId(enemyId)}/battler-pages`);
    if (answer.enemyId !== enemyId)
    {
      throw new MapEditorApiError(`GET /api/enemies/${enemyId}/battler-pages answered about enemy ${answer.enemyId}`, 0);
    }

    return answer.battlers;
  }

  /**
   * Reads a JSON route and unwraps the server's envelope.
   * @param {string} route The route, from {@code /api} on.
   * @param {boolean} allowMissing True to answer null for a 404 instead of throwing.
   * @returns {Promise<T>} The envelope's data.
   */
  async #getJson<T>(route: string, allowMissing = false): Promise<T>
  {
    const response = await this.#fetch(`${this.#base}${route}`, { method: 'GET' });
    if (allowMissing && response.status === 404)
    {
      return null as T;
    }

    await this.#requireOk(response, `GET ${route}`);
    const text = await response.text();
    let envelope: unknown;
    try
    {
      envelope = JSON.parse(text);
    }
    catch
    {
      throw new MapEditorApiError(`GET ${route} did not answer with JSON`, response.status);
    }

    // the envelope names the project path; a body without one is some other shape entirely.
    if (isJsonObject(envelope) === false || typeof envelope['path'] !== 'string')
    {
      throw new MapEditorApiError(`GET ${route} did not answer in the API envelope`, response.status);
    }

    const { error, data } = envelope;
    if (typeof error === 'string' && error !== '')
    {
      throw new MapEditorApiError(`GET ${route}: ${error}`, response.status, error);
    }

    return data as T;
  }

  /**
   * Writes a whole document with a PUT, carrying this window's id, which the change stream hands back on the
   * change the write causes.
   * @param {string} route The route, from {@code /api} on.
   * @param {unknown} body The complete document.
   * @param {Record<string, string>} conditions Any further headers the write depends on, such as If-None-Match.
   * @returns {Promise<void>} Settles once the server confirms the write.
   */
  async #put(route: string, body: unknown, conditions: Record<string, string> = {}): Promise<void>
  {
    const response = await this.#fetch(`${this.#base}${route}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        [CLIENT_HEADER]: this.clientId,
        ...conditions,
      },
      body: JSON.stringify(body),
    });
    await this.#requireOk(response, `PUT ${route}`);
  }

  /**
   * Throws, naming the route and the server's words, unless the response succeeded. A failed JSON route answers in
   * the envelope, whose error is what it has to say, so that is what the error says rather than the envelope whole.
   * @param {Response} response The response.
   * @param {string} what The request, for the message.
   */
  async #requireOk(response: Response, what: string): Promise<void>
  {
    if (response.ok)
    {
      return;
    }

    const detail = serverWords((await response.text()).trim());
    throw new MapEditorApiError(`${what} answered ${response.status}${detail === '' ? '' : `: ${detail}`}`, response.status, detail);
  }
}

export { CLIENT_HEADER, HttpMapEditorApi, MapEditorApiError };
export type { AudioFolder, BlueprintWrite, EnemyBattlerPage, EnemyRow, HttpMapEditorApiOptions, ImageFolder, MapEditorApi };
