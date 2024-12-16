import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import { FormControlLabel, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import {
  AutoFixHigh, Casino, DirectionsRun, FitnessCenter, HeartBroken, MonitorHeart, PhotoFilter, Shield
} from "@mui/icons-material";
import { blue, pink } from "@mui/material/colors";
import { EnemyBaseParam } from "../../../enums/EnemyParameter.ts";
import React from "react";
import NumberInputWithLabel from "../../../components/NumberInputWithLabel.tsx";

type EnemyBaseParametersProps = {
  selectedEnemy: RPG_Enemy; updateEnemyWithNewParam: (parameterId: number, updatedValue: number) => void;
};

export default function EnemyBaseParameters({
  selectedEnemy,
  updateEnemyWithNewParam
}: EnemyBaseParametersProps)
{
  return <>
    <Stack spacing={1}>
      <Typography
        variant={"h5"}
        align={"center"}
        color={"primary"}
      >
        Base Parameters
      </Typography>
      <NumberInputWithLabel
        label={"Max HP"}
        endAdornment={<HeartBroken sx={{ color: pink[200] }}/>}
        value={selectedEnemy.params[EnemyBaseParam.MaxHp]}
        onChangeEventHandler={(event) =>
        {
          const updatedValue = parseInt(event.target.value) ?? 1;
          updateEnemyWithNewParam(EnemyBaseParam.MaxHp, updatedValue);
        }}
      />

      <NumberInputWithLabel
        label={"Max MP"}
        endAdornment={<MonitorHeart sx={{ color: blue[200] }}/>}
        value={selectedEnemy.params[EnemyBaseParam.MaxMp]}
        onChangeEventHandler={(event) =>
        {
          const updatedValue = parseInt(event.target.value) ?? 1;
          updateEnemyWithNewParam(EnemyBaseParam.MaxMp, updatedValue);
        }}
      />

      <NumberInputWithLabel
        label={"Power"}
        endAdornment={<FitnessCenter color={"error"}/>}
        value={selectedEnemy.params[EnemyBaseParam.Attack]}
        onChangeEventHandler={(event) =>
        {
          const updatedValue = parseInt(event.target.value) ?? 1;
          updateEnemyWithNewParam(EnemyBaseParam.Attack, updatedValue);
        }}
      />

      <NumberInputWithLabel
        label={"Endurance"}
        endAdornment={<Shield color={"info"}/>}
        value={selectedEnemy.params[EnemyBaseParam.Defense]}
        onChangeEventHandler={(event) =>
        {
          const updatedValue = parseInt(event.target.value) ?? 1;
          updateEnemyWithNewParam(EnemyBaseParam.Defense, updatedValue);
        }}
      />

      <NumberInputWithLabel
        label={"Force"}
        endAdornment={<AutoFixHigh color={"success"}/>}
        value={selectedEnemy.params[EnemyBaseParam.MAttack]}
        onChangeEventHandler={(event) =>
        {
          const updatedValue = parseInt(event.target.value) ?? 1;
          updateEnemyWithNewParam(EnemyBaseParam.MAttack, updatedValue);
        }}
      />

      <NumberInputWithLabel
        label={"Resist"}
        endAdornment={<PhotoFilter color={"secondary"}/>}
        value={selectedEnemy.params[EnemyBaseParam.MDefense]}
        onChangeEventHandler={(event) =>
        {
          const updatedValue = parseInt(event.target.value) ?? 1;
          updateEnemyWithNewParam(EnemyBaseParam.MDefense, updatedValue);
        }}
      />

      <NumberInputWithLabel
        label={"Speed"}
        endAdornment={<DirectionsRun color={"warning"}/>}
        value={selectedEnemy.params[EnemyBaseParam.Speed]}
        onChangeEventHandler={(event) =>
        {
          const updatedValue = parseInt(event.target.value) ?? 1;
          updateEnemyWithNewParam(EnemyBaseParam.Speed, updatedValue);
        }}
      />

      <NumberInputWithLabel
        label={"Luck"}
        endAdornment={<Casino/>}
        value={selectedEnemy.params[EnemyBaseParam.Luck]}
        onChangeEventHandler={(event) =>
        {
          const updatedValue = parseInt(event.target.value) ?? 1;
          updateEnemyWithNewParam(EnemyBaseParam.Luck, updatedValue);
        }}
      />
    </Stack>
  </>
}