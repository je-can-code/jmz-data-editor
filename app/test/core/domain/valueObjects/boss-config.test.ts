import { describe, expect, it } from "vitest";
import {
  createBossEncounter,
  createBossParticipant,
  createBossReaction,
  createBossRoutine,
  createBossStep,
  hydrateBossEncounters,
  withEnemySelection,
  withSkillSelection,
  withSpawnSelection,
  withStateSelection,
} from "@core/domain/valueObjects/boss-config.ts";

/**
 * The fields the spawn, blink, tint, animation and dialogue verbs read, each at its "none", as every step that
 * performs some other verb carries them.
 */
const SPAWN_TINT_ANIMATION_DIALOGUE_NONES = {
  enemyId: 0,
  template: 0,
  x: 0,
  y: 0,
  direction: 0,
  tone: [],
  animation: 0,
  face: "",
  faceIndex: 0,
  speaker: "",
  lines: [],
};

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
 *   - read a body still naming an event, from before the plugin spawned its bodies, as a body with no
 *     tile chosen yet, since the event id it carries no longer means anything to the plugin
 *   - read an encounter that names no defeat switch as turning none on, since one written before fights
 *     could name a switch has no key for it
 *   - fill every field any verb reads on every step, so switching a step's verb never meets a missing
 *     field, and read an encounter written before reactions as reacting to nothing
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
        defeatSwitch: 24,
        participants: [
          {
            key: "mayor",
            enemyId: 581,
            expect: "Gluttonwolf Mayor",
            x: 8,
            y: 14,
            template: 0,
          },
          {
            key: "golem",
            enemyId: 501,
            expect: "Golem",
            x: 4,
            y: 3,
            template: 601,
          },
        ],
        aiControl: "shared",
        routines: [
          {
            key: "devour",
            cadence: 20,
            dormant: true,
            steps: [
              {
                verb: "forceSkill",
                participant: "",
                skill: 2584,
                state: 0,
                expect: "Devour",
                cast: true,
                image: "",
                index: 0,
                routine: "",
                seconds: 0,
                ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
              },
            ],
          },
        ],
        reactions: [
          {
            key: "seal",
            on: "start",
            participants: [],
            below: 0,
            steps: [
              {
                verb: "addState",
                participant: "mayor",
                skill: 0,
                state: 2072,
                expect: "Sealed",
                cast: true,
                image: "",
                index: 0,
                routine: "",
                seconds: 0,
                ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
              },
              {
                verb: "changeImage",
                participant: "mayor",
                skill: 0,
                state: 0,
                expect: "",
                cast: true,
                image: "$m_elemental-earthie-sealed",
                index: 2,
                routine: "",
                seconds: 0,
                ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
              },
            ],
          },
          {
            key: "enrage",
            on: "fallen",
            participants: [ "golem" ],
            below: 0,
            steps: [
              {
                verb: "quickenRoutine",
                participant: "",
                skill: 0,
                state: 0,
                expect: "",
                cast: true,
                image: "",
                index: 0,
                routine: "devour",
                seconds: 1.5,
                ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
              },
            ],
          },
          {
            key: "two-thirds",
            on: "health",
            participants: [],
            below: 66,
            steps: [
              {
                verb: "spawn",
                participant: "",
                skill: 0,
                state: 0,
                expect: "Ignihazard",
                cast: true,
                image: "",
                index: 0,
                routine: "",
                seconds: 0,
                enemyId: 511,
                template: 605,
                x: 44,
                y: 16,
                direction: 0,
                tone: [],
                animation: 120,
                face: "",
                faceIndex: 0,
                speaker: "",
                lines: [],
              },
              {
                verb: "blink",
                participant: "mayor",
                skill: 0,
                state: 0,
                expect: "",
                cast: true,
                image: "",
                index: 0,
                routine: "",
                seconds: 0,
                ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
                x: 8,
                y: 19,
                direction: 6,
                animation: 40,
              },
              {
                verb: "tint",
                participant: "",
                skill: 0,
                state: 0,
                expect: "",
                cast: true,
                image: "",
                index: 0,
                routine: "",
                seconds: 2,
                ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
                tone: [ 17, -68, -68, 0 ],
              },
              {
                verb: "dialogue",
                participant: "mayor",
                skill: 0,
                state: 0,
                expect: "",
                cast: true,
                image: "",
                index: 0,
                routine: "",
                seconds: 0,
                ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
                animation: 56,
                face: "KH06-2_faces_MV_07",
                faceIndex: 3,
                speaker: "\\C[10]Cynder\\C[0]",
                lines: [ "\\pop[self]BRING IT", "second line" ],
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

  it("fills in an encounter that omits everything but its name and map, turning no switch on", () =>
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
        defeatSwitch: 0,
        participants: [],
        aiControl: "shared",
        routines: [],
        reactions: [],
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

  it("reads a routine written before routines could wait to be started as running from the first frame", () =>
  {
    // Arrange
    const noDormant = [ { key: "x", routines: [ { key: "r", cadence: 15 } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(noDormant);

    // Assert- the cadence proves this is the parsed routine, not a blank stand-in.
    expect(hydrated[ 0 ].routines[ 0 ].cadence)
      .toBe(15);
    expect(hydrated[ 0 ].routines[ 0 ].dormant)
      .toBe(false);
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

  it("falls back to using a skill when the authored verb is not one the plugin implements", () =>
  {
    // Arrange
    const unknownVerb = [ { key: "x", routines: [ { key: "r", steps: [ { verb: "teleport" } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(unknownVerb);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ].verb)
      .toBe("forceSkill");
  });

  it("keeps a verb the plugin implements rather than falling back", () =>
  {
    // Arrange
    const quickening = [ { key: "x", routines: [ { key: "r", steps: [ { verb: "quickenRoutine" } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(quickening);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ].verb)
      .toBe("quickenRoutine");
  });

  it("fills every field a step leaves out with its none, so switching verbs never meets a missing field", () =>
  {
    // Arrange
    const bareStep = [ { key: "x", routines: [ { key: "r", steps: [ { verb: "removeState" } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(bareStep);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ])
      .toEqual({
        verb: "removeState",
        participant: "",
        skill: 0,
        state: 0,
        expect: "",
        cast: true,
        image: "",
        index: 0,
        routine: "",
        seconds: 0,
        ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
      });
  });

  it("keeps only numbers in a tone, since nothing else could be a color", () =>
  {
    // Arrange
    const mixedTone = [ { key: "x", routines: [ { key: "r", steps: [ { verb: "tint", tone: [ 17, "red", null, 0 ] } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(mixedTone);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ].tone)
      .toEqual([ 17, 0 ]);
  });

  it("keeps only text in a line, since nothing else could be said", () =>
  {
    // Arrange
    const mixedLines = [ { key: "x", routines: [ { key: "r", steps: [ { verb: "dialogue", lines: [ "BRING IT", 7, "again" ] } ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(mixedLines);

    // Assert
    expect(hydrated[ 0 ].routines[ 0 ].steps[ 0 ].lines)
      .toEqual([ "BRING IT", "again" ]);
  });

  it("fills in a reaction that omits everything as one to the fight beginning, doing nothing yet", () =>
  {
    // Arrange
    const bareReaction = [ { key: "x", reactions: [ {} ] } ];

    // Act
    const hydrated = hydrateBossEncounters(bareReaction);

    // Assert
    expect(hydrated[ 0 ].reactions[ 0 ])
      .toEqual({ key: "", on: "start", participants: [], below: 0, steps: [] });
  });

  it("falls back to the fight beginning when a reaction answers a moment the plugin does not have", () =>
  {
    // Arrange
    const unknownMoment = [ { key: "x", reactions: [ { key: "typo", on: "fell" } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(unknownMoment);

    // Assert
    expect(hydrated[ 0 ].reactions[ 0 ].on)
      .toBe("start");
  });

  it("keeps only names in the bodies a reaction waits on, since nothing else could match a body", () =>
  {
    // Arrange
    const mixedBodies = [ { key: "x", reactions: [ { on: "fallen", participants: [ "golem", 3, null, "earthie" ] } ] } ];

    // Act
    const hydrated = hydrateBossEncounters(mixedBodies);

    // Assert
    expect(hydrated[ 0 ].reactions[ 0 ].participants)
      .toEqual([ "golem", "earthie" ]);
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

  it("reads a body written against an event as one with no tile chosen yet, leaving the event id behind", () =>
  {
    // Arrange- the shape bodies had before the plugin spawned them, when each one named an event.
    const retiredShape = [
      {
        key: "gluttonwolf",
        participants: [ { key: "mayor", eventId: 4, enemyId: 581, expect: "Gluttonwolf Mayor" } ],
      },
    ];

    // Act
    const hydrated = hydrateBossEncounters(retiredShape);

    // Assert
    expect(hydrated[ 0 ].participants[ 0 ])
      .toEqual({
        key: "mayor",
        enemyId: 581,
        expect: "Gluttonwolf Mayor",
        x: 0,
        y: 0,
        template: 0,
      });
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
 * Same contract as {@link withSkillSelection}, applied to the state a step puts on or takes off a body.
 */
describe("withStateSelection", () =>
{
  it("records the id and the name it was chosen under together", () =>
  {
    // Arrange
    const step = { ...createBossStep(), verb: "addState" as const };

    // Act
    const updated = withStateSelection(step, 2072, "Sealed");

    // Assert
    expect(updated.state)
      .toBe(2072);
    expect(updated.expect)
      .toBe("Sealed");
  });

  it("leaves the rest of the step untouched", () =>
  {
    // Arrange
    const step = { ...createBossStep(), verb: "addState" as const, participant: "earthie" };

    // Act
    const updated = withStateSelection(step, 2072, "Sealed");

    // Assert
    expect(updated.participant)
      .toBe("earthie");
    expect(updated.verb)
      .toBe("addState");
  });

  it("does not mutate the step it was given", () =>
  {
    // Arrange
    const step = createBossStep();

    // Act
    withStateSelection(step, 2072, "Sealed");

    // Assert
    expect(step.state)
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

  it("leaves the participant's own identity and tile untouched", () =>
  {
    // Arrange
    const participant = { ...createBossParticipant(), key: "mayor", x: 8, y: 14 };

    // Act
    const updated = withEnemySelection(participant, 582, "Vampire King");

    // Assert
    expect(updated.key)
      .toBe("mayor");
    expect(updated.x)
      .toBe(8);
    expect(updated.y)
      .toBe(14);
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

describe("withSpawnSelection", () =>
{
  it("records the id and the name it was chosen under together", () =>
  {
    // Arrange
    const step = { ...createBossStep(), verb: "spawn" as const };

    // Act
    const updated = withSpawnSelection(step, 511, "Ignihazard");

    // Assert
    expect(updated.enemyId)
      .toBe(511);
    expect(updated.expect)
      .toBe("Ignihazard");
  });

  it("leaves the rest of the step, its tile and template included, untouched", () =>
  {
    // Arrange
    const step = { ...createBossStep(), verb: "spawn" as const, x: 44, y: 16, template: 605 };

    // Act
    const updated = withSpawnSelection(step, 511, "Ignihazard");

    // Assert
    expect(updated.verb)
      .toBe("spawn");
    expect(updated.x)
      .toBe(44);
    expect(updated.y)
      .toBe(16);
    expect(updated.template)
      .toBe(605);
  });

  it("does not mutate the step it was given", () =>
  {
    // Arrange
    const step = createBossStep();

    // Act
    withSpawnSelection(step, 511, "Ignihazard");

    // Assert
    expect(step.enemyId)
      .toBe(0);
    expect(step.expect)
      .toBe("");
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
        participant: "",
        skill: 0,
        state: 0,
        expect: "",
        cast: true,
        image: "",
        index: 0,
        routine: "",
        seconds: 0,
        ...SPAWN_TINT_ANIMATION_DIALOGUE_NONES,
      });
  });

  it("starts a new reaction at the fight beginning, with one step so it is never empty on arrival", () =>
  {
    // Arrange
    // nothing to arrange; the factory takes no inputs.

    // Act
    const reaction = createBossReaction();

    // Assert
    expect(reaction.on)
      .toBe("start");
    expect(reaction.participants)
      .toEqual([]);
    expect(reaction.steps)
      .toHaveLength(1);
  });

  it("does not share nested structure between two new reactions", () =>
  {
    // Arrange
    const first = createBossReaction();
    const second = createBossReaction();

    // Act
    first.steps[ 0 ].state = 2072;
    first.participants.push("golem");

    // Assert
    expect(second.steps[ 0 ].state)
      .toBe(0);
    expect(second.participants)
      .toEqual([]);
  });

  it("starts a new body spawning from its enemy's own slot", () =>
  {
    // Arrange
    // nothing to arrange; the factory takes no inputs.

    // Act
    const participant = createBossParticipant();

    // Assert
    expect(participant.template)
      .toBe(0);
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

  it("starts a new encounter with one body, no routines, no reactions, and no defeat switch", () =>
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
    expect(encounter.reactions)
      .toEqual([]);
    expect(encounter.aiControl)
      .toBe("shared");
    expect(encounter.defeatSwitch)
      .toBe(0);
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
