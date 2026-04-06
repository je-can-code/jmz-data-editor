import React, {
  type ChangeEvent,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowDownward,
  ArrowUpward,
  DeleteOutline,
  Percent,
} from "@mui/icons-material";
import NumberInputWithLabel from "../../../components/core/NumberInputWithLabel.tsx";
import {
  RMMZ_SPECIAL_EFFECT_ESCAPE,
  RMMZ_USABLE_EFFECT_OPTIONS,
  buildBparamAutocompleteOptions,
  catalogRowForEffectCode,
  defaultUsableEffectForCode,
  type RmmzUsableEffectCatalogOption,
} from "@core/enums/RmmzUsableEffectCatalog.ts";

type IdLabelRow = {
  id: number;
  label: string;
};

type ForeignEffectTypeOption = {
  code: number;
  label: string;
  optionKey: string;
  isForeign: true;
};

type UsableEffectTypeOption = RmmzUsableEffectCatalogOption | ForeignEffectTypeOption;

type UsableEffectsEditorProps = {
  value: Rmmz.Data.RPG_UsableEffect[];
  onChange: (next: Rmmz.Data.RPG_UsableEffect[]) => void;
  stateRows: IdLabelRow[];
  skillRows: IdLabelRow[];
  commonEventRows: IdLabelRow[];
};

const SPECIAL_EFFECT_ROWS: IdLabelRow[] = [
  {
    id: RMMZ_SPECIAL_EFFECT_ESCAPE,
    label: `${RMMZ_SPECIAL_EFFECT_ESCAPE}: Escape`,
  },
];

