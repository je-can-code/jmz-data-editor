import { describe, expect, it } from 'vitest';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { BlueprintSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { BlueprintUsesWriter, followedBy, mergeOf, type OwedMap } from '../../../../src/mapEditor/core/blueprints/blueprintUsesWriter.ts';
import { UsesServer } from '../../support/usesServer.ts';

/*
 * The writer carries the record of where blueprints are placed to disk a map at a time, merged there into the file as it
 * stands. It owes its keeper these rules: a map's placements are written whole or one placement at a time, and what a map
 * owes is gathered so its writes land in the order asked for; one merge is on its way at a time, and whatever is asked for
 * meanwhile goes in the next; a map asked for whole is sent whatever the writer knows the file to hold, since another
 * window may have written it since; a merge that fails is said, given back beneath anything asked for since, and tried
 * again with the next write or a retry, counted unwritten until it lands; and what the file holds is known as read, with
 * this window's writes on top as they land.
 */

/**
 * The camp at 1, 3; the camp cut off at the left edge at -1, 0; and the roost at 4, 7.
 */
const CAMP: BlueprintSpot = { blueprintId: 'aa22', x: 1, y: 3 };
const CUT: BlueprintSpot = { blueprintId: 'aa22', x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } };
const ROOST: BlueprintSpot = { blueprintId: 'k3x9q2mf', x: 4, y: 7 };

describe('followedBy', () =>
{
  it('lets placements given whole replace everything owed before them', () =>
  {
    // Arrange.
    const earlier: OwedMap = { kind: 'single', removed: [ CAMP ], added: [ ROOST ] };

    // Act.
    const owed = followedBy(earlier, { kind: 'whole', spots: [ CUT ] });

    // Assert.
    expect(owed)
      .toStrictEqual({ kind: 'whole', spots: [ CUT ] });
  });

  it('takes single placements out of and puts them into placements owed whole', () =>
  {
    // Arrange.
    const earlier: OwedMap = { kind: 'whole', spots: [ CAMP, ROOST ] };

    // Act.
    const owed = followedBy(earlier, { kind: 'single', removed: [ CAMP ], added: [ CUT ] });

    // Assert.
    expect(owed)
      .toStrictEqual({ kind: 'whole', spots: [ ROOST, CUT ] });
  });

  it('gathers single placements, a later one at a corner taking the place of an earlier one there', () =>
  {
    // Arrange: the camp taken out, the roost put in.
    const earlier: OwedMap = { kind: 'single', removed: [ CAMP ], added: [ ROOST ] };

    // Act: the camp put back, the roost taken out again.
    const owed = followedBy(earlier, { kind: 'single', removed: [ ROOST ], added: [ CAMP ] });

    // Assert.
    expect(owed)
      .toStrictEqual({ kind: 'single', removed: [ ROOST ], added: [ CAMP ] });
  });

  it('owes single placements as they are when nothing was owed before', () =>
  {
    // Arrange: nothing owed.

    // Act.
    const owed = followedBy(undefined, { kind: 'single', removed: [ CAMP ], added: [ CUT ] });

    // Assert.
    expect(owed)
      .toStrictEqual({ kind: 'single', removed: [ CAMP ], added: [ CUT ] });
  });
});

