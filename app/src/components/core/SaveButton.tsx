import React from "react";
import { Button } from "@mui/material";
import { Save } from "@mui/icons-material";

const SaveStyles = {
  fontFamily: "monospace",
  position: "absolute",
  top: "1%",
  left: "13%",
};

type SaveButtonProps = {
  /**
   * The additional text to append to "Save". If you put "Panels" in this value, then the button would reflect "Save
   * Panels" instead of just "Save".
   */
  handleSave: () => void;
  canSave: boolean;
  extraSaveText?: string;
};

/**
 * A normalized button dedicated to being used to represent a "save data to disk".
 * @param handleSave The async function to execute upon clicking.
 * @param canSave The reverse conditional as to whether or not the button should be available.
 * @param extraSaveText Additional text to append after "Save" on the button.
 * @constructor
 */
export default function SaveButton({
  handleSave,
  canSave,
  extraSaveText,
}: SaveButtonProps)
{
  return <>
    <Button
      size={"small"}
      color={"secondary"}
      onClick={async () => handleSave()}
      loading={!canSave}
      loadingPosition={"start"}
      startIcon={<Save/>}
      variant="contained"
      sx={SaveStyles}
    >
      <span>{`Save ${extraSaveText ?? ''}`}</span>
    </Button>
  </>
}