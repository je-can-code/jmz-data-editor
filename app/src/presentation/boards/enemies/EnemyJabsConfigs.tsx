import { Box, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';
import {
  Badge,
  BadgeSharp,
  DirectionsRun,
  Favorite,
  HeartBroken,
  NoEncryption,
  Security,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import { blue, green, grey, orange, purple, red } from '@mui/material/colors';
import { JabsConfig, JabsConfigsData } from '@core/domain/valueObjects/jabs-configs.ts';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';

type EnemyJabsConfigsProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (enemy: RPG_EnemyDomainModel) => void;
};

const EnemyJabsConfigs = ({
  selectedEnemy,
  updateEnemy,
}: EnemyJabsConfigsProps) =>
{
  /**
   * Updates the specific config property on the domain model
   * and triggers the parent update.
   */
  const handleConfigChange = (
    configName: keyof JabsConfigsData,
    checked: boolean
  ) =>
  {
    selectedEnemy.jabsConfigs.updateConfig(configName, checked);
    updateEnemy(selectedEnemy);
  };

  /**
   * Helper to render a consistent checkbox bound to the domain model.
   */
  const renderCheckbox = (
    config: JabsConfig,
    label: string,
    icon: any,
    checkedIcon: any
  ) => (
    <FormControlLabel
      control={
        <Checkbox
          checked={selectedEnemy.jabsConfigs[ config as keyof JabsConfigsData ]}
          onChange={(
            _,
            checked
          ) => handleConfigChange(config as keyof JabsConfigsData, checked)}
          icon={icon}
          checkedIcon={checkedIcon}
        />
      }
      label={label}
    />
  );

  return <>
    <Typography
      variant={'h4'}
      gutterBottom={true}
      color={'primary'}
      align={'center'}
      sx={{ paddingTop: 2 }}
    >
      JABS Configs
    </Typography>

    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }}>
      {/* Movement configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Movement</Typography>
        <Stack>
          {renderCheckbox(
            JabsConfig.NoIdle,
            'No Idle',
            <DirectionsRun sx={{ color: grey[ 400 ] }}/>,
            <DirectionsRun sx={{ color: red[ 500 ] }}/>
          )}
          {renderCheckbox(
            JabsConfig.CanIdle,
            'Can Idle',
            <DirectionsRun sx={{ color: grey[ 400 ] }}/>,
            <DirectionsRun sx={{ color: green[ 500 ] }}/>
          )}
        </Stack>
      </Box>

      {/* HP Bar configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>HP Bar</Typography>
        <Stack>
          {renderCheckbox(
            JabsConfig.NoHpBar,
            'No HP Bar',
            <HeartBroken sx={{ color: grey[ 400 ] }}/>,
            <HeartBroken sx={{ color: red[ 500 ] }}/>
          )}
          {renderCheckbox(
            JabsConfig.ShowHpBar,
            'Show HP Bar',
            <Favorite sx={{ color: grey[ 400 ] }}/>,
            <Favorite sx={{ color: blue[ 500 ] }}/>
          )}
        </Stack>
      </Box>

      {/* Animation configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Animation</Typography>
        <Stack>
          {renderCheckbox(
            JabsConfig.Inanimate,
            'Inanimate',
            <VisibilityOff sx={{ color: grey[ 400 ] }}/>,
            <VisibilityOff sx={{ color: purple[ 500 ] }}/>
          )}
          {renderCheckbox(
            JabsConfig.NotInanimate,
            'Not Inanimate',
            <Visibility sx={{ color: grey[ 400 ] }}/>,
            <Visibility sx={{ color: green[ 500 ] }}/>
          )}
        </Stack>
      </Box>

      {/* Invincibility configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Invincibility</Typography>
        <Stack>
          {renderCheckbox(
            JabsConfig.Invincible,
            'Invincible',
            <Security sx={{ color: grey[ 400 ] }}/>,
            <Security sx={{ color: orange[ 500 ] }}/>
          )}
          {renderCheckbox(
            JabsConfig.NotInvincible,
            'Not Invincible',
            <NoEncryption sx={{ color: grey[ 400 ] }}/>,
            <NoEncryption sx={{ color: blue[ 500 ] }}/>
          )}
        </Stack>
      </Box>

      {/* Name display configs */}
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Name Display</Typography>
        <Stack>
          {renderCheckbox(
            JabsConfig.NoName,
            'No Name',
            <BadgeSharp sx={{ color: grey[ 400 ] }}/>,
            <BadgeSharp sx={{ color: red[ 500 ] }}/>
          )}
          {renderCheckbox(
            JabsConfig.ShowName,
            'Show Name',
            <Badge sx={{ color: grey[ 400 ] }}/>,
            <Badge sx={{ color: green[ 500 ] }}/>
          )}
        </Stack>
      </Box>
    </Box>
  </>;
};

export { EnemyJabsConfigs };
