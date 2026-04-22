import React from "react";
import { Box, Typography } from "@mui/material";

const IndexBoard = () =>
{
  return (
    <Box sx={{
      flex: 1,
      minHeight: 0,
      overflow: "auto",
      p: 2,
    }}>
      <Typography component={"p"}>
        this is the index- WIP
      </Typography>
    </Box>
  );
};

export default IndexBoard;
