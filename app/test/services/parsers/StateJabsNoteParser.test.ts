import { describe, expect, it } from 'vitest';
import { StateJabsExtension } from '@core/domain/entities/jabs/StateJabsExtension.ts';
import { StateJabsNoteParser } from '@services/parsers/StateJabsNoteParser.ts';

describe('StateJabsNoteParser', () =>
{
  it('hydrate reads stateDuration frames from note', () =>
  {
    const ext = new StateJabsExtension();
    StateJabsNoteParser.hydrate(ext, '<stateDuration:3600>\n<negative>');
    expect(ext.stateDurationFrames)
      .toBe(3600);
    expect(ext.stateDurationSeconds)
      .toBe(null);
    expect(ext.negative)
      .toBe(true);
  });

  it('hydrate reads stateDurationSec from note', () =>
  {
    const ext = new StateJabsExtension();
    StateJabsNoteParser.hydrate(ext, '<stateDurationSec:300>');
    expect(ext.stateDurationSeconds)
      .toBe(300);
    expect(ext.stateDurationFrames)
      .toBe(null);
  });

  it('write emits stateDuration when frames are set', () =>
  {
    const ext = new StateJabsExtension();
    ext.stateDurationFrames = 18000;
    const note = StateJabsNoteParser.writeStateTags(ext, 'foreign');
    expect(note)
      .toContain('<stateDuration:18000>');
    expect(note)
      .not
      .toMatch(/stateDurationSec/i);
    expect(note)
      .toContain('foreign');
  });

  it('write emits stateDurationSec only when frames are unset', () =>
  {
    const ext = new StateJabsExtension();
    ext.stateDurationSeconds = 120;
    const note = StateJabsNoteParser.writeStateTags(ext, '');
    expect(note)
      .toContain('<stateDurationSec:120>');
    expect(note)
      .not
      .toMatch(/<stateDuration:\d+>/);
  });

  it('write prefers stateDuration over stateDurationSec when both hydrated', () =>
  {
    const ext = new StateJabsExtension();
    StateJabsNoteParser.hydrate(ext, '<stateDuration:60>\n<stateDurationSec:999>');
    expect(ext.stateDurationFrames)
      .toBe(60);
    expect(ext.stateDurationSeconds)
      .toBe(999);
    const note = StateJabsNoteParser.writeStateTags(ext, '');
    expect(note)
      .toContain('<stateDuration:60>');
    expect(note)
      .not
      .toMatch(/stateDurationSec/i);
  });

  it('write omits map-duration tags when values are zero or null', () =>
  {
    const ext = new StateJabsExtension();
    ext.stateDurationFrames = 0;
    ext.stateDurationSeconds = 0;
    const note = StateJabsNoteParser.writeStateTags(ext, 'keep');
    expect(note)
      .not
      .toMatch(/stateDuration/i);
    expect(note)
      .toContain('keep');
  });

  it('stripStateJabsTags removes map-duration tags', () =>
  {
    const stripped = StateJabsNoteParser.stripStateJabsTags(
      '<stateDuration:100>\n<stateDurationSec:5>\n<stateDurationFlat:2>\nrest',
    );
    expect(stripped)
      .toContain('rest');
    expect(stripped)
      .not
      .toMatch(/stateDuration:/i);
    expect(stripped)
      .not
      .toMatch(/stateDurationSec/i);
    expect(stripped)
      .not
      .toMatch(/stateDurationFlat/i);
  });

  it('fromStateNote + applyToNote round-trips map duration with foreign lines', () =>
  {
    const ext = StateJabsExtension.fromStateNote('<customTag>\n<stateDuration:7200>');
    expect(ext.stateDurationFrames)
      .toBe(7200);
    const out = ext.applyToNote('<customTag>\nlegacy line');
    expect(out)
      .toContain('<stateDuration:7200>');
    expect(out)
      .toContain('legacy line');
    expect(out)
      .toContain('<customTag>');
  });

  it('hydrate reads indefiniteState and write emits the tag', () =>
  {
    const ext = new StateJabsExtension();
    StateJabsNoteParser.hydrate(ext, '<indefiniteState>\n<negative>');
    expect(ext.indefiniteState)
      .toBe(true);
    const note = StateJabsNoteParser.writeStateTags(ext, '');
    expect(note)
      .toContain('<indefiniteState>');
  });

  it('hydrate reads skillHistoryBonus bracket tag', () =>
  {
    const ext = new StateJabsExtension();
    StateJabsNoteParser.hydrate(ext, '<skillHistoryBonus:[0, 10, 5, unique]>\n<negative>');
    expect(ext.skillHistoryBonusTypeId)
      .toBe(0);
    expect(ext.skillHistoryBonusWindowSeconds)
      .toBe(10);
    expect(ext.skillHistoryBonusPctPerCount)
      .toBe(5);
    expect(ext.skillHistoryBonusCountMode)
      .toBe('unique');
  });

  it('write emits skillHistoryBonus when all fields are set', () =>
  {
    const ext = new StateJabsExtension();
    ext.skillHistoryBonusTypeId = 0;
    ext.skillHistoryBonusWindowSeconds = 10;
    ext.skillHistoryBonusPctPerCount = 8;
    ext.skillHistoryBonusCountMode = 'unique';
    const note = StateJabsNoteParser.writeStateTags(ext, '');
    expect(note)
      .toContain('<skillHistoryBonus:[0, 10, 8, unique]>');
  });

  it('stripStateJabsTags removes skillHistoryBonus', () =>
  {
    const stripped = StateJabsNoteParser.stripStateJabsTags('<skillHistoryBonus:[0, 10, 5, unique]>\nkeep');
    expect(stripped)
      .toContain('keep');
    expect(stripped)
      .not
      .toMatch(/skillHistoryBonus/i);
  });

  it('hydrate and write preserve duration modifier tags separately from map timer', () =>
  {
    const ext = new StateJabsExtension();
    StateJabsNoteParser.hydrate(
      ext,
      '<stateDuration:3600>\n<stateDurationFlat:10>\n<stateDurationPerc:25>',
    );
    expect(ext.stateDurationFrames)
      .toBe(3600);
    expect(ext.stateDurationFlat)
      .toBe(10);
    expect(ext.stateDurationPercent)
      .toBe(25);
    const note = StateJabsNoteParser.writeStateTags(ext, '');
    expect(note)
      .toContain('<stateDuration:3600>');
    expect(note)
      .toContain('<stateDurationFlat:10>');
    expect(note)
      .toContain('<stateDurationPerc:25>');
  });
});
