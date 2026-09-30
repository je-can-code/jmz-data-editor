/**
 * A message as a BroadcastChannel delivers it.
 */
type ChannelMessageEvent = { readonly data: unknown };

/**
 * Hears messages on a channel.
 */
type ChannelMessageListener = (event: ChannelMessageEvent) => void;

/**
 * The part of {@link BroadcastChannel} the editors use. Every window of one origin that opens a channel of the
 * same name hears every message posted on it by the others (never its own), across renderer processes too, so
 * this is how windows talk to each other and to the NW.js shell. Tests stand in for it with an in-memory network.
 */
interface MessageChannelLike
{
  /**
   * Sends a message to every other channel of the same name. It is structured-cloned on the way.
   * @param {unknown} message The message; plain data only.
   */
  postMessage(message: unknown): void;

  /**
   * Listens for messages.
   * @param {'message'} type Always {@code message}.
   * @param {ChannelMessageListener} listener Called once per message.
   */
  addEventListener(type: 'message', listener: ChannelMessageListener): void;

  /**
   * Stops listening.
   * @param {'message'} type Always {@code message}.
   * @param {ChannelMessageListener} listener The listener to remove.
   */
  removeEventListener(type: 'message', listener: ChannelMessageListener): void;

  /**
   * Closes the channel; nothing more is sent or heard.
   */
  close(): void;
}

/**
 * Opens a channel by name.
 */
type ChannelFactory = (name: string) => MessageChannelLike;

/**
 * The channel names every window agrees on.
 *
 * - {@code shell}: pages asking the NW.js shell to open windows.
 * - {@code sync}: map editor windows keeping shared documents and histories in step.
 * - {@code fileChanges}: the one window watching the server's change stream relaying it to the rest.
 */
const CHANNEL_NAMES = {
  shell: 'jmz-shell',
  sync: 'jmz-sync',
  fileChanges: 'jmz-file-changes',
} as const;

/**
 * Opens a real BroadcastChannel, or answers null where the platform has none.
 * @param {string} name The channel name.
 * @returns {MessageChannelLike | null} The channel.
 */
const openBroadcastChannel = (name: string): MessageChannelLike | null =>
{
  if (typeof BroadcastChannel === 'undefined')
  {
    return null;
  }

  return new BroadcastChannel(name) as unknown as MessageChannelLike;
};

export { CHANNEL_NAMES, openBroadcastChannel };
export type { ChannelFactory, ChannelMessageEvent, ChannelMessageListener, MessageChannelLike };
