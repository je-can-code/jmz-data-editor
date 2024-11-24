import {os} from "@neutralinojs/lib";
import {Button} from "@mui/material";

type ProjectPickerButtonProps = {
  projectPathSetter: (value: string) => void;
};

export default function ProjectPickerButton(projectPathSetter: ProjectPickerButtonProps)
{
  const folderPicker = async () =>
  {
    const path = await os.showFolderDialog(
      'Choose project data directory',
      { defaultPath: '/media/je/exdrive/dev/gaming/ca/chef-adventure/data' }
    );

    if (!!path)
    {
      projectPathSetter.projectPathSetter(path);
    }
  };

  return <>
    <Button color="inherit" onClick={async () => { await folderPicker(); }}>Select Project Root</Button>
  </>;
}