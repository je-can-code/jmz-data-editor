import React from 'react';
import type { CommandEditor, CommandEditorProps, CommandEditorRegistry } from '../../core/commands/CommandEditorRegistry.ts';
import { CONDITIONAL_BRANCH_CODE } from '../../core/commands/editors/conditionalBranch.ts';
import { CONTROL_VARIABLES_CODE } from '../../core/commands/editors/controlVariables.ts';
import { SET_MOVEMENT_ROUTE_CODE } from '../../core/commands/editors/moveRoute.ts';
import { SCRIPT_CODE } from '../../core/commands/editors/script.ts';
import { SHOW_CHOICES_CODE } from '../../core/commands/editors/showChoices.ts';
import { SHOW_TEXT_CODE } from '../../core/commands/editors/showText.ts';
import { TRANSFER_PLAYER_CODE } from '../../core/commands/editors/transferPlayer.ts';
import { PLUGIN_COMMAND_CODE } from '../../core/commands/pluginCommands.ts';
import { ConditionalBranchEditor } from './ConditionalBranchEditor.tsx';
import { ControlVariablesEditor } from './ControlVariablesEditor.tsx';
import { EditorEnvironmentProvider, type HandBuiltEditorEnvironment } from './editorEnvironment.tsx';
import { PluginCommandEditor } from './PluginCommandEditor.tsx';
import { ScriptEditor } from './ScriptEditor.tsx';
import { SetMovementRouteEditor } from './SetMovementRouteEditor.tsx';
import { ShowChoicesEditor } from './ShowChoicesEditor.tsx';
import { ShowTextEditor } from './ShowTextEditor.tsx';
import { TransferPlayerEditor } from './TransferPlayerEditor.tsx';

/**
 * The hand-built editors, by the command code each edits. The plugin command editor serves every plugin
 * command, since they all share one code.
 */
const HAND_BUILT_EDITORS: readonly (readonly [ number, CommandEditor ])[] = [
  [ SHOW_TEXT_CODE, ShowTextEditor ],
  [ SHOW_CHOICES_CODE, ShowChoicesEditor ],
  [ CONDITIONAL_BRANCH_CODE, ConditionalBranchEditor ],
  [ CONTROL_VARIABLES_CODE, ControlVariablesEditor ],
  [ SET_MOVEMENT_ROUTE_CODE, SetMovementRouteEditor ],
  [ TRANSFER_PLAYER_CODE, TransferPlayerEditor ],
  [ PLUGIN_COMMAND_CODE, PluginCommandEditor ],
  [ SCRIPT_CODE, ScriptEditor ],
];

/**
 * Binds an editor to its environment, so the component the registry hands out needs nothing but the
 * editor's own props.
 * @param {CommandEditor} Editor The editor.
 * @param {HandBuiltEditorEnvironment} environment What it runs on.
 * @param {number} code The code it edits, for its name in React's tools.
 * @returns {CommandEditor} The bound editor.
 */
const bind = (Editor: CommandEditor, environment: HandBuiltEditorEnvironment, code: number): CommandEditor =>
{
  const Bound = (props: CommandEditorProps) => (
    <EditorEnvironmentProvider environment={environment}>
      <Editor {...props}/>
    </EditorEnvironmentProvider>
  );
  Bound.displayName = `HandBuiltEditor${code}`;
  return Bound;
};

/**
 * Registers the eight hand-built command editors (Show Text, Show Choices, Conditional Branch, Control
 * Variables, Set Movement Route, Transfer Player, Plugin Command, Script) by command code, so they serve
 * whatever catalog entries those codes have. Every other command keeps its generated form.
 *
 * Show Choices and Conditional Branch change their block's structure, so the list hands them the whole block
 * through the {@code block} prop, as {@code blockSpanAt} finds it; without it, Show Choices only lists its
 * choices and Conditional Branch cannot add or remove its Else. Call this once per registry: a second call
 * finds the codes taken and throws.
 * @param {CommandEditorRegistry} registry The window's editor registry.
 * @param {HandBuiltEditorEnvironment} environment The server, the plugin headers, and optionally database names and a
 * landing-spot picker.
 */
const registerHandBuiltEditors = (registry: CommandEditorRegistry, environment: HandBuiltEditorEnvironment): void =>
{
  HAND_BUILT_EDITORS.forEach(([ code, Editor ]) => registry.registerForCode(code, bind(Editor, environment, code)));
};

export { HAND_BUILT_EDITORS, registerHandBuiltEditors };
