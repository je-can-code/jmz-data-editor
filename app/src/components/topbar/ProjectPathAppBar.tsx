import {
  AppBar,
  Toolbar,
  Typography
} from "@mui/material";
import ProjectPickerButton from "./ProjectPickerButton.tsx";

type ProjectPathAppBarProps = {
  onProjectPathChange: (value: string) => void;
  projectPath: string;
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
            projectPathAppBarProps.projectPath === ''
              ? 'project path unset.'
              : projectPathAppBarProps.projectPath
          }
        </Typography>
        <ProjectPickerButton projectPathSetter={projectPathAppBarProps.onProjectPathChange}/>
      </Toolbar>
    </AppBar>
  );
};

export default ProjectPathAppBar;
