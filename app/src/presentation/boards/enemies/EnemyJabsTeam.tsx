import React, { useMemo } from "react";
import { FormControl, InputLabel, MenuItem, Select, Stack, Typography } from "@mui/material";
import { RPG_EnemyDomainModel } from "@core/domain/entities/RPG_EnemyDomainModel.ts";
import { useJabs } from "@presentation/context/resources/jabs.context.tsx";
import type { JabsTeamDefinition } from "@core/domain/valueObjects/jabs-config.ts";

type EnemyJabsTeamProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (value: RPG_EnemyDomainModel) => void;
};

const teamLabel = (team: JabsTeamDefinition) =>
{
  const name = team.name?.trim();
  const key = team.key?.trim();
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

const EnemyJabsTeam = ({
  selectedEnemy,
  updateEnemy,
}: EnemyJabsTeamProps) =>
{
  const { jabsConfig } = useJabs();
  const teams = useMemo(() => (jabsConfig?.teams ?? []) as JabsTeamDefinition[], [ jabsConfig ]);

  const value = selectedEnemy.jabsTeamId === null
    ? ""
    : String(selectedEnemy.jabsTeamId);

  const handleChange = (next: string) =>
  {
    selectedEnemy.jabsTeamId = next.trim() === ""
      ? null
      : Number(next);
    updateEnemy(selectedEnemy);
  };

  return (
    <>
      <Typography
        variant={"h4"}
        gutterBottom={true}
        color={"primary"}
        align={"center"}
        sx={{ paddingTop: 2 }}
      >
        JABS Team
      </Typography>

      <Stack spacing={1}>
        <FormControl fullWidth={true}>
          <InputLabel id={"enemy-jabs-team-select-label"}>Team</InputLabel>
          <Select
            labelId={"enemy-jabs-team-select-label"}
            label={"Team"}
            value={value}
            onChange={(e) => handleChange(String(e.target.value))}
          >
            <MenuItem value={""}>
              Default (engine / no tag)
            </MenuItem>
            {teams
              .slice()
              .sort((a, b) => Number(a.id) - Number(b.id))
              .map(team => (
                <MenuItem key={team.id} value={String(team.id)}>
                  {teamLabel(team)}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
      </Stack>
    </>
  );
};

export default EnemyJabsTeam;

