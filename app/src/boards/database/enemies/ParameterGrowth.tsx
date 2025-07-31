import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid2, InputAdornment,
  Stack,
  TextField, Typography
} from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Close, ShowChart, Sync } from "@mui/icons-material";
import { knownLongParams, KnownParameter } from '../../../services/ParameterIdMapper.ts';
import { GrowthParser } from "../services/GrowthParser.ts";
import FormulaVisualizer from "../components/FormulaVisualizer.tsx";

type ParameterGrowthProps = {
  growableNote: string;
  growableName: string;
  updateNote: (updatedNote: string) => void;
};

// Define parameter categories
const parameterCategories = {
  "Core Stats": [ 0, 1, 30, 2, 3, 4, 5, 6, 7 ], // mhp, mmp, mtp, atk, def, mat, mdf, agi, luk
  "Hit/Evasion": [ 8, 9, 12, 13, 14 ], // hit, eva, mev, mrf, cnt
  "Recovery": [ 15, 16, 17, 20, 21 ], // hrg, mrg, trg, rec, pha
  "Damage/Defense": [ 18, 19, 22, 23, 24, 25, 26, 27 ], // tgr, grd, mcr, tcr, pdr, mdr, fdr, exr
  "Critical": [ 10, 11, 28, 29, ] //  cri, cev, cdm, cdr
};

function ParameterGrowth({
  growableNote,
  growableName,
  updateNote
}: ParameterGrowthProps)
{

  //region state
  const [ localNote, setLocalNote ] = useState<string>(growableNote);
  const [ dialogOpen, setDialogOpen ] = useState(false);
  //endregion state

  //region update
  const updateLocalNote = useCallback(
    (value: string, paramData: KnownParameter) =>
    {
      const updatedNote = GrowthParser.write(localNote, paramData, value);
      setLocalNote(updatedNote);
    },
    [ localNote ]
  );
  //endregion update

  //region setup
  // Sync with parent when prop changes
  useEffect(() =>
  {
    setLocalNote(growableNote);
  }, [ growableNote ]);
  //endregion setup

  //region render
  const renderGrowth = (paramData: KnownParameter) =>
  {
    const data = GrowthParser.read(localNote, paramData);
    return <>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <TextField
          label={paramData.name}
          variant={"outlined"}
          fullWidth={true}
          size={"small"}
          value={data}
          onChange={(event) => updateLocalNote(event.target.value, paramData)}
          sx={{
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            '& .MuiInputBase-input': {
              fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace"
            }
          }}
          slotProps={{
            input: {
              // Only show the adornment when there's content in the field
              endAdornment: data
                ? (
                  <InputAdornment position={"end"}>
                    <Check color={"success"}/>
                  </InputAdornment>
                )
                : undefined
            }
          }}
        />
        {data && (
          <FormulaVisualizer
            formula={data}
            paramName={paramData.name}
            onUpdateFormula={(updatedFormula) => updateLocalNote(updatedFormula, paramData)}
          />
        )}
      </div>
    </>;
  };

  const renderParametersByCategory = useMemo(() =>
  {
    const allParams = knownLongParams();

    return Object.entries(parameterCategories)
      .map(([ category, paramIds ]) =>
      {
        const categoryParams = paramIds
          .map(id => allParams.find(param => param.longParamId === id))
          .filter(Boolean);

        return (
          <Grid2 size={3} key={category}>
            <Typography variant="subtitle2" sx={{
              fontWeight: 'bold',
              mb: 1
            }}>
              {category}
            </Typography>
            <Stack spacing={2} direction="column">
              {categoryParams.map(param =>
                <div key={param!.key}>
                  {renderGrowth(param!)}
                </div>
              )}
            </Stack>
          </Grid2>
        );
      });
  }, [ localNote ]);
  //endregion render

  return <>
    <Button
      variant={"contained"}
      color={"success"}
      onClick={() =>
      {
        setLocalNote(growableNote);
        setDialogOpen(true);
      }}
    >
      Manage Growths
    </Button>

    {/*region not-grid-related elements */}
    <Dialog
      open={dialogOpen}
      fullWidth={true}
      maxWidth={"md"}
      onClose={() => setDialogOpen(false)}
      sx={{
        '& .MuiDialog-paper': {
          maxHeight: 950,
          minHeight: 900,
          position: 'absolute',
          right: 32, // Position from right edge
          top: 32,   // Position from top edge
          margin: 0  // Remove default margin
        }
      }}
    >
      <DialogTitle>
        Parameter Growth for {growableName}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} direction={"column"}>
          {renderParametersByCategory}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button
          variant={"contained"}
          color={"warning"}
          startIcon={<Close/>}
          onClick={() =>
          {
            setLocalNote(growableNote);
            setDialogOpen(false);
          }}
        >
          Nevermind
        </Button>
        <Button
          color={"primary"}
          variant={"contained"}
          startIcon={<Sync/>}
          onClick={() =>
          {
            updateNote(localNote);
            setDialogOpen(false);
          }}
        >
          Update Growth
        </Button>
      </DialogActions>

    </Dialog>
    {/*endregion not-grid-related elements */}
  </>
}

export default memo(ParameterGrowth);