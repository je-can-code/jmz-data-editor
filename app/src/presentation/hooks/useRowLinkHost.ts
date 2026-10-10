import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHANNEL_NAMES, openBroadcastChannel } from '@core/infrastructure/messaging/MessageChannelLike.ts';
import { RowLinkHost } from '@core/infrastructure/shell/RowLink.ts';

/**
 * Shows the rows the map editor asks the data editor for, such as the enemy a battler fights as: each request goes to the
 * row's board, selecting the row the way the data editor's own search does. Listens for as long as the data editor's
 * page is open.
 */
const useRowLinkHost = (): void =>
{
  const navigate = useNavigate();

  // the request is heard whenever it comes, with the router as it stands then.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() =>
  {
    const channel = openBroadcastChannel(CHANNEL_NAMES.shell);
    if (channel === null)
    {
      return undefined;
    }

    const host = new RowLinkHost(channel, location => navigateRef.current(location));
    host.start();
    return () =>
    {
      host.stop();
      channel.close();
    };
  }, []);
};

export { useRowLinkHost };
