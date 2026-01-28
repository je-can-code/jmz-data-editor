import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Check,
  Close,
  ContentCopy,
  Sync
} from "@mui/icons-material";
import {
  knownLongParams,
  KnownParameter
} from '../../../mappers/ParameterIdMapper.ts';
import { GrowthParser } from "@services/parsers/GrowthParser.ts";
import FormulaVisualizer from "../../components/FormulaVisualizer.tsx";
import RPG_Base = Rmmz.Base.RPG_Base;
import { EnemyDomainModel } from "@core/domain/entities/EnemyDomainEntity.ts";

type ParameterGrowthProps = {
  selectedEnemy: EnemyDomainModel;
  growableName: string;
  updateEnemy: (enemy: EnemyDomainModel) => void;
  otherSubjects?: EnemyDomainModel[];
  suggestedLevel?: number;
};

const parameterCategories = {
  "Rewards": [ 31, 32, 33 ],
  "Core Stats": [ 0, 1, 30, 2, 3, 4, 5, 6, 7 ],
  "Hit/Evasion": [ 8, 9, 12, 13, 14 ],
  "Recovery": [ 15, 16, 17, 20, 21 ],
  "Damage/Defense": [ 18, 19, 22, 23, 24, 25, 26, 27 ],
  "Critical": [ 10, 11, 28, 29, ]
};

function ParameterGrowth({
  selectedEnemy,
  growableName,
  updateEnemy,
  otherSubjects = [],
  suggestedLevel,
}: ParameterGrowthProps)
{
  const [ dialogOpen, setDialogOpen ] = useState(false);
  const [ copyDialogOpen, setCopyDialogOpen ] = useState(false);
  const [ selectedSource, setSelectedSource ] = useState<EnemyDomainModel | null>(null);
  const [ workingGrowths, setWorkingGrowths ] = useState<Map<number, string>>(new Map());

  const handleOpenDialog = () => {
    setWorkingGrowths(new Map(selectedEnemy.growths));
    setDialogOpen(true);
  };

  const updateWorkingGrowth = (formula: string, paramData: KnownParameter) =>
  {
    const newGrowths = new Map(workingGrowths);
    newGrowths.set(paramData.longParamId, formula);
    setWorkingGrowths(newGrowths);
  };

  const commitGrowths = () => {
    selectedEnemy.growths = workingGrowths;
    updateEnemy(selectedEnemy);
    setDialogOpen(false);
  };

  const copyGrowthsFromSubject = (sourceEnemy: EnemyDomainModel) =>
  {
    // Directly copy the growths map from the source model
    setWorkingGrowths(new Map(sourceEnemy.growths));
    setCopyDialogOpen(false);
  };

  const renderGrowth = (paramData: KnownParameter) =>
  {
    const formula = workingGrowths.get(paramData.longParamId) ?? '';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <TextField
          label={paramData.name}
          variant="outlined"
          fullWidth
          size="small"
          value={formula}
          onChange={(event) => updateWorkingGrowth(event.target.value, paramData)}
          sx={{
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            '& .MuiInputBase-input': {
              fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace"
            }
          }}
          slotProps={{
            input: {
              endAdornment: formula ? (
                <InputAdornment position="end">
                  <Check color="success"/>
                </InputAdornment>
              ) : undefined
            }
          }}
        />
        {formula && (
          <FormulaVisualizer
            formula={formula}
            paramName={paramData.name}
            onUpdateFormula={(updatedFormula) => updateWorkingGrowth(updatedFormula, paramData)}
            suggestedLevel={suggestedLevel}
          />
        )}
      </div>
    );
  };

  const renderParametersByCategory = useMemo(() => {
    const allParams = knownLongParams();

    // Return a single array of category blocks
    return Object.entries(parameterCategories).map(([category, paramIds]) => {
      const categoryParams = paramIds
        .map(id => allParams.find(param => param.longParamId === id))
        .filter(Boolean);

      return (
        <Box key={category} sx={{ mb: 4 }}>
          {/* Category Header */}
          <Typography
            variant="h6"
            color="primary"
            sx={{
              fontWeight: 'bold',
              mb: 2,
              borderBottom: '1px solid',
              borderColor: 'divider'
            }}
          >
            {category}
          </Typography>

          {/* Single Column Stack for Parameters */}
          <Stack spacing={2} direction="column">
            {categoryParams.map(param => (
              <div key={param!.key}>
                {renderGrowth(param!)}
              </div>
            ))}
          </Stack>
        </Box>
      );
    });
  }, [workingGrowths]);

  return (
    <>
      <Button variant="contained" color="success" onClick={handleOpenDialog}>
        Manage Growths
      </Button>

      <Dialog
        open={dialogOpen}
        fullWidth
        maxWidth="sm"
        onClose={() => setDialogOpen(false)}
        sx={{
          '& .MuiDialog-paper': {
            maxHeight: 950,
            minHeight: 900,
            position: 'absolute',
            right: 32,
            top: 32,
            margin: 0
          }
        }}
      >
        <DialogTitle>Parameter Growth for {growableName}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1} direction="column">
            {renderParametersByCategory}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button color="inherit" startIcon={<Close/>} onClick={() => setDialogOpen(false)}>
            Nevermind
          </Button>
          <div>
            <Button
              color="info"
              variant="contained"
              startIcon={<ContentCopy/>}
              onClick={() => setCopyDialogOpen(true)}
              sx={{ mr: 1 }}
            >
              Copy From...
            </Button>
            <Button color="success" variant="contained" startIcon={<Sync/>} onClick={commitGrowths}>
              Update Growth
            </Button>
          </div>
        </DialogActions>
      </Dialog>

      {/* Copy Dialog remains largely the same, calling copyGrowthsFromSubject */}
      <Dialog open={copyDialogOpen} onClose={() => setCopyDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Copy Parameter Growths</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 2 }}
            options={otherSubjects.filter(s => s && s.id !== 0 && s.name && !s.name.startsWith('==='))}
            getOptionLabel={(option) => option.name}
            renderInput={(params) => <TextField {...params} label="Search Source" />}
            value={selectedSource}
            onChange={(_, newValue) => setSelectedSource(newValue)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
          <Button
            disabled={!selectedSource}
            onClick={() => selectedSource && copyGrowthsFromSubject(selectedSource)}
          >
            Copy
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default memo(ParameterGrowth);
