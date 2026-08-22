import type { ChangeEvent } from 'react';
import { Alert, Chip, Grid, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { EmojiEvents, Functions, TrendingUp } from '@mui/icons-material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { useJabs } from '@presentation/context/resources/jabs.context.tsx';
import {
  findDuplicateVariableIds,
  isDuplicateMetric,
  METRIC_GROUPS,
  type MetricShape,
} from '@boards/jabs/jabsMetricsGroups.ts';
import type { JabsMetricsConfig } from '@core/domain/valueObjects/jabs-config.ts';

/**
 * The icon standing for each kind of number, so the shape of a metric is legible at a glance rather
 * than only in its description.
 * @param {MetricShape} shape The kind of number the metric holds.
 */
const shapeIcon = (shape: MetricShape) =>
{
  if (shape === 'total')
  {
    return <Functions fontSize={'inherit'}/>;
  }

  if (shape === 'best')
  {
    return <EmojiEvents fontSize={'inherit'}/>;
  }

  return <TrendingUp fontSize={'inherit'}/>;
};

/**
 * The wording for each kind of number, used as the chip's tooltip.
 * @param {MetricShape} shape The kind of number the metric holds.
 */
const shapeLabel = (shape: MetricShape) =>
{
  if (shape === 'total')
  {
    return 'Running total - only ever grows.';
  }

  if (shape === 'best')
  {
    return 'Personal best - only moves when it is beaten.';
  }

  return 'Count - tallies occurrences.';
};

/**
 * Which game variable holds which combat statistic.
 *
 * J-ABS-Metrics records combat activity into game variables rather than a store of its own, because
 * variables are the one thing the event editor, the message window and every conditional branch can
 * already read - a trophy that fires at a thousand kills is one event page and nothing else.
 *
 * The price of that is twenty-six bare numbers, and the mistake this tab exists to prevent is
 * pointing two of them at the same variable. The game reports nothing when that happens; both
 * counters climb into the same slot and every figure downstream reads like a balance problem rather
 * than a typo.
 */
const JabsMetricsTab = () =>
{
  const {
    jabsConfig,
    setConfig,
  } = useJabs();

  const metrics = jabsConfig?.metrics ?? null;

  /**
   * Points a metric at a different variable, leaving every other block of the config untouched.
   * @param {keyof JabsMetricsConfig} key The metric being repointed.
   * @param {number} variableId The variable it should use.
   */
  const patchMetric = (key: keyof JabsMetricsConfig, variableId: number) =>
  {
    setConfig(prev =>
    {
      // spread rather than naming the blocks: listing them by hand is what silently drops any block added later.
      const base = prev ?? jabsConfig!;

      return {
        ...base,
        metrics: {
          ...base.metrics,
          [ key ]: variableId,
        },
      };
    });
  };

  /**
   * Reads a variable id out of a field, refusing anything that is not a whole number.
   * @param {keyof JabsMetricsConfig} key The metric being edited.
   * @param {ChangeEvent<HTMLInputElement>} event The field's change event.
   */
  const handleVariableIdOnChangeEvent = (key: keyof JabsMetricsConfig, event: ChangeEvent<HTMLInputElement>) =>
  {
    const parsed = Number.parseInt(event.target.value, 10);

    // an emptied field parses to NaN, and writing that would put a non-number where the game does
    // arithmetic. Falling back to zero keeps the field editable while reading as obviously unset.
    const variableId = Number.isNaN(parsed)
      ? 0
      : parsed;

    patchMetric(key, Math.max(0, variableId));
  };

  if (metrics === null)
  {
    return null;
  }

  const duplicates = findDuplicateVariableIds(metrics);

  return (
    <Grid container rowSpacing={2} columnSpacing={2} sx={{ p: 2, overflowY: 'auto' }}>
      {duplicates.size > 0 && (
        <Grid size={12}>
          <Alert severity={'error'}>
            <Typography variant={'body2'}>
              Two or more metrics are pointed at the same variable. The game will not complain- both
              counters will climb into the same slot, and every number derived from either will be wrong.
            </Typography>
          </Alert>
        </Grid>
      )}

      {METRIC_GROUPS.map(group => (
        <Grid size={12} key={group.title}>
          <BoardSectionCard title={group.title}>
            <Stack spacing={2}>
              <Typography variant={'body2'} color={'text.secondary'}>
                {group.description}
              </Typography>

              <Grid container rowSpacing={2} columnSpacing={2}>
                {group.metrics.map(descriptor => (
                  <Grid size={4} key={descriptor.key}>
                    <TextField
                      variant={'outlined'}
                      type={'number'}
                      label={descriptor.label}
                      value={metrics[ descriptor.key ]}
                      onChange={event => handleVariableIdOnChangeEvent(
                        descriptor.key,
                        event as ChangeEvent<HTMLInputElement>)}
                      size={'small'}
                      fullWidth
                      error={isDuplicateMetric(duplicates, descriptor.key, metrics[ descriptor.key ])}
                      helperText={descriptor.description}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <Tooltip title={shapeLabel(descriptor.shape)}>
                              <Chip
                                size={'small'}
                                variant={'outlined'}
                                icon={shapeIcon(descriptor.shape)}
                                label={descriptor.shape}
                                sx={{ mr: 1 }}
                              />
                            </Tooltip>
                          ),
                        },
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
            </Stack>
          </BoardSectionCard>
        </Grid>
      ))}
    </Grid>
  );
};

export default JabsMetricsTab;
