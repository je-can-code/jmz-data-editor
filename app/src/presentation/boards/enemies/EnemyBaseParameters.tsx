import { type ReactNode, Fragment } from 'react';
import { Box, Grid, Stack, Tooltip, Typography } from '@mui/material';
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
} from '@mui/icons-material';
import { blue, green, lightBlue, lightGreen, pink, red } from '@mui/material/colors';
import { EnemyBaseParam } from '@core/enums/EnemyParameter.ts';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import { knownLongParams } from '../../../mappers/ParameterIdMapper.ts';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';

type EnemyBaseParametersProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemyWithNewParam: (parameterId: number, updatedValue: number) => void;
  updateEnemy: (updatedEnemy: RPG_EnemyDomainModel) => void;
};

type ParamDef = {
  label: string;
  paramId: number;
  icon: ReactNode;
  longParamId: number;
};

const RESOURCES: ParamDef[] = [
  { label: 'Max HP', paramId: EnemyBaseParam.MaxHp,  icon: <HeartBroken sx={{ color: pink[ 200 ] }}/>,      longParamId: 0  },
  { label: 'Max MP', paramId: EnemyBaseParam.MaxMp,  icon: <MonitorHeart sx={{ color: lightBlue[ 400 ] }}/>, longParamId: 1  },
  { label: 'Max TP', paramId: -1,                    icon: <Battery6Bar sx={{ color: lightGreen[ 400 ] }}/>, longParamId: 30 },
];

const OFFENSE: ParamDef[] = [
  { label: 'Power',  paramId: EnemyBaseParam.Attack,  icon: <FitnessCenter sx={{ color: red[ 900 ] }}/>,   longParamId: 2 },
  { label: 'Force',  paramId: EnemyBaseParam.MAttack, icon: <AutoFixHigh sx={{ color: green[ 500 ] }}/>,   longParamId: 4 },
  { label: 'Speed',  paramId: EnemyBaseParam.Speed,   icon: <DirectionsRun color={'warning'}/>,             longParamId: 6 },
];

const DEFENSE: ParamDef[] = [
  { label: 'Endurance', paramId: EnemyBaseParam.Defense,  icon: <Shield sx={{ color: blue[ 700 ] }}/>,         longParamId: 3 },
  { label: 'Resist',    paramId: EnemyBaseParam.MDefense, icon: <PhotoFilter sx={{ color: pink[ 400 ] }}/>,     longParamId: 5 },
  { label: 'Luck',      paramId: EnemyBaseParam.Luck,     icon: <Casino/>,                                      longParamId: 7 },
];

const formulaCellSx = {
  fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  display: 'inline-block',
  color: 'text.secondary',
} as const;

const FormulaCell = ({ formula }: { formula: string }) =>
{
  if (!formula)
  {
    return null;
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <ShowChart sx={{ color: 'text.secondary', mr: 0.5, fontSize: '0.875rem', flexShrink: 0 }}/>
      <Tooltip title={formula}>
        <Typography variant="caption" sx={formulaCellSx}>
          {formula}
        </Typography>
      </Tooltip>
    </Box>
  );
};

export default function EnemyBaseParameters({
  selectedEnemy,
  updateEnemyWithNewParam,
  updateEnemy,
}: EnemyBaseParametersProps)
{
  const allParams = knownLongParams();

  const getFormula = (longParamId: number): string =>
  {
    const match = allParams.find((param) => param.longParamId === longParamId);
    return match ? GrowthParser.read(selectedEnemy.note, match) : '';
  };

  const renderRow = (p: ParamDef) =>
  {
    const isMaxTp = p.longParamId === 30;
    return (
      <Fragment key={p.longParamId}>
        <Grid size={4}>
          <NumberInputWithLabel
            label={p.label}
            endAdornment={p.icon}
            variant={'outlined'}
            size={'small'}
            fullWidth
            value={isMaxTp ? selectedEnemy.maxTp : selectedEnemy.params[ p.paramId ]}
            onChangeEventHandler={(event) =>
            {
              if (isMaxTp)
              {
                selectedEnemy.maxTp = parseInt(event.target.value) ?? 0;
                updateEnemy(selectedEnemy);
              }
              else
              {
                updateEnemyWithNewParam(p.paramId, parseInt(event.target.value) ?? 1);
              }
            }}
          />
        </Grid>
        <Grid size={8}>
          <FormulaCell formula={getFormula(p.longParamId)}/>
        </Grid>
      </Fragment>
    );
  };

  const renderGroup = (title: string, params: ParamDef[]) => (
    <Stack spacing={1} key={title}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
        {title}
      </Typography>
      <Grid container spacing={1} alignItems={'center'}>
        {params.map(renderRow)}
      </Grid>
    </Stack>
  );

  return (
    <BoardSectionCard title={'Base Parameters'}>
      <Stack spacing={2}>
        {renderGroup('Resources', RESOURCES)}
        {renderGroup('Offense', OFFENSE)}
        {renderGroup('Defense', DEFENSE)}
      </Stack>
    </BoardSectionCard>
  );
}