function clampFinite(n: number, lo: number, hi: number): number
{
  if (!Number.isFinite(n))
  {
    return lo;
  }
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Editor percent −100…+100 ↔ stored {@code value1} fraction for recover HP/MP (MZ: {@code mhp * value1 + value2}).
 */
function recoverPercentFromStored(stored: number): number
{
  if (!Number.isFinite(stored))
  {
    return 0;
  }
  return clampFinite(Math.round(stored * 100), -100, 100);
}

/**
 * Editor whole percent 0–100 ↔ stored probability for add/remove state ({@code Math.random() < value1} in MZ).
 */
function stateChancePercentFromStored(stored: number): number
{
  if (!Number.isFinite(stored))
  {
    return 0;
  }
  return clampFinite(Math.round(stored * 100), 0, 100);
}

function isForeignEffectOption(opt: UsableEffectTypeOption): opt is ForeignEffectTypeOption
{
  return "isForeign" in opt && opt.isForeign === true;
}

function optionForEffect(effect: Rmmz.Data.RPG_UsableEffect): UsableEffectTypeOption
{
  const hit = RMMZ_USABLE_EFFECT_OPTIONS.find((o) => o.code === effect.code);
  if (hit)
  {
    return hit;
  }
  return {
    code: effect.code,
    label: `Non-vanilla (code ${effect.code})`,
    optionKey: `foreign-${effect.code}`,
    isForeign: true,
  };
}

function replaceAt(
  list: Rmmz.Data.RPG_UsableEffect[],
  index: number,
  row: Rmmz.Data.RPG_UsableEffect
): Rmmz.Data.RPG_UsableEffect[]
{
  return list.map((item, i) =>
  {
    if (i !== index)
    {
      return item;
    }
    return {
      ...row,
    };
  });
}

/**
 * Dense table editor for vanilla {@link Rmmz.Data.RPG_UsableEffect} lists (skills / items).
 */
function UsableEffectsEditor(props: UsableEffectsEditorProps)
{
  const {
    value,
    onChange,
    stateRows,
    skillRows,
    commonEventRows,
  } = props;

  const bparamRows = useMemo(() => buildBparamAutocompleteOptions(), []);

  const [ addMenuAnchor, setAddMenuAnchor ] = useState<null | HTMLElement>(null);

  const handleAddOpen = (event: React.MouseEvent<HTMLButtonElement>) =>
  {
    setAddMenuAnchor(event.currentTarget);
  };

  const handleAddClose = () =>
  {
    setAddMenuAnchor(null);
  };

  const handleAddPick = (code: number) =>
  {
    const row = defaultUsableEffectForCode(code);
    onChange([ ...value, row ]);
    handleAddClose();
  };

  const handleMove = (index: number, delta: number) =>
  {
    const j = index + delta;
    if (j < 0 || j >= value.length)
    {
      return;
    }
    const next = value.slice();
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    onChange(next);
  };

  const handleRemove = (index: number) =>
  {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleTypeChange = (index: number, opt: UsableEffectTypeOption | null) =>
  {
    if (opt === null)
    {
      return;
    }
    if (isForeignEffectOption(opt))
    {
      return;
    }
    onChange(replaceAt(value, index, defaultUsableEffectForCode(opt.code)));
  };

  const patchRow = useCallback(
    (index: number, patch: Partial<Rmmz.Data.RPG_UsableEffect>) =>
    {
      const cur = value[index];
      if (!cur)
      {
        return;
      }
      onChange(replaceAt(value, index, {
        ...cur,
        ...patch,
      }));
    },
    [ onChange, value ]
  );

  const renderValueFields = (
    index: number,
    effect: Rmmz.Data.RPG_UsableEffect,
    catalog: ReturnType<typeof catalogRowForEffectCode>
  ) =>
  {
    if (catalog === null)
    {
      return (
        <Stack direction={"row"} spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <NumberInputWithLabel
            label={"Code"}
            variant={"outlined"}
            size={"small"}
            value={effect.code}
            sx={{ width: 112 }}
            htmlInput={{ step: 1 }}
            onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            {
              const n = Number(e.target.value);
              patchRow(index, {
                code: Number.isFinite(n)
                  ? Math.trunc(n)
                  : effect.code,
              });
            }}
          />
          <NumberInputWithLabel
            label={"dataId"}
            variant={"outlined"}
            size={"small"}
            value={effect.dataId}
            sx={{ width: 112 }}
            htmlInput={{ step: 1 }}
            onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            {
              const n = Number(e.target.value);
              patchRow(index, {
                dataId: Number.isFinite(n)
                  ? Math.trunc(n)
                  : effect.dataId,
              });
            }}
          />
          <NumberInputWithLabel
            label={"value1"}
            variant={"outlined"}
            size={"small"}
            value={effect.value1}
            sx={{ width: 120 }}
            htmlInput={{ step: 1 }}
            onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            {
              const n = Number(e.target.value);
              patchRow(index, {
                value1: Number.isFinite(n)
                  ? n
                  : effect.value1,
              });
            }}
          />
          <NumberInputWithLabel
            label={"value2"}
            variant={"outlined"}
            size={"small"}
            value={effect.value2}
            sx={{ width: 120 }}
            htmlInput={{ step: 1 }}
            onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            {
              const n = Number(e.target.value);
              patchRow(index, {
                value2: Number.isFinite(n)
                  ? n
                  : effect.value2,
              });
            }}
          />
        </Stack>
      );
    }

    const dataCell = () =>
    {
      switch (catalog.dataId)
      {
        case "none":
          return null;
        case "state_add":
        case "state_remove":
          return (
            <Autocomplete
              size={"small"}
              sx={{ minWidth: 220 }}
              options={stateRows}
              value={
                stateRows.find((r) => r.id === effect.dataId) ?? {
                  id: effect.dataId,
                  label: `${effect.dataId}: (unset)`,
                }
              }
              onChange={(_e, opt) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={"dataId"}
                  placeholder={"State"}
                />
              )}
            />
          );
        case "param":
          return (
            <Autocomplete
              size={"small"}
              sx={{ minWidth: 200 }}
              options={bparamRows}
              value={
                bparamRows.find((r) => r.id === effect.dataId) ?? {
                  id: effect.dataId,
                  label: `${effect.dataId}`,
                }
              }
              onChange={(_e, opt) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={"dataId"}
                  placeholder={"Param"}
                />
              )}
            />
          );
        case "special":
          return (
            <Autocomplete
              size={"small"}
              sx={{ minWidth: 200 }}
              options={SPECIAL_EFFECT_ROWS}
              value={
                SPECIAL_EFFECT_ROWS.find((r) => r.id === effect.dataId) ?? SPECIAL_EFFECT_ROWS[0]
              }
              onChange={(_e, opt) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={"dataId"}
                />
              )}
            />
          );
        case "skill":
          return (
            <Autocomplete
              size={"small"}
              sx={{ minWidth: 220 }}
              options={skillRows}
              value={
                skillRows.find((r) => r.id === effect.dataId) ?? {
                  id: effect.dataId,
                  label: `${effect.dataId}: (unset)`,
                }
              }
              onChange={(_e, opt) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={"dataId"}
                  placeholder={"Skill"}
                />
              )}
            />
          );
        case "common_event":
          return (
            <Autocomplete
              size={"small"}
              sx={{ minWidth: 260 }}
              options={commonEventRows}
              value={
                commonEventRows.find((r) => r.id === effect.dataId) ?? {
                  id: effect.dataId,
                  label: `${effect.dataId}: (unset)`,
                }
              }
              onChange={(_e, opt) =>
              {
                if (opt === null)
                {
                  return;
                }
                patchRow(index, {
                  dataId: opt.id,
                });
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={"dataId"}
                  placeholder={"Common event"}
                />
              )}
            />
          );
        default:
          return null;
      }
    };

    const v1 = () =>
    {
      switch (catalog.value1)
      {
        case "recover_fraction":
          return (
            <NumberInputWithLabel
              label={"% max"}
              variant={"outlined"}
              size={"small"}
              value={recoverPercentFromStored(effect.value1)}
              sx={{ width: 140 }}
              htmlInput={{
                min: -100,
                max: 100,
                step: 1,
              }}
              endAdornment={<Percent/>}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(raw, -100, 100) / 100,
                });
              }}
            />
          );
        case "tp_amount":
          return (
            <NumberInputWithLabel
              label={"TP Δ"}
              variant={"outlined"}
              size={"small"}
              value={clampFinite(Math.trunc(effect.value1), -9999, 9999)}
              sx={{ width: 128 }}
              htmlInput={{
                min: -9999,
                max: 9999,
                step: 1,
              }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(Math.trunc(raw), -9999, 9999),
                });
              }}
            />
          );
        case "state_chance":
          return (
            <NumberInputWithLabel
              label={"Chance"}
              variant={"outlined"}
              size={"small"}
              value={stateChancePercentFromStored(effect.value1)}
              sx={{ width: 140 }}
              htmlInput={{
                min: 0,
                max: 100,
                step: 1,
              }}
              endAdornment={<Percent/>}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(Math.trunc(raw), 0, 100) / 100,
                });
              }}
            />
          );
        case "buff_turns":
        case "debuff_turns":
          return (
            <NumberInputWithLabel
              label={"Turns"}
              variant={"outlined"}
              size={"small"}
              value={clampFinite(Math.trunc(effect.value1), 0, 9999)}
              sx={{ width: 120 }}
              htmlInput={{
                min: 0,
                max: 9999,
                step: 1,
              }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(Math.trunc(raw), 0, 9999),
                });
              }}
            />
          );
        case "grow_delta":
          return (
            <NumberInputWithLabel
              label={"Δ param"}
              variant={"outlined"}
              size={"small"}
              value={Math.trunc(effect.value1)}
              sx={{ width: 128 }}
              htmlInput={{
                min: -999999,
                max: 999999,
                step: 1,
              }}
              onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw))
                {
                  return;
                }
                patchRow(index, {
                  value1: clampFinite(Math.trunc(raw), -999999, 999999),
                });
              }}
            />
          );
        case "unused":
        default:
          return null;
      }
    };

    const v2 = () =>
    {
      if (catalog.value2 === "recover_flat")
      {
        return (
          <NumberInputWithLabel
            label={"+ flat"}
            variant={"outlined"}
            size={"small"}
            value={clampFinite(Math.trunc(effect.value2), -999999, 999999)}
            sx={{ width: 136 }}
            htmlInput={{
              min: -999999,
              max: 999999,
              step: 1,
            }}
            onChangeEventHandler={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw))
              {
                return;
              }
              patchRow(index, {
                value2: clampFinite(Math.trunc(raw), -999999, 999999),
              });
            }}
          />
        );
      }
      return null;
    };

    const dataEl = dataCell();
    const v1El = v1();
    const v2El = v2();

    return (
      <Stack direction={"row"} spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
        {dataEl !== null && (
          <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>{dataEl}</Box>
        )}
        {v1El !== null && (
          <Box sx={{ flex: "0 0 auto" }}>{v1El}</Box>
        )}
        {v2El !== null && (
          <Box sx={{ flex: "0 0 auto" }}>{v2El}</Box>
        )}
      </Stack>
    );
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={"row"} alignItems={"center"} spacing={1}>
        <Button
          variant={"outlined"}
          size={"small"}
          onClick={handleAddOpen}
        >
          Add effect
        </Button>
        <Menu
          anchorEl={addMenuAnchor}
          open={addMenuAnchor !== null}
          onClose={handleAddClose}
          slotProps={{
            list: {
              dense: true,
              sx: { maxHeight: 360 },
            },
          }}
        >
          {RMMZ_USABLE_EFFECT_OPTIONS.map((opt) => (
            <MenuItem
              key={opt.optionKey}
              onClick={() =>
              {
                handleAddPick(opt.code);
              }}
            >
              <Stack spacing={0}>
                <Typography variant={"body2"}>{opt.label}</Typography>
                <Typography variant={"caption"} color={"text.secondary"}>
                  code {opt.code}
                </Typography>
              </Stack>
            </MenuItem>
          ))}
        </Menu>
        <Typography variant={"caption"} color={"text.secondary"}>
          Reorder with arrows. Effect codes match RPG Maker MZ Game_Action constants.
        </Typography>
      </Stack>

      {value.length === 0
        ? (
          <Typography variant={"body2"} color={"text.secondary"}>
            No effects. Use &quot;Add effect&quot; to append a row.
          </Typography>
        )
        : (
          <TableContainer>
            <Table size={"small"} padding={"checkbox"}>
              <TableHead>
                <TableRow>
                  <TableCell width={96}>Order</TableCell>
                  <TableCell sx={{ minWidth: 300, width: "34%" }}>Type</TableCell>
                  <TableCell>Parameters</TableCell>
                  <TableCell width={56} />
                </TableRow>
              </TableHead>
              <TableBody>
                {value.map((effect, index) =>
                {
                  const catalog = catalogRowForEffectCode(effect.code);
                  const typeOpt = optionForEffect(effect);
                  return (
                    <TableRow key={`${index}-${effect.code}-${effect.dataId}`}>
                      <TableCell>
                        <Stack direction={"row"} spacing={0}>
                          <Tooltip title={"Move up"}>
                            <span>
                              <IconButton
                                size={"small"}
                                disabled={index === 0}
                                onClick={() =>
                                {
                                  handleMove(index, -1);
                                }}
                              >
                                <ArrowUpward fontSize={"inherit"} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title={"Move down"}>
                            <span>
                              <IconButton
                                size={"small"}
                                disabled={index >= value.length - 1}
                                onClick={() =>
                                {
                                  handleMove(index, 1);
                                }}
                              >
                                <ArrowDownward fontSize={"inherit"} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ minWidth: 300, verticalAlign: "top" }}>
                        <Box sx={{ width: "100%", minWidth: 280 }}>
                          <Autocomplete
                            fullWidth
                            size={"small"}
                            options={RMMZ_USABLE_EFFECT_OPTIONS}
                            value={isForeignEffectOption(typeOpt)
                              ? null
                              : typeOpt}
                            onChange={(_e, opt) =>
                            {
                              handleTypeChange(index, opt);
                            }}
                            getOptionLabel={(o) => o.label}
                            isOptionEqualToValue={(a, b) => a.code === b.code}
                            renderOption={(props, option) =>
                            {
                              const {
                                key,
                                ...rest
                              } = props;
                              return (
                                <li key={key} {...rest}>
                                  <Stack spacing={0}>
                                    <Typography variant={"body2"}>{option.label}</Typography>
                                    <Typography variant={"caption"} color={"text.secondary"}>
                                      code {option.code}
                                    </Typography>
                                  </Stack>
                                </li>
                              );
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                fullWidth
                                label={"Effect"}
                                placeholder={isForeignEffectOption(typeOpt)
                                  ? typeOpt.label
                                  : ""}
                              />
                            )}
                          />
                        </Box>
                        {isForeignEffectOption(typeOpt) && (
                          <Typography variant={"caption"} color={"warning.main"} display={"block"} sx={{ mt: 0.5 }}>
                            Non-vanilla code — use parameter fields on the right, or pick a standard type above.
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ verticalAlign: "top" }}>
                        {renderValueFields(index, effect, catalog)}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={"Remove"}>
                          <IconButton
                            size={"small"}
                            color={"error"}
                            onClick={() =>
                            {
                              handleRemove(index);
                            }}
                          >
                            <DeleteOutline fontSize={"small"} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
    </Stack>
  );
}

export {
  UsableEffectsEditor,
  type UsableEffectsEditorProps,
  type IdLabelRow,
};
