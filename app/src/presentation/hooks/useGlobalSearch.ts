import { useMemo } from 'react';
import { useEnemies } from '@presentation/context/resources/enemies.context.tsx';
import { useItems } from '@presentation/context/resources/items.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { useStates } from '@presentation/context/resources/states.context.tsx';
import { useActors } from '@presentation/context/resources/actors.context.tsx';
import { useClasses } from '@presentation/context/resources/classes.context.tsx';
import { useWeapons } from '@presentation/context/resources/weapons.context.tsx';
import { useArmors } from '@presentation/context/resources/armors.context.tsx';
import { useQuests } from '@presentation/context/resources/quests.context.tsx';
import { useSdps } from '@presentation/context/resources/sdps.context.tsx';
import { useCrafting } from '@presentation/context/resources/crafting.context.tsx';
import { useProficiency } from '@presentation/context/resources/proficiency.context.tsx';
import { OmniObjectiveType } from '@core/enums/OmniObjectiveType.ts';
import OmniObjectiveFetchType from '@boards/quests/OmniObjectiveFetchType.ts';

export type SearchResult = {
  id: string | number;
  name: string;
  type: string;
  path: string;
  category: string;
};

/**
 * A hook that provides global search capabilities across all loaded RPG Maker and plugin data.
 */
export const useGlobalSearch = () =>
{
  const { data: enemies } = useEnemies();
  const { data: items } = useItems();
  const { skills } = useSkills();
  const { states } = useStates();
  const { data: actors } = useActors();
  const { data: classes } = useClasses();
  const { data: weapons } = useWeapons();
  const { data: armors } = useArmors();
  const { quests } = useQuests();
  const { sdps } = useSdps();
  const { recipes } = useCrafting();
  const { conditionals } = useProficiency();

  /**
   * Resolves a human-readable name for a quest objective's target.
   */
  const getFulfillmentTargetName = (
    type: OmniObjectiveFetchType,
    id: number
  ): string =>
  {
    switch (type)
    {
      case OmniObjectiveFetchType.Item:
        return items.find(i => i.id === id)?.name || '';
      case OmniObjectiveFetchType.Weapon:
        return weapons.find(w => w.id === id)?.name || '';
      case OmniObjectiveFetchType.Armor:
        return armors.find(a => a.id === id)?.name || '';
      default:
        return '';
    }
  };

  const allData = useMemo(() =>
  {
    const results: SearchResult[] = [];

    enemies.forEach(e =>
    {
      if (e && e.name)
      {
        results.push({
          id: e.id,
          name: e.name,
          type: 'enemyId',
          path: '/enemies',
          category: 'Enemies'
        });
      }
    });
    items.forEach(i => results.push({
      id: i.id,
      name: i.name,
      type: 'itemId',
      path: '/items',
      category: 'Items'
    }));
    skills.forEach(s => results.push({
      id: s.id,
      name: s.name,
      type: 'skillId',
      path: '/skills',
      category: 'Skills'
    }));
    states.forEach(s => results.push({
      id: s.id,
      name: s.name,
      type: 'stateId',
      path: '/states',
      category: 'States'
    }));
    actors.forEach(a => results.push({
      id: a.id,
      name: a.name,
      type: 'actorId',
      path: '/actors',
      category: 'Actors'
    }));
    classes.forEach(c => results.push({
      id: c.id,
      name: c.name,
      type: 'classId',
      path: '/classes',
      category: 'Classes'
    }));
    weapons.forEach(w => results.push({
      id: w.id,
      name: w.name,
      type: 'weaponId',
      path: '/weapons',
      category: 'Weapons'
    }));
    armors.forEach(a => results.push({
      id: a.id,
      name: a.name,
      type: 'armorId',
      path: '/armors',
      category: 'Armors'
    }));

    quests.forEach(q =>
    {
      results.push({
        id: q.key,
        name: q.name,
        type: 'questKey',
        path: '/quests',
        category: 'Quests'
      });

      q.objectives.forEach((
        obj,
        index
      ) =>
      {
        let targetName = '';

        switch (obj.type)
        {
          case OmniObjectiveType.Fetch:
            targetName = getFulfillmentTargetName(obj.fulfillment.fetch.type, obj.fulfillment.fetch.id);
            break;

          case OmniObjectiveType.Slay:
            targetName = enemies.find(e => e.id === obj.fulfillment.slay.id)?.name || '';
            break;
        }

        if (targetName)
        {
          results.push({
            id: q.key,
            // format: "Target Name - Quest 'Quest Name' - Objective: Index"
            name: `${targetName} - Quest '${q.name}' - Objective: ${index}`,
            type: 'questKey',
            path: '/quests',
            category: 'Quests (Objectives)',
          });
        }
      });
    });

    sdps.forEach(s => results.push({
      id: s.key,
      name: s.identity.name,
      type: 'sdpKey',
      path: '/sdp',
      category: 'SDP'
    }));
    recipes.forEach(r => results.push({
      id: r.key,
      name: r.name,
      type: 'recipeKey',
      path: '/crafting',
      category: 'Crafting'
    }));
    conditionals.forEach(c => results.push({
      id: c.key,
      name: `Conditional: ${c.key}`,
      type: 'conditionalKey',
      path: '/proficiency',
      category: 'Proficiency'
    }));

    return results.sort((
      a,
      b
    ) => a.category.localeCompare(b.category));
  }, [ enemies, items, skills, states, actors, classes, weapons, armors, quests, sdps, recipes, conditionals ]);

  return { allData };
};
