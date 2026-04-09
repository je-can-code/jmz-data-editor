import React from 'react';
import { Button } from '@mui/material';
import { Save } from '@mui/icons-material';

const SaveStyles = {
  fontFamily: 'monospace',
  position: 'absolute',
  top: '1%',
  left: '13%',
};

type SaveButtonProps = {
  handleSave: () => void;
  canSave: boolean;
  isSaving?: boolean;
  extraSaveText?: string;
};

/**
 * A normalized button dedicated to being used to represent a "save data to disk".
 * @param handleSave The async function to execute upon clicking.
 * @param canSave The reverse conditional whether the button should be available.
 * @param isSaving Whether or not the button is currently saving data.
 * @param extraSaveText Additional text to append after "Save" on the button.
 * @constructor
 */
export default function SaveButton({
  handleSave,
  canSave,
  isSaving = false,
  extraSaveText,
}: SaveButtonProps)
{
  return <>
    <Button
      size={'small'}
      color={'secondary'}
      onClick={async () => handleSave()}
      disabled={!canSave || isSaving}
      loading={isSaving}
      loadingPosition={'start'}
      startIcon={<Save/>}
      variant="contained"
      sx={SaveStyles}
    >
      <span>{`Save ${extraSaveText ?? ''}`}</span>
    </Button>
  </>;
}
