import { describe, expect, it } from "vitest";
import {
  createBossEncounter,
  createBossParticipant,
  createBossRoutine,
  createBossStep,
  hydrateBossConfig,
  withEnemySelection,
  withSkillSelection,
} from "@core/domain/valueObjects/boss-config.ts";

/**
 * Editor-side counterpart to J-ABS-Boss's configuration loader. The editor must:
 *
 *   - turn a missing or malformed {@code config.boss.json} into an empty-but-valid configuration,
 *     because the editor is the thing that creates the file in the first place
 *   - round-trip a complete encounter without dropping or renaming anything, since whatever this
 *     writes is what the plugin reads back at game load
 *   - default a step to observing its cast time, matching the plugin, so a telegraph is never
 *     removed by omission
 */
describe("hydrateBossConfig", () =>
{
  it("returns an empty configuration when the payload is null or undefined", () =>
  {
    expect(hydrateBossConfig(null))
      .toEqual({ encounters: [] });
    expect(hydrateBossConfig(undefined))
      .toEqual({ encounters: [] });
  });

  it("returns an empty configuration when the payload is an array rather than an object", () =>
  {
    expect(hydrateBossConfig([]))
      .toEqual({ encounters: [] });
  });

  it("returns an empty configuration when the encounters key is missing entirely", () =>
  {
    expect(hydrateBossConfig({}))
      .toEqual({ encounters: [] });
  });

  it("returns an empty configuration when encounters is not an array", () =>
  {
    expect(hydrateBossConfig({ encounters: "nope" }))
      .toEqual({ encounters: [] });
  });

  it("round-trips a complete encounter without altering it", () =>
  {
    const authored = {
      encounters: [
        {
          key: "gluttonwolf",
          map: 75,
          participants: [
            {
              key: "mayor",
              eventId: 4,
              enemyId: 581,
              expect: "Gluttonwolf Mayor",
            },
          ],
          aiControl: "shared",
          routines: [
            {
              key: "devour",
              cadence: 20,
              steps: [
                {
                  verb: "forceSkill",
                  skill: 2584,
                  expect: "Devour",
                  cast: true,
                },
              ],
            },
          ],
        },
      ],
    };

    expect(hydrateBossConfig(authored))
      .toEqual(authored);
  });

  it("fills participants and routines with empty lists when an encounter omits them", () =>
  {
    const hydrated = hydrateBossConfig({ encounters: [ { key: "bare", map: 1 } ] });

    expect(hydrated.encounters[ 0 ])
      .toEqual({
        key: "bare",
        map: 1,
        participants: [],
        aiControl: "shared",
        routines: [],
      });
  });

  it("falls back to shared control when the authored mode is not one this editor knows", () =>
  {
    const hydrated = hydrateBossConfig({ encounters: [ { key: "x", aiControl: "telepathic" } ] });

    expect(hydrated.encounters[ 0 ].aiControl)
      .toBe("shared");
  });

  it("preserves scripted control when it is authored", () =>
  {
    const hydrated = hydrateBossConfig({ encounters: [ { key: "x", aiControl: "scripted" } ] });

    expect(hydrated.encounters[ 0 ].aiControl)
      .toBe("scripted");
  });

  it("gives a routine the default cadence when the file omits it", () =>
  {
    const hydrated = hydrateBossConfig({
      encounters: [ { key: "x", routines: [ { key: "r" } ] } ],
    });

    expect(hydrated.encounters[ 0 ].routines[ 0 ].cadence)
      .toBe(20);
    expect(hydrated.encounters[ 0 ].routines[ 0 ].steps)
      .toEqual([]);
  });

  it("defaults a step to observing its cast time, so a telegraph is never lost by omission", () =>
  {
    const hydrated = hydrateBossConfig({
      encounters: [ { key: "x", routines: [ { key: "r", steps: [ { skill: 5 } ] } ] } ],
    });

    expect(hydrated.encounters[ 0 ].routines[ 0 ].steps[ 0 ].cast)
      .toBe(true);
  });

  it("preserves an authored instant step rather than re-adding its wind-up", () =>
  {
    const hydrated = hydrateBossConfig({
      encounters: [ { key: "x", routines: [ { key: "r", steps: [ { skill: 5, cast: false } ] } ] } ],
    });

    expect(hydrated.encounters[ 0 ].routines[ 0 ].steps[ 0 ].cast)
      .toBe(false);
  });

  it("falls back to the only implemented verb when the authored verb is unknown", () =>
  {
    const hydrated = hydrateBossConfig({
      encounters: [ { key: "x", routines: [ { key: "r", steps: [ { verb: "teleport" } ] } ] } ],
    });

    expect(hydrated.encounters[ 0 ].routines[ 0 ].steps[ 0 ].verb)
      .toBe("forceSkill");
  });

  it("leaves the recorded name blank rather than inventing one when a step omits it", () =>
  {
    const hydrated = hydrateBossConfig({
      encounters: [ { key: "x", routines: [ { key: "r", steps: [ { skill: 5 } ] } ] } ],
    });

    expect(hydrated.encounters[ 0 ].routines[ 0 ].steps[ 0 ].expect)
      .toBe("");
  });

  it("replaces a non-object entry in a list with a fully defaulted one", () =>
  {
    const hydrated = hydrateBossConfig({ encounters: [ null, 42 ] });

    expect(hydrated.encounters)
      .toHaveLength(2);
    expect(hydrated.encounters[ 0 ].key)
      .toBe("");
    expect(hydrated.encounters[ 1 ].participants)
      .toEqual([]);
  });
});

