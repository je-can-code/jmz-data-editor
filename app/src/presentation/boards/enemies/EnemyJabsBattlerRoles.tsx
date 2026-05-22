import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { alpha } from '@mui/material/styles';
import {
  Anchor,
  Group,
  HealthAndSafety,
  Person,
  Security,
  Star
} from '@mui/icons-material';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';
import {
  JabsBattlerRole,
  JabsBattlerRoleDescriptions,
  JabsCoordinationAxisNoneDescription,
  JabsProtectionAxisNoneDescription
} from '@core/domain/valueObjects/jabs-battler-roles.ts';
import { JabsChipContent } from './JabsChipContent.tsx';

type EnemyJabsBattlerRolesProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (updatedEnemy: RPG_EnemyDomainModel) => void;
};

/**
 * Segmented-control editor for the six battlefield-coordination roles owned by
 * `JABS_BattlerRole`. The six flags break down into three distinct axes, each with its own
 * row in the UI:
 *
 *   1. Coordination — leader vs follower, tri-state segmented control with an explicit "None"
 *      pill in the middle. Picking either side clears the other (mutual exclusion lives on the
 *      value object, not just in the UI).
 *   2. Protection — guardian vs ward, same tri-state pattern. A battler can't protect itself,
 *      so the same exclusion rule applies.
 *   3. Modifiers — solo and sentinel as independent toggles. Solo is the plugin's master
 *      opt-out and wins over the coordination pairs at runtime regardless of the other flags;
 *      sentinel is fully orthogonal (it just holds position).
 *
 * Each pill — including the "None" pills on the two tri-state axes — wraps its content in a
 * MUI Tooltip via {@link JabsChipContent}, with copy sourced from the runtime behavior in
 * `JABS_AiManager` rather than just the JSDoc.
 */
