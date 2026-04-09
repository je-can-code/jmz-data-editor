import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, } from '@mui/material';
import { Close, ContentCopy, Sync, } from '@mui/icons-material';
import { memo, useState, } from 'react';
import { NaturalGrowthQuadrant } from '@core/domain/valueObjects/NaturalQuadFormulas.ts';
import { NaturalGrowthQuadrantsEditor } from '@presentation/components/naturalGrowth/NaturalGrowthQuadrantsEditor.tsx';
import { knownLongParams } from '../../../mappers/ParameterIdMapper.ts';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';

type ParameterGrowthProps = {
  selectedEnemy: RPG_EnemyDomainModel;
  growableName: string;
  updateEnemy: (enemy: RPG_EnemyDomainModel) => void;
  otherSubjects?: RPG_EnemyDomainModel[];
  suggestedLevel?: number;
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
  const [ selectedSource, setSelectedSource ] = useState<RPG_EnemyDomainModel | null>(null);
  const [ workingNote, setWorkingNote ] = useState('');

  const handleOpenDialog = () =>
  {
    setWorkingNote(selectedEnemy.note);
    setDialogOpen(true);
  };

  const commitGrowths = () =>
  {
    selectedEnemy.note = workingNote;
    selectedEnemy.rehydrateGrowthsFromNote();
    updateEnemy(selectedEnemy);
    setDialogOpen(false);
  };

  const copyGrowthsFromSubject = (sourceEnemy: RPG_EnemyDomainModel) =>
  {
    let n = workingNote;
    for (const p of knownLongParams())
    {
      n = GrowthParser.write(n, p, GrowthParser.read(sourceEnemy.note, p));
    }
    setWorkingNote(n);
    setCopyDialogOpen(false);
  };

  return (
    <>
      <Button variant="contained" color="success" onClick={handleOpenDialog}>
        Manage Growths
      </Button>

      <Dialog
        open={dialogOpen}
        fullWidth
        maxWidth="md"
        onClose={() => setDialogOpen(false)}
        sx={{
          '& .MuiDialog-paper': {
            maxHeight: 950,
            minHeight: 720,
            position: 'absolute',
            right: 32,
            top: 32,
            margin: 0,
          },
        }}
      >
        <DialogTitle>Parameter Growth for {growableName}</DialogTitle>
        <DialogContent dividers>
          <NaturalGrowthQuadrantsEditor
            note={workingNote}
            onNoteChange={setWorkingNote}
            visibleQuadrants={[ NaturalGrowthQuadrant.BuffPlus ]}
            constrainFormColumnWidth={false}
            suggestedLevel={suggestedLevel}
          />
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

      <Dialog open={copyDialogOpen} onClose={() => setCopyDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Copy Parameter Growths</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 2 }}
            options={otherSubjects.filter((s) => s && s.id !== 0 && s.name && !s.name.startsWith('==='))}
            getOptionLabel={(option) => option.name}
            renderInput={(params) => <TextField {...params} label="Search Source"/>}
            value={selectedSource}
            onChange={(
              _e,
              newValue
            ) => setSelectedSource(newValue)}
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
