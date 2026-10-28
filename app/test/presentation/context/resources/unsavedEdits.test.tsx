/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { executeLoad, executeSave } from '@services/DataService.ts';
import { DifficultyProvider, useDifficultyConfig } from '@presentation/context/resources/difficulty.context.tsx';
import { JabsProvider, useJabs } from '@presentation/context/resources/jabs.context.tsx';
import { LevelProvider, useLevelConfig } from '@presentation/context/resources/level.context.tsx';
import { MotionProvider, useMotionConfig } from '@presentation/context/resources/motion.context.tsx';
import { NotetagLinesProvider, useNotetagLinesConfig } from '@presentation/context/resources/notetag-lines.context.tsx';
import { SdpsProvider, useSdps } from '@presentation/context/resources/sdps.context.tsx';
import { useWeatherConfig, WeatherProvider } from '@presentation/context/resources/weather.context.tsx';

// keep every read and write off the disk.
vi.mock('@services/DataService.ts', () => ({
  executeLoad: vi.fn(),
  executeSave: vi.fn(),
}));

// stand in a project, so each provider has somewhere to read from.
vi.mock('@presentation/context/project-path.context.tsx', () => ({
  useProjectPath: () => ({
    projectRoot: '/test/project',
    rmmzDataPath: '/test/project/data',
    setProjectRoot: () =>
    {
    },
    systemDataGeneration: 0,
    projectReloadGeneration: 0,
    reloadProjectFromDisk: async () =>
    {
    },
  }),
}));

/**
 * What every hand-written provider offers a board, under one set of names.
 */
type ProviderView = {
  config: unknown;
  setConfig: (next: (previous: any) => any) => void;
  save: (config: any) => Promise<void>;
  reload: () => Promise<void>;
  hasUnsavedEdits: boolean;
};

/**
 * One hand-written provider: its component, and how to read it as a {@link ProviderView}.
 */
type ProviderCase = {
  name: string;
  Provider: (props: { children: React.ReactNode }) => React.ReactNode;
  useView: () => ProviderView;
};

/**
 * Every provider written by hand rather than built by a factory, read under one set of names.
 */
const PROVIDERS: ProviderCase[] = [
  {
    name: 'Level',
    Provider: LevelProvider,
    useView: () =>
    {
      const { levelConfig, ...rest } = useLevelConfig();
      return { config: levelConfig, ...rest };
    },
  },
  {
    name: 'JABS',
    Provider: JabsProvider,
    useView: () =>
    {
      const { jabsConfig, ...rest } = useJabs();
      return { config: jabsConfig, ...rest };
    },
  },
  {
    name: 'Difficulty',
    Provider: DifficultyProvider,
    useView: () =>
    {
      const { difficultyConfig, ...rest } = useDifficultyConfig();
      return { config: difficultyConfig, ...rest };
    },
  },
  {
    name: 'Motion',
    Provider: MotionProvider,
    useView: () =>
    {
      const { motionConfig, ...rest } = useMotionConfig();
      return { config: motionConfig, ...rest };
    },
  },
  {
    name: 'Weather',
    Provider: WeatherProvider,
    useView: () =>
    {
      const { weatherConfig, ...rest } = useWeatherConfig();
      return { config: weatherConfig, ...rest };
    },
  },
  {
    name: 'Tag Lines',
    Provider: NotetagLinesProvider,
    useView: () =>
    {
      const { notetagLinesConfig, ...rest } = useNotetagLinesConfig();
      return { config: notetagLinesConfig, ...rest };
    },
  },
  {
    name: 'SDP',
    Provider: SdpsProvider,
    useView: () => useSdps(),
  },
];

/**
 * The seven providers written by hand each say whether their file holds edits it does not, and their boards light Save
 * from that alone, so each has to wire it the same way the factories do. The answer must be no once the file is read
 * (an empty file here, which each fills in with its own defaults), yes after an edit, and no again once a save or a
 * reload brings the file and the config back into step. A save that fails reached nothing on disk, so it must leave the
 * answer at yes.
 */
describe.each(PROVIDERS)('the $name provider\'s unsaved edits', ({ Provider, useView }) =>
{
  beforeEach(() =>
  {
    vi.clearAllMocks();
    (executeLoad as any).mockResolvedValue(null);
    (executeSave as any).mockResolvedValue(undefined);
  });

  /**
   * Mounts the provider over an empty file and waits for it to be read.
   * @returns {() => ProviderView} Reads the provider's latest value.
   */
  const renderLoaded = async (): Promise<() => ProviderView> =>
  {
    let latest: ProviderView | null = null;
    const Grabber = () =>
    {
      latest = useView();
      return null;
    };

    render(
      <Provider>
        <Grabber/>
      </Provider>
    );

    const current = () => latest as unknown as ProviderView;
    await waitFor(() => expect(current().config)
      .not.toBeNull());
    return current;
  };

  /**
   * Edits the config, handing back a copy of it, as a board's controls do.
   * @param {() => ProviderView} current Reads the provider's latest value.
   */
  const edit = (current: () => ProviderView) =>
  {
    act(() =>
    {
      current().setConfig(previous => (Array.isArray(previous) ? [ ...previous ] : { ...previous }));
    });
  };

  it('holds nothing unsaved once the file is read, and an edit as unsaved', async () =>
  {
    // Arrange.
    const current = await renderLoaded();
    const read = current().hasUnsavedEdits;

    // Act.
    edit(current);

    // Assert.
    expect([ read, current().hasUnsavedEdits ])
      .toStrictEqual([ false, true ]);
  });

  it('holds nothing unsaved once a save writes the edit', async () =>
  {
    // Arrange.
    const current = await renderLoaded();
    edit(current);

    // Act.
    await act(async () =>
    {
      await current().save(current().config);
    });

    // Assert.
    expect([ (executeSave as any).mock.calls.length, current().hasUnsavedEdits ])
      .toStrictEqual([ 1, false ]);
  });

  it('still holds the edit as unsaved when the save fails', async () =>
  {
    // Arrange: a disk that refuses the write.
    const current = await renderLoaded();
    edit(current);
    (executeSave as any).mockRejectedValueOnce(new Error('the disk is full'));
    const consoleError = vi.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    // Act.
    let refused = '';
    await act(async () =>
    {
      await current().save(current().config)
        .catch((error: Error) =>
        {
          refused = error.message;
        });
    });
    consoleError.mockRestore();

    // Assert.
    expect([ refused, current().hasUnsavedEdits ])
      .toStrictEqual([ 'the disk is full', true ]);
  });

  it('holds nothing unsaved once the file is read again', async () =>
  {
    // Arrange.
    const current = await renderLoaded();
    edit(current);

    // Act.
    await act(async () =>
    {
      await current().reload();
    });

    // Assert: read twice, the second time over the edit.
    expect([ (executeLoad as any).mock.calls.length, current().hasUnsavedEdits ])
      .toStrictEqual([ 2, false ]);
  });
});