const EnemyJabsBattlerRoles = ({
  selectedEnemy,
  updateEnemy,
}: EnemyJabsBattlerRolesProps) =>
{
  // sentinel string used by the tri-state controls when the author has explicitly chosen the
  // "neither" state. it's purely a UI value — never written to disk and never stored on the
  // domain model, where "neither" is represented by both pair flags being false.
  const NONE_VALUE = 'none';

  //region derived values
  // derive the current segmented-control value from the domain model. "none" is the fallback
  // when neither pair flag is set, which gives the tri-state a visible default rather than an
  // un-highlighted ambiguous state.
  let coordinationValue: string = NONE_VALUE;
  if (selectedEnemy.jabsBattlerRoles.leader)
  {
    coordinationValue = JabsBattlerRole.Leader;
  }
  else if (selectedEnemy.jabsBattlerRoles.follower)
  {
    coordinationValue = JabsBattlerRole.Follower;
  }

  let protectionValue: string = NONE_VALUE;
  if (selectedEnemy.jabsBattlerRoles.guardian)
  {
    protectionValue = JabsBattlerRole.Guardian;
  }
  else if (selectedEnemy.jabsBattlerRoles.ward)
  {
    protectionValue = JabsBattlerRole.Ward;
  }

  // modifier values are the active subset of [solo, sentinel] for the non-exclusive toggle group.
  const modifierValues: string[] = [];
  if (selectedEnemy.jabsBattlerRoles.solo)
  {
    modifierValues.push(JabsBattlerRole.Solo);
  }
  if (selectedEnemy.jabsBattlerRoles.sentinel)
  {
    modifierValues.push(JabsBattlerRole.Sentinel);
  }
  //endregion derived values

  const handleCoordinationChange = (
    _: unknown,
    newValue: string | null
  ) =>
  {
    // MUI's exclusive ToggleButtonGroup emits null when the user clicks an already-active pill.
    // we suppress that here so the row always has exactly one selection — the author should
    // pick "None" explicitly to clear, rather than discovering the deselect-by-double-click
    // gesture by accident.
    if (newValue === null)
    {
      return;
    }

    if (newValue === NONE_VALUE)
    {
      selectedEnemy.jabsBattlerRoles.setCoordination(null);
    }
    else if (newValue === JabsBattlerRole.Leader)
    {
      selectedEnemy.jabsBattlerRoles.setCoordination(JabsBattlerRole.Leader);
    }
    else if (newValue === JabsBattlerRole.Follower)
    {
      selectedEnemy.jabsBattlerRoles.setCoordination(JabsBattlerRole.Follower);
    }

    updateEnemy(selectedEnemy);
  };

  const handleProtectionChange = (
    _: unknown,
    newValue: string | null
  ) =>
  {
    // same deselect-suppression rationale as coordination above.
    if (newValue === null)
    {
      return;
    }

    if (newValue === NONE_VALUE)
    {
      selectedEnemy.jabsBattlerRoles.setProtection(null);
    }
    else if (newValue === JabsBattlerRole.Guardian)
    {
      selectedEnemy.jabsBattlerRoles.setProtection(JabsBattlerRole.Guardian);
    }
    else if (newValue === JabsBattlerRole.Ward)
    {
      selectedEnemy.jabsBattlerRoles.setProtection(JabsBattlerRole.Ward);
    }

    updateEnemy(selectedEnemy);
  };

  const handleModifiersChange = (
    _: unknown,
    newValues: string[]
  ) =>
  {
    // newValues is the post-toggle list of active modifier strings. since solo and sentinel are
    // orthogonal at this layer, we just project each membership onto its own flag.
    selectedEnemy.jabsBattlerRoles.setSolo(newValues.includes(JabsBattlerRole.Solo));
    selectedEnemy.jabsBattlerRoles.setSentinel(newValues.includes(JabsBattlerRole.Sentinel));
    updateEnemy(selectedEnemy);
  };

  return (
    <BoardSectionCard title={'Battler Roles'}>
    <Stack
      spacing={1.5}
      sx={{ alignItems: 'stretch' }}
    >
      {/* Coordination axis: leader <-> none <-> follower */}
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
          Coordination
        </Typography>
        <ToggleButtonGroup
          exclusive={true}
          size={'small'}
          color={'primary'}
          value={coordinationValue}
          onChange={handleCoordinationChange}
          sx={(theme) =>
            (
              {
                // see EnemyJabsAiTraits for the rationale on omitting backgroundColor — the
                // `background.paper` token in dark mode looks like a heavy black box around
                // the chips, so we let the parent panel show through instead.
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '4px',
                // flex-wrap safety net matches the AI Traits component pattern. the role
                // segmented controls only have 3 chips each (incl. None), so they're unlikely
                // to actually wrap, but keeping the rule uniform avoids surprise overflow at
                // smaller viewports.
                flexWrap: 'wrap'
              }
            )}
        >
          <ToggleButton
            value={JabsBattlerRole.Leader}
            sx={(theme) =>
              (
                {
                  // see EnemyJabsAiTraits for the rationale: selected chips fill with a
                  // translucent tint of the accent, with text/border shifted to the accent.
                  // the icon keeps its own (always-vibrant) color regardless of state.
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
              icon={<Star sx={(theme) =>
                (
                  {
                    color: theme.palette.warning.main,
                    mr: 1
                  }
                )}/>}
              label={'Leader'}
              description={JabsBattlerRoleDescriptions[ JabsBattlerRole.Leader ]}
            />
          </ToggleButton>

          <ToggleButton
            value={NONE_VALUE}
            sx={(theme) =>
              (
                {
                  color: theme.palette.text.disabled,
                  fontStyle: 'italic',
                  // None pills get the same fill-on-select treatment as their colored peers, but
                  // tinted with text.secondary so the empty state still reads as neutral rather
                  // than "the empty option has been promoted to a real choice."
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.text.secondary, 0.12),
                      color: theme.palette.text.secondary,
                      borderColor: theme.palette.divider,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.text.secondary, 0.20),
                        }
                    }
                }
              )}
          >
            {/* italics + muted color already signals "empty state"; dropping the leading icon
                makes the None pill physically smaller, subtly de-emphasizing it as the default
                rather than a peer of the two real options on this axis. */}
            <JabsChipContent
              label={'None'}
              description={JabsCoordinationAxisNoneDescription}
            />
          </ToggleButton>

          <ToggleButton
            value={JabsBattlerRole.Follower}
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
              icon={<Group sx={(theme) =>
                (
                  {
                    color: theme.palette.secondary.main,
                    mr: 1
                  }
                )}/>}
              label={'Follower'}
              description={JabsBattlerRoleDescriptions[ JabsBattlerRole.Follower ]}
            />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Protection axis: guardian <-> none <-> ward */}
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
          Protection
        </Typography>
        <ToggleButtonGroup
          exclusive={true}
          size={'small'}
          color={'primary'}
          value={protectionValue}
          onChange={handleProtectionChange}
          sx={(theme) =>
            (
              {
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '4px',
                flexWrap: 'wrap'
              }
            )}
        >
          <ToggleButton
            value={JabsBattlerRole.Guardian}
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
              icon={<Security sx={(theme) =>
                (
                  {
                    color: theme.palette.success.main,
                    mr: 1
                  }
                )}/>}
              label={'Guardian'}
              description={JabsBattlerRoleDescriptions[ JabsBattlerRole.Guardian ]}
            />
          </ToggleButton>

          <ToggleButton
            value={NONE_VALUE}
            sx={(theme) =>
              (
                {
                  color: theme.palette.text.disabled,
                  fontStyle: 'italic',
                  '&.Mui-selected':
                    {
                      backgroundColor: alpha(theme.palette.text.secondary, 0.12),
                      color: theme.palette.text.secondary,
                      borderColor: theme.palette.divider,
                      '&:hover':
                        {
                          backgroundColor: alpha(theme.palette.text.secondary, 0.20),
                        }
                    }
                }
              )}
          >
            {/* matches the Coordination None pill — italic + muted, no icon. */}
            <JabsChipContent
              label={'None'}
              description={JabsProtectionAxisNoneDescription}
            />
          </ToggleButton>

          <ToggleButton
            value={JabsBattlerRole.Ward}
            sx={(theme) =>
              (
                {
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
              icon={<HealthAndSafety sx={(theme) =>
                (
                  {
                    color: theme.palette.info.main,
                    mr: 1
                  }
                )}/>}
              label={'Ward'}
              description={JabsBattlerRoleDescriptions[ JabsBattlerRole.Ward ]}
            />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Modifiers row: solo and sentinel toggle independently */}
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
          Modifiers
        </Typography>
        <Box>
          <ToggleButtonGroup
            size={'small'}
            color={'primary'}
            value={modifierValues}
            onChange={handleModifiersChange}
            sx={(theme) =>
              (
                {
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '4px',
                  flexWrap: 'wrap'
                }
              )}
          >
            <ToggleButton
              value={JabsBattlerRole.Solo}
              sx={(theme) =>
                (
                  {
                    '&.Mui-selected':
                      {
                        backgroundColor: alpha(theme.palette.text.secondary, 0.16),
                        borderColor: theme.palette.text.secondary,
                        color: theme.palette.text.secondary,
                        '&:hover':
                          {
                            backgroundColor: alpha(theme.palette.text.secondary, 0.24),
                          }
                      }
                  }
                )}
            >
              <JabsChipContent
                icon={<Person sx={(theme) =>
                  (
                    {
                      color: theme.palette.text.secondary,
                      mr: 1
                    }
                  )}/>}
                label={'Solo'}
                description={JabsBattlerRoleDescriptions[ JabsBattlerRole.Solo ]}
              />
            </ToggleButton>

            <ToggleButton
              value={JabsBattlerRole.Sentinel}
              sx={(theme) =>
                (
                  {
                    '&.Mui-selected':
                      {
                        backgroundColor: alpha(theme.palette.warning.dark, 0.16),
                        borderColor: theme.palette.warning.dark,
                        color: theme.palette.warning.dark,
                        '&:hover':
                          {
                            backgroundColor: alpha(theme.palette.warning.dark, 0.24),
                          }
                      }
                  }
                )}
            >
              <JabsChipContent
                icon={<Anchor sx={(theme) =>
                  (
                    {
                      color: theme.palette.warning.dark,
                      mr: 1
                    }
                  )}/>}
                label={'Sentinel'}
                description={JabsBattlerRoleDescriptions[ JabsBattlerRole.Sentinel ]}
              />
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Stack>
    </Stack>
    </BoardSectionCard>
  );
};

export { EnemyJabsBattlerRoles };