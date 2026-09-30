import { describe, expect, it } from 'vitest';
import {
  decodeList,
  decodeNote,
  decodeStruct,
  encodeList,
  encodeNote,
  encodeStruct,
  parseArgType,
} from '../../../../../src/mapEditor/core/commands/editors/pluginArgValues.ts';

/*
 * MZ stores every plugin command argument as text, whatever it means: a list is the JSON of an array of texts,
 * a struct the JSON of an object of texts, a note the JSON of its text. The plugin command form edits them as
 * what they mean and writes them back in exactly MZ's encoding (compact JSON, keys in their order), since the
 * plugins parse these texts themselves. Text that is not the encoding it should be reads as null, so the form
 * falls back to editing it as plain text rather than destroying it.
 */
describe('plugin argument values', () =>
{
  describe('parseArgType', () =>
  {
    it('reads simple types, structs, and lists of either, nested', () =>
    {
      // Arrange: types as headers spell them.
      const types = [ 'number', 'struct<Reward>', 'string[]', 'struct< Reward >[]', 'number[][]', '', ' switch ' ];

      // Act.
      const parsed = types.map(parseArgType);

      // Assert.
      expect(parsed)
        .toStrictEqual([
          { kind: 'simple', name: 'number' },
          { kind: 'struct', name: 'Reward' },
          { kind: 'list', item: { kind: 'simple', name: 'string' } },
          { kind: 'list', item: { kind: 'struct', name: 'Reward' } },
          { kind: 'list', item: { kind: 'list', item: { kind: 'simple', name: 'number' } } },
          { kind: 'simple', name: 'string' },
          { kind: 'simple', name: 'switch' },
        ]);
    });
  });

  describe('decodeList and encodeList', () =>
  {
    it('read a stored list into its items and write them back in MZ\'s encoding', () =>
    {
      // Arrange: a real quest-unlock argument.
      const stored = '["main-000","main-001"]';

      // Act.
      const items = decodeList(stored);
      const back = encodeList(items ?? []);

      // Assert.
      expect([ items, back ])
        .toStrictEqual([ [ 'main-000', 'main-001' ], stored ]);
    });

    it('read an empty text as no items, and items a tool stored as numbers as text', () =>
    {
      // Arrange: nothing stored, and numbers where MZ writes texts.

      // Act.
      const lists = [ decodeList(''), decodeList(' '), decodeList('[1,{"a":"b"}]') ];

      // Assert.
      expect(lists)
        .toStrictEqual([ [], [], [ '1', '{"a":"b"}' ] ]);
    });

    it('refuse text that is no list', () =>
    {
      // Arrange: an object, and not JSON at all.

      // Act.
      const lists = [ decodeList('{"a":"1"}'), decodeList('main-000') ];

      // Assert.
      expect(lists)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('decodeStruct and encodeStruct', () =>
  {
    it('read a stored struct into its fields and write them back in their order', () =>
    {
      // Arrange: a sound struct, as J-ABS-Charge declares one.
      const stored = '{"name":"Cursor1","volume":"90","pitch":"100","pan":"0"}';

      // Act.
      const fields = decodeStruct(stored);
      const back = encodeStruct(fields ?? {});

      // Assert.
      expect([ fields, back ])
        .toStrictEqual([ { name: 'Cursor1', volume: '90', pitch: '100', pan: '0' }, stored ]);
    });

    it('read an empty text as no fields, and values a tool stored unencoded as text', () =>
    {
      // Arrange.

      // Act.
      const structs = [ decodeStruct(''), decodeStruct('{"count":3,"tags":["a"]}') ];

      // Assert.
      expect(structs)
        .toStrictEqual([ {}, { count: '3', tags: '["a"]' } ]);
    });

    it('refuse text that is no struct', () =>
    {
      // Arrange: a list, and not JSON at all.

      // Act.
      const structs = [ decodeStruct('["a"]'), decodeStruct('name=Cursor1') ];

      // Assert.
      expect(structs)
        .toStrictEqual([ null, null ]);
    });
  });

  describe('decodeNote and encodeNote', () =>
  {
    it('read a stored note back into its text and write it as MZ does', () =>
    {
      // Arrange.
      const note = 'line one\n"quoted" line two';

      // Act.
      const stored = encodeNote(note);
      const back = decodeNote(stored);

      // Assert.
      expect([ stored, back ])
        .toStrictEqual([ '"line one\\n\\"quoted\\" line two"', note ]);
    });

    it('show text that is not an encoded note as it is', () =>
    {
      // Arrange: plain text, and JSON that is not a string.

      // Act.
      const notes = [ decodeNote('plain words'), decodeNote('[1,2]') ];

      // Assert.
      expect(notes)
        .toStrictEqual([ 'plain words', '[1,2]' ]);
    });
  });
});
