import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import {
  useEffect,
  useState
} from "react";
import {
  JabsAiTrait,
  JabsAiTraits,
  JabsDataParser
} from "@services/parsers/JabsDataParser.ts";
import {
  Bolt,
  Favorite,
  Gavel,
  Group,
  Shield,
  Star
} from "@mui/icons-material";
import { EnemyDomainModel } from "@core/domain/entities/EnemyDomainEntity.ts";

type EnemyJabsDataProps = {
  selectedEnemy: EnemyDomainModel;
  updateEnemy: (updatedEnemy: EnemyDomainModel) => void;
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
    if (selectedEnemy.jabsAiTraits.careful) activeTraits.push(JabsAiTrait.Careful);
    if (selectedEnemy.jabsAiTraits.executor) activeTraits.push(JabsAiTrait.Executor);
    if (selectedEnemy.jabsAiTraits.reckless) activeTraits.push(JabsAiTrait.Reckless);
    if (selectedEnemy.jabsAiTraits.healer) activeTraits.push(JabsAiTrait.Healer);
    if (selectedEnemy.jabsAiTraits.leader) activeTraits.push(JabsAiTrait.Leader);
    if (selectedEnemy.jabsAiTraits.follower) activeTraits.push(JabsAiTrait.Follower);

    // Update the stringTraits state to match the current traits
    setStringTraits(activeTraits);
  };

  const handleJabsAiTraitsUpdate = (newTraits: string[]) =>
  {
    // 1. Apply mutual exclusivity logic
    const exclusiveTraits = ensureLeaderFollowerMutualExclusivity(stringTraits, newTraits);

    // 2. Update the UI state
    setStringTraits(exclusiveTraits);

    // 3. Synchronize ALL properties on the domain model
    // Use .includes() to determine the true/false state for every trait
    selectedEnemy.jabsAiTraits.careful = exclusiveTraits.includes(JabsAiTrait.Careful);
    selectedEnemy.jabsAiTraits.executor = exclusiveTraits.includes(JabsAiTrait.Executor);
    selectedEnemy.jabsAiTraits.reckless = exclusiveTraits.includes(JabsAiTrait.Reckless);
    selectedEnemy.jabsAiTraits.healer = exclusiveTraits.includes(JabsAiTrait.Healer);
    selectedEnemy.jabsAiTraits.leader = exclusiveTraits.includes(JabsAiTrait.Leader);
    selectedEnemy.jabsAiTraits.follower = exclusiveTraits.includes(JabsAiTrait.Follower);

    // 4. Notify the parent/provider of the change
    updateEnemy(selectedEnemy);
  };

  /**
   * Ensures that Leader and Follower traits are mutually exclusive.
   * If both are present in the new traits array, keeps only the newly added one.
   * @param currentTraits The current traits array before the update
   * @param newTraits The new traits array after the update
   * @returns A modified traits array where Leader and Follower are mutually exclusive
   */
  const ensureLeaderFollowerMutualExclusivity = (currentTraits: string[], newTraits: string[]): string[] =>
  {
    // Check if both Leader and Follower are in the newTraits array
    const hasLeader = newTraits.includes(JabsAiTrait.Leader);
    const hasFollower = newTraits.includes(JabsAiTrait.Follower);

    // If both are selected, determine which one was newly added
    if (hasLeader && hasFollower)
    {
      const wasLeaderAlreadySelected = currentTraits.includes(JabsAiTrait.Leader);
      const wasFollowerAlreadySelected = currentTraits.includes(JabsAiTrait.Follower);

      // If Leader was just added, remove Follower
      if (!wasLeaderAlreadySelected)
      {
        return newTraits.filter(trait => trait !== JabsAiTrait.Follower);
      }
      // If Follower was just added, remove Leader
      else if (!wasFollowerAlreadySelected)
      {
        return newTraits.filter(trait => trait !== JabsAiTrait.Leader);
      }
      // If both were already selected (shouldn't happen normally), keep the new one and remove the old one
      else
      {
        // Find the index of the last clicked trait (the one that triggered this update)
        const lastClickedIndex = newTraits.findIndex(trait =>
          trait === JabsAiTrait.Leader || trait === JabsAiTrait.Follower);

        // If it's Leader, remove Follower; if it's Follower, remove Leader
        if (newTraits[lastClickedIndex] === JabsAiTrait.Leader)
        {
          return newTraits.filter(trait => trait !== JabsAiTrait.Follower);
        }
        else
        {
          return newTraits.filter(trait => trait !== JabsAiTrait.Leader);
        }
      }
    }

    // If not both are selected, return the original array
    return newTraits;
  };

  return <>
    <Typography
      variant={"h4"}
      gutterBottom={true}
      color={"primary"}
      align={"center"}
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
        orientation={"horizontal"}
        size={"small"}
        color={"primary"}
        value={stringTraits}
        onChange={(_, newValues) =>
        {
          handleJabsAiTraitsUpdate(newValues);
        }}
        sx={(theme) =>
          ({
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '4px',
            backgroundColor: theme.palette.background.paper
          })}
      >
        <ToggleButton
          value={JabsAiTrait.Careful}
          selected={selectedEnemy.jabsAiTraits.careful}
          sx={(theme) =>
            ({
              "&.Mui-selected":
                {
                  borderColor: theme.palette.info.main,
                }
            })}
        >
          <Shield sx={(theme) =>
            ({
              color: theme.palette.info.main,
              mr: 1
            })}/>
          Careful
        </ToggleButton>

        <ToggleButton
          value={JabsAiTrait.Executor}
          selected={selectedEnemy.jabsAiTraits.executor}
          sx={(theme) =>
            ({
              "&.Mui-selected":
                {
                  borderColor: theme.palette.error.main,
                }
            })}
        >
          <Gavel sx={(theme) =>
            ({
              color: theme.palette.error.main,
              mr: 1
            })}/>
          Executor
        </ToggleButton>

        <ToggleButton
          value={JabsAiTrait.Reckless}
          selected={selectedEnemy.jabsAiTraits.reckless}
          sx={(theme) =>
            ({
              "&.Mui-selected":
                {
                  borderColor: theme.palette.warning.main,
                }
            })}
        >
          <Bolt sx={(theme) =>
            ({
              color: theme.palette.warning.main,
              mr: 1
            })}/>
          Reckless
        </ToggleButton>

        <ToggleButton
          value={JabsAiTrait.Healer}
          selected={selectedEnemy.jabsAiTraits.healer}
          sx={(theme) =>
            ({
              "&.Mui-selected":
                {
                  borderColor: theme.palette.success.main,
                }
            })}
        >
          <Favorite sx={(theme) =>
            ({
              color: theme.palette.success.main,
              mr: 1
            })}/>
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
            orientation={"horizontal"}
            size={"small"}
            color={"primary"}
            value={stringTraits}
            onChange={(_, newValues) =>
            {
              handleJabsAiTraitsUpdate(newValues);
            }}
            sx={(theme) => ({
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '4px',
              backgroundColor: theme.palette.background.paper
            })}
          >
            <ToggleButton
              value={JabsAiTrait.Leader}
              selected={selectedEnemy.jabsAiTraits.leader}
              sx={(theme) => ({
                "&.Mui-selected":
                  {
                    borderColor: theme.palette.warning.main,
                  }
              })}
            >
              <Star sx={(theme) => ({
                color: theme.palette.warning.main,
                mr: 1
              })}/>
              Leader
            </ToggleButton>
            <ToggleButton
              value={JabsAiTrait.Follower}
              selected={selectedEnemy.jabsAiTraits.follower}
              sx={(theme) => ({
                "&.Mui-selected":
                  {
                    borderColor: theme.palette.secondary.main,
                  }
              })}
            >
              <Group sx={(theme) => ({
                color: theme.palette.secondary.main,
                mr: 1
              })}/>
              Follower
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
    </Box>
  </>;
};

export { EnemyJabsAiTraits }
