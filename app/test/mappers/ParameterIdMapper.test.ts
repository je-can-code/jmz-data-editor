import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fromBParamIdToName,
  fromLongParameterIdToName,
  fromSParamIdToName,
  fromXParamIdToName,
  knownBaseParams,
  knownExParams,
  knownLongParams,
  knownParamByLongId,
  knownRewardParams,
  knownSpParams,
} from '@mappers/ParameterIdMapper.ts';

describe('ParameterIdMapper basic b/x/s param name lookups', () =>
{
  it('fromBParamIdToName maps 0-7 correctly', () =>
  {
    expect(fromBParamIdToName(0))
      .toBe('Max Life');
    expect(fromBParamIdToName(1))
      .toBe('Max Magi');
    expect(fromBParamIdToName(2))
      .toBe('Power');
    expect(fromBParamIdToName(3))
      .toBe('Endurance');
    expect(fromBParamIdToName(4))
      .toBe('Force');
    expect(fromBParamIdToName(5))
      .toBe('Resist');
    expect(fromBParamIdToName(6))
      .toBe('Speed');
    expect(fromBParamIdToName(7))
      .toBe('Luck');
  });

  it('fromBParamIdToName throws on unsupported ids', () =>
  {
    expect(() => fromBParamIdToName(-1))
      .toThrowError('Unsupported ParamId: -1');
    expect(() => fromBParamIdToName(8))
      .toThrowError('Unsupported ParamId: 8');
  });

  it('fromXParamIdToName maps 0-9 correctly and throws otherwise', () =>
  {
    expect(fromXParamIdToName(0))
      .toBe('Accuracy');
    expect(fromXParamIdToName(1))
      .toBe('Phys Evade');
    expect(fromXParamIdToName(2))
      .toBe('Crit Rate');
    expect(fromXParamIdToName(3))
      .toBe('Crit Dodge');
    expect(fromXParamIdToName(4))
      .toBe('Magic Evade');
    expect(fromXParamIdToName(5))
      .toBe('Magic Reflect');
    expect(fromXParamIdToName(6))
      .toBe('Autocounter');
    expect(fromXParamIdToName(7))
      .toBe('HP Regen');
    expect(fromXParamIdToName(8))
      .toBe('MP Rejuv');
    expect(fromXParamIdToName(9))
      .toBe('TP Restore');

    expect(() => fromXParamIdToName(-1))
      .toThrowError('Unsupported xParamId: -1');
    expect(() => fromXParamIdToName(10))
      .toThrowError('Unsupported xParamId: 10');
  });

  it('fromSParamIdToName maps 0-9 correctly and throws otherwise', () =>
  {
    expect(fromSParamIdToName(0))
      .toBe('Aggro');
    expect(fromSParamIdToName(1))
      .toBe('Parry');
    expect(fromSParamIdToName(2))
      .toBe('Recovery Rate');
    expect(fromSParamIdToName(3))
      .toBe('Item Effects');
    expect(fromSParamIdToName(4))
      .toBe('Magi Cost');
    expect(fromSParamIdToName(5))
      .toBe('Tech Cost');
    expect(fromSParamIdToName(6))
      .toBe('Phys Dmg Rate');
    expect(fromSParamIdToName(7))
      .toBe('Magi Dmg Rate');
    expect(fromSParamIdToName(8))
      .toBe('Env Dmg Rate');
    expect(fromSParamIdToName(9))
      .toBe('Experience UP');

    expect(() => fromSParamIdToName(-1))
      .toThrowError('Unsupported sParamId: -1');
    expect(() => fromSParamIdToName(10))
      .toThrowError('Unsupported sParamId: 10');
  });
});

describe('ParameterIdMapper fromLongParameterIdToName', () =>
{
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() =>
  {
    warnSpy = vi.spyOn(console, 'warn')
      .mockImplementation(() =>
      {
      });
  });

  afterEach(() =>
  {
    warnSpy.mockRestore();
  });

  it('maps base params (0-7) via bparam mapping', () =>
  {
    expect(fromLongParameterIdToName(0))
      .toBe('Max Life');
    expect(fromLongParameterIdToName(1))
      .toBe('Max Magi');
    expect(fromLongParameterIdToName(2))
      .toBe('Power');
    expect(fromLongParameterIdToName(3))
      .toBe('Endurance');
    expect(fromLongParameterIdToName(4))
      .toBe('Force');
    expect(fromLongParameterIdToName(5))
      .toBe('Resist');
    expect(fromLongParameterIdToName(6))
      .toBe('Speed');
    expect(fromLongParameterIdToName(7))
      .toBe('Luck');
  });

  it('maps ex params (8-17) via xparam offset', () =>
  {
    expect(fromLongParameterIdToName(8))
      .toBe('Accuracy');
    expect(fromLongParameterIdToName(9))
      .toBe('Phys Evade');
    expect(fromLongParameterIdToName(10))
      .toBe('Crit Rate');
    expect(fromLongParameterIdToName(11))
      .toBe('Crit Dodge');
    expect(fromLongParameterIdToName(12))
      .toBe('Magic Evade');
    expect(fromLongParameterIdToName(13))
      .toBe('Magic Reflect');
    expect(fromLongParameterIdToName(14))
      .toBe('Autocounter');
    expect(fromLongParameterIdToName(15))
      .toBe('HP Regen');
    expect(fromLongParameterIdToName(16))
      .toBe('MP Rejuv');
    expect(fromLongParameterIdToName(17))
      .toBe('TP Restore');
  });

  it('maps s params (18-27) via sparam offset', () =>
  {
    expect(fromLongParameterIdToName(18))
      .toBe('Aggro');
    expect(fromLongParameterIdToName(19))
      .toBe('Parry');
    expect(fromLongParameterIdToName(20))
      .toBe('Recovery Rate');
    expect(fromLongParameterIdToName(21))
      .toBe('Item Effects');
    expect(fromLongParameterIdToName(22))
      .toBe('Magi Cost');
    expect(fromLongParameterIdToName(23))
      .toBe('Tech Cost');
    expect(fromLongParameterIdToName(24))
      .toBe('Phys Dmg Rate');
    expect(fromLongParameterIdToName(25))
      .toBe('Magi Dmg Rate');
    expect(fromLongParameterIdToName(26))
      .toBe('Env Dmg Rate');
    expect(fromLongParameterIdToName(27))
      .toBe('Experience UP');
  });

  it('maps custom long params 28-30', () =>
  {
    expect(fromLongParameterIdToName(28))
      .toBe('Crit Amp');
    expect(fromLongParameterIdToName(29))
      .toBe('Crit Block');
    expect(fromLongParameterIdToName(30))
      .toBe('Max Tech');
  });

  it('returns empty string and warns for unknown ids', () =>
  {
    expect(fromLongParameterIdToName(999))
      .toBe('');
    expect(warnSpy)
      .toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[ 0 ][ 0 ]))
      .toContain('paramId:999 didn\'t map to any of the default parameters.');
  });
});

