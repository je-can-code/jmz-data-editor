import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Bolt, Favorite, Gavel, Group, Shield, Star } from '@mui/icons-material';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';
import { JabsAiTrait, JabsAiTraitsData } from '@core/domain/valueObjects/jabs-ai-traits.ts';

type EnemyJabsDataProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (updatedEnemy: RPG_EnemyDomainModel) => void;
};

const EnemyJabsAiTraits = ({
  selectedEnemy,
  updateEnemy,
}: EnemyJabsDataProps) =>
{
  //region state
  const [ stringTraits, setStringTraits ] = useState<string[]>([]);
  //endregion state

  useEffect(() =>
  {
    refreshAiTraitsFromNote();
  }, [ selectedEnemy ]);

  const refreshAiTraitsFromNote = () =>
  {
    // Create an array of active trait strings to update the ToggleButtonGroup
    const activeTraits = [];
    if (selectedEnemy.jabsAiTraits.careful)
    {
      activeTraits.push(JabsAiTrait.Careful);
    }
    if (selectedEnemy.jabsAiTraits.executor)
    {
      activeTraits.push(JabsAiTrait.Executor);
    }
    if (selectedEnemy.jabsAiTraits.reckless)
    {
      activeTraits.push(JabsAiTrait.Reckless);
    }
    if (selectedEnemy.jabsAiTraits.healer)
    {
      activeTraits.push(JabsAiTrait.Healer);
    }
    if (selectedEnemy.jabsAiTraits.leader)
    {
      activeTraits.push(JabsAiTrait.Leader);
    }
    if (selectedEnemy.jabsAiTraits.follower)
    {
      activeTraits.push(JabsAiTrait.Follower);
    }

    // Update the stringTraits state to match the current traits
    setStringTraits(activeTraits);
  };

  const handleJabsAiTraitsUpdate = (newTraits: string[]) =>
  {
    // Delegate the logic to the domain object
    selectedEnemy.jabsAiTraits.updateFromStrings(newTraits, stringTraits);

    // Sync the UI representation (string array for ToggleButtonGroup)
    const activeStrings = Object.values(JabsAiTrait)
      .filter(t => selectedEnemy.jabsAiTraits[ t as keyof JabsAiTraitsData ]);

    setStringTraits(activeStrings);
    updateEnemy(selectedEnemy);
  };

  return <>
    <Typography
      variant={'h4'}
      gutterBottom={true}
      color={'primary'}
      align={'center'}
      sx={{ paddingTop: 2 }}
    >
      JABS AI Traits
    </Typography>

    {/* Main container for vertical layout */}
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }}>
      {/* First row with main traits */}
      <ToggleButtonGroup
        orientation={'horizontal'}
        size={'small'}
        color={'primary'}
        value={stringTraits}
        onChange={(
          _,
          newValues
        ) =>
        {
          handleJabsAiTraitsUpdate(newValues);
        }}
        sx={(theme) =>
          (
            {
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '4px',
              backgroundColor: theme.palette.background.paper
            }
          )}
      >
        <ToggleButton
          value={JabsAiTrait.Careful}
          selected={selectedEnemy.jabsAiTraits.careful}
          sx={(theme) =>
            (
              {
                '&.Mui-selected':
                  {
                    borderColor: theme.palette.info.main,
                  }
              }
            )}
        >
          <Shield sx={(theme) =>
            (
              {
                color: theme.palette.info.main,
                mr: 1
              }
            )}/>
          Careful
        </ToggleButton>

        <ToggleButton
          value={JabsAiTrait.Executor}
          selected={selectedEnemy.jabsAiTraits.executor}
          sx={(theme) =>
            (
              {
                '&.Mui-selected':
                  {
                    borderColor: theme.palette.error.main,
                  }
              }
            )}
        >
          <Gavel sx={(theme) =>
            (
              {
                color: theme.palette.error.main,
                mr: 1
              }
            )}/>
          Executor
        </ToggleButton>

        <ToggleButton
          value={JabsAiTrait.Reckless}
          selected={selectedEnemy.jabsAiTraits.reckless}
          sx={(theme) =>
            (
              {
                '&.Mui-selected':
                  {
                    borderColor: theme.palette.warning.main,
                  }
              }
            )}
        >
          <Bolt sx={(theme) =>
            (
              {
                color: theme.palette.warning.main,
                mr: 1
              }
            )}/>
          Reckless
        </ToggleButton>

        <ToggleButton
          value={JabsAiTrait.Healer}
          selected={selectedEnemy.jabsAiTraits.healer}
          sx={(theme) =>
            (
              {
                '&.Mui-selected':
                  {
                    borderColor: theme.palette.success.main,
                  }
              }
            )}
        >
          <Favorite sx={(theme) =>
            (
              {
                color: theme.palette.success.main,
                mr: 1
              }
            )}/>
          Healer
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Second row with Role traits */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            ml: -1
          }}
        >
          <ToggleButtonGroup
            orientation={'horizontal'}
            size={'small'}
            color={'primary'}
            value={stringTraits}
            onChange={(
              _,
              newValues
            ) =>
            {
              handleJabsAiTraitsUpdate(newValues);
            }}
            sx={(theme) => (
              {
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '4px',
                backgroundColor: theme.palette.background.paper
              }
            )}
          >
            <ToggleButton
              value={JabsAiTrait.Leader}
              selected={selectedEnemy.jabsAiTraits.leader}
              sx={(theme) => (
                {
                  '&.Mui-selected':
                    {
                      borderColor: theme.palette.warning.main,
                    }
                }
              )}
            >
              <Star sx={(theme) => (
                {
                  color: theme.palette.warning.main,
                  mr: 1
                }
              )}/>
              Leader
            </ToggleButton>
            <ToggleButton
              value={JabsAiTrait.Follower}
              selected={selectedEnemy.jabsAiTraits.follower}
              sx={(theme) => (
                {
                  '&.Mui-selected':
                    {
                      borderColor: theme.palette.secondary.main,
                    }
                }
              )}
            >
              <Group sx={(theme) => (
                {
                  color: theme.palette.secondary.main,
                  mr: 1
                }
              )}/>
              Follower
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
    </Box>
  </>;
};

export { EnemyJabsAiTraits };
