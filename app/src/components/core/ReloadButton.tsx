import React from 'react';
import { Button } from '@mui/material';
import { SdCard } from '@mui/icons-material';

const ReloadStyles = {
  fontFamily: 'monospace',
  position: 'absolute',
  top: '1%',
  left: '23%',
};

type ReloadButtonProps = {
  handleReload: () => void;
  canReload: boolean;
  extraReloadText?: string;
};

/**
 * A normalized button dedicated to being used to represent a "reload data from disk".
 * @param handleReload The async function to execute upon clicking.
 * @param canReload The reverse conditional as to whether or not the button should be available.
 * @param extraReloadText Additional text to append after "Reload" on the button.
 * @constructor
 */
const ReloadButton = ({
  handleReload,
  canReload,
  extraReloadText,
}: ReloadButtonProps) =>
{
  return <>
    <Button
      size={'small'}
      color={'warning'}
      onClick={async () => handleReload()}
      loading={!canReload}
      loadingPosition={'start'}
      startIcon={<SdCard/>}
      variant={'contained'}
      sx={ReloadStyles}
    >
      <span>{`Reload ${extraReloadText ?? ''}`}</span>
    </Button>
  </>;
};

export default ReloadButton;
