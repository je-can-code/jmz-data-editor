/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TraitEditor from '@presentation/components/traits/TraitEditor.tsx';
import { ProjectPathProvider } from '@presentation/context/project-path.context.tsx';
import { loadAnimations, loadCommonEvents, loadSystem } from '@services/DataService.ts';
import { SystemService } from '@services/SystemService.ts';
import RPG_System = Rmmz.System.RPG_System;

// System.json, Animations.json and CommonEvents.json come off disk through the data service, which each test
// feeds by hand so it can decide when System.json arrives.
vi.mock('@services/DataService.ts', () => (
  {
    loadSystem: vi.fn(),
    loadAnimations: vi.fn(),
    loadCommonEvents: vi.fn(),
  }
));

// skill and state names are only read for traits naming a skill or a state, which nothing here does, so both
// tables stand loaded and empty.
vi.mock('@presentation/context/resources/skills.context.tsx', () => (
  {
    useSkills: () => (
      {
        skills: [],
        loading: false,
        toName: (id: number) => `Skill ${id}`,
      }
    ),
  }
));

vi.mock('@presentation/context/resources/states.context.tsx', () => (
  {
    useStates: () => (
      {
        states: [],
        loading: false,
        toName: (id: number) => `State ${id}`,
      }
    ),
  }
));

/**
 * The trait editor names every trait it lists: an elemental resistance by its element, a skill type trait by
 * its skill type, an equipment trait by its slot or its weapon or armor type. Those names live in System.json,
 * which loads on its own while the board's rows load, and on a fresh launch straight onto a board the rows can
 * land first. The editor owes its boards two things. It waits for System.json before listing any trait,
 * exactly as it already waits for the skills and states tables, rather than reading names that are not there
 * yet- which took the whole Enemies board down on a reload. And the wait ends by itself the moment System.json
 * lands, with every trait named, so nothing has to be clicked to bring the list back.
 */
describe('TraitEditor', () =>
{
  /**
   * An enemy's traits: resistance to element 1, which System.json below names Fire. Element 2 sits right
   * beside it, so a trait named Ice would mean the wrong element was read.
   */
  const traits = [ { code: 11, dataId: 1, value: 0.5 } ];

  /**
   * The parts of System.json the trait names are read from.
   */
  const systemJson: Partial<RPG_System> = {
    elements: [ '', 'Fire', 'Ice' ],
    skillTypes: [ '', 'Magic' ],
    weaponTypes: [ '', 'Sword' ],
    armorTypes: [ '', 'Cloth' ],
    equipTypes: [ '', 'Weapon' ],
  };

  beforeEach(() =>
  {
    // every test starts where a fresh launch does, before System.json has been read.
    Object.assign(SystemService, {
      systemData: undefined,
      elements: undefined,
      skillTypes: undefined,
      weaponTypes: undefined,
      armorTypes: undefined,
      equipTypes: undefined,
    });

    // the animation and common event lists that load after System.json arrive empty, and at once.
    vi.mocked(loadAnimations).mockResolvedValue([ null ]);
    vi.mocked(loadCommonEvents).mockResolvedValue([ null ]);
  });

  /**
   * Holds System.json back until the test lets it arrive, the way a slow read leaves it behind the board's
   * rows.
   * @returns {() => void} Delivers System.json.
   */
  const holdBackSystemJson = (): (() => void) =>
  {
    let deliver: (system: RPG_System) => void = () =>
    {
    };
    vi.mocked(loadSystem).mockReturnValue(new Promise<RPG_System>((resolve) =>
    {
      deliver = resolve;
    }));

    return () => deliver(systemJson as RPG_System);
  };

  /**
   * Draws the editor the way a board does, inside the project provider that reads System.json.
   */
  const renderEditor = () =>
  {
    render(
      <ProjectPathProvider>
        <TraitEditor selectedTraits={traits} updateEnemyTraits={vi.fn()}/>
      </ProjectPathProvider>
    );
  };

  it('waits for System.json before listing any trait, rather than reading names that have not arrived', () =>
  {
    // Arrange- the enemy's rows are here, but System.json is still on its way.
    holdBackSystemJson();

    // Act
    renderEditor();

    // Assert- it says it is waiting, and lists nothing yet.
    expect(screen.getByText('Loading mapping data...'))
      .toBeInTheDocument();
    expect(screen.queryByText('Elemental Resistance'))
      .not.toBeInTheDocument();
  });

  it('lists every trait by name the moment System.json arrives', async () =>
  {
    // Arrange- drawn while System.json was still on its way.
    const deliverSystemJson = holdBackSystemJson();
    renderEditor();

    // Act
    await act(async () =>
    {
      deliverSystemJson();
    });

    // Assert- the resistance names its own element, and the wait is over.
    expect(await screen.findByText('Fire'))
      .toBeInTheDocument();
    expect(screen.getByText('Elemental Resistance'))
      .toBeInTheDocument();
    expect(screen.queryByText('Loading mapping data...'))
      .not.toBeInTheDocument();
  });
});
