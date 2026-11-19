/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SystemService } from '@services/SystemService';
import { ProjectPathProvider, useProjectPath } from '@presentation/context/project-path.context.tsx';

// keep the system data off the disk; only where it is read from matters here.
vi.mock('@services/SystemService', () => ({
  SystemService: {
    loadSystemData: vi.fn(async () => undefined),
  },
}));

/*
 * The project root the editor shows and loads from is the one the API serves, handed over by the backend gate, from
 * the very first render. A root an earlier session left in local storage must never reach the bar or a load, and the
 * root must never start empty or stale and be corrected later, since every resource loads, or skips loading, on
 * whatever root it first sees.
 */
describe('ProjectPathProvider', () =>
{
  afterEach(() =>
  {
    window.localStorage.clear();
    vi.mocked(SystemService.loadSystemData)
      .mockClear();
  });

  it('starts on the API\'s root from the first render, never on one an earlier session left', async () =>
  {
    // Arrange- the stale root an earlier session stored, under today's key and the one before it.
    window.localStorage.setItem('rmmzProjectRoot', '/run/media/je/exdrive/dev/gaming/ca/chef-adventure/');
    window.localStorage.setItem('projectPath', '/run/media/je/exdrive/dev/gaming/ca/chef-adventure/data');
    const seen: string[][] = [];
    const Probe = () =>
    {
      const { projectRoot, rmmzDataPath } = useProjectPath();
      seen.push([ projectRoot, rmmzDataPath ]);
      return null;
    };

    // Act
    render(
      <ProjectPathProvider initialProjectRoot={'/games/test-project'}>
        <Probe/>
      </ProjectPathProvider>
    );

    // Assert- every render, the first included, saw the API's root, and the system data was read from it alone.
    await waitFor(() =>
    {
      expect(SystemService.loadSystemData)
        .toHaveBeenCalled();
    });
    expect(seen[0])
      .toEqual([ '/games/test-project', '/games/test-project/data' ]);
    expect(seen.every(([ projectRoot ]) => projectRoot === '/games/test-project'))
      .toBe(true);
    expect(vi.mocked(SystemService.loadSystemData).mock.calls)
      .toEqual([ [ '/games/test-project/data' ] ]);
  });
});
