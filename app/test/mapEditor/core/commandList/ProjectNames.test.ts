import { describe, expect, it, vi } from 'vitest';
import type { DatabaseNamesJson } from '../../../../src/mapEditor/core/commandList/databaseNames.ts';
import { ProjectNames } from '../../../../src/mapEditor/core/commandList/ProjectNames.ts';

/*
 * A window shows ids by its names: the project's, read from the server once however often they are asked for, with the
 * switch and variable names as they stand in System.json right now, which outrank what the server read, since they may
 * hold renames nobody has saved yet. Until either arrives there are no names, and ids read as numbers; a read that
 * fails leaves it so, save for the switches and variables once they are followed. Whoever listens hears every change,
 * and nothing for names that match the ones already followed, and the same names read back until they change.
 */
describe('ProjectNames', () =>
{
  /**
   * The project's names as the server reads them: two switches, one variable and one item.
   * @returns {DatabaseNamesJson} The names.
   */
  const buildNames = (): DatabaseNamesJson => ({
    switches: [ '', 'partner-visible', 'suspicious castle' ],
    variables: [ '', 'Enemies Defeated' ],
    actors: [],
    classes: [],
    skills: [],
    items: [ '', 'Potion' ],
    weapons: [],
    armors: [],
    enemies: [],
    troops: [],
    states: [],
    animations: [],
    tilesets: [],
    commonEvents: [],
    maps: [],
    equipTypes: [],
  });

  it('has no names until they are read, then the server\'s, read once however often asked', async () =>
  {
    // Arrange.
    const load = vi.fn(async () => buildNames());
    const names = new ProjectNames(load);
    const before = names.names();

    // Act.
    const [ first, second ] = await Promise.all([ names.read(), names.read() ]);

    // Assert.
    expect([ before, first, second === first, names.names(), load.mock.calls.length ])
      .toStrictEqual([ null, buildNames(), true, buildNames(), 1 ]);
  });

  it('puts the switch and variable names followed over the ones the server read, leaving the rest', async () =>
  {
    // Arrange: names read, then switch 2 renamed and a third variable added.
    const names = new ProjectNames(async () => buildNames());
    await names.read();

    // Act.
    names.followSystem({ switches: [ '', 'partner-visible', 'after the vampire' ], variables: [ '', 'Enemies Defeated', '' ] });

    // Assert.
    expect(names.names())
      .toStrictEqual({ ...buildNames(), switches: [ '', 'partner-visible', 'after the vampire' ], variables: [ '', 'Enemies Defeated', '' ] });
  });

  it('keeps the names followed when the server\'s arrive after them', async () =>
  {
    // Arrange: the switches followed before the read lands.
    const names = new ProjectNames(async () => buildNames());
    names.followSystem({ switches: [ '', 'Door open' ], variables: [ '' ] });
    const early = names.names();

    // Act.
    await names.read();

    // Assert: before the read, only the switches and variables are named.
    expect([ early?.switches, early?.items, names.names()?.switches, names.names()?.items ])
      .toStrictEqual([ [ '', 'Door open' ], [], [ '', 'Door open' ], [ '', 'Potion' ] ]);
  });

  it('leaves ids as numbers when the server cannot answer, or the load throws before it starts', async () =>
  {
    // Arrange: a server refusing, and a load that throws at once.
    const refused = new ProjectNames(async () => Promise.reject(new Error('down')));
    const broken = new ProjectNames(() =>
    {
      throw new Error('no route');
    });

    // Act.
    const read = [ await refused.read(), await broken.read() ];

    // Assert.
    expect([ read, refused.names(), broken.names() ])
      .toStrictEqual([ [ null, null ], null, null ]);
  });

  it('tells whoever listens of each change, nothing for names matching the ones followed, and nobody once they stop', async () =>
  {
    // Arrange: a listener, and the names read.
    const names = new ProjectNames(async () => buildNames());
    let heard = 0;
    const stop = names.subscribe(() =>
    {
      heard += 1;
    });
    await names.read();
    const afterRead = heard;

    // Act: switch 1 renamed; the same names followed again; variable 1 alone renamed; the listener stops; switch 1
    // renamed back.
    names.followSystem({ switches: [ '', 'partner', 'suspicious castle' ], variables: [ '', 'Enemies Defeated' ] });
    const renamed = names.names();
    names.followSystem({ switches: [ '', 'partner', 'suspicious castle' ], variables: [ '', 'Enemies Defeated' ] });
    const same = names.names();
    names.followSystem({ switches: [ '', 'partner', 'suspicious castle' ], variables: [ '', 'Foes Felled' ] });
    stop();
    names.followSystem({ switches: [ '', 'partner-visible', 'suspicious castle' ], variables: [ '', 'Foes Felled' ] });

    // Assert.
    expect([ afterRead, heard, same === renamed, names.names()?.switches[1], names.names()?.variables[1] ])
      .toStrictEqual([ 1, 3, true, 'partner-visible', 'Foes Felled' ]);
  });
});
