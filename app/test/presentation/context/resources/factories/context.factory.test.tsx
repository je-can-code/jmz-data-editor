/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import {
  createResourceContext,
  type ResourceContextValue,
} from '@presentation/context/resources/factories/context.factory.tsx';
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
  const TestComponent = (
    { onLoaded }: { onLoaded: (ctx: { data: MockModel[]; byId: ReadonlyMap<number, MockModel> }) => void }
  ) =>
  {
    const {
      data,
      byId,
      loading
    } = useResource();

    if (!loading)
    {
      onLoaded({ data, byId });
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

    let loadedData: MockModel[] = [];
    let loadedById: ReadonlyMap<number, MockModel> = new Map();
    render(
      <Provider>
        <TestComponent onLoaded={({ data, byId }) =>
        {
          loadedData = data;
          loadedById = byId;
        }}/>
      </Provider>
    );

    await waitFor(() => expect(executeLoad)
      .toHaveBeenCalled());

    expect(loadedData.length)
      .toBe(2);
    expect(loadedData[ 0 ])
      .toBeInstanceOf(MockModel);
    expect(loadedData[ 0 ].id)
      .toBe(1);
    expect(loadedById.get(1)?.name)
      .toBe('Test');
    expect(loadedById.get(2)?.name)
      .toBe('Test 2');
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

/**
 * A database provider says whether its data holds edits the file does not, and every board built on one lights its
 * Save from that alone. So the answer must be no when the file has just been read, yes after any edit, and no again
 * once a save or a reload has brought the data and the file back into step. A save that fails changes nothing on disk,
 * so it must leave the answer at yes, or the author would lose the only sign that the edit is still unsaved. A board
 * that holds an edit back for a moment, as the Skills board does while the author types, can light Save ahead of it.
 */
describe('context.factory unsaved edits', () =>
{
  const {
    Provider,
    useResource
  } = createResourceContext(
    DatabaseFilenames.Enemies,
    MockModel,
    'TestResource'
  );

  beforeEach(() =>
  {
    vi.clearAllMocks();
    (executeLoad as any).mockResolvedValue([ null, { id: 1, name: 'Slime' } ]);
    (executeSave as any).mockResolvedValue(undefined);
  });

  /**
   * Mounts the provider over the one-row file and waits for it to be read.
   * @returns {() => ResourceContextValue<MockModel>} Reads the provider's latest value.
   */
  const renderLoaded = async (): Promise<() => ResourceContextValue<MockModel>> =>
  {
    let latest: ResourceContextValue<MockModel> | null = null;
    const Grabber = () =>
    {
      latest = useResource();
      return null;
    };

    render(
      <Provider>
        <Grabber/>
      </Provider>
    );

    const current = () => latest as unknown as ResourceContextValue<MockModel>;
    await waitFor(() => expect(current().data.length)
      .toBe(1));
    return current;
  };

  it('holds nothing unsaved once the file is read', async () =>
  {
    // Arrange: nothing beyond the provider itself.

    // Act.
    const current = await renderLoaded();

    // Assert.
    expect([ current().data[ 0 ].name, current().hasUnsavedEdits ])
      .toStrictEqual([ 'Slime', false ]);
  });

  it('holds an edit as unsaved', async () =>
  {
    // Arrange.
    const current = await renderLoaded();

    // Act.
    act(() =>
    {
      current().setData(rows => [ ...rows, new MockModel({ id: 2, name: 'Bat' }) ]);
    });

    // Assert.
    expect([ current().data.length, current().hasUnsavedEdits ])
      .toStrictEqual([ 2, true ]);
  });

  it('holds nothing unsaved once a save writes the edit', async () =>
  {
    // Arrange.
    const current = await renderLoaded();
    act(() =>
    {
      current().setData(rows => [ ...rows, new MockModel({ id: 2, name: 'Bat' }) ]);
    });

    // Act.
    await act(async () =>
    {
      await current().save(current().data);
    });

    // Assert.
    expect([ (executeSave as any).mock.calls.length, current().data.length, current().hasUnsavedEdits ])
      .toStrictEqual([ 1, 2, false ]);
  });

  it('still holds the edit as unsaved when the save fails', async () =>
  {
    // Arrange: a disk that refuses the write.
    const current = await renderLoaded();
    act(() =>
    {
      current().setData(rows => [ ...rows, new MockModel({ id: 2, name: 'Bat' }) ]);
    });
    (executeSave as any).mockRejectedValueOnce(new Error('the disk is full'));
    const consoleError = vi.spyOn(console, 'error')
      .mockImplementation(() => undefined);

    // Act.
    let refused = '';
    await act(async () =>
    {
      await current().save(current().data)
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
    act(() =>
    {
      current().setData(rows => [ ...rows, new MockModel({ id: 2, name: 'Bat' }) ]);
    });

    // Act.
    await act(async () =>
    {
      await current().reload();
    });

    // Assert.
    expect([ current().data.length, current().hasUnsavedEdits ])
      .toStrictEqual([ 1, false ]);
  });

  it('holds the data as unsaved ahead of an edit a board holds back', async () =>
  {
    // Arrange.
    const current = await renderLoaded();

    // Act.
    act(() =>
    {
      current().flagUnsavedEdits();
    });

    // Assert: the data itself is as it was read.
    expect([ current().data.length, current().hasUnsavedEdits ])
      .toStrictEqual([ 1, true ]);
  });
});
