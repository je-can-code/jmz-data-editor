import React from 'react';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowForward from '@mui/icons-material/ArrowForward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import Casino from '@mui/icons-material/Casino';
import HourglassEmpty from '@mui/icons-material/HourglassEmpty';
import NorthEast from '@mui/icons-material/NorthEast';
import NorthWest from '@mui/icons-material/NorthWest';
import RotateLeft from '@mui/icons-material/RotateLeft';
import RotateRight from '@mui/icons-material/RotateRight';
import SouthEast from '@mui/icons-material/SouthEast';
import SouthWest from '@mui/icons-material/SouthWest';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import UTurnLeft from '@mui/icons-material/UTurnLeft';
import { moveStepKind, type MoveStepKind } from '../../core/commands/editors/moveRoute.ts';

/**
 * One key of a pad: the step it adds, what it shows, and the number pad key that types it, when one does.
 */
type PadKey = {
  readonly code: number;
  readonly face: React.ReactNode;
  readonly numpad?: string;
};

/**
 * The move pad, laid out as the number pad is: each arrow walks the way it sits from the middle, which waits.
 */
const MOVE_PAD: readonly PadKey[] = [
  { code: 7, face: <NorthWest fontSize={'small'}/>, numpad: '7' },
  { code: 4, face: <ArrowUpward fontSize={'small'}/>, numpad: '8' },
  { code: 8, face: <NorthEast fontSize={'small'}/>, numpad: '9' },
  { code: 2, face: <ArrowBack fontSize={'small'}/>, numpad: '4' },
  { code: 15, face: <HourglassEmpty fontSize={'small'}/>, numpad: '5' },
  { code: 3, face: <ArrowForward fontSize={'small'}/>, numpad: '6' },
  { code: 5, face: <SouthWest fontSize={'small'}/>, numpad: '1' },
  { code: 1, face: <ArrowDownward fontSize={'small'}/>, numpad: '2' },
  { code: 6, face: <SouthEast fontSize={'small'}/>, numpad: '3' },
];

/**
 * The moves beside the pad, which go no fixed way: at random, toward or away from the player, along the facing, and the
 * leap.
 */
const MOVE_EXTRAS: readonly PadKey[] = [
  { code: 9, face: 'Random' },
  { code: 10, face: 'Toward player' },
  { code: 11, face: 'Away from player' },
  { code: 12, face: 'Forward' },
  { code: 13, face: 'Back' },
  { code: 14, face: 'Jump' },
];

/**
 * The turn pad: the four arrows face their way, with the quarter turns above them, the half turn in the middle, and
 * the turns that are left to chance below.
 */
const TURN_PAD: readonly PadKey[] = [
  { code: 21, face: <RotateLeft fontSize={'small'}/> },
  { code: 19, face: <ArrowUpward fontSize={'small'}/>, numpad: 'Shift+8' },
  { code: 20, face: <RotateRight fontSize={'small'}/> },
  { code: 17, face: <ArrowBack fontSize={'small'}/>, numpad: 'Shift+4' },
  { code: 22, face: <UTurnLeft fontSize={'small'}/> },
  { code: 18, face: <ArrowForward fontSize={'small'}/>, numpad: 'Shift+6' },
  { code: 23, face: <SwapHoriz fontSize={'small'}/> },
  { code: 16, face: <ArrowDownward fontSize={'small'}/>, numpad: 'Shift+2' },
  { code: 24, face: <Casino fontSize={'small'}/> },
];

/**
 * The turns beside the pad, which face the player or away.
 */
const TURN_EXTRAS: readonly PadKey[] = [
  { code: 25, face: 'Toward player' },
  { code: 26, face: 'Away from player' },
];

/**
 * The settings that go on and off, each with the step turning it on and the one turning it off.
 */
const TOGGLES: readonly { readonly label: string; readonly on: number; readonly off: number }[] = [
  { label: 'Walking animation', on: 31, off: 32 },
  { label: 'Stepping animation', on: 33, off: 34 },
  { label: 'Direction fix', on: 35, off: 36 },
  { label: 'Through', on: 37, off: 38 },
  { label: 'Transparent', on: 39, off: 40 },
  { label: 'Switch', on: 27, off: 28 },
];

/**
 * The settings that take a value, whose inputs show once the step is added.
 */
