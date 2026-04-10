/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import { JmzEditorYamlConfigReader } from '@platform/neutralino/readJmzEditorYamlConfig.ts';

describe('JmzEditorYamlConfigReader.candidateAbsolutePaths', () =>
{
  const original = typeof window !== 'undefined'
    ? window.NL_PATH
    : undefined;

  afterEach(() =>
  {
    if (typeof window === 'undefined')
    {
      return;
    }
    if (original === undefined)
    {
      delete window.NL_PATH;
    }
    else
    {
      window.NL_PATH = original;
    }
  });

  it('returns an empty list when NL_PATH is unset', () =>
  {
    delete window.NL_PATH;
    expect(JmzEditorYamlConfigReader.candidateAbsolutePaths())
      .toEqual([]);
  });

  it('joins .config/config.yaml under NL_PATH', () =>
  {
    window.NL_PATH = '/repo';
    expect(JmzEditorYamlConfigReader.candidateAbsolutePaths())
      .toEqual([ '/repo/.config/config.yaml' ]);
  });

  it('tries the parent directory when NL_PATH ends with app', () =>
  {
    window.NL_PATH = '/repo/app';
    expect(JmzEditorYamlConfigReader.candidateAbsolutePaths())
      .toEqual([
        '/repo/app/.config/config.yaml',
        '/repo/.config/config.yaml',
      ]);
  });

  it('uses backslashes when NL_PATH contains them', () =>
  {
    window.NL_PATH = 'C:\\games\\jmz-data-editor\\app';
    expect(JmzEditorYamlConfigReader.candidateAbsolutePaths())
      .toEqual([
        'C:\\games\\jmz-data-editor\\app\\.config\\config.yaml',
        'C:\\games\\jmz-data-editor\\.config\\config.yaml',
      ]);
  });
});
