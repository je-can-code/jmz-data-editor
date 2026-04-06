import { os } from "@neutralinojs/lib";
import { Button } from "@mui/material";
import {defaultDataPath} from "../../constants/PathConstants.ts";

type ProjectPickerButtonProps = {
  projectPathSetter: (value: string) => void;
};

export default function ProjectPickerButton(projectPathSetter: ProjectPickerButtonProps)
{
  const folderPicker = async () =>
  {
    const path = await os.showFolderDialog(
      "Choose your RMMZ data folder (contains Actors.json, Skills.json, …)",
      { defaultPath: defaultDataPath });

    if (!!path)
    {
      projectPathSetter.projectPathSetter(path);
    }
  };

  return <>
    <Button
      color={"inherit"}
      variant={"outlined"}
      onClick={async () => await folderPicker()}
    >
      {"Select data folder"}
    </Button>
  </>;
}