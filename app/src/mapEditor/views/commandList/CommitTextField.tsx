import React, { useEffect, useState } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';

/**
 * What a committing text field takes: a text field's own props, the value it shows, and where a finished value goes.
 */
type CommitTextFieldProps = Omit<TextFieldProps, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'> & {
  /**
   * The value the command holds now.
   */
  readonly value: string;

  /**
   * Takes a finished value: on leaving the field, on Enter in a single line, on Ctrl+Enter in several. Words handed back
   * refuse it, saying why: the field then keeps what was typed, shows the words beneath it, and waits for another try.
   */
  readonly onCommit: (value: string) => string | null | void;
};

/**
 * A text field that edits freely and hands its value over only once the author is done with it, so a burst of
 * typing lands in history as one step rather than one per key. A value refused keeps what was typed in the field, with
 * why beneath it, so nothing typed is lost to a refusal; Escape puts back what the command holds.
 * @param {CommitTextFieldProps} props The field's props.
 * @returns {React.JSX.Element} The field.
 */
const CommitTextField = (props: CommitTextFieldProps) =>
{
  const { value, onCommit, multiline, error, helperText, ...rest } = props;
  const [ draft, setDraft ] = useState(value);
  const [ editing, setEditing ] = useState(false);
  const [ refusal, setRefusal ] = useState<string | null>(null);

  // while nobody is typing, and nothing typed waits refused, the field follows the command, undo and other windows
  // included.
  useEffect(() =>
  {
    if (editing === false)
    {
      setDraft(value);
    }
  }, [ value, editing ]);

  /**
   * Hands the typed value over, when it differs from the command's, keeping it in the field with why when it is refused.
   */
  const commit = () =>
  {
    // a value typed back to what the command holds hands nothing over, and leaves nothing refused.
    if (draft === value)
    {
      setEditing(false);
      setRefusal(null);
      return;
    }

    // words handed back refuse the value, which stays in the field, the field still being typed in.
    const answer = onCommit(draft);
    const refused = typeof answer === 'string' ? answer : null;
    setRefusal(refused);
    setEditing(refused !== null);
  };

  /**
   * Finishes on Enter (Ctrl+Enter in several lines), and puts the command's value back on Escape, along with anything
   * typed that was refused.
   * @param {React.KeyboardEvent} event The key.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    if (event.key === 'Enter' && (multiline !== true || event.ctrlKey || event.metaKey))
    {
      event.preventDefault();
      commit();
      return;
    }

    if (event.key === 'Escape')
    {
      event.stopPropagation();
      setDraft(value);
      setEditing(false);
      setRefusal(null);
    }
  };

  return (
    <TextField
      {...rest}
      error={refusal !== null || error === true}
      helperText={refusal ?? helperText}
      multiline={multiline}
      value={draft}
      onChange={event =>
      {
        setEditing(true);
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
};

export { CommitTextField };
export type { CommitTextFieldProps };
