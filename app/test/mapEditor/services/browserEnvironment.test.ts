/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { browserEnvironment } from '../../../src/mapEditor/services/MapEditorServices.ts';

/*
 * The page's own environment remembers each project's clock and preview in the window's local storage, under the
 * project's own name, so two projects opened on one machine never share them and the game's files never hold them.
 */
describe('browserEnvironment', () =>
{
  afterEach(() =>
  {
    window.localStorage.clear();
  });

  it('remembers each project\'s clock and preview in the window\'s local storage, under the project\'s own name', () =>
  {
    // Arrange.
    const environment = browserEnvironment('http://127.0.0.1:8080');

    // Act: Chef Adventure's state kept, and another project's looked for.
    environment.rememberedView?.('/games/chef-adventure').write('{"version":1,"clock":1320,"preview":{}}');
    const other = environment.rememberedView?.('/games/other').read();

    // Assert.
    expect([ window.localStorage.getItem('jmz-map-editor:view:/games/chef-adventure'), other, environment.apiBase ])
      .toStrictEqual([ '{"version":1,"clock":1320,"preview":{}}', null, 'http://127.0.0.1:8080' ]);
  });
});