describe('ParameterIdMapper known param lists', () =>
{
  it('knownBaseParams returns 8 entries with correct mapping', () =>
  {
    const base = knownBaseParams();
    expect(base.length)
      .toBe(8);
    expect(base[ 0 ])
      .toEqual({
        id: 0,
        name: 'Max Life',
        key: 'mhp',
        longParamId: 0
      });
    expect(base[ 7 ])
      .toEqual({
        id: 7,
        name: 'Luck',
        key: 'luk',
        longParamId: 7
      });
  });

  it('knownExParams returns 10 entries with expected keys', () =>
  {
    const ex = knownExParams();
    expect(ex.length)
      .toBe(10);
    expect(ex[ 0 ])
      .toEqual({
        id: 0,
        name: 'Accuracy',
        key: 'hit',
        longParamId: 8
      });
    expect(ex[ 9 ])
      .toEqual({
        id: 9,
        name: 'TP Restore',
        key: 'trg',
        longParamId: 17
      });
  });

  it('knownSpParams returns 10 entries with expected keys', () =>
  {
    const sp = knownSpParams();
    expect(sp.length)
      .toBe(10);
    expect(sp[ 0 ])
      .toEqual({
        id: 0,
        name: 'Aggro',
        key: 'tgr',
        longParamId: 18
      });
    expect(sp[ 9 ])
      .toEqual({
        id: 9,
        name: 'Experience UP',
        key: 'exr',
        longParamId: 27
      });
  });

  it('knownRewardParams returns 3 entries with regex "Plus"', () =>
  {
    const rewards = knownRewardParams();
    expect(rewards.length)
      .toBe(3);
    expect(rewards[ 0 ])
      .toEqual({
        id: 0,
        name: 'Experience',
        key: 'exp',
        longParamId: 31,
        regex: 'Plus'
      });
    expect(rewards[ 1 ])
      .toEqual({
        id: 1,
        name: 'Gold',
        key: 'gold',
        longParamId: 32,
        regex: 'Plus'
      });
    expect(rewards[ 2 ])
      .toEqual({
        id: 2,
        name: 'SDPs',
        key: 'sdp',
        longParamId: 33,
        regex: 'Plus'
      });
  });

  it('knownLongParams returns 34 entries and includes special ones', () =>
  {
    const all = knownLongParams();
    expect(all.length)
      .toBe(34); // 8 base + 10 ex + 10 sp + 3 special (cdm/cdr/mtp) + 3 reward

    // spot-check a few
    expect(all.find(p => p.longParamId === 0))
      .toEqual({
        id: 0,
        name: 'Max Life',
        key: 'mhp',
        longParamId: 0
      });
    expect(all.find(p => p.longParamId === 10))
      .toEqual({
        id: 2,
        name: 'Crit Rate',
        key: 'cri',
        longParamId: 10
      });
    expect(all.find(p => p.longParamId === 23))
      .toEqual({
        id: 5,
        name: 'Tech Cost',
        key: 'tcr',
        longParamId: 23
      });
    expect(all.find(p => p.longParamId === 28))
      .toEqual({
        id: 0,
        name: 'Crit Amp',
        key: 'cdm',
        longParamId: 28
      });
    expect(all.find(p => p.longParamId === 29))
      .toEqual({
        id: 1,
        name: 'Crit Block',
        key: 'ctr',
        longParamId: 29
      });
    expect(all.find(p => p.longParamId === 30))
      .toEqual({
        id: 0,
        name: 'Max Tech',
        key: 'mtp',
        longParamId: 30
      });
    expect(all.find(p => p.longParamId === 31))
      .toEqual({
        id: 0,
        name: 'Experience',
        key: 'exp',
        longParamId: 31,
        regex: 'Plus'
      });
  });
});

describe('ParameterIdMapper knownParamByLongId', () =>
{
  it('returns the correct KnownParameter by long id', () =>
  {
    const mtp = knownParamByLongId(30);
    expect(mtp)
      .toEqual({
        id: 0,
        name: 'Max Tech',
        key: 'mtp',
        longParamId: 30
      });

    const exp = knownParamByLongId(31);
    expect(exp)
      .toEqual({
        id: 0,
        name: 'Experience',
        key: 'exp',
        longParamId: 31,
        regex: 'Plus'
      });
  });
});
