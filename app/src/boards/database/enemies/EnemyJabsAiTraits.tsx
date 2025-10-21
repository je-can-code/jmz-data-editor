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
} from "../../../services/parsers/JabsDataParser.ts";
import {
  Bolt,
  Favorite,
  Gavel,
  Group,
  Shield,
  Star
} from "@mui/icons-material";

type EnemyJabsDataProps = {
  note: string;
  updateNote: (value: string) => void;
};

const EnemyJabsAiTraits = ({
  note,
  updateNote,
}: EnemyJabsDataProps) =>
{
  //region state
  const [ careful, setCareful ] = useState<boolean>(false);
  const [ executor, setExecutor ] = useState<boolean>(false);
  const [ reckless, setReckless ] = useState<boolean>(false);
  const [ healer, setHealer ] = useState<boolean>(false);
  const [ leader, setLeader ] = useState<boolean>(false);
  const [ follower, setFollower ] = useState<boolean>(false);

  const [ stringTraits, setStringTraits ] = useState<string[]>([]);
  //endregion state

  useEffect(() =>
  {
    refreshAiTraitsFromNote();
  }, [ note ]);

  const resetAiTraits = () =>
  {
    // reset all the traits.
    setCareful(false);
    setExecutor(false);
    setReckless(false);
    setHealer(false);
    setLeader(false);
    setFollower(false);
  };

  const refreshAiTraitsFromNote = () =>
  {
    resetAiTraits();

    const currentTraits = JabsDataParser.readAiTraits(note);
    setCareful(currentTraits.careful);
    setExecutor(currentTraits.executor);
    setReckless(currentTraits.reckless);
    setHealer(currentTraits.healer);
    setLeader(currentTraits.leader);
    setFollower(currentTraits.follower);

    // Create an array of active trait strings to update the ToggleButtonGroup
    const activeTraits = [];
    if (currentTraits.careful) activeTraits.push(JabsAiTrait.Careful);
    if (currentTraits.executor) activeTraits.push(JabsAiTrait.Executor);
    if (currentTraits.reckless) activeTraits.push(JabsAiTrait.Reckless);
    if (currentTraits.healer) activeTraits.push(JabsAiTrait.Healer);
    if (currentTraits.leader) activeTraits.push(JabsAiTrait.Leader);
    if (currentTraits.follower) activeTraits.push(JabsAiTrait.Follower);

    // Update the stringTraits state to match the current traits
    setStringTraits(activeTraits);
  };

  const handleJabsAiTraitsUpdate = (newTraits: string[]) =>
  {
    // Apply mutual exclusivity logic for Leader and Follower traits
    newTraits = ensureLeaderFollowerMutualExclusivity(stringTraits, newTraits);

    // start with a fresh slate.
    resetAiTraits();

    // update the tracker for the traits currently selected for the toggle button group.
    setStringTraits(newTraits);

    // Create a new traits object based on the newTraits array
    const updatedAiTraits = {
      careful: newTraits.includes(JabsAiTrait.Careful),
      executor: newTraits.includes(JabsAiTrait.Executor),
      reckless: newTraits.includes(JabsAiTrait.Reckless),
      healer: newTraits.includes(JabsAiTrait.Healer),
      leader: newTraits.includes(JabsAiTrait.Leader),
      follower: newTraits.includes(JabsAiTrait.Follower),
    } as JabsAiTraits;

    // flag all the traits as active that are actually active.
    newTraits.forEach(trait =>
    {
      switch (trait)
      {
        case JabsAiTrait.Careful:
          setCareful(true);
          break;
        case JabsAiTrait.Executor:
          setExecutor(true);
          break;
        case JabsAiTrait.Reckless:
          setReckless(true);
          break;
        case JabsAiTrait.Healer:
          setHealer(true);
          break;
        case JabsAiTrait.Leader:
          setLeader(true);
          break;
        case JabsAiTrait.Follower:
          setFollower(true);
          break;
      }
    });

    // Use the directly created object instead of relying on state
    const updatedNote = JabsDataParser.writeAiTraits(note, updatedAiTraits);
    updateNote(updatedNote);
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
          selected={careful}
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
          selected={executor}
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
          selected={reckless}
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
          selected={healer}
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
              selected={leader}
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
              selected={follower}
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