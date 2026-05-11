import { Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AutoFixHigh,
  Bolt,
  Favorite,
  Gavel,
  Psychology,
  Shield,
  TrendingUp,
  Whatshot
} from '@mui/icons-material';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';
import {
  JabsAiTrait,
  JabsAiTraitDescriptions
} from '@core/domain/valueObjects/jabs-ai-traits.ts';
import { JabsChipContent } from './JabsChipContent.tsx';

type EnemyJabsDataProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (updatedEnemy: RPG_EnemyDomainModel) => void;
};

/**
 * Chip-row editor for the eight skill-choice AI traits owned by `JABS_EnemyAI`. The eight flags
 * are split into two labeled rows — Attack (careful / executor / reckless / tactical /
 * berserker) and Support (cleanser / healer / buffer) — to mirror the plugin source's
 * `//region attack traits` and `//region support traits` groupings, and to match the
 * labeled-axis rhythm of the companion `EnemyJabsBattlerRoles` editor below this one. Within
 * each row the flags are independent toggles; the leader/follower mutual-exclusion rule lives
 * on `JabsBattlerRoles`, where it belongs.
 *
 * Each chip wraps its content in a MUI Tooltip via {@link JabsChipContent} so authors can hover
 * any trait to read what it actually does at runtime — sourced from the behavior in
 * `JABS_EnemyAI.decideAction` and the support/attack helpers, not just the JSDoc.
 */
