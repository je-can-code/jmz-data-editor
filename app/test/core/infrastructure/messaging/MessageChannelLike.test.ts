import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL_NAMES, openBroadcastChannel } from '../../../../src/core/infrastructure/messaging/MessageChannelLike.ts';

/*
 * Windows find each other by channel name, so every window must agree on the names, and opening a channel must
 * hand back a real BroadcastChannel wherever the platform has one and nothing where it does not, so the caller
 * can fall back instead of crashing at boot.
 */
describe('MessageChannelLike', () =>
{
  afterEach(() =>
  {
    vi.unstubAllGlobals();
  });

  it('names the three channels the windows share', () =>
  {
    // Arrange: nothing; the names are constants.

    // Act.
    const names = { ...CHANNEL_NAMES };

    // Assert.
    expect(names)
      .toStrictEqual({ shell: 'jmz-shell', sync: 'jmz-sync', fileChanges: 'jmz-file-changes' });
  });

  it('opens a real channel that reaches another channel of the same name', async () =>
  {
    // Arrange.
    const sender = openBroadcastChannel('jmz-test-channel');
    const receiver = openBroadcastChannel('jmz-test-channel');
    const heard = new Promise<unknown>(resolve =>
    {
      receiver?.addEventListener('message', event => resolve(event.data));
    });

    // Act.
    sender?.postMessage({ hello: 'there' });
    const message = await heard;
    sender?.close();
    receiver?.close();

    // Assert.
    expect(message)
      .toStrictEqual({ hello: 'there' });
  });

  it('answers null where the platform has no BroadcastChannel', () =>
  {
    // Arrange.
    vi.stubGlobal('BroadcastChannel', undefined);

    // Act.
    const channel = openBroadcastChannel('jmz-test-channel');

    // Assert.
    expect(channel)
      .toBeNull();
  });
});
