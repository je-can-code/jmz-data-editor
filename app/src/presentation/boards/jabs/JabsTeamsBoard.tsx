import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Delete } from "@mui/icons-material";
import SaveButton from "@components/core/SaveButton.tsx";
import ReloadButton from "@components/core/ReloadButton.tsx";
import EditorBoardSplitLayout from "@presentation/components/board/EditorBoardSplitLayout.tsx";
import { useUrlSelection } from "@presentation/hooks/useUrlSelection.ts";
import { useJabs } from "@presentation/context/resources/jabs.context.tsx";
import type { JabsTeamDefinition } from "@core/domain/valueObjects/jabs-teams.ts";

const normalizeTeams = (teams: JabsTeamDefinition[]) =>
{
  return (teams ?? [])
    .map(t => ({
      id: Number(t.id),
      key: t.key ?? "",
      name: t.name ?? "",
      opposes: Array.isArray(t.opposes)
        ? t.opposes.map(Number)
        : [],
    }))
    .filter(t => Number.isFinite(t.id));
};

const displayTeamLabel = (team: JabsTeamDefinition) =>
{
  const key = team.key?.trim();
  const name = team.name?.trim();

  if (name)
  {
    return `${name} (${team.id})`;
  }

  if (key)
  {
    return `${key} (${team.id})`;
  }

  return `team ${team.id}`;
};

