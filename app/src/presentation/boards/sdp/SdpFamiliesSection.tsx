import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  ContentCopy,
  DeleteOutline,
} from "@mui/icons-material";

import KeyTextField from '../../../components/core/KeyTextField.tsx';
import { BoardSectionCard } from "@presentation/components/board/BoardSectionCard.tsx";
import { IconIndexField } from "@presentation/components/icons/IconIndexField.tsx";

type Family = Sdp.PanelFamily;
type Subgroup = Sdp.PanelSubgroup;

type SdpFamiliesSectionProps = {
  families: Family[];
  subgroups: Subgroup[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onChange: (updated: Family[]) => void;
};

const createBlankFamily = (index: number): Family =>
{
  return {
    key: `family_${index}`,
    name: `New Family #${index}`,
    iconIndex: -1,
    description: "",
    subgroupKeys: [],
  };
};

const SdpFamiliesSection = ({
  families,
  subgroups,
  selectedIndex,
  onSelectIndex,
  onChange,
}: SdpFamiliesSectionProps) =>
{
  const selectedFamily = families.at(selectedIndex) ?? null;
  const assignedSubgroupKeys = new Set(
    families.flatMap(family => family.subgroupKeys)
  );

  const applyFamilies = (updated: Family[]) =>
  {
    onChange(updated);
  };

  const updateSelected = (patch: Partial<Family>) =>
  {
    if (selectedFamily === null)
    {
      return;
    }

    applyFamilies(families.with(selectedIndex, {
      ...selectedFamily,
      ...patch,
    }));
  };

  const handleAdd = () =>
  {
    const next = families.concat(createBlankFamily(families.length));
    applyFamilies(next);
    onSelectIndex(next.length - 1);
  };

  const handleClone = () =>
  {
    if (selectedFamily === null)
    {
      return;
    }

    const cloned = {
      ...selectedFamily,
      key: `${selectedFamily.key}_copy`,
      name: `${selectedFamily.name} (copy)`,
      subgroupKeys: [ ...selectedFamily.subgroupKeys ],
    };
    const next = families.toSpliced(selectedIndex + 1, 0, cloned);
    applyFamilies(next);
    onSelectIndex(selectedIndex + 1);
  };

  const handleDelete = () =>
  {
    if (selectedFamily === null)
    {
      return;
    }

    const next = families.toSpliced(selectedIndex, 1);
    applyFamilies(next);
    onSelectIndex(Math.max(0, selectedIndex - 1));
  };

  const handleMove = (
    fromIdx: number,
    toIdx: number
  ) =>
  {
    if (toIdx < 0 || toIdx >= families.length)
    {
      return;
    }

    const next = [ ...families ];
    const [ moved ] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    applyFamilies(next);

    if (selectedIndex === fromIdx)
    {
      onSelectIndex(toIdx);
    }
    else if (fromIdx < selectedIndex && toIdx >= selectedIndex)
    {
      onSelectIndex(selectedIndex - 1);
    }
    else if (fromIdx > selectedIndex && toIdx <= selectedIndex)
    {
      onSelectIndex(selectedIndex + 1);
    }
  };

  const subgroupOptionsForSelectedFamily = subgroups.filter(subgroup =>
  {
    if (selectedFamily === null)
    {
      return false;
    }

    if (selectedFamily.subgroupKeys.includes(subgroup.key))
    {
      return true;
    }

    return assignedSubgroupKeys.has(subgroup.key) === false;
  });

  const selectedSubgroups = selectedFamily === null
    ? []
    : subgroups.filter(subgroup => selectedFamily.subgroupKeys.includes(subgroup.key));

  return (
    <Grid container columnSpacing={2}>
      <Grid size={4}>
        <Stack spacing={1}>
          <Button
            fullWidth
            startIcon={<Add/>}
            variant={"outlined"}
            onClick={handleAdd}
          >
            Add Family
          </Button>
          {families.map((family, index) =>
          {
            const selected = index === selectedIndex;
            return (
              <Stack
                key={`${family.key}-${index}`}
                direction={"row"}
                spacing={0.5}
                alignItems={"center"}
              >
                <Button
                  fullWidth
                  variant={selected ? "contained" : "outlined"}
                  onClick={() => onSelectIndex(index)}
                  sx={{ justifyContent: "flex-start", flex: 1 }}
                >
                  [{family.key}] {family.name}
                </Button>
                <IconButton
                  size={"small"}
                  disabled={index === 0}
                  onClick={() => handleMove(index, index - 1)}
                >
                  <ArrowUpward fontSize={"small"}/>
                </IconButton>
                <IconButton
                  size={"small"}
                  disabled={index === families.length - 1}
                  onClick={() => handleMove(index, index + 1)}
                >
                  <ArrowDownward fontSize={"small"}/>
                </IconButton>
              </Stack>
            );
          })}
        </Stack>
      </Grid>
      <Grid size={8}>
        {selectedFamily === null
          ? (
            <Typography>
              Add a family to group subgroups for the in-game SDP family strip.
            </Typography>
          )
          : (
            <BoardSectionCard title={"Family Identity"}>
              <Stack spacing={1.5}>
                <Stack direction={"row"} spacing={1}>
                  <Button
                    startIcon={<ContentCopy/>}
                    variant={"outlined"}
                    onClick={handleClone}
                  >
                    Clone
                  </Button>
                  <IconButton color={"error"} onClick={handleDelete}>
                    <DeleteOutline/>
                  </IconButton>
                </Stack>
                <Grid container spacing={1.5}>
                  <Grid size={4}>
                    <KeyTextField
                      value={selectedFamily.key}
                      onChange={(value) => updateSelected({ key: value })}
                    />
                  </Grid>
                  <Grid size={8}>
                    <TextField
                      fullWidth
                      size={"small"}
                      label={"Name"}
                      value={selectedFamily.name}
                      onChange={(event) => updateSelected({ name: event.target.value })}
                    />
                  </Grid>
                  <Grid size={4}>
                    <IconIndexField
                      value={selectedFamily.iconIndex}
                      onChange={(value) => updateSelected({ iconIndex: value })}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      size={"small"}
                      label={"Description"}
                      multiline
                      rows={3}
                      value={selectedFamily.description}
                      onChange={(event) => updateSelected({ description: event.target.value })}
                    />
                  </Grid>
                  <Grid size={12}>
                    <Autocomplete
                      multiple
                      disableCloseOnSelect
                      options={subgroupOptionsForSelectedFamily}
                      value={selectedSubgroups}
                      getOptionLabel={(subgroup) =>
                        subgroup.name
                          ? `[${subgroup.key}] ${subgroup.name}`
                          : subgroup.key}
                      isOptionEqualToValue={(left, right) => left.key === right.key}
                      onChange={(_, value) =>
                        updateSelected({ subgroupKeys: value.map(subgroup => subgroup.key) })}
                      renderTags={(value, getTagProps) =>
                        value.map((subgroup, index) =>
                        {
                          const { key, ...tagProps } = getTagProps({ index });
                          return (
                            <Chip
                              key={key}
                              label={subgroup.key}
                              size={"small"}
                              {...tagProps}
                            />
                          );
                        })}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size={"small"}
                          label={"Subgroups in this family"}
                          placeholder={"Pick subgroups"}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
                <Box>
                  <Typography variant={"caption"} color={"text.secondary"}>
                    Panels reference subgroups via mastery.subgroupKey; family membership is derived here.
                    A subgroup may belong to only one family.
                  </Typography>
                </Box>
              </Stack>
            </BoardSectionCard>
          )}
      </Grid>
    </Grid>
  );
};

export default SdpFamiliesSection;