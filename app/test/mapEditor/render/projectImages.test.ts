import { describe, expect, it } from 'vitest';
import type { MapEditorApi } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { TextureImage } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { ProjectImages, projectImagesFor } from '../../../src/mapEditor/render/projectImages.ts';

/*
 * Every map view in a window shares one image cache, which is what makes a second open of a map near-instant: its
 * tileset and character sheets are already decoded. The cache decodes each picture once, answers null for a missing
 * file, forgets a load that failed so the next request tries again, and loads a tileset's nine sheets in RMMZ order
 * with null for the sheets it leaves empty.
 */

/**
 * Builds a server whose images are blobs naming themselves, with some missing and one that fails once.
 * @returns {{ api: MapEditorApi, requests: string[] }} The server and every image it was asked for.
 */
const buildApi = () =>
{
  const requests: string[] = [];
  let failures = 1;
  const api = {
    loadImage: async (folder: string, name: string) =>
    {
      requests.push(`${folder}/${name}`);
      if (name === 'Missing')
      {
        return null;
      }

      if (name === 'Flaky' && failures > 0)
      {
        failures -= 1;
        throw new Error('the server hiccuped');
      }

      return new Blob([ `${folder}/${name}` ]);
    },
  } as unknown as MapEditorApi;
  return { api, requests };
};

/**
 * Decodes a blob into a stand-in image carrying its text.
 * @param {Blob} blob The file.
 * @returns {Promise<TextureImage>} The image.
 */
const decode = async (blob: Blob): Promise<TextureImage> => ({ text: await blob.text() }) as unknown as TextureImage;

describe('projectImages', () =>
{
  describe('ProjectImages', () =>
  {
    it('decodes each picture once, however many ask for it', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi();
      const images = new ProjectImages(api, decode);

      // Act.
      const [ first, second ] = await Promise.all([ images.image('characters', 'Actor1'), images.image('characters', 'Actor1') ]);
      const other = await images.image('faces', 'Actor1');

      // Assert: the same image both times; a different folder is a different picture.
      expect([ first === second, (first as unknown as { text: string }).text, (other as unknown as { text: string }).text, requests ])
        .toStrictEqual([ true, 'characters/Actor1', 'faces/Actor1', [ 'characters/Actor1', 'faces/Actor1' ] ]);
    });

    it('answers null for a missing file, and tries a failed load again next time', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi();
      const images = new ProjectImages(api, decode);

      // Act.
      const missing = await images.image('characters', 'Missing');
      const failed = await images.image('characters', 'Flaky').catch(() => 'failed');
      await Promise.resolve();
      const retried = await images.image('characters', 'Flaky');

      // Assert.
      expect([ missing, failed, (retried as unknown as { text: string }).text, requests.filter(request => request.endsWith('Flaky')).length ])
        .toStrictEqual([ null, 'failed', 'characters/Flaky', 2 ]);
    });

    it('loads a tileset\'s nine sheets in order, null where the tileset names none', async () =>
    {
      // Arrange.
      const { api } = buildApi();
      const images = new ProjectImages(api, decode);
      const tileset = { id: 1, flags: [], mode: 1, name: 'Outside', note: '', tilesetNames: [ 'A1', 'A2', '', '', '', 'B', '', '', 'E' ] };

      // Act.
      const sheets = await images.tilesetSheets(tileset);

      // Assert.
      expect(sheets.map(sheet => (sheet === null ? null : (sheet as unknown as { text: string }).text)))
        .toStrictEqual([ 'tilesets/A1', 'tilesets/A2', null, null, null, 'tilesets/B', null, null, 'tilesets/E' ]);
    });
  });

  describe('projectImagesFor', () =>
  {
    it('hands every view of one server the same cache, and another server its own', () =>
    {
      // Arrange.
      const one = buildApi().api;
      const two = buildApi().api;

      // Act.
      const caches = [ projectImagesFor(one), projectImagesFor(one), projectImagesFor(two) ];

      // Assert.
      expect([ caches[0] === caches[1], caches[0] === caches[2] ])
        .toStrictEqual([ true, false ]);
    });
  });
});
