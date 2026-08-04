import { describe, expect, it } from "vitest";
import {
  createBossEncounter,
  createBossParticipant,
  createBossRoutine,
  createBossStep,
  hydrateBossEncounters,
  withEnemySelection,
  withSkillSelection,
} from "@core/domain/valueObjects/boss-config.ts";

/**
 * Editor-side counterpart to J-ABS-Boss's configuration loader. Encounters are the `bosses` block of
 * `config.jabs.json`, so this hydrates a block rather than a file root. It must:
 *
 *   - turn a missing or malformed block into an empty list, because a JABS config that predates this
 *     feature simply has no `bosses` key at all
 *   - round-trip a complete encounter without dropping or renaming anything, since whatever this
 *     writes is what the plugin reads back at game load
 *   - default a step to observing its cast time, matching the plugin, so a telegraph is never
 *     removed by omission
 */
describe("hydrateBossEncounters", () =>
{
  it("returns an empty list when the block is null", () =>
  {
    // Arrange
    const absentBlock = null;

    // Act
    const hydrated = hydrateBossEncounters(absentBlock);

    // Assert
    expect(hydrated)
      .toEqual([]);
  });

  it("returns an empty list when the block is undefined, as in a config predating this feature", () =>
  {
    // Arrange
    const absentBlock = undefined;

    // Act
    const hydrated = hydrateBossEncounters(absentBlock);

    // Assert
    expect(hydrated)
      .toEqual([]);
  });

  it("returns an empty list when the block is an object rather than an array", () =>
  {
    // Arrange
    const wrongShape: unknown = { encounters: [] };

    // Act
    const hydrated = hydrateBossEncounters(wrongShape);

    // Assert
    expect(hydrated)
      .toEqual([]);
  });

  it("returns an empty list when the block is some other type entirely", () =>
  {
    // Arrange
    const wrongType: unknown = "nope";

    // Act
    const hydrated = hydrateBossEncounters(wrongType);

    // Assert
    expect(hydrated)
      .toEqual([]);
  });

  it("round-trips a complete encounter without altering it", () =>
  {
    // Arrange
    const authored = [
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
    ];

    // Act
    const hydrated = hydrateBossEncounters(authored);

    // Assert
    expect(hydrated)
      .toEqual(authored);
  });

  it("fills participants and routines with empty lists when an encounter omits them", () =>
  {
    // Arrange
    const sparse = [ { key: "bare", map: 1 } ];

    // Act
    const hydrated = hydrateBossEncounters(sparse);

    // Assert
    expect(hydrated[ 0 ])
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
    // Arrange
    const unknownMode = [ { key: "x", aiControl: "telepathic" } ];

    // Act
    const hydrated = hydrateBossEncounters(unknownMode);

    // Assert
    expect(hydrated[ 0 ].aiControl)
      .toBe("shared");
  });

  it("preserves scripted control when it is authored", () =>
  {
    // Arrange
    const scripted = [ { key: "x", aiControl: "scripted" } ];

    // Act
    const hydrated = hydrateBossEncounters(scripted);

    // Assert
    expect(hydrated[ 0 ].aiControl)
      .toBe("scripted");
  });

  it("gives a routine the default cadence when the block omits it", () =>
  {
    // Arrange
    const noCadence = [ { key: "x", routines: [ { key: "r" } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(noCadence);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].cadence)
      .toBe(20);
    expect(hydrated[ 0 ].routines[ 0 ].steps)
      .toEqual([]);
  });

  it("defaults a step to observing its cast time, so a telegraph is never lost by omission", () =>
  {
    // Arrange
    const noCastFlag = [ { key: "x", routines: [ { key: "r", steps: [ { skill: 5 } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(noCastFlag);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ].cast)
      .toBe(true);
  });

  it("preserves an authored instant step rather than re-adding its wind-up", () =>
  {
    // Arrange
    const instant = [ { key: "x", routines: [ { key: "r", steps: [ { skill: 5, cast: false } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(instant);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ].cast)
      .toBe(false);
  });

  it("falls back to the only implemented verb when the authored verb is unknown", () =>
  {
    // Arrange
    const unknownVerb = [ { key: "x", routines: [ { key: "r", steps: [ { verb: "teleport" } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(unknownVerb);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ].verb)
      .toBe("forceSkill");
  });

  it("leaves the recorded name blank rather than inventing one when a step omits it", () =>
  {
    // Arrange
    const noExpect = [ { key: "x", routines: [ { key: "r", steps: [ { skill: 5 } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(noExpect);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ].expect)
      .toBe("");
  });

  it("replaces a non-object entry in the list with a fully defaulted one", () =>
  {
    // Arrange
    const junkEntries = [ null, 42 ];

    // Act
    const hydrated = hydrateBossEncounters(junkEntries);

    // Assert
    expect(hydrated)
      .toHaveLength(2);
    expect(hydrated[ 0 ].key)
      .toBe("");
    expect(hydrated[ 1 ].participants)
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
    // Arrange
    const step = createBossStep();

    // Act
    const updated = withSkillSelection(step, 2584, "Devour");

    // Assert
    expect(updated.skill)
      .toBe(2584);
    expect(updated.expect)
      .toBe("Devour");
  });

  it("leaves the rest of the step untouched", () =>
  {
    // Arrange
    const step = { ...createBossStep(), cast: false };

    // Act
    const updated = withSkillSelection(step, 2588, "Wave of the Void");

    // Assert
    expect(updated.cast)
      .toBe(false);
    expect(updated.verb)
      .toBe("forceSkill");
  });

  it("clears the recorded name when the chosen skill could not be resolved", () =>
  {
    // Arrange
    const step = withSkillSelection(createBossStep(), 2584, "Devour");

    // Act
    const updated = withSkillSelection(step, 9999, "");

    // Assert
    expect(updated.expect)
      .toBe("");
  });

  it("does not mutate the step it was given", () =>
  {
    // Arrange
    const step = createBossStep();

    // Act
    withSkillSelection(step, 2584, "Devour");

    // Assert
    expect(step.skill)
      .toBe(0);
    expect(step.expect)
      .toBe("");
  });
});

/**
 * Same contract as {@link withSkillSelection}, applied to the body a fight is fought against.
 */
describe("withEnemySelection", () =>
{
  it("records the id and the name it was chosen under together", () =>
  {
    // Arrange
    const participant = createBossParticipant();

    // Act
    const updated = withEnemySelection(participant, 581, "Gluttonwolf Mayor");

    // Assert
    expect(updated.enemyId)
      .toBe(581);
    expect(updated.expect)
      .toBe("Gluttonwolf Mayor");
  });

  it("leaves the participant's own identity and event untouched", () =>
  {
    // Arrange
    const participant = { ...createBossParticipant(), key: "mayor", eventId: 4 };

    // Act
    const updated = withEnemySelection(participant, 582, "Vampire King");

    // Assert
    expect(updated.key)
      .toBe("mayor");
    expect(updated.eventId)
      .toBe(4);
  });

  it("does not mutate the participant it was given", () =>
  {
    // Arrange
    const participant = createBossParticipant();

    // Act
    withEnemySelection(participant, 581, "Gluttonwolf Mayor");

    // Assert
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
    // Arrange
    // nothing to arrange; the factory takes no inputs.

    // Act
    const step = createBossStep();

    // Assert
    expect(step)
      .toEqual({
        verb: "forceSkill",
        skill: 0,
        expect: "",
        cast: true,
      });
  });

  it("starts a new routine with one step so it is never empty on arrival", () =>
  {
    // Arrange
    // nothing to arrange; the factory takes no inputs.

    // Act
    const routine = createBossRoutine();

    // Assert
    expect(routine.cadence)
      .toBe(20);
    expect(routine.steps)
      .toHaveLength(1);
  });

  it("starts a new encounter with one body and no routines", () =>
  {
    // Arrange
    // nothing to arrange; the factory takes no inputs.

    // Act
    const encounter = createBossEncounter();

    // Assert
    expect(encounter.participants)
      .toHaveLength(1);
    expect(encounter.routines)
      .toEqual([]);
    expect(encounter.aiControl)
      .toBe("shared");
  });

  it("does not share nested structure between two new encounters", () =>
  {
    // Arrange
    const first = createBossEncounter();
    const second = createBossEncounter();

    // Act
    first.participants[ 0 ].key = "mayor";

    // Assert
    expect(second.participants[ 0 ].key)
      .toBe("");
  });

  it("does not share nested structure between two new routines", () =>
  {
    // Arrange
    const first = createBossRoutine();
    const second = createBossRoutine();

    // Act
    first.steps[ 0 ].skill = 2584;

    // Assert
    expect(second.steps[ 0 ].skill)
      .toBe(0);
  });

  it("survives a hydrate round-trip without changing shape", () =>
  {
    // Arrange
    const encounter = createBossEncounter();

    // Act
    const hydrated = hydrateBossEncounters([ encounter ]);

    // Assert
    expect(hydrated[ 0 ])
      .toEqual(encounter);
  });
});
