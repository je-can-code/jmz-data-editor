import {AppBar, IconButton, Toolbar, Typography} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ProjectPickerButton from "./ProjectPickerButton.tsx";

type ProjectPathAppBarProps = {
  pathSetter: (value: string) => void;
  pathGetter: string;
};

const ProjectPathAppBar = (projectPathAppBarProps: ProjectPathAppBarProps) =>
{
  return (
    <AppBar position={"static"}>
      <Toolbar variant={"dense"}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          JMZ Data Editor
        </Typography>
        <Typography fontFamily={"monospace"} sx={{ flexGrow: 1 }}>
          {
            projectPathAppBarProps.pathGetter === ''
              ? 'project path unset.'
              : projectPathAppBarProps.pathGetter
          }
        </Typography>
        <ProjectPickerButton projectPathSetter={projectPathAppBarProps.pathSetter} />
      </Toolbar>
    </AppBar>
  );
};

export default ProjectPathAppBar;