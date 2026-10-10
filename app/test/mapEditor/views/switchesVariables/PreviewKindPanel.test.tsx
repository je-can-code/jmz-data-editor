/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { PreviewKindDefinition } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { GamePreview } from '../../../../src/mapEditor/core/preview/GamePreview.ts';
import type { PreviewChoice, PreviewEntry } from '../../../../src/mapEditor/core/preview/previewList.ts';
import { PreviewKindPanel } from '../../../../src/mapEditor/views/switchesVariables/PreviewKindPanel.tsx';

/*
 * A kind of state a plugin module lets the preview set gets a list beside the switches and variables, drawn the same way
 * for every module from what the module lists: a heading naming the kind and how many things of it are set, worded as
 * the module words a thing set; a search over each thing's name and key, saying so when nothing matches; and each thing
 * with its name, its key beneath, and its own choice, opening onto its lines, each with its number, what it is, and its
 * choice. A thing with no lines offers nothing to open. A choice the author set stands out as a set variable's box does.
 * Every pick is handed back by the thing's key, the choice and the option picked, for the module to work out; the list
 * itself sets nothing.
 */
describe('PreviewKindPanel', () =>
{
  /**
   * A choice offering the options named, standing at the first unless told otherwise.
   * @param {string} id The choice's id.
   * @param {string} label Its name for a screen reader.
   * @param {string[]} values Its options' values, each worded in capitals.
   * @param {Partial<PreviewChoice>} overrides What stands, and whether it was set.
   * @returns {PreviewChoice} The choice.
   */
  const choice = (id: string, label: string, values: string[], overrides: Partial<PreviewChoice> = {}): PreviewChoice => ({
    id,
    label,
    options: values.map(value => ({ value, label: value === '' ? 'From objectives' : value.toUpperCase() })),
    value: values[0],
    set: false,
    ...overrides,
  });

  /**
   * Cecil's first quest set completed of its own, his second left alone, and a quest with no objectives.
   */
  const ENTRIES: readonly PreviewEntry[] = [
    {
      key: 'cecil-001',
      title: 'Drills',
      detail: 'cecil-001',
      choice: choice('quest', 'Show quest cecil-001 as', [ '', 'completed' ], { value: 'completed', set: true }),
      rows: [
        { label: '0', detail: 'The town\'s only guard wants lessons.', choice: choice('0', 'Show objective 0 of quest cecil-001 as', [ 'inactive', 'active' ]) },
        { label: '1', detail: 'It goes badly. Then less badly.', choice: choice('1', 'Show objective 1 of quest cecil-001 as', [ 'inactive', 'active' ], { value: 'active', set: true }) },
      ],
    },
    {
      key: 'cecil-002',
      title: 'The Patrol Route',
      detail: 'cecil-002',
      choice: choice('quest', 'Show quest cecil-002 as', [ '', 'completed' ]),
      rows: [ { label: '0', detail: 'The full circuit of Raevula.', choice: choice('0', 'Show objective 0 of quest cecil-002 as', [ 'inactive', 'active' ]) } ],
    },
    { key: 'mittens-001', title: 'Mittens', detail: 'mittens-001', choice: choice('quest', 'Show quest mittens-001 as', [ '', 'missed' ]), rows: [] },
  ];

  /**
   * The quests as a module's kind, listing the entries above whatever the preview sets.
   */
  const KIND: PreviewKindDefinition = {
    id: 'quest.states',
    title: 'Quests',
    nouns: { one: 'quest', many: 'quests', state: 'set' },
    searchHint: 'Find a quest by name or key',
    noMatch: 'No quest has that name or key.',
    entries: () => ENTRIES,
    choose: () => undefined,
  };

  /**
   * Renders the list at a preview.
   * @param {GamePreview} preview The preview.
   * @returns {ReturnType<typeof vi.fn>} Where each pick goes.
   */
  const renderPanel = (preview: GamePreview = GamePreview.FRESH) =>
  {
    const onChoose = vi.fn();
    render(<PreviewKindPanel kind={KIND} preview={preview} onChoose={onChoose}/>);
    return onChoose;
  };

  it('lists every thing by its name with its key beneath, under the kind\'s heading, saying nothing set while nothing is', () =>
  {
    // Arrange: nothing beyond the render.

    // Act.
    renderPanel();

    // Assert.
    const region = screen.getByRole('region', { name: 'Quests' });
    expect([ [ 'cecil-001', 'cecil-002', 'mittens-001' ].map(key => screen.getByTestId(`preview-entry-${key}`).textContent), within(region).queryByText(/ set$/u) ])
      .toStrictEqual([ [ 'Drillscecil-001From objectivesCOMPLETED', 'The Patrol Routececil-002From objectivesCOMPLETED', 'Mittensmittens-001From objectivesMISSED' ], null ]);
  });

  it('counts in its heading the things of its kind the preview sets, as the module words a thing set', () =>
  {
    // Arrange: two quests set, beside a switch.
    const preview = GamePreview.FRESH.withSwitch(74, true)
      .with('quest.states', 'cecil-001', { state: 'completed' })
      .with('quest.states', 'cecil-002', { objectives: { 0: 'active' } });

    // Act.
    renderPanel(preview);

    // Assert.
    expect(screen.getByText('2 set') instanceof HTMLElement)
      .toBe(true);
  });

  it('opens a thing onto its lines, each by number and what it is, and closes it again', () =>
  {
    // Arrange.
    renderPanel();
    const arrow = screen.getByRole('button', { name: 'Drills' });
    const closed = [ arrow.getAttribute('aria-expanded'), screen.queryByText('It goes badly. Then less badly.') ];

    // Act: opened, then closed.
    fireEvent.click(arrow);
    const opened = [ arrow.getAttribute('aria-expanded'), screen.getByText('It goes badly. Then less badly.').previousElementSibling?.textContent ];
    fireEvent.click(arrow);

    // Assert.
    expect([ closed, opened, arrow.getAttribute('aria-expanded'), screen.queryByText('It goes badly. Then less badly.') ])
      .toStrictEqual([ [ 'false', null ], [ 'true', '1' ], 'false', null ]);
  });

  it('opens each thing alone, leaving the others closed', () =>
  {
    // Arrange.
    renderPanel();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'The Patrol Route' }));

    // Assert.
    expect([ screen.queryByText('The full circuit of Raevula.') !== null, screen.queryByText('It goes badly. Then less badly.') ])
      .toStrictEqual([ true, null ]);
  });

  it('offers nothing to open for a thing with no lines', () =>
  {
    // Arrange: nothing beyond the render.

    // Act.
    renderPanel();

    // Assert.
    expect([ screen.queryByRole('button', { name: 'Mittens' }), screen.getAllByRole('button').length ])
      .toStrictEqual([ null, 2 ]);
  });

  it('hands back a pick of a thing\'s own choice and of one of its lines, by the thing\'s key, the choice and the option', () =>
  {
    // Arrange: Cecil's first quest opened.
    const onChoose = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Drills' }));

    // Act: the quest back to its objectives, then objective 0 under way.
    fireEvent.change(screen.getByLabelText('Show quest cecil-001 as'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Show objective 0 of quest cecil-001 as'), { target: { value: 'active' } });

    // Assert.
    expect(onChoose.mock.calls)
      .toStrictEqual([ [ 'cecil-001', 'quest', '' ], [ 'cecil-001', '0', 'active' ] ]);
  });

  it('shows each choice at the option standing, and outlines those the author set', () =>
  {
    // Arrange: Cecil's first quest opened.
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Drills' }));

    // Act.
    const selects = [ 'Show quest cecil-001 as', 'Show quest cecil-002 as', 'Show objective 1 of quest cecil-001 as', 'Show objective 0 of quest cecil-001 as' ]
      .map(label => screen.getByLabelText(label) as HTMLSelectElement);

    // Assert: set, left alone, set, left alone.
    expect(selects.map(select => select.value))
      .toStrictEqual([ 'completed', '', 'active', 'inactive' ]);
    expect(selects[0].parentElement)
      .toHaveStyle({ borderColor: '#ed6c02' });
    expect(selects[1].parentElement)
      .toHaveStyle({ borderColor: 'rgba(0, 0, 0, 0.12)' });
    expect(selects[2].parentElement)
      .toHaveStyle({ borderColor: '#ed6c02' });
    expect(selects[3].parentElement)
      .toHaveStyle({ borderColor: 'rgba(0, 0, 0, 0.12)' });
  });

  it('finds things by its search, and says so when nothing matches', () =>
  {
    // Arrange.
    renderPanel();
    const search = screen.getByPlaceholderText('Find a quest by name or key');

    // Act: part of a name, then a word no quest has.
    fireEvent.change(search, { target: { value: 'patrol' } });
    const found = screen.queryAllByTestId(/^preview-entry-/u).map(each => each.dataset['testid']);
    fireEvent.change(search, { target: { value: 'castle' } });

    // Assert.
    expect([ found, screen.getByText('No quest has that name or key.') instanceof HTMLElement, screen.queryAllByTestId(/^preview-entry-/u).length ])
      .toStrictEqual([ [ 'preview-entry-cecil-002' ], true, 0 ]);
  });
});
