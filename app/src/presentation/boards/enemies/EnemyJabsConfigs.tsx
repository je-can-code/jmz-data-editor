import type { ReactNode } from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography
} from '@mui/material';
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
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
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

  const jabsConfigKeys: (keyof JabsConfigsData)[] = [
    'noIdle',
    'canIdle',
    'noHpBar',
    'showHpBar',
    'inanimate',
    'notInanimate',
    'invincible',
    'notInvincible',
    'noName',
    'showName',
  ];

  const activeJabsOptionCount = jabsConfigKeys.filter((k) => selectedEnemy.jabsConfigs[ k ] === true)
    .length;

  /**
   * Checkbox row using custom icons for unchecked vs checked (JABS config pattern).
   */
  const renderCheckbox = (
    config: JabsConfig,
    label: string,
    icon: ReactNode,
    checkedIcon: ReactNode
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

  return (
    <BoardSectionCard
      title={'JABS behavior'}
      subtitle={activeJabsOptionCount === 0
        ? 'No JABS flags on — defaults apply in-game.'
        : `${activeJabsOptionCount} option${activeJabsOptionCount === 1 ? '' : 's'} on`}
      collapsible
      defaultExpanded={false}
    >
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
            'No idle',
            <DirectionsRun sx={{ color: grey[ 400 ] }}/>,
            <DirectionsRun sx={{ color: red[ 500 ] }}/>
          )}
          {renderCheckbox(
            JabsConfig.CanIdle,
            'Can idle',
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
            'No HP bar',
            <HeartBroken sx={{ color: grey[ 400 ] }}/>,
            <HeartBroken sx={{ color: red[ 500 ] }}/>
          )}
          {renderCheckbox(
            JabsConfig.ShowHpBar,
            'Show HP bar',
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
            'Not inanimate',
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
            'Not invincible',
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
            'Hide name',
            <BadgeSharp sx={{ color: grey[ 400 ] }}/>,
            <BadgeSharp sx={{ color: red[ 500 ] }}/>
          )}
          {renderCheckbox(
            JabsConfig.ShowName,
            'Show name',
            <Badge sx={{ color: grey[ 400 ] }}/>,
            <Badge sx={{ color: green[ 500 ] }}/>
          )}
        </Stack>
        </Box>
        </Box>
    </BoardSectionCard>
  );
};

export { EnemyJabsConfigs };