const JabsTeamsBoard = () =>
{
  const {
    jabsConfig,
    setConfig,
    save,
    reload,
    loading,
  } = useJabs();

  const [ isSaving, setIsSaving ] = useState(false);

  const teams = useMemo(() =>
  {
    return normalizeTeams(jabsConfig?.teams ?? []);
  }, [ jabsConfig ]);

  const teamIds = useMemo(() =>
  {
    return teams
      .map(t => t.id)
      .sort((a, b) => a - b);
  }, [ teams ]);

  const [ selectedTeamIndex, setSelectedTeamIndex ] = useState(0);

  useUrlSelection<JabsTeamDefinition>(
    "teamId",
    teams,
    team => team.id,
    selectedTeamIndex,
    (index) => setSelectedTeamIndex(index),
    (_) => undefined
  );

  const selectedTeam = useMemo(() =>
  {
    return teams[ selectedTeamIndex ] ?? null;
  }, [ teams, selectedTeamIndex ]);

  useEffect(() =>
  {
    if (teams.length === 0)
    {
      return;
    }

    const idx = Math.min(Math.max(0, selectedTeamIndex), teams.length - 1);
    if (idx !== selectedTeamIndex)
    {
      setSelectedTeamIndex(idx);
    }
  }, [ teams, selectedTeamIndex ]);

  const updateTeam = (next: JabsTeamDefinition) =>
  {
    const nextTeams = teams.map((t, idx) => (idx === selectedTeamIndex ? next : t));
    setConfig({
      ...(jabsConfig ?? { teams: [] }),
      teams: nextTeams,
    });
  };

  const addTeam = () =>
  {
    const nextId = teams.length === 0
      ? 0
      : Math.max(...teams.map(t => t.id)) + 1;

    const nextTeam: JabsTeamDefinition = {
      id: nextId,
      key: "",
      name: "",
      opposes: [],
    };

    const nextTeams = [ ...teams, nextTeam ]
      .sort((a, b) => a.id - b.id);

    setConfig({
      ...(jabsConfig ?? { teams: [] }),
      teams: nextTeams,
    });

    setSelectedTeamIndex(nextTeams.findIndex(t => t.id === nextId));
  };

  const deleteSelectedTeam = () =>
  {
    if (!selectedTeam)
    {
      return;
    }

    const nextTeams = teams.filter(t => t.id !== selectedTeam.id);
    setConfig({
      ...(jabsConfig ?? { teams: [] }),
      teams: nextTeams,
    });

    setSelectedTeamIndex(0);
  };

  const handleSave = async () =>
  {
    if (!jabsConfig)
    {
      return;
    }

    setIsSaving(true);
    try
    {
      await save({
        ...jabsConfig,
        teams,
      });
    }
    finally
    {
      setIsSaving(false);
    }
  };

  const handleReload = async () =>
  {
    await reload();
  };

  const canSave = loading === false && jabsConfig !== null;
  const canReload = loading === false;

  return (
    <Box sx={{ height: "100%", position: "relative" }}>
      <SaveButton
        handleSave={handleSave}
        canSave={canSave}
        isSaving={isSaving}
        extraSaveText={"Teams"}
      />
      <ReloadButton
        handleReload={handleReload}
        canReload={canReload}
        extraReloadText={"Teams"}
      />

      <EditorBoardSplitLayout
        sidebarColumnWidth={"360px"}
        sidebar={
          <Stack spacing={1} sx={{ p: 1 }}>
            <Stack direction={"row"} spacing={1}>
              <Button
                size={"small"}
                variant={"contained"}
                startIcon={<Add/>}
                onClick={addTeam}
              >
                Add team
              </Button>
              <Button
                size={"small"}
                color={"error"}
                variant={"outlined"}
                startIcon={<Delete/>}
                disabled={!selectedTeam}
                onClick={deleteSelectedTeam}
              >
                Delete
              </Button>
            </Stack>

            <Divider/>

            <Stack spacing={0.5}>
              {teams.map(t =>
              {
                const active = teams[ selectedTeamIndex ]?.id === t.id;
                return (
                  <Paper
                    key={t.id}
                    variant={"outlined"}
                    sx={{
                      p: 1,
                      cursor: "pointer",
                      borderColor: active ? "primary.main" : undefined,
                    }}
                    onClick={() =>
                    {
                      const index = teams.findIndex(x => x.id === t.id);
                      setSelectedTeamIndex(index);
                    }}
                  >
                    <Typography variant={"subtitle2"} sx={{ fontWeight: 700 }}>
                      {displayTeamLabel(t)}
                    </Typography>
                    <Typography variant={"caption"} color={"text.secondary"}>
                      {t.opposes?.length
                        ? `opposes: ${t.opposes.join(", ")}`
                        : "opposes: (none)"}
                    </Typography>
                  </Paper>
                );
              })}
            </Stack>
          </Stack>
        }
      >
        <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
          <Typography variant={"h4"} align={"center"} color={"primary"} gutterBottom={true}>
            JABS Teams
          </Typography>

          {selectedTeam
            ? (
              <Stack spacing={2} sx={{ maxWidth: 720, mx: "auto" }}>
                <TextField
                  label={"Team Id"}
                  type={"number"}
                  value={selectedTeam.id}
                  disabled={true}
                  helperText={"Team ids are referenced by enemies/events. Delete + re-add to renumber."}
                />

                <TextField
                  label={"Key"}
                  value={selectedTeam.key ?? ""}
                  onChange={e => updateTeam({
                    ...selectedTeam,
                    key: e.target.value,
                  })}
                  helperText={"Optional stable key for tooling (ex: ALLY, ENEMY, NEUTRAL)."}
                />

                <TextField
                  label={"Name"}
                  value={selectedTeam.name ?? ""}
                  onChange={e => updateTeam({
                    ...selectedTeam,
                    name: e.target.value,
                  })}
                />

                <FormControl>
                  <InputLabel id={"jabs-opposes-label"}>Opposes</InputLabel>
                  <Select
                    labelId={"jabs-opposes-label"}
                    multiple={true}
                    value={selectedTeam.opposes ?? []}
                    input={<OutlinedInput label={"Opposes"}/>}
                    renderValue={(selected) =>
                    {
                      const ids = selected as number[];
                      if (ids.length === 0)
                      {
                        return "(none)";
                      }

                      return (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                          {ids.map(id =>
                          {
                            const t = teams.find(x => x.id === id);
                            return <Chip key={id} label={t ? displayTeamLabel(t) : String(id)}/>;
                          })}
                        </Box>
                      );
                    }}
                    onChange={e =>
                    {
                      const next = e.target.value as number[];
                      updateTeam({
                        ...selectedTeam,
                        opposes: next,
                      });
                    }}
                  >
                    {teamIds
                      .filter(id => id !== selectedTeam.id)
                      .map(id =>
                      {
                        const team = teams.find(t => t.id === id)!;
                        return (
                          <MenuItem key={id} value={id}>
                            <ListItemText primary={displayTeamLabel(team)}/>
                          </MenuItem>
                        );
                      })}
                  </Select>
                </FormControl>
              </Stack>
            )
            : (
              <Typography align={"center"} color={"text.secondary"}>
                No teams found.
              </Typography>
            )}
        </Box>
      </EditorBoardSplitLayout>
    </Box>
  );
};

export default JabsTeamsBoard;

