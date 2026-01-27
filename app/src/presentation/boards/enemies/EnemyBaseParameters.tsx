import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import {
  Box,
  Grid,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import {
  AutoFixHigh,
  Battery6Bar,
  Casino,
  DirectionsRun,
  FitnessCenter,
  HeartBroken,
  MonitorHeart,
  PhotoFilter,
  Shield,
  ShowChart,
} from "@mui/icons-material";
import {
  blue,
  green,
  lightBlue,
  lightGreen,
  pink,
  red
} from "@mui/material/colors";
import { EnemyBaseParam } from "@core/enums/EnemyParameter.ts";
import React from "react";
import NumberInputWithLabel from "../../../components/NumberInputWithLabel.tsx";
import { GrowthParser } from "@services/parsers/GrowthParser.ts";
import { knownLongParams } from "../../../mappers/ParameterIdMapper.ts";
import { MaxTpParser } from "@services/parsers/MaxTpParser.ts";

type EnemyBaseParametersProps = {
  selectedEnemy: RPG_Enemy;
  updateEnemyWithNewParam: (parameterId: number, updatedValue: number) => void;
  updateNote: (updatedNote: string) => void;
};

export default function EnemyBaseParameters({
  selectedEnemy,
  updateEnemyWithNewParam,
  updateNote,
}: EnemyBaseParametersProps)
{
  // Get all parameter definitions
  const allParams = knownLongParams();

  // Function to get growth formula for a parameter
  const getGrowthFormula = (longParamId: number): string =>
  {
    const paramData = allParams.find(param => param.longParamId === longParamId);
    return paramData
      ? GrowthParser.read(selectedEnemy.note, paramData)
      : '';
  };

  // Create parameter data array for rendering
  const parameterData = [
    {
      label: "Max HP",
      paramId: EnemyBaseParam.MaxHp,
      icon: <HeartBroken sx={{ color: pink[200] }}/>,
      longParamId: 0
    },
    {
      label: "Max MP",
      paramId: EnemyBaseParam.MaxMp,
      icon: <MonitorHeart sx={{ color: lightBlue[400] }}/>,
      longParamId: 1
    },
    {
      label: "Max TP",
      paramId: -1, // display-only; no base param index exists for TP
      icon: <Battery6Bar sx={{ color: lightGreen[400] }}/>,
      longParamId: 30
    },
    {
      label: "Power",
      paramId: EnemyBaseParam.Attack,
      icon: <FitnessCenter sx={{ color: red[900] }}/>,
      longParamId: 2
    },
    {
      label: "Endurance",
      paramId: EnemyBaseParam.Defense,
      icon: <Shield sx={{ color: blue[700] }}/>,
      longParamId: 3
    },
    {
      label: "Force",
      paramId: EnemyBaseParam.MAttack,
      icon: <AutoFixHigh sx={{ color: green[500] }}/>,
      longParamId: 4
    },
    {
      label: "Resist",
      paramId: EnemyBaseParam.MDefense,
      icon: <PhotoFilter sx={{ color: pink[400] }}/>,
      longParamId: 5
    },
    {
      label: "Speed",
      paramId: EnemyBaseParam.Speed,
      icon: <DirectionsRun color={"warning"}/>,
      longParamId: 6
    },
    {
      label: "Luck",
      paramId: EnemyBaseParam.Luck,
      icon: <Casino/>,
      longParamId: 7
    }
  ];

  return <>
    <Stack spacing={1}>
      <Typography
        variant={"h5"}
        align={"center"}
        color={"primary"}
      >
        Base Parameters
      </Typography>

      <Grid container spacing={1}>
        {parameterData.map(param =>
        {
          const formula = getGrowthFormula(param.longParamId);
          const isMaxTp = (param.longParamId === 30);
          const maxTpValue = isMaxTp ? MaxTpParser.read(selectedEnemy.note) : 0;

          return (
            <React.Fragment key={param.paramId}>
              {/* Parameter Input - Left Column */}
              <Grid size={6}>
                {isMaxTp
                  ? (
                    <NumberInputWithLabel
                      label={param.label}
                      endAdornment={param.icon}
                      value={maxTpValue}
                      onChangeEventHandler={(event) =>
                      {
                        const updatedValue = parseInt(event.target.value) ?? 0;
                        const updatedNote = MaxTpParser.write(selectedEnemy.note, updatedValue);
                        updateNote(updatedNote);
                      }}
                    />
                  )
                  : (
                    <NumberInputWithLabel
                      label={param.label}
                      endAdornment={param.icon}
                      value={selectedEnemy.params[param.paramId]}
                      onChangeEventHandler={(event) =>
                      {
                        const updatedValue = parseInt(event.target.value) ?? 1;
                        updateEnemyWithNewParam(param.paramId, updatedValue);
                      }}
                    />
                  )}
              </Grid>

              {/* Growth Formula - Right Column */}
              <Grid size={6}>
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '30px', // Match height of NumberInputWithLabel
                }}>
                  {formula && (
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%'
                    }}>
                      <ShowChart sx={{
                        color: 'text.secondary',
                        mr: 0.5,
                        fontSize: '0.875rem',
                        flexShrink: 0
                      }}/>
                      <Tooltip title={formula}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            width: '100%',
                            display: 'inline-block',
                            color: 'text.secondary'
                          }}
                        >
                          {formula}
                        </Typography>
                      </Tooltip>
                    </Box>
                  )}
                </Box>
              </Grid>
            </React.Fragment>
          );
        })}
      </Grid>
    </Stack>
  </>
}