const EnemyJabsAiTraits = ({
  selectedEnemy,
  updateEnemy,
}: EnemyJabsDataProps) =>
{
  //region derived values
  // derive each row's active-string array directly from the domain model. no useState/useEffect
  // mirror is needed — the parent recomposes on every domain mutation, so the chips re-render
  // in lockstep with the canonical truth.
  const attackTraitValues: string[] = [];
  if (selectedEnemy.jabsAiTraits.careful)
  {
    attackTraitValues.push(JabsAiTrait.Careful);
  }
  if (selectedEnemy.jabsAiTraits.executor)
  {
    attackTraitValues.push(JabsAiTrait.Executor);
  }
  if (selectedEnemy.jabsAiTraits.reckless)
  {
    attackTraitValues.push(JabsAiTrait.Reckless);
  }
  if (selectedEnemy.jabsAiTraits.tactical)
  {
    attackTraitValues.push(JabsAiTrait.Tactical);
  }
  if (selectedEnemy.jabsAiTraits.berserker)
  {
    attackTraitValues.push(JabsAiTrait.Berserker);
  }

  const supportTraitValues: string[] = [];
  if (selectedEnemy.jabsAiTraits.cleanser)
  {
    supportTraitValues.push(JabsAiTrait.Cleanser);
  }
  if (selectedEnemy.jabsAiTraits.healer)
  {
    supportTraitValues.push(JabsAiTrait.Healer);
  }
  if (selectedEnemy.jabsAiTraits.buffer)
  {
    supportTraitValues.push(JabsAiTrait.Buffer);
  }
  //endregion derived values

  const handleAttackTraitsChange = (
    _: unknown,
    newValues: string[]
  ) =>
  {
    // delegate to the value object; the support-trait flags stay untouched on this axis edit.
    selectedEnemy.jabsAiTraits.setAttackTraits(newValues);
    updateEnemy(selectedEnemy);
  };

  const handleSupportTraitsChange = (
    _: unknown,
    newValues: string[]
  ) =>
  {
    // delegate to the value object; the attack-trait flags stay untouched on this axis edit.
    selectedEnemy.jabsAiTraits.setSupportTraits(newValues);
    updateEnemy(selectedEnemy);
  };

  return <>
    <Typography
      variant={'subtitle1'}
      color={'primary'}
      sx={{
        fontWeight: 700,
        mt: 2,
        mb: 1
      }}
    >
      JABS AI Traits
    </Typography>

    <Stack
      spacing={1.5}
      sx={{ alignItems: 'stretch' }}
    >
      {/* Attack axis: careful / executor / reckless / tactical / berserker */}
      <Stack
        direction={'row'}
        spacing={2}
        alignItems={'center'}
      >
        <Typography
          variant={'body2'}
          color={'text.secondary'}
          sx={{
            minWidth: 72,
            fontWeight: 600
          }}
        >
          Attack
        </Typography>
        <ToggleButtonGroup
          orientation={'horizontal'}
          size={'small'}
          color={'primary'}
          value={attackTraitValues}
          onChange={handleAttackTraitsChange}
          sx={{
            // intentionally NO outer border / background: the row label + chip alignment
            // already groups these visually, and the Attack row wraps to 2 lines on tighter
            // viewports (5 chips), which makes a container border look stretched and awkward
            // around the empty space next to the wrapped chip. the Battler Roles tri-states
            // below keep their borders because the "None" pill in the middle benefits from
            // visual anchoring; flat multi-select flag rows like this one don't need it.
            // flex-wrap is a safety net: even after the parent column rebalance the Attack
            // row has 5 chips, which can still overflow a tight viewport. wrapping keeps
            // chips inside their parent column rather than spilling into a sibling column.
            flexWrap: 'wrap'
          }}
        >
          <ToggleButton
            value={JabsAiTrait.Careful}
            selected={selectedEnemy.jabsAiTraits.careful}
            sx={(theme) =>
              (
                {
                  // selected chips fill with a translucent tint of the accent color and shift
                  // their text/border to match — louder than a 1px border alone, so the author
                  // can scan a row and instantly read which flags are on without squinting.
                  // the icon keeps its own (always-vibrant) color so unselected chips retain
                  // their visual identity.
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.info.main, 0.16),
                      borderColor: theme.palette.info.main,
                      color: theme.palette.info.main,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.info.main, 0.24),
                        }
                    }
                }
              )}
          >
            <JabsChipContent
              icon={<Shield sx={(theme) =>
                (
                  {
                    color: theme.palette.info.main,
                    mr: 1
                  }
                )}/>}
              label={'Careful'}
              description={JabsAiTraitDescriptions[ JabsAiTrait.Careful ]}
            />
          </ToggleButton>

          <ToggleButton
            value={JabsAiTrait.Executor}
            selected={selectedEnemy.jabsAiTraits.executor}
            sx={(theme) =>
              (
                {
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.error.main, 0.16),
                      borderColor: theme.palette.error.main,
                      color: theme.palette.error.main,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.error.main, 0.24),
                        }
                    }
                }
              )}
          >
            <JabsChipContent
              icon={<Gavel sx={(theme) =>
                (
                  {
                    color: theme.palette.error.main,
                    mr: 1
                  }
                )}/>}
              label={'Executor'}
              description={JabsAiTraitDescriptions[ JabsAiTrait.Executor ]}
            />
          </ToggleButton>

          <ToggleButton
            value={JabsAiTrait.Reckless}
            selected={selectedEnemy.jabsAiTraits.reckless}
            sx={(theme) =>
              (
                {
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.warning.main, 0.16),
                      borderColor: theme.palette.warning.main,
                      color: theme.palette.warning.main,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.warning.main, 0.24),
                        }
                    }
                }
              )}
          >
            <JabsChipContent
              icon={<Bolt sx={(theme) =>
                (
                  {
                    color: theme.palette.warning.main,
                    mr: 1
                  }
                )}/>}
              label={'Reckless'}
              description={JabsAiTraitDescriptions[ JabsAiTrait.Reckless ]}
            />
          </ToggleButton>

          <ToggleButton
            value={JabsAiTrait.Tactical}
            selected={selectedEnemy.jabsAiTraits.tactical}
            sx={(theme) =>
              (
                {
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.secondary.main, 0.16),
                      borderColor: theme.palette.secondary.main,
                      color: theme.palette.secondary.main,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.secondary.main, 0.24),
                        }
                    }
                }
              )}
          >
            <JabsChipContent
              icon={<Psychology sx={(theme) =>
                (
                  {
                    color: theme.palette.secondary.main,
                    mr: 1
                  }
                )}/>}
              label={'Tactical'}
              description={JabsAiTraitDescriptions[ JabsAiTrait.Tactical ]}
            />
          </ToggleButton>

          <ToggleButton
            value={JabsAiTrait.Berserker}
            selected={selectedEnemy.jabsAiTraits.berserker}
            sx={(theme) =>
              (
                {
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.error.dark, 0.16),
                      borderColor: theme.palette.error.dark,
                      color: theme.palette.error.dark,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.error.dark, 0.24),
                        }
                    }
                }
              )}
          >
            <JabsChipContent
              icon={<Whatshot sx={(theme) =>
                (
                  {
                    color: theme.palette.error.dark,
                    mr: 1
                  }
                )}/>}
              label={'Berserker'}
              description={JabsAiTraitDescriptions[ JabsAiTrait.Berserker ]}
            />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Support axis: cleanser / healer / buffer */}
      <Stack
        direction={'row'}
        spacing={2}
        alignItems={'center'}
      >
        <Typography
          variant={'body2'}
          color={'text.secondary'}
          sx={{
            minWidth: 72,
            fontWeight: 600
          }}
        >
          Support
        </Typography>
        <ToggleButtonGroup
          orientation={'horizontal'}
          size={'small'}
          color={'primary'}
          value={supportTraitValues}
          onChange={handleSupportTraitsChange}
          sx={{
            // matches the Attack row above — no outer container border on flat flag rows.
            flexWrap: 'wrap'
          }}
        >
          <ToggleButton
            value={JabsAiTrait.Cleanser}
            selected={selectedEnemy.jabsAiTraits.cleanser}
            sx={(theme) =>
              (
                {
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.primary.main, 0.16),
                      borderColor: theme.palette.primary.main,
                      color: theme.palette.primary.main,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.primary.main, 0.24),
                        }
                    }
                }
              )}
          >
            <JabsChipContent
              icon={<AutoFixHigh sx={(theme) =>
                (
                  {
                    color: theme.palette.primary.main,
                    mr: 1
                  }
                )}/>}
              label={'Cleanser'}
              description={JabsAiTraitDescriptions[ JabsAiTrait.Cleanser ]}
            />
          </ToggleButton>

          <ToggleButton
            value={JabsAiTrait.Healer}
            selected={selectedEnemy.jabsAiTraits.healer}
            sx={(theme) =>
              (
                {
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.success.main, 0.16),
                      borderColor: theme.palette.success.main,
                      color: theme.palette.success.main,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.success.main, 0.24),
                        }
                    }
                }
              )}
          >
            <JabsChipContent
              icon={<Favorite sx={(theme) =>
                (
                  {
                    color: theme.palette.success.main,
                    mr: 1
                  }
                )}/>}
              label={'Healer'}
              description={JabsAiTraitDescriptions[ JabsAiTrait.Healer ]}
            />
          </ToggleButton>

          {/* Buffer's chip uses info.light (cool blue) rather than another shade of green so
              the eye doesn't have to disambiguate two near-identical green chips next to each
              other — Healer keeps the universal "HP green" association, Buffer reads as the
              "buff stat blue" complement. */}
          <ToggleButton
            value={JabsAiTrait.Buffer}
            selected={selectedEnemy.jabsAiTraits.buffer}
            sx={(theme) =>
              (
                {
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.info.light, 0.16),
                      borderColor: theme.palette.info.light,
                      color: theme.palette.info.light,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.info.light, 0.24),
                        }
                    }
                }
              )}
          >
            <JabsChipContent
              icon={<TrendingUp sx={(theme) =>
                (
                  {
                    color: theme.palette.info.light,
                    mr: 1
                  }
                )}/>}
              label={'Buffer'}
              description={JabsAiTraitDescriptions[ JabsAiTrait.Buffer ]}
            />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
    </Stack>
  </>;
};

export { EnemyJabsAiTraits };