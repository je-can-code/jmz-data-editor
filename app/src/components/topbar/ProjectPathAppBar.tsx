import React, { useState } from 'react';
import { AppBar, Box, Button, Toolbar, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useProjectPath } from '@presentation/context/project-path.context.tsx';
import { JmzEditorYamlConfigReader } from '@platform/neutralino/readJmzEditorYamlConfig.ts';

const ProjectPathAppBar = () =>
{
  const {
    projectRoot,
    reloadProjectFromDisk
  } = useProjectPath();
  const [ busy, setBusy ] = useState(false);

  const onReload = async () =>
  {
    setBusy(true);
    try
    {
      await reloadProjectFromDisk();
    }
    finally
    {
      setBusy(false);
    }
  };

  return (
    <AppBar position={'static'}>
      <Toolbar
        variant={'dense'}
        sx={{
          gap: 2,
        }}
      >
        <Typography
          variant="h6"
          sx={{ flexShrink: 0 }}
        >
          JMZ Data Editor
        </Typography>
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 2,
            minWidth: 0,
          }}
        >
          <Typography
            component="span"
            fontFamily={'monospace'}
            sx={{
              minWidth: 0,
              maxWidth: 'min(65vw, 960px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}
          >
            {
              projectRoot === ''
                ? `project root unset — add ${JmzEditorYamlConfigReader.CONFIG_YAML_RELATIVE_HINT} (see config.example.yaml)`
                : projectRoot
            }
          </Typography>
          <Button
            color="inherit"
            disabled={busy}
            onClick={onReload}
            size="small"
            startIcon={<RefreshIcon/>}
            sx={{ flexShrink: 0 }}
            variant="outlined"
          >
            Reload project
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default ProjectPathAppBar;
