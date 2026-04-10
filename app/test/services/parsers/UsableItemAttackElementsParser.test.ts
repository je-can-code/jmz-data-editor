import { describe, expect, it } from 'vitest';
import { UsableItemAttackElementsParser } from '@services/parsers/UsableItemAttackElementsParser.ts';
import { NoteNormalizer } from '@services/utils/NoteNormalizer.ts';

describe('UsableItemAttackElementsParser', () =>
{
  it('readAttackElements merges unique ids in order', () =>
  {
    const note = 'x\n<attackElements:[3, 1]>\n<attackElements:[1, 2]>';
    expect(UsableItemAttackElementsParser.readAttackElements(note))
      .toEqual([ 3, 1, 2 ]);
  });

  it('readAttackElements ignores invalid tokens', () =>
  {
    const note = '<attackElements:[1, bad, 2]>';
    expect(UsableItemAttackElementsParser.readAttackElements(note))
      .toEqual([ 1, 2 ]);
  });

  it('writeAttackElements replaces all prior lines and prepends one tag', () =>
  {
    const start = '<attackElements:[9]>\nkeep\n<attackElements:[1]>';
    const out = UsableItemAttackElementsParser.writeAttackElements(start, [ 4, 5 ]);
    expect(out)
      .toContain('<attackElements:[4,5]>');
    expect(out.includes('9'))
      .toBe(false);
    expect(out)
      .toContain('keep');
  });

  it('writeAttackElements clears when ids empty', () =>
  {
    const cleared = UsableItemAttackElementsParser.writeAttackElements(
      '<attackElements:[1]>\na',
      []
    );
    expect(NoteNormalizer.normalize(cleared))
      .toBe('a');
  });
});
