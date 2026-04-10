import { describe, expect, it, } from 'vitest';

import { resolveGameProjectRootFromDataPath, resolveIconSetPngPath, } from '@services/ImageService.ts';

describe('resolveGameProjectRootFromDataPath', () =>
{
  it('strips a trailing data segment (forward slashes)', () =>
  {
    expect(resolveGameProjectRootFromDataPath('/opt/game/data'))
      .toBe('/opt/game');
  });

  it('strips a trailing data segment (backslashes)', () =>
  {
    expect(resolveGameProjectRootFromDataPath('C:\\RMMZ\\chef-adventure\\data'))
      .toBe('C:\\RMMZ\\chef-adventure');
  });

  it('strips a trailing Data segment case-insensitively (Windows)', () =>
  {
    expect(resolveGameProjectRootFromDataPath('C:\\RMMZ\\chef-adventure\\Data'))
      .toBe('C:\\RMMZ\\chef-adventure');
  });

  it('ignores a path whose last segment is not data', () =>
  {
    expect(resolveGameProjectRootFromDataPath('/opt/game'))
      .toBe('/opt/game');
  });

  it('returns empty string when the path is only data (no parent)', () =>
  {
    expect(resolveGameProjectRootFromDataPath('data'))
      .toBe('');
  });

  it('treats /data as the data dir at filesystem root', () =>
  {
    expect(resolveGameProjectRootFromDataPath('/data'))
      .toBe('/');
  });
});

describe('resolveIconSetPngPath', () =>
{
  it('points at img/system/IconSet.png under the project root', () =>
  {
    expect(resolveIconSetPngPath('/opt/game/data'))
      .toBe('/opt/game/img/system/IconSet.png');
  });

  it('uses backslashes when the input path uses them', () =>
  {
    expect(resolveIconSetPngPath('C:\\game\\data'))
      .toBe('C:\\game\\img\\system\\IconSet.png');
  });

  it('accepts a file:// URL to the data directory', () =>
  {
    expect(resolveIconSetPngPath('file:///opt/mygame/data'))
      .toBe('/opt/mygame/img/system/IconSet.png');
  });
});
