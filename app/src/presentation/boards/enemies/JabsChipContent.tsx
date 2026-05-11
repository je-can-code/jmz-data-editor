import { Box, Tooltip, Typography } from '@mui/material';
import { ReactNode } from 'react';

type JabsChipContentProps = {
  /** Optional leading icon. Omitted by chips that intentionally render no icon (e.g. None pills). */
  icon?: ReactNode;
  label: string;
  description: string;
};

/**
 * Shared chip-content wrapper used by both the AI Traits chip row and the Battler Roles
 * segmented controls on the Enemies board. Renders the icon + label inside a MUI Tooltip so
 * authors can hover any chip to see what the trait/role actually does at runtime.
 *
 * Why the tooltip wraps the inner Box rather than the surrounding ToggleButton:
 * MUI's ToggleButtonGroup uses `React.Children.map + cloneElement` to inject `selected` /
 * `onChange` / `value` props onto its direct children. If we wrapped each ToggleButton in a
 * Tooltip at the group level, those props would land on the Tooltip element and never reach
 * the ToggleButton — the group integration (selected styling, exclusive-mode click handling)
 * would silently break. Wrapping the chip's inner content sidesteps that by keeping the
 * ToggleButton as the direct child of the group; the trade-off is a small dead zone on the
 * button's outer padding where hover won't trigger the tooltip, which is acceptable for
 * authoring UX.
 *
 * The Box fills its parent flexbox so the dead zone stays tiny — hover anywhere on the icon,
 * the label, or the gap between them shows the tooltip.
 */
const JabsChipContent = ({
  icon,
  label,
  description,
}: JabsChipContentProps) =>
{
  return <Tooltip
    title={
      <Box sx={{
        maxWidth: 320,
        py: 0.5
      }}>
        <Typography
          variant={'subtitle2'}
          sx={{
            fontWeight: 700,
            mb: 0.25
          }}
        >
          {label}
        </Typography>
        <Typography
          variant={'caption'}
          sx={{
            display: 'block',
            lineHeight: 1.4
          }}
        >
          {description}
        </Typography>
      </Box>
    }
    arrow={true}
    placement={'top'}
    enterDelay={300}
    enterNextDelay={150}
  >
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%'
    }}>
      {icon}
      {label}
    </Box>
  </Tooltip>;
};

export { JabsChipContent };