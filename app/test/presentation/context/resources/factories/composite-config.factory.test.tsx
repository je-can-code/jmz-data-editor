/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import {
  createCompositeConfigContext,
  type CompositeConfigContextValue,
} from '@presentation/context/resources/factories/composite-config.factory.tsx';
import { executeLoad, executeSave } from '@services/DataService.ts';
import ConfigFilenames from '@core/enums/ConfigFilenames.ts';

// keep every read and write off the disk.
vi.mock('@services/DataService.ts', () => ({
  executeLoad: vi.fn(),
  executeSave: vi.fn(),
}));

// stand in a project, so the provider has somewhere to read from.
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
 * A configuration with two root blocks, as the crafting and proficiency files have.
 */
type TestConfiguration = {
  recipes: string[];
  categories: string[];
};

/**
 * A configuration provider holds a whole plugin file, several root blocks at once, and says whether it holds edits the
 * file does not; the Crafting, Proficiency and Quests boards light their Save from that alone. The answer must be no
 * once the file is read, yes after any edit, and no again once a save or a reload brings the two back into step. A
 * save that fails leaves it at yes, since nothing reached the disk. A save writes the configuration exactly as handed
 * over, every block of it.
 */
describe('composite-config.factory', () =>
{
  const {
    Provider,
    useHook,
  } = createCompositeConfigContext<TestConfiguration>(ConfigFilenames.Crafting, 'TestConfig');

  beforeEach(() =>
  {
    vi.clearAllMocks();
    (executeLoad as any).mockResolvedValue({ recipes: [ 'Stew' ], categories: [ 'Soups' ] });
    (executeSave as any).mockResolvedValue(undefined);
  });

  /**
   * Mounts the provider over the file and waits for it to be read.
   * @returns {() => CompositeConfigContextValue<TestConfiguration>} Reads the provider's latest value.
   */
  const renderLoaded = async (): Promise<() => CompositeConfigContextValue<TestConfiguration>> =>
  {
    let latest: CompositeConfigContextValue<TestConfiguration> | null = null;
    const Grabber = () =>
    {
      latest = useHook();
      return null;
    };

    render(
      <Provider>
        <Grabber/>
      </Provider>
    );

    const current = () => latest as unknown as CompositeConfigContextValue<TestConfiguration>;
    await waitFor(() => expect(current().config)
      .not.toBeNull());
    return current;
  };

  /**
   * Adds a recipe, as the board's recipe list does.
   * @param {() => CompositeConfigContextValue<TestConfiguration>} current Reads the provider's latest value.
   */
  const addRecipe = (current: () => CompositeConfigContextValue<TestConfiguration>) =>
  {
    act(() =>
    {
      current().setConfig(config => ({ ...config as TestConfiguration, recipes: [ 'Stew', 'Pie' ] }));
    });
  };

  it('holds nothing unsaved once the file is read', async () =>
  {
    // Arrange: nothing beyond the provider itself.

    // Act.
    const current = await renderLoaded();

    // Assert.
    expect([ current().config, current().hasUnsavedEdits ])
      .toStrictEqual([ { recipes: [ 'Stew' ], categories: [ 'Soups' ] }, false ]);
  });

  it('holds an edit as unsaved', async () =>
  {
    // Arrange.
    const current = await renderLoaded();

    // Act.
    addRecipe(current);

    // Assert.
    expect([ current().config?.recipes, current().hasUnsavedEdits ])
      .toStrictEqual([ [ 'Stew', 'Pie' ], true ]);
  });

  it('writes the whole configuration as handed over, and holds nothing unsaved after', async () =>
  {
    // Arrange.
    const current = await renderLoaded();
    addRecipe(current);

    // Act.
    await act(async () =>
    {
      await current().save(current().config as TestConfiguration);
    });

    // Assert.
    expect([ (executeSave as any).mock.calls, current().hasUnsavedEdits ])
      .toStrictEqual([
        [ [ '/test/project/data', ConfigFilenames.Crafting, { recipes: [ 'Stew', 'Pie' ], categories: [ 'Soups' ] } ] ],
        false,
      ]);
  });

  it('still holds the edit as unsaved when the save fails', async () =>
  {
    // Arrange: a disk that refuses the write.
    const current = await renderLoaded();
    addRecipe(current);
    (executeSave as any).mockRejectedValueOnce(new Error('the disk is full'));
    const consoleError = vi.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    // Act.
    let refused = '';
    await act(async () =>
    {
      await current().save(current().config as TestConfiguration)
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

  it('holds nothing unsaved once the file is read again, dropping the edit', async () =>
  {
    // Arrange.
    const current = await renderLoaded();
    addRecipe(current);

    // Act.
    await act(async () =>
    {
      await current().reload();
    });

    // Assert.
    expect([ current().config?.recipes, current().hasUnsavedEdits ])
      .toStrictEqual([ [ 'Stew' ], false ]);
  });
});
