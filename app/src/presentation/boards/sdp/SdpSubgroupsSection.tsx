import {
  Box,
  Button,
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
import { emptyMasteryProse } from "@services/sdp/sdpPanelShape";

type Subgroup = Sdp.PanelSubgroup;

type SdpSubgroupsSectionProps = {
  subgroups: Subgroup[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onChange: (updated: Subgroup[]) => void;
};

const createBlankSubgroup = (index: number): Subgroup =>
{
  return {
    key: `subgroup_${index}`,
    name: `New Subgroup #${index}`,
    iconIndex: -1,
    description: "",
    prose: emptyMasteryProse(),
  };
};

const SdpSubgroupsSection = ({
  subgroups,
  selectedIndex,
  onSelectIndex,
  onChange,
}: SdpSubgroupsSectionProps) =>
{
  const selectedSubgroup = subgroups.at(selectedIndex) ?? null;

  const applySubgroups = (updated: Subgroup[]) =>
  {
    onChange(updated);
  };

  const updateSelected = (patch: Partial<Subgroup>) =>
  {
    if (selectedSubgroup === null)
    {
      return;
    }

    applySubgroups(subgroups.with(selectedIndex, {
      ...selectedSubgroup,
      ...patch,
    }));
  };

  const updateProse = (patch: Partial<Sdp.MasteryProse>) =>
  {
    if (selectedSubgroup === null)
    {
      return;
    }

    updateSelected({
      prose: {
        ...selectedSubgroup.prose,
        ...patch,
      },
    });
  };

  const handleAdd = () =>
  {
    const next = subgroups.concat(createBlankSubgroup(subgroups.length));
    applySubgroups(next);
    onSelectIndex(next.length - 1);
  };

  const handleClone = () =>
  {
    if (selectedSubgroup === null)
    {
      return;
    }

    const cloned = {
      ...selectedSubgroup,
      key: `${selectedSubgroup.key}_copy`,
      name: `${selectedSubgroup.name} (copy)`,
    };
    const next = subgroups.toSpliced(selectedIndex + 1, 0, cloned);
    applySubgroups(next);
    onSelectIndex(selectedIndex + 1);
  };

  const handleDelete = () =>
  {
    if (selectedSubgroup === null)
    {
      return;
    }

    const next = subgroups.toSpliced(selectedIndex, 1);
    applySubgroups(next);
    onSelectIndex(Math.max(0, selectedIndex - 1));
  };

  const handleMove = (
    fromIdx: number,
    toIdx: number
  ) =>
  {
    if (toIdx < 0 || toIdx >= subgroups.length)
    {
      return;
    }

    const next = [ ...subgroups ];
    const [ moved ] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    applySubgroups(next);

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
            Add Subgroup
          </Button>
          {subgroups.map((subgroup, index) =>
          {
            const selected = index === selectedIndex;
            return (
              <Stack
                key={`${subgroup.key}-${index}`}
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
                  [{subgroup.key}] {subgroup.name}
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
                  disabled={index === subgroups.length - 1}
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
        {selectedSubgroup === null
          ? (
            <Typography>
              Add a subgroup to prototype mastery suites (for example Ghosty tiers).
            </Typography>
          )
          : (
            <BoardSectionCard title={"Subgroup Identity"}>
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
                      value={selectedSubgroup.key}
                      onChange={(value) => updateSelected({ key: value })}
                    />
                  </Grid>
                  <Grid size={8}>
                    <TextField
                      fullWidth
                      size={"small"}
                      label={"Name"}
                      value={selectedSubgroup.name}
                      onChange={(event) => updateSelected({ name: event.target.value })}
                    />
                  </Grid>
                  <Grid size={4}>
                    <IconIndexField
                      value={selectedSubgroup.iconIndex}
                      onChange={(value) => updateSelected({ iconIndex: value })}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      size={"small"}
                      label={"Description"}
                      multiline
                      rows={4}
                      value={selectedSubgroup.description}
                      onChange={(event) => updateSelected({ description: event.target.value })}
                    />
                  </Grid>
                  <Grid size={12}>
                    <Typography variant={"subtitle2"} sx={{ mt: 1 }}>
                      Mastery prose
                    </Typography>
                    <Typography variant={"caption"} color={"text.secondary"}>
                      What the player reads on the SDP screen before buying the strip. One template
                      per act, not per tier. Tokens resolve against live data at draw time, so
                      rebalancing a number never leaves the sentence wrong: {"{p.def}"} reads a
                      parameter on the mastery state, {"{d.atk}"} reads one on the payload it
                      applies, {"{s.radius}"} is derived, and {"{v.cdr}"} is a raw tag value. Leave
                      an act blank to reuse a neighbouring one.
                    </Typography>
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      size={"small"}
                      label={"Beginning (tiers 1-3)"}
                      multiline
                      rows={2}
                      value={selectedSubgroup.prose.beginning}
                      onChange={(event) => updateProse({ beginning: event.target.value })}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      size={"small"}
                      label={"Middle (tiers 4-9)"}
                      multiline
                      rows={2}
                      value={selectedSubgroup.prose.middle}
                      onChange={(event) => updateProse({ middle: event.target.value })}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      size={"small"}
                      label={"End (tier 10 capstone)"}
                      multiline
                      rows={2}
                      value={selectedSubgroup.prose.end}
                      onChange={(event) => updateProse({ end: event.target.value })}
                    />
                  </Grid>
                </Grid>
                <Box>
                  <Typography variant={"caption"} color={"text.secondary"}>
                    Panels reference this key via mastery.subgroupKey. Each tier in the subgroup
                    needs a unique subgroupTier and a wrapper masterySkillId.
                  </Typography>
                </Box>
              </Stack>
            </BoardSectionCard>
          )}
      </Grid>
    </Grid>
  );
};

export default SdpSubgroupsSection;