const SETTING_EXTRAS: readonly PadKey[] = [
  { code: 29, face: 'Speed' },
  { code: 30, face: 'Frequency' },
  { code: 42, face: 'Opacity' },
  { code: 43, face: 'Blend' },
  { code: 41, face: 'Image' },
  { code: 44, face: 'Sound' },
  { code: 45, face: 'Script' },
];

/**
 * Names a step the way MZ does, which every key reads out as its name.
 * @param {number} code The step's code.
 * @returns {string} The step's name.
 */
const stepName = (code: number): string =>
{
  // every key names a step MZ writes, and every such step has a kind.
  return (moveStepKind(code) as MoveStepKind).name;
};

/**
 * One key: a small outlined button named for its step, with a tooltip saying the step and the number pad key typing it.
 * @param {{ padKey: PadKey, onAdd: (code: number) => void, square?: boolean }} props The key, what to do when pressed,
 * and whether it is a square pad key rather than a word.
 * @returns {React.JSX.Element} The key.
 */
const Key = (props: { readonly padKey: PadKey; readonly onAdd: (code: number) => void; readonly square?: boolean }) =>
{
  const { padKey, onAdd, square = false } = props;
  const name = stepName(padKey.code);
  const tip = padKey.numpad === undefined ? name : `${name} (numpad ${padKey.numpad})`;
  return (
    <Tooltip title={tip} disableInteractive>
      <Button
        aria-label={name}
        size={'small'}
        variant={'outlined'}
        onClick={() => onAdd(padKey.code)}
        sx={square ? { minWidth: 0, width: 38, height: 34, p: 0 } : { textTransform: 'none', py: 0.25 }}
      >
        {padKey.face}
      </Button>
    </Tooltip>
  );
};

/**
 * A pad of nine square keys in three rows, then its other keys beneath.
 * @param {{ title: string, pad: readonly PadKey[], extras: readonly PadKey[], onAdd: (code: number) => void }} props The
 * pad's heading, its nine keys, its other keys, and what to do when one is pressed.
 * @returns {React.JSX.Element} The pad.
 */
const Pad = (props: { readonly title: string; readonly pad: readonly PadKey[]; readonly extras: readonly PadKey[]; readonly onAdd: (code: number) => void }) =>
{
  const { title, pad, extras, onAdd } = props;
  return (
    <Box>
      <Typography variant={'overline'} color={'text.secondary'}>{title}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 38px)', gap: 0.5 }}>
        {pad.map(padKey => <Key key={padKey.code} padKey={padKey} onAdd={onAdd} square/>)}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75, maxWidth: 260 }}>
        {extras.map(padKey => <Key key={padKey.code} padKey={padKey} onAdd={onAdd}/>)}
      </Box>
    </Box>
  );
};

/**
 * Every step a route can take, laid out to be found at a glance instead of read through: moves on a compass laid out as
 * the number pad is, turns on a compass of their own, and settings as ON and OFF pairs beside the ones that take a
 * value. Every key is named for its step as MZ names it.
 * @param {{ onAdd: (code: number) => void }} props What to do with the step a key adds.
 * @returns {React.JSX.Element} The pads.
 */
const RoutePads = (props: { readonly onAdd: (code: number) => void }) =>
{
  const { onAdd } = props;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-start' }}>
      <Pad title={'Move'} pad={MOVE_PAD} extras={MOVE_EXTRAS} onAdd={onAdd}/>
      <Pad title={'Turn'} pad={TURN_PAD} extras={TURN_EXTRAS} onAdd={onAdd}/>
      <Box>
        <Typography variant={'overline'} color={'text.secondary'}>Settings</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: 0.5, alignItems: 'center' }}>
          {TOGGLES.map(toggle => (
            <React.Fragment key={toggle.label}>
              <Typography variant={'body2'} sx={{ pr: 1 }}>{toggle.label}</Typography>
              <Key padKey={{ code: toggle.on, face: 'ON' }} onAdd={onAdd}/>
              <Key padKey={{ code: toggle.off, face: 'OFF' }} onAdd={onAdd}/>
            </React.Fragment>
          ))}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75, maxWidth: 320 }}>
          {SETTING_EXTRAS.map(padKey => <Key key={padKey.code} padKey={padKey} onAdd={onAdd}/>)}
        </Box>
      </Box>
    </Box>
  );
};

export { RoutePads };
