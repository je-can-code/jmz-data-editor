/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { createResourceContext } from '@presentation/context/resources/factories/context.factory.tsx';
import { RPG_BaseDomainModel } from '@core/domain/entities/RPG_BaseDomainModel.ts';
import { executeLoad, executeSave } from '@services/DataService.ts';
import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';

// Mock DataService to prevent actual disk IO.
vi.mock('@services/DataService.ts', () => ({
  executeLoad: vi.fn(),
  executeSave: vi.fn(),
}));

// Mock ProjectPath context to simulate a valid project environment.
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
 * Dummy Domain Model for testing the factory.
 */
class MockModel
  extends RPG_BaseDomainModel<any>
{
  constructor(rmmz: any)
  {
    super(rmmz);
  }

  /**
   * Serializes the domain state back into the original RMMZ DTO format.
   * Leverages the original object to preserve unhandled fields.
   * @returns {any} The raw RMMZ data.
   */
  public toRmmz(): any
  {
    return {
      ...this._original, // Use the correct property to preserve original data
      id: this.id,
      name: this.name,
      note: this.syncNote(), // Ensure note is synced before returning
    };
  }

  /**
   * Synchronizes the internal note field.
   * @returns {string} The synchronized note.
   */
  protected syncNote(): string
  {
    // For the mock, we just return the current state of the note property.
    return this.note;
  }
}

describe('context.factory', () =>
{
  // create a test context using the factory.
  const {
    Provider,
    useResource
  } = createResourceContext(
    DatabaseFilenames.Enemies,
    MockModel,
    'TestResource'
  );

  /**
   * A helper component to capture the data loaded into the context.
   */
  const TestComponent = ({ onDataLoaded }: { onDataLoaded: (data: any) => void }) =>
  {
    const {
      data,
      loading
    } = useResource();

    // only notify when loading is complete.
    if (!loading)
    {
      onDataLoaded(data);
    }
    return null;
  };

  beforeEach(() =>
  {
    vi.clearAllMocks();
  });

  it('loads and maps data on mount, skipping index 0', async () =>
  {
    // RMMZ data files always start with null at index 0.
    const rawData = [
      null,
      {
        id: 1,
        name: 'Test'
      },
      {
        id: 2,
        name: 'Test 2'
      }
    ];
    (executeLoad as any).mockResolvedValue(rawData);

    let loadedData: any[] = [];
    render(
      <Provider>
        <TestComponent onDataLoaded={(data) => loadedData = data}/>
      </Provider>
    );

    // wait for the DataService to be called.
    await waitFor(() => expect(executeLoad)
      .toHaveBeenCalled());

    // check that the null was filtered and models were instantiated.
    expect(loadedData.length)
      .toBe(2);
    expect(loadedData[ 0 ])
      .toBeInstanceOf(MockModel);
    expect(loadedData[ 0 ].id)
      .toBe(1);
  });

  it('save() converts models back to RMMZ and prepends null', async () =>
  {
    const rawData = [
      null,
      {
        id: 1,
        name: 'Test'
      }
    ];
    (executeLoad as any).mockResolvedValue(rawData);

    let saveFn: any;
    const Grabber = () =>
    {
      const { save } = useResource();
      saveFn = save;
      return null;
    };

    render(
      <Provider>
        <Grabber/>
      </Provider>
    );

    await waitFor(() => expect(saveFn)
      .toBeDefined());

    const updatedModels = [
      new MockModel({
        id: 1,
        name: 'Updated'
      })
    ];

    // 2. Wrap the async call in act() to resolve the warning
    await act(async () =>
    {
      await saveFn(updatedModels);
    });

    // 3. Update assertion to include the note property produced by syncNote()
    expect(executeSave)
      .toHaveBeenCalledWith(
        '/test/project/data',
        DatabaseFilenames.Enemies,
        [
          null,
          {
            id: 1,
            name: 'Updated',
            note: '' // Added to match the model's output
          }
        ]
      );
  });
});
