import React from "react";
import { Box, Grid, Paper } from "@mui/material";

type EditorBoardSplitLayoutProps = {
  /**
   * CSS width for the left column (search + list).
   */
  sidebarColumnWidth: string;
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Two-column editor shell: fixed-width sidebar and a scrollable main pane (MUI {@link Paper}).
 * Intended as the primary child of the routed outlet so only the main pane scrolls.
 */
const EditorBoardSplitLayout = (props: EditorBoardSplitLayoutProps) =>
{
  const {
    sidebarColumnWidth,
    sidebar,
    children,
  } = props;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <Grid
        container
        spacing={2}
        wrap="nowrap"
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          alignItems: "stretch",
        }}
      >
        <Grid
          size="auto"
          sx={{
            width: sidebarColumnWidth,
            maxWidth: "100%",
            flexShrink: 0,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {sidebar}
        </Grid>

        <Grid
          size="grow"
          sx={{
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Paper
            elevation={10}
            sx={{
              flex: 1,
              minHeight: 0,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              padding: 2,
            }}
          >
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
              }}
            >
              {children}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default EditorBoardSplitLayout;
