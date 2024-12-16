import LoadingButton from "@mui/lab/LoadingButton";
import { Save } from "@mui/icons-material";
import React from "react";

const SaveStyles = {
  fontFamily: "monospace",
  position: "absolute",
  top: "1%",
  left: "13%",
};

type SaveButtonProps = {
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
    <LoadingButton
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
    </LoadingButton>
  </>
}