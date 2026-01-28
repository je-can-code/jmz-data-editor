import React, {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Autocomplete,
  Button,
  Checkbox,
  FormControlLabel,
  TextField
} from "@mui/material";
import { OpenInNew } from "@mui/icons-material";
import NumberInputWithLabel from "../../../components/NumberInputWithLabel.tsx";
import { SdpParser } from "@services/parsers/SdpParser.ts";
import { executeLoad } from "@services/DataService.ts";
import ConfigFilenames from "@core/enums/ConfigFilenames.ts";
import Panel = Sdp.Panel;
import Configuration = Sdp.Configuration;
import { RPG_EnemyDomainModel } from "@core/domain/entities/RPG_EnemyDomainModel.ts";
import { useProjectPath } from "@presentation/context/project-path.context.tsx";

type EnemySdpDropProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  updateEnemy: (value: RPG_EnemyDomainModel) => void;
};

const EnemySdpDrop = ({
  selectedEnemy,
  updateEnemy,
}: EnemySdpDropProps) =>
{
  const { projectPath } = useProjectPath();

  const [ panels, setPanels ] = useState<Panel[]>([]);

  useEffect(() =>
  {
    let ignore = false;
    const initializeSdps = async () =>
    {
      if (!projectPath || !projectPath.endsWith('/data')) return;
      const sdpData = await executeLoad<Configuration>(projectPath, ConfigFilenames.Sdps);
      if (!ignore && sdpData?.sdps) setPanels(sdpData.sdps);
    };
    initializeSdps()
      .catch(console.error);
    return () =>
    {
      ignore = true;
    };
  }, [ projectPath ]);

  const currentSdpDrop = selectedEnemy.sdpDrop;
  const isEnabled = selectedEnemy.sdpDrop.key !== '' || selectedEnemy.sdpDrop.isForcedOpen;

  const selectedPanel = useMemo(() =>
  {
    return panels.find(p => p.key === currentSdpDrop?.key) ?? null;
  }, [ panels, currentSdpDrop?.key ]);

  const canOpenInSdp = isEnabled && currentSdpDrop.key !== '' && panels.length > 0;

  const handleToggleFields = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;

    // Track state directly on the model
    selectedEnemy.sdpDrop.isForcedOpen = checked;

    if (!checked) {
      selectedEnemy.sdpDrop.key = '';
      selectedEnemy.sdpDrop.dropChance = 0;
    }

    updateEnemy(selectedEnemy);
  };

  const handleUpdateKey = (updatedKey: string) => {
    selectedEnemy.sdpDrop.key = updatedKey;

    if (updatedKey !== '') selectedEnemy.sdpDrop.isForcedOpen = false;
    updateEnemy(selectedEnemy);
  };

  const handleUpdateDropChance = (updatedDropChance: number) =>
  {
    selectedEnemy.sdpDrop.dropChance = updatedDropChance;
    updateEnemy(selectedEnemy);
  };

  const handleOpenInSdp = () =>
  {
    if (!canOpenInSdp) return;
    window.dispatchEvent(new CustomEvent('jmz:navigate-to-tab', {
      detail: {
        tab: 'sdp',
        sdpKey: currentSdpDrop.key
      }
    }));
  };

  return (
    <>
      <FormControlLabel
        control={<Checkbox checked={isEnabled} onChange={handleToggleFields}/>}
        label="Enable SDP Drop"
        labelPlacement="end"
      />

      <Autocomplete
        size="small"
        options={panels}
        value={selectedPanel}
        disabled={!isEnabled}
        isOptionEqualToValue={(opt, val) => opt.key === val.key}
        getOptionLabel={(option) => option
          ? `[${option.key}] ${option.name}`
          : ""}
        onChange={(_, newValue) => handleUpdateKey(newValue?.key ?? '')}
        renderInput={(params) => <TextField {...params} size="small" label="SDP"/>}
        renderOption={(props, option) => (
          <li {...props} key={option.key} style={{ height: 32 }}>
            {`[${option.key}] ${option.name}`}
          </li>
        )}
      />

      <Button
        size="small"
        variant="outlined"
        startIcon={<OpenInNew/>}
        onClick={handleOpenInSdp}
        disabled={!canOpenInSdp}
      >
        Open in SDP
      </Button>

      <NumberInputWithLabel
        label="% Drop Chance"
        value={currentSdpDrop?.dropChance ?? 0}
        onChangeEventHandler={(e) => handleUpdateDropChance(parseInt(e.target.value) || 0)}
        disabled={!isEnabled}
      />
    </>
  );
};

export default EnemySdpDrop;
