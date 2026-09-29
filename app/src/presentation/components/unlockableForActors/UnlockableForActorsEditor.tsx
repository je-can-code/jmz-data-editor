import { useMemo } from 'react';
import { Autocomplete, TextField, Typography } from '@mui/material';
import { UnlockableForActorsParser } from '@services/parsers/UnlockableForActorsParser.ts';
import { useActors } from '@presentation/context/resources/actors.context.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';

/**
 * One actor as the picker offers it.
 */
type ActorOption = {
  id: number;
  name: string;
};

type UnlockableForActorsEditorProps = {
  note: string;
  onNoteChange: (note: string) => void;
};

/**
 * Editor for the actors a class is set aside for (J-Classes), wired to the class's `note` the same way
 * {@link UnslottedSkillsEditor} is.
 *
 * A class naming some actors unlocks only for them, and waits in their class lists as "???" until they do-
 * which is how a class becomes one particular character's path. A class naming nobody can be unlocked for
 * anyone, but hints at itself to no one: it shows only while an actor wears it, or once an event unlocks it.
 * That is what a starting class wants, since it disappears once its actor moves on.
 */
function UnlockableForActorsEditor({ note, onNoteChange }: UnlockableForActorsEditorProps)
{
  const { data: actors, loading: actorsLoading } = useActors();

  // the actors the note sets this class aside for.
  const actorIds = useMemo(() => UnlockableForActorsParser.read(note), [ note ]);

  // every actor the picker can offer, in database order.
  const actorOptions = useMemo(
    (): ActorOption[] => actors
      .map((actor) => ({ id: actor.id, name: actor.name }))
      .sort((a, b) => a.id - b.id),
    [ actors ],
  );

  // the chosen actors as options. One the database no longer has keeps its id, so saving never drops it.
  const selectedOptions = actorIds.map((actorId): ActorOption =>
  {
    const known = actorOptions.find((option) => option.id === actorId);

    return known ?? { id: actorId, name: `Actor ${actorId}` };
  });

  /**
   * Writes the chosen actors back onto the note.
   * @param {ActorOption[]} chosen The actors now chosen, in the order they were picked.
   */
  const handleChange = (chosen: ActorOption[]) =>
  {
    const chosenIds = chosen.map((option) => option.id);
    onNoteChange(UnlockableForActorsParser.write(note, chosenIds));
  };

  if (actorsLoading)
  {
    return <Typography>Loading actors...</Typography>;
  }

  return (
    <BoardSectionCard title={'Unlockable By'}>
      <Typography variant={'caption'} color={'text.secondary'} sx={{
        display: 'block',
        mb: 1.5,
      }}>
        Only these characters can get this class, and it waits in their class list as "???" until they do.
        Left empty, it gives no hint to anyone and only shows up while a character is in it, or once an event
        unlocks it.
      </Typography>
      <Autocomplete<ActorOption, true>
        multiple
        size={'small'}
        options={actorOptions}
        value={selectedOptions}
        onChange={(_, chosen) => handleChange(chosen)}
        getOptionKey={(option) => option.id}
        getOptionLabel={(option) => `${option.id}: ${option.name}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        slotProps={{ chip: { size: 'small' } }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={'Characters'}
          />
        )}
      />
    </BoardSectionCard>
  );
}

export type { UnlockableForActorsEditorProps };
export { UnlockableForActorsEditor };
