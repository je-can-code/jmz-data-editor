import React, { useState } from 'react';
import { Box, Collapse, IconButton, Stack, Typography } from '@mui/material';
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

  const headerPy = density === 'compact' ? 0.75 : 1;
  const contentPx = density === 'compact' ? 1.5 : 2;
  const contentPy = density === 'compact' ? 1 : 1.5;

  const accentColor = ACCENT_COLORS[ accent ];
  const hasAccent = accent !== 'neutral';

  const handleToggle = () =>
  {
    if (collapsible) setExpanded((prev) => !prev);
  };

  return (
    <Box
      sx={{
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid',
        borderColor: hasAccent ? accentColor : 'divider',
        borderRadius: 1,
        bgcolor: 'action.hover',
        overflow: 'hidden',
      }}
    >
      <Box
        onClick={collapsible ? handleToggle : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: contentPx,
          py: headerPy,
          borderBottom: (!collapsible || expanded) ? '1px solid' : 'none',
          borderColor: 'divider',
          cursor: collapsible ? 'pointer' : 'default',
          userSelect: 'none',
          '&:hover': collapsible ? { bgcolor: 'action.selected' } : {},
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant={'subtitle1'} fontWeight={600} lineHeight={1.3}>
            {title}
          </Typography>
          {subtitle
            ? (
              <Typography variant={'caption'} color={'text.secondary'} display={'block'}>
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
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
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
    </Box>
  );
}

export { BoardSectionCard };
export type { BoardSectionCardProps, BoardSectionCardAccent, BoardSectionCardDensity };
