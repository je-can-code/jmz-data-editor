import { describe, expect, it } from 'vitest';
import { ContextBudget, MAP_VIEW_CONTEXTS, mapViewContexts } from '../../../src/mapEditor/render/ContextBudget.ts';

/*
 * Chromium keeps a fixed number of WebGL contexts alive per renderer process and silently takes the oldest away past
 * it, never giving it back, so the map views of one window (torn-out windows included) share a budget kept below that
 * number. The budget owes them a fair count: a claim is granted at once while a context is free, waits in line
 * otherwise, and is granted, and told, when a claim ahead of it lets go, oldest first. A claim leaving the line frees
 * nothing, a claim released twice frees one context, not two, and a claim that lets go again as it is granted passes
 * its turn to the next in line. If the count ever drifted, views would either wait for contexts nobody holds or take
 * more than the browser keeps, which is the silent blanking this exists to prevent.
 */
describe('ContextBudget', () =>
{
  /**
   * Asks for a claim that notes, by name, when it is granted after waiting.
   * @param {ContextBudget} budget The budget.
   * @param {string[]} heard Where grants are noted.
   * @param {string} name The claim's name.
   * @returns {ReturnType<ContextBudget['request']>} The claim.
   */
  const claimNamed = (budget: ContextBudget, heard: string[], name: string) => budget.request(() => heard.push(name));

  it('grants claims at once while contexts are free, and lines up the rest without granting them', () =>
  {
    // Arrange.
    const budget = new ContextBudget(2);
    const heard: string[] = [];

    // Act.
    const claims = [ 'a', 'b', 'c' ].map(name => claimNamed(budget, heard, name));

    // Assert: a claim granted at once is not told, since its caller sees it straight away.
    expect([ claims.map(claim => claim.isGranted), budget.grantedCount, budget.waitingCount, heard ])
      .toStrictEqual([ [ true, true, false ], 2, 1, [] ]);
  });

  it('grants the claim that has waited longest when a context is given back, and tells it', () =>
  {
    // Arrange: one context, held by a, with b then c in line.
    const budget = new ContextBudget(1);
    const heard: string[] = [];
    const [ a, b, c ] = [ 'a', 'b', 'c' ].map(name => claimNamed(budget, heard, name));

    // Act.
    a.release();

    // Assert.
    expect([ a.isGranted, b.isGranted, c.isGranted, heard, budget.grantedCount, budget.waitingCount ])
      .toStrictEqual([ false, true, false, [ 'b' ], 1, 1 ]);
  });

  it('never grants a claim that left the line, and frees nothing when one leaves', () =>
  {
    // Arrange.
    const budget = new ContextBudget(1);
    const heard: string[] = [];
    const [ a, b, c ] = [ 'a', 'b', 'c' ].map(name => claimNamed(budget, heard, name));

    // Act.
    b.release();
    const whileHeld = [ a.isGranted, budget.waitingCount ];
    a.release();

    // Assert.
    expect([ whileHeld, b.isGranted, c.isGranted, heard ])
      .toStrictEqual([ [ true, 1 ], false, true, [ 'c' ] ]);
  });

  it('frees one context for a claim released twice', () =>
  {
    // Arrange.
    const budget = new ContextBudget(1);
    const heard: string[] = [];
    const [ a, b, c ] = [ 'a', 'b', 'c' ].map(name => claimNamed(budget, heard, name));

    // Act.
    a.release();
    a.release();

    // Assert: c still waits behind b.
    expect([ b.isGranted, c.isGranted, heard, budget.grantedCount ])
      .toStrictEqual([ true, false, [ 'b' ], 1 ]);
  });

  it('passes the turn on when a claim lets go again as it is granted', () =>
  {
    // Arrange: b gives its context straight back when it hears it has one.
    const budget = new ContextBudget(1);
    const heard: string[] = [];
    const a = claimNamed(budget, heard, 'a');
    const b = budget.request(() =>
    {
      heard.push('b');
      b.release();
    });
    const c = claimNamed(budget, heard, 'c');

    // Act.
    a.release();

    // Assert.
    expect([ b.isGranted, c.isGranted, heard, budget.grantedCount, budget.waitingCount ])
      .toStrictEqual([ false, true, [ 'b', 'c' ], 1, 0 ]);
  });

  it('shares one budget between every map view of the window, below what Chromium keeps', () =>
  {
    // Arrange: Chromium keeps 16 contexts per renderer process.
    const chromiumLimit = 16;

    // Act.
    const { limit } = mapViewContexts;

    // Assert.
    expect([ limit, limit === MAP_VIEW_CONTEXTS, limit < chromiumLimit ])
      .toStrictEqual([ 12, true, true ]);
  });
});
