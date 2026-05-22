import React from 'react';
import { Box, Typography } from '@mui/material';

type BoardEmptyStateProps = {
  icon: React.ReactNode;
  message: string;
};

function BoardEmptyState({ icon, message }: BoardEmptyStateProps)
{
  return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      {icon}
      <Typography color={'text.secondary'}>{message}</Typography>
    </Box>
  );
}

export { BoardEmptyState };
