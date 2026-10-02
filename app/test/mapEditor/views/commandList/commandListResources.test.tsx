/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { createSoundPlayer, useCommandListResources } from '../../../../src/mapEditor/views/commandList/commandListResources.ts';

/*
 * Every command list reads with the project's names and ranks its search by the project's usage, both asked of the
 * server once per window, and neither needed for the list to work: a failure leaves ids as numbers and the search in
 * name order. Sounds preview one at a time at the command's volume and pitch. None of these tests plays a sound:
 * the audio element is a silent stand-in.
 */
describe('commandListResources', () =>
{
  /**
   * A silent stand-in for an audio element, recording what was asked of it.
   * @returns {object} The element and its record.
   */
  const silentAudio = () =>
  {
    const element = {
      volume: 1,
      playbackRate: 1,
      preservesPitch: true,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
    };
    return element;
  };

  describe('createSoundPlayer', () =>
  {
    it('plays a sound at its volume and pitch, stopping the one before', () =>
    {
      // Arrange.
      const made: ReturnType<typeof silentAudio>[] = [];
      const play = createSoundPlayer(() =>
      {
        const element = silentAudio();
        made.push(element);
        return element as unknown as HTMLAudioElement;
      });

      // Act.
      play('audio/se/Heal1', { volume: 90, pitch: 150 });
      play('audio/se/Bell', { volume: 250, pitch: 10 });

      // Assert: the second is bounded to what an audio element can play; the first was paused for it.
      expect(made.map(element => [ element.volume, element.playbackRate, element.play.mock.calls.length, element.pause.mock.calls.length ]))
        .toStrictEqual([ [ 0.9, 1.5, 1, 1 ], [ 1, 0.5, 1, 0 ] ]);
    });

    it('sets each sound up before it plays, and pauses the last', () =>
    {
      // Arrange.
      const elements: Record<string, unknown>[] = [];
      const play = createSoundPlayer(() =>
      {
        const element: Record<string, unknown> = { play: vi.fn(async () => undefined), pause: vi.fn() };
        elements.push(element);
        return element as unknown as HTMLAudioElement;
      });

      // Act.
      play('a', { volume: 45, pitch: 120 });
      play('b', { volume: 100, pitch: 100 });

      // Assert.
      expect([ elements[0]['volume'], elements[0]['playbackRate'], elements[0]['preservesPitch'], (elements[0]['pause'] as ReturnType<typeof vi.fn>).mock.calls.length ])
        .toStrictEqual([ 0.45, 1.2, false, 1 ]);
    });

    it('stays quiet about a sound that cannot play', async () =>
    {
      // Arrange.
      const play = createSoundPlayer(() => ({ play: vi.fn(async () => Promise.reject(new Error('missing'))), pause: vi.fn() }) as unknown as HTMLAudioElement);

      // Act.
      const attempt = () => play('audio/se/Gone', { volume: 90, pitch: 100 });

      // Assert.
      expect(attempt)
        .not.toThrow();
      await act(async () =>
      {
        await Promise.resolve();
      });
    });
  });

  describe('useCommandListResources', () =>
  {
    it('reads the names and usage once they arrive, asking the server once however many lists read them', async () =>
    {
      // Arrange.
      const api = {
        loadDatabaseNames: vi.fn(async () => ({ switches: [ '', 'Door' ] })),
        loadCommandUsage: vi.fn(async () => ({ events: 3, codes: { 250: 2 }, pluginCommands: [] })),
      } as unknown as MapEditorApi;

      // Act.
      const first = renderHook(() => useCommandListResources(api));
      const second = renderHook(() => useCommandListResources(api));
      await act(async () =>
      {
        await Promise.resolve();
      });

      // Assert.
      expect([
        first.result.current.names,
        [ ...second.result.current.usage.entries() ],
        vi.mocked(api.loadDatabaseNames).mock.calls.length,
        vi.mocked(api.loadCommandUsage).mock.calls.length,
      ])
        .toStrictEqual([ { switches: [ '', 'Door' ] }, [ [ 'core:250', 2 ] ], 1, 1 ]);
    });

    it('leaves ids as numbers and usage empty when the server cannot answer, or there is no server', async () =>
    {
      // Arrange.
      const api = {
        loadDatabaseNames: vi.fn(async () => Promise.reject(new Error('down'))),
        loadCommandUsage: vi.fn(async () => Promise.reject(new Error('down'))),
      } as unknown as MapEditorApi;

      // Act.
      const failing = renderHook(() => useCommandListResources(api));
      const serverless = renderHook(() => useCommandListResources(null));
      await act(async () =>
      {
        await Promise.resolve();
      });

      // Assert.
      expect([ failing.result.current.names, failing.result.current.usage.size, serverless.result.current.names, serverless.result.current.usage.size ])
        .toStrictEqual([ null, 0, null, 0 ]);
    });

    it('drops answers that arrive after the list has gone', async () =>
    {
      // Arrange.
      let answer: (value: unknown) => void = () => undefined;
      const api = {
        loadDatabaseNames: vi.fn(() => new Promise(resolve =>
        {
          answer = resolve;
        })),
        loadCommandUsage: vi.fn(async () => ({ events: 0, codes: {}, pluginCommands: [] })),
      } as unknown as MapEditorApi;
      const hook = renderHook(() => useCommandListResources(api));

      // Act.
      hook.unmount();
      await act(async () =>
      {
        answer({ switches: [] });
        await Promise.resolve();
      });

      // Assert: nothing to see but the absence of a warning about updating a component that has gone.
      expect(hook.result.current.names)
        .toBeNull();
    });
  });
});
