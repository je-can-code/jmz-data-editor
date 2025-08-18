import LoadingButton from "@mui/lab/LoadingButton";
import { Save, SdCard } from "@mui/icons-material";
import React from "react";

const ReloadStyles = {
  fontFamily: "monospace",
  position: "absolute",
  top: "1%",
  left: "23%",
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
 * @param extraReloadText Additional text to append after "Save" on the button.
 * @constructor
 */
const ReloadButton = ({
  handleReload,
  canReload,
  extraReloadText,
}: ReloadButtonProps) =>
{
  return <>
    <LoadingButton
      size={"small"}
      color={"warning"}
      onClick={async () => handleReload()}
      loading={!canReload}
      loadingPosition={"start"}
      startIcon={<SdCard/>}
      variant={"contained"}
      sx={ReloadStyles}
    >
      <span>{`Reload ${extraReloadText ?? ''}`}</span>
    </LoadingButton>
  </>
};

export default ReloadButton;