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
import { SdpParser } from "../../../services/parsers/SdpParser.ts";
import { executeLoad } from "../../../services/DataService.ts";
import ConfigFilenames from "../../../core/enums/ConfigFilenames.ts";
import Panel = Sdp.Panel;
import Configuration = Sdp.Configuration;

type EnemySdpDropProps = {
  note: string;
  updateNote: (value: string) => void;
  projectPath: string;
};

const EnemySdpDrop = ({
  note,
  updateNote,
  projectPath
}: EnemySdpDropProps) =>
{
  const [ sdpKey, setSdpKey ] = useState<string>('');
  const [ sdpDropChance, setSdpDropChance ] = useState<number>(30);
  const [ fieldsDisabled, setFieldsDisabled ] = useState<boolean>(true);

  const [ panels, setPanels ] = useState<Panel[]>([]);

  useEffect(() =>
  {
    let ignore = false;

    const initializeSdps = async () =>
    {
      if (!projectPath || !projectPath.endsWith('/data')) return;

      const sdpData = await executeLoad<Configuration>(projectPath, ConfigFilenames.Sdps);
      if (!ignore && sdpData?.sdps)
      {
        setPanels(sdpData.sdps);
      }
    };

    initializeSdps()
      .catch(console.error);
    return () =>
    {
      ignore = true;
    };
  }, [ projectPath ]);

  useEffect(() =>
  {
    const currentSdp = SdpParser.readDrop(note);
    if (currentSdp)
    {
      setSdpKey(currentSdp.key);
      setSdpDropChance(currentSdp.dropChance);
      setFieldsDisabled(false);
    }
    else
    {
      setSdpKey('');
      setSdpDropChance(0);
      setFieldsDisabled(true);
    }
  }, [ note ]);

  const handleUpdateNote = () =>
  {
    if (fieldsDisabled)
    {
      const updatedNote = SdpParser.deleteDrop(note);
      updateNote(updatedNote);
      return;
    }

    const sdpData = {
      key: sdpKey,
      dropChance: sdpDropChance,
    };

    const updatedNote = SdpParser.writeDrop(note, sdpData);
    updateNote(updatedNote);
  };

  const handleUpdateKey = (updatedKey: string) =>
  {
    setSdpKey(updatedKey);

    // Write using the fresh key to avoid stale state
    const sdpData = {
      key: updatedKey,
      dropChance: sdpDropChance,
    };
    const updatedNote = SdpParser.writeDrop(note, sdpData);
    updateNote(updatedNote);
  };

  const handleUpdateDropChance = (updatedDropChance: number) =>
  {
    setSdpDropChance(updatedDropChance);

    // Write using the fresh drop chance to avoid stale state
    const sdpData = {
      key: sdpKey,
      dropChance: updatedDropChance,
    };
    const updatedNote = SdpParser.writeDrop(note, sdpData);
    updateNote(updatedNote);
  };

  const handleToggleFields = (event: React.ChangeEvent<HTMLInputElement>) =>
  {
    const newDisabledState = !event.target.checked;
    setFieldsDisabled(newDisabledState);

    // Update the note when toggling the checkbox
    setTimeout(handleUpdateNote, 0);
  };

  const selectedPanel: Panel | null = useMemo(() =>
  {
    return panels.find(p => p.key === sdpKey) ?? null;
  }, [ panels, sdpKey ]);

  const canOpenInSdp = useMemo(() =>
  {
    return !fieldsDisabled && sdpKey !== '' && (panels?.length ?? 0) > 0;
  }, [ fieldsDisabled, sdpKey, panels ]);

  const handleOpenInSdp = () =>
  {
    if (!canOpenInSdp) return;

    window.dispatchEvent(new CustomEvent('jmz:navigate-to-tab', {
      detail: {
        tab: 'sdp',
        sdpKey: sdpKey,
      }
    }));
  };

  return <>
    <FormControlLabel
      control={
        <Checkbox
          checked={!fieldsDisabled}
          onChange={handleToggleFields}
        />
      }
      label="Enable SDP Drop"
      labelPlacement={"end"}
    />

    <Autocomplete
      size={"small"}
      options={panels}
      value={selectedPanel}
      disabled={fieldsDisabled}
      isOptionEqualToValue={(opt, val) => opt.key === val.key}
      getOptionLabel={(option) => option
        ? `[${option.key}] ${option.name}`
        : ""}
      onChange={(_, newValue) => handleUpdateKey(newValue?.key ?? '')}
      slotProps={{ listbox: { sx: { maxHeight: '170px' } } }}
      renderInput={(params) => (
        <TextField
          {...params}
          size={"small"}
          label={"SDP"}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.key} style={{ height: 32 }}>
          {[ `[${option.key}] ${option.name}` ]}
        </li>
      )}
    />

    <Button
      size={"small"}
      variant={"outlined"}
      startIcon={<OpenInNew/>}
      onClick={handleOpenInSdp}
      disabled={!canOpenInSdp}
    >
      Open in SDP
    </Button>

    <NumberInputWithLabel
      label={"% Drop Chance"}
      value={sdpDropChance}
      onChangeEventHandler={(event) => handleUpdateDropChance(parseInt(event.target.value))}
      disabled={fieldsDisabled}
    />
  </>;
};

export default EnemySdpDrop;