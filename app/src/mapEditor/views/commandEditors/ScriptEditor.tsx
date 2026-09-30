import React, { useMemo } from 'react';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import { parseScript, scriptToText, textToScript, writeScript } from '../../core/commands/editors/script.ts';
import { CodeBox } from './CodeBox.tsx';
import { EditorStack, UneditableCommand } from './editorFields.tsx';

/**
 * Edits a Script command as one block of code, however many lines it runs to.
 * @param {CommandEditorProps} props The command, its lines and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const ScriptEditor = (props: CommandEditorProps) =>
{
  const { command, continuation, onChange } = props;
  const model = useMemo(() => parseScript(command, continuation), [ command, continuation ]);
  if (model === null)
  {
    return <UneditableCommand command={command}/>;
  }

  return (
    <EditorStack>
      <CodeBox
        label={'Script'}
        value={scriptToText(model.lines)}
        onChange={text =>
        {
          const written = writeScript(command, continuation, { lines: textToScript(text) });
          onChange(written.command, written.continuation);
        }}
      />
    </EditorStack>
  );
};

export { ScriptEditor };
