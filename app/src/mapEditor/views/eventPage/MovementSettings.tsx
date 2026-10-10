import React from 'react';
import { MOVE_FREQUENCIES, MOVE_SPEEDS } from '../../core/commands/editors/moveRoute.ts';
import {
  MOVE_TYPE_OPTIONS,
  usesCustomRoute,
  withMoveFrequency,
  withMoveRoute,
  withMoveSpeed,
  withMoveType,
  type EventMovementFields,
} from '../../core/eventPage/eventMovement.ts';
import type { RouteSetting } from '../../core/moveRoutes/routeStart.ts';
import { EditorStack, FieldRow, SelectField } from '../commandEditors/editorFields.tsx';
import { MoveRouteEditor } from '../commandEditors/MoveRouteEditor.tsx';

/**
 * What the movement settings take: an event page's own movement fields, exactly as RMMZ stores them.
 */
type MovementSettingsProps = {
  /**
   * The page's {@code moveType}, {@code moveSpeed}, {@code moveFrequency} and {@code moveRoute}.
   */
  readonly value: EventMovementFields;

  /**
   * Hands back the fields after every change.
   */
  readonly onChange: (value: EventMovementFields) => void;

  /**
   * Where the page's own route runs, for the map showing where it goes; left out, or null, where there is no map.
   */
  readonly setting?: RouteSetting | null;
};

/**
 * Edits an event page's own movement: how it moves (Fixed, Random, Approach or Custom), its speed and frequency in
 * RMMZ's own words, and, only while Custom is chosen, the route itself through the same editor Set Movement Route
 * uses. The route is never cleared by switching away from Custom, so a page can be flipped back and forth without
 * losing the route it was built with.
 * @param {MovementSettingsProps} props The page's movement fields and what to do with a change.
 * @returns {React.JSX.Element} The section.
 */
const MovementSettings = (props: MovementSettingsProps) =>
{
  const { value, onChange, setting = null } = props;
  return (
    <EditorStack>
      <FieldRow>
        <SelectField label={'Type'} value={value.moveType} options={MOVE_TYPE_OPTIONS} width={150}
          onChange={moveType => onChange(withMoveType(value, moveType))}/>
        <SelectField label={'Speed'} value={value.moveSpeed} options={MOVE_SPEEDS} width={170}
          onChange={moveSpeed => onChange(withMoveSpeed(value, moveSpeed))}/>
        <SelectField label={'Frequency'} value={value.moveFrequency} options={MOVE_FREQUENCIES} width={170}
          onChange={moveFrequency => onChange(withMoveFrequency(value, moveFrequency))}/>
      </FieldRow>
      {usesCustomRoute(value.moveType)
        ? <MoveRouteEditor mode={'page'} route={value.moveRoute} setting={setting} onChange={moveRoute => onChange(withMoveRoute(value, moveRoute))}/>
        : null}
    </EditorStack>
  );
};

export { MovementSettings };
export type { MovementSettingsProps };