/**
 * The id and the name it was chosen under have to travel together. J-ABS-Boss compares the recorded
 * name against the live database before a fight starts, so a selection that updates one without the
 * other produces either a silent wrong-skill fight or a false alarm on a correct configuration.
 */
describe("withSkillSelection", () =>
{
  it("records the id and the name it was chosen under together", () =>
  {
    const step = createBossStep();

    const updated = withSkillSelection(step, 2584, "Devour");

    expect(updated.skill)
      .toBe(2584);
    expect(updated.expect)
      .toBe("Devour");
  });

  it("leaves the rest of the step untouched", () =>
  {
    const step = { ...createBossStep(), cast: false };

    const updated = withSkillSelection(step, 2588, "Wave of the Void");

    expect(updated.cast)
      .toBe(false);
    expect(updated.verb)
      .toBe("forceSkill");
  });

  it("clears the recorded name when the chosen skill could not be resolved", () =>
  {
    const step = withSkillSelection(createBossStep(), 2584, "Devour");

    const updated = withSkillSelection(step, 9999, "");

    expect(updated.expect)
      .toBe("");
  });

  it("does not mutate the step it was given", () =>
  {
    const step = createBossStep();

    withSkillSelection(step, 2584, "Devour");

    expect(step.skill)
      .toBe(0);
    expect(step.expect)
      .toBe("");
  });
});

describe("withEnemySelection", () =>
{
  it("records the id and the name it was chosen under together", () =>
  {
    const participant = createBossParticipant();

    const updated = withEnemySelection(participant, 581, "Gluttonwolf Mayor");

    expect(updated.enemyId)
      .toBe(581);
    expect(updated.expect)
      .toBe("Gluttonwolf Mayor");
  });

  it("leaves the participant's own identity and event untouched", () =>
  {
    const participant = { ...createBossParticipant(), key: "mayor", eventId: 4 };

    const updated = withEnemySelection(participant, 582, "Vampire King");

    expect(updated.key)
      .toBe("mayor");
    expect(updated.eventId)
      .toBe(4);
  });

  it("does not mutate the participant it was given", () =>
  {
    const participant = createBossParticipant();

    withEnemySelection(participant, 581, "Gluttonwolf Mayor");

    expect(participant.enemyId)
      .toBe(0);
  });
});

/**
 * The factories seed what a new row looks like in the board. They must not share structure between
 * calls, or editing one freshly-added routine would silently edit every other one.
 */
describe("boss config factories", () =>
{
  it("starts a new step observing its cast time", () =>
  {
    expect(createBossStep())
      .toEqual({
        verb: "forceSkill",
        skill: 0,
        expect: "",
        cast: true,
      });
  });

  it("starts a new routine with one step so it is never empty on arrival", () =>
  {
    const routine = createBossRoutine();

    expect(routine.cadence)
      .toBe(20);
    expect(routine.steps)
      .toHaveLength(1);
  });

  it("starts a new encounter with one body and no routines", () =>
  {
    const encounter = createBossEncounter();

    expect(encounter.participants)
      .toHaveLength(1);
    expect(encounter.routines)
      .toEqual([]);
    expect(encounter.aiControl)
      .toBe("shared");
  });

  it("does not share nested structure between two new encounters", () =>
  {
    const first = createBossEncounter();
    const second = createBossEncounter();

    first.participants[ 0 ].key = "mayor";

    expect(second.participants[ 0 ].key)
      .toBe("");
  });

  it("does not share nested structure between two new routines", () =>
  {
    const first = createBossRoutine();
    const second = createBossRoutine();

    first.steps[ 0 ].skill = 2584;

    expect(second.steps[ 0 ].skill)
      .toBe(0);
  });

  it("survives a hydrate round-trip without changing shape", () =>
  {
    const encounter = createBossEncounter();

    const hydrated = hydrateBossConfig({ encounters: [ encounter ] });

    expect(hydrated.encounters[ 0 ])
      .toEqual(encounter);
  });
});
