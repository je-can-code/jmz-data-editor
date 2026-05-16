import React, { useState } from 'react';
import { Box, Collapse, IconButton, Paper, Stack, Typography } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';

type BoardSectionCardAccent = 'neutral' | 'primary' | 'jabs' | 'plugin';
type BoardSectionCardDensity = 'comfortable' | 'compact';

type BoardSectionCardProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  density?: BoardSectionCardDensity;
  accent?: BoardSectionCardAccent;
  children: React.ReactNode;
};

const ACCENT_COLORS: Record<BoardSectionCardAccent, string> = {
  neutral: 'divider',
  primary: 'primary.main',
  jabs: '#00bcd4',
  plugin: 'secondary.main',
};

function BoardSectionCard({
  title,
  subtitle,
  actions,
  collapsible = false,
  defaultExpanded = true,
  density = 'comfortable',
  accent = 'neutral',
  children,
}: BoardSectionCardProps)
{
  const [ expanded, setExpanded ] = useState(defaultExpanded);

  const headerPy = density === 'compact'
    ? 0.75
    : 1.25;
  const contentPx = density === 'compact'
    ? 1.5
    : 2;
  const contentPy = density === 'compact'
    ? 1
    : 1.5;

  const accentColor = ACCENT_COLORS[ accent ];

  const handleToggle = () =>
  {
    if (collapsible)
    {
      setExpanded((prev) => !prev);
    }
  };

  return (
    <Paper
      variant={'outlined'}
      sx={{
        borderColor: 'divider',
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Box
        onClick={collapsible
          ? handleToggle
          : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: contentPx,
          py: headerPy,
          borderBottom: expanded
            ? '1px solid'
            : 'none',
          borderColor: 'divider',
          borderLeft: '3px solid',
          borderLeftColor: accentColor,
          cursor: collapsible
            ? 'pointer'
            : 'default',
          userSelect: 'none',
          '&:hover': collapsible
            ? { bgcolor: 'action.hover' }
            : {},
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant={'subtitle1'}
            fontWeight={600}
            lineHeight={1.3}
            noWrap
          >
            {title}
          </Typography>
          {subtitle
            ? (
              <Typography
                variant={'caption'}
                color={'text.secondary'}
                display={'block'}
              >
                {subtitle}
              </Typography>
            )
            : null}
        </Box>

        {actions
          ? (
            <Stack direction={'row'} spacing={0.5} alignItems={'center'} sx={{ ml: 1 }}>
              {actions}
            </Stack>
          )
          : null}

        {collapsible
          ? (
            <IconButton
              size={'small'}
              onClick={(e) =>
              {
                e.stopPropagation();
                handleToggle();
              }}
              sx={{
                ml: 0.5,
                transform: expanded
                  ? 'rotate(0deg)'
                  : 'rotate(-90deg)',
                transition: 'transform 200ms',
              }}
            >
              <ExpandMore fontSize={'small'}/>
            </IconButton>
          )
          : null}
      </Box>

      <Collapse in={!collapsible || expanded}>
        <Box sx={{ px: contentPx, py: contentPy }}>
          {children}
        </Box>
      </Collapse>
    </Paper>
  );
}

export { BoardSectionCard };
export type { BoardSectionCardProps, BoardSectionCardAccent, BoardSectionCardDensity };