describe('mergeOf', () =>
{
  it('names maps owed whole with their entries, none as null, and single placements by map, the part placed only put in', () =>
  {
    // Arrange.
    const owed = new Map<number, OwedMap>([
      [ 16, { kind: 'whole', spots: [ ROOST, CAMP ] } ],
      [ 7, { kind: 'whole', spots: [] } ],
      [ 3, { kind: 'single', removed: [ CUT ], added: [ CUT ] } ],
    ]);

    // Act.
    const merge = mergeOf(owed);

    // Assert.
    expect(merge)
      .toStrictEqual({
        schemaVersion: 2,
        maps: { 16: { aa22: [ { x: 1, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] }, 7: null },
        remove: [ { map: 3, blueprint: 'aa22', x: -1, y: 0 } ],
        add: [ { map: 3, blueprint: 'aa22', x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ],
      });
  });

  it('leaves out what it has nothing for', () =>
  {
    // Arrange.
    const owed = new Map<number, OwedMap>([ [ 3, { kind: 'single', removed: [ CAMP ], added: [] } ] ]);

    // Act.
    const merge = mergeOf(owed);

    // Assert.
    expect(merge)
      .toStrictEqual({ schemaVersion: 2, remove: [ { map: 3, blueprint: 'aa22', x: 1, y: 3 } ] });
  });
});

describe('BlueprintUsesWriter', () =>
{
  /**
   * A writer over a server whose file holds the camp on map 16, known to the writer as read.
   * @returns {{ server: UsesServer, writer: BlueprintUsesWriter, problems: string[] }} The server, the writer, and what
   * the author heard.
   */
  const build = () =>
  {
    const server = new UsesServer({ schemaVersion: 2, data: { maps: { 16: { aa22: [ { x: 1, y: 3 } ] } } } });
    const problems: string[] = [];
    const writer = new BlueprintUsesWriter(server.api, message => problems.push(message));
    writer.learn(new Map([ [ 16, [ CAMP ] ] ]));
    return { server, writer, problems };
  };

  it('sends one merge at a time, gathering what is asked for meanwhile into the next, each map\'s in the order asked', async () =>
  {
    // Arrange: merges held on their way.
    const { server, writer } = build();
    server.holding = true;

    // Act: map 16 whole, then while that waits, map 3 whole and map 16 again.
    writer.writeWhole(16, [ CAMP, ROOST ]);
    writer.writeWhole(3, [ CUT ]);
    writer.writeRemoved(16, [ CAMP ]);
    const whileWaiting = server.merges.length;
    server.releaseAll();
    await writer.whenWritten();

    // Assert: the second merge carries map 3 whole and map 16's removal, which lands after map 16's first write.
    expect([ whileWaiting, server.merges.map(merge => [ merge.maps, merge.remove ]), server.entryOf(16), writer.owes(16) ])
      .toStrictEqual([
        1,
        [
          [ { 16: { aa22: [ { x: 1, y: 3 } ], k3x9q2mf: [ { x: 4, y: 7 } ] } }, undefined ],
          [ { 3: { aa22: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ] } }, [ { map: 16, blueprint: 'aa22', x: 1, y: 3 } ] ],
        ],
        { k3x9q2mf: [ { x: 4, y: 7 } ] },
        false,
      ]);
  });

  it('writes a map whole though it knows the file to hold exactly that, since only the file knows what another window wrote', async () =>
  {
    // Arrange: the writer knows the file to hold the camp on map 16, and another window has since written map 16 empty.
    const { server, writer } = build();
    server.stored = { schemaVersion: 2, data: { maps: {} } };

    // Act: map 16 asked for as the writer knows the file to hold it.
    writer.writeWhole(16, [ CAMP ]);
    await writer.whenWritten();

    // Assert: the merge went, and the file holds the camp again.
    expect([ server.merges.length, server.entryOf(16) ])
      .toStrictEqual([ 1, { aa22: [ { x: 1, y: 3 } ] } ]);
  });

  it('counts what is on its way, waiting, or refused as unwritten, until it lands', async () =>
  {
    // Arrange: merges held on their way, the first to be refused.
    const { server, writer } = build();
    const before = writer.hasUnwritten();
    server.holding = true;
    writer.writeWhole(16, [ ROOST ]);
    writer.writeWhole(3, [ CUT ]);
    const whileWaiting = writer.hasUnwritten();
    server.held.splice(0).forEach(each => each.fail(new Error('the disk is full')));
    await writer.whenWritten();
    const whileRefused = writer.hasUnwritten();
    server.releaseAll();

    // Act: everything owed tried again, as a save does.
    writer.retry();
    await writer.whenWritten();

    // Assert: unwritten from the first write until the retry landed, and both maps on disk.
    expect([ before, whileWaiting, whileRefused, writer.hasUnwritten(), server.entryOf(16), server.entryOf(3) ])
      .toStrictEqual([
        false,
        true,
        true,
        false,
        { k3x9q2mf: [ { x: 4, y: 7 } ] },
        { aa22: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ] },
      ]);
  });

  it('sends nothing on a retry while a merge is on its way, which sends what waits once it lands', async () =>
  {
    // Arrange: one merge held on its way, and another write waiting behind it.
    const { server, writer } = build();
    server.holding = true;
    writer.writeWhole(16, [ ROOST ]);
    writer.writeWhole(3, [ CUT ]);

    // Act.
    writer.retry();
    const whileOnItsWay = server.merges.length;
    server.releaseAll();
    await writer.whenWritten();

    // Assert: still one merge after the retry, and the waiting write sent once the first landed.
    expect([ whileOnItsWay, server.merges.map(merge => Object.keys(merge.maps ?? {})) ])
      .toStrictEqual([ 1, [ [ '16' ], [ '3' ] ] ]);
  });

  it('writes whatever is asked for while what the file holds is not known', async () =>
  {
    // Arrange.
    const { server, writer } = build();
    writer.learn(null);

    // Act.
    writer.writeWhole(16, [ CAMP ]);
    await writer.whenWritten();

    // Assert.
    expect(server.merges.length)
      .toBe(1);
  });

  it('says why a merge failed, in the server\'s words, and gives it back to go with the next write', async () =>
  {
    // Arrange: the first merge refused by a newer record.
    const { server, writer, problems } = build();
    server.failNext = new MapEditorApiError('PUT answered 409', 409, 'jmz-editor/blueprint-uses.json was written by a newer editor (version 3)');
    writer.writeWhole(16, [ ROOST ]);
    await writer.whenWritten();
    const owedAfterFailing = writer.owes(16);

    // Act: map 3 written, carrying map 16's failed write with it.
    writer.writeWhole(3, [ CUT ]);
    await writer.whenWritten();

    // Assert.
    expect([ problems, owedAfterFailing, server.merges[1].maps, writer.owes(16) ])
      .toStrictEqual([
        [ 'The blueprint placements could not be saved: jmz-editor/blueprint-uses.json was written by a newer editor (version 3). They are tried again with the next save.' ],
        true,
        { 16: { k3x9q2mf: [ { x: 4, y: 7 } ] }, 3: { aa22: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 2, height: 3 } } ] } },
        false,
      ]);
  });

  it('says why a merge failed in the words of what failed it, whatever that was', async () =>
  {
    // Arrange: a merge failed by an error the server gave no words for, and one by something that is no error at all.
    const { server, writer, problems } = build();
    server.failNext = new MapEditorApiError('PUT /api/editor-data/blueprint-uses/maps answered 502', 502);
    writer.writeWhole(16, [ ROOST ]);
    await writer.whenWritten();
    server.failNext = 'the server went away' as unknown as Error;

    // Act.
    writer.writeWhole(3, [ CUT ]);
    await writer.whenWritten();

    // Assert.
    expect(problems)
      .toStrictEqual([
        'The blueprint placements could not be saved: PUT /api/editor-data/blueprint-uses/maps answered 502. They are tried again with the next save.',
        'The blueprint placements could not be saved: the server went away. They are tried again with the next save.',
      ]);
  });

  it('gives a failed merge back beneath what was asked for since, the newer winning', async () =>
  {
    // Arrange: a merge held, then failed, after a newer write of the same map was asked for.
    const { server, writer } = build();
    server.holding = true;
    writer.writeWhole(16, [ ROOST ]);
    writer.writeRemoved(16, [ ROOST ]);

    // Act.
    server.held.splice(0).forEach(each => each.fail(new Error('the disk is full')));
    await writer.whenWritten();
    server.holding = false;
    writer.writeWhole(3, [ CUT ]);
    await writer.whenWritten();

    // Assert: map 16 owed whole without the roost, written once map 3 was.
    expect(server.entryOf(16))
      .toBeUndefined();
  });

  it('knows what the file will hold once everything owed has landed, and nothing while the file is not known', () =>
  {
    // Arrange: a merge on its way putting the roost in, and the camp taken out after it.
    const { server, writer } = build();
    server.holding = true;
    writer.writeAdded(16, [ ROOST ]);
    writer.writeRemoved(16, [ CAMP ]);

    // Act.
    const intended = [ writer.intended(16), writer.intended(3) ];
    writer.learn(null);

    // Assert: map 3, which the file does not hold and nothing is owed for, holds nothing.
    expect([ intended, writer.intended(16), writer.onDisk ])
      .toStrictEqual([ [ [ ROOST ], [] ], null, null ]);
  });

  it('takes nothing out or in when given nothing', () =>
  {
    // Arrange.
    const { server, writer } = build();

    // Act.
    writer.writeRemoved(16, []);
    writer.writeAdded(16, []);

    // Assert.
    expect([ server.merges, writer.owes(16) ])
      .toStrictEqual([ [], false ]);
  });

  it('keeps what the file holds as its own writes land, a map left with none dropped', async () =>
  {
    // Arrange.
    const { writer } = build();

    // Act.
    writer.writeWhole(3, [ CUT ]);
    writer.writeRemoved(16, [ CAMP ]);
    await writer.whenWritten();

    // Assert.
    expect([ ...(writer.onDisk ?? new Map()) ])
      .toStrictEqual([ [ 3, [ CUT ] ] ]);
  });
});
