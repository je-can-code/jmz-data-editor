import {
  describe,
  expect,
  it
} from "vitest";
import { RPG_EnemyDomainModel } from "@core/domain/entities/RPG_EnemyDomainModel.ts";
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;

describe("EnemyDomainModel", () =>
{
  /**
   * Helper to create a mock RMMZ enemy object.
   */
  const createMockRmmzEnemy = (overrides: Partial<RPG_Enemy> = {}): RPG_Enemy =>
  {
    return {
      id: 1,
      name: "Slime",
      exp: 10,
      gold: 5,
      params: [ 100, 10, 10, 10, 10, 10, 10, 10 ],
      traits: [],
      note: "",
      actions: [],
      battlerHue: 0,
      battlerName: "Slime",
      dropItems: [],
      ...overrides,
    } as RPG_Enemy;
  };

  it("should correctly handle a full Round-Trip (DTO -> Model -> DTO)", () =>
  {
    const originalNote = "<level:5>\n<maxTp:100>\n<sdpPoints:50>";
    const rmmz = createMockRmmzEnemy({ note: originalNote });

    const model = new RPG_EnemyDomainModel(rmmz);

    // Check initial parsing
    expect(model.level)
      .toBe(5);
    expect(model.maxTp)
      .toBe(100);
    expect(model.sdpPoints)
      .toBe(50);

    // Modify properties
    model.level = 10;
    model.name = "Giant Slime";

    const result = model.toRmmz();

    // Verify DTO updates
    expect(result.name)
      .toBe("Giant Slime");
    expect(result.note)
      .toContain("<level:10>");
    expect(result.note)
      .toContain("<maxTp:100>");
    // Ensure original RMMZ fields are preserved
    expect(result.battlerName)
      .toBe("Slime");
  });

  it("should normalize messy notes and handle whitespace gracefully", () =>
  {
    const rmmz = createMockRmmzEnemy({
      note: "  <level: 5>  \r\n\r\n  <maxTp: 100>  \n<sdpPoints: 50>"
    });

    const model = new RPG_EnemyDomainModel(rmmz);

    // Internal state should be clean
    expect(model.level)
      .toBe(5);
    expect(model.maxTp)
      .toBe(100);

    const result = model.toRmmz();

    // Output should be standardized (Standard parsers remove leading/trailing spaces in tags)
    expect(result.note)
      .toContain("<level:5>");
    expect(result.note)
      .toContain("<maxTp:100>");
    // NoteNormalizer collapses newlines and converts CRLF to LF
    expect(result.note)
      .not
      .toContain("\r");
    expect(result.note.split("\n").length)
      .toBeLessThan(5);
  });

  it("should enforce AI Trait mutual exclusivity (Leader vs Follower)", () =>
  {
    const model = new RPG_EnemyDomainModel(createMockRmmzEnemy({ note: "<aiTrait:leader>" }));
    expect(model.jabsAiTraits.leader)
      .toBe(true);

    // Simulating Toggle: User adds 'follower' while 'leader' is active
    const currentTraits = [ "leader" ];
    const newTraits = [ "leader", "follower" ];
    model.jabsAiTraits.updateFromStrings(newTraits, currentTraits);

    expect(model.jabsAiTraits.follower)
      .toBe(true);
    expect(model.jabsAiTraits.leader)
      .toBe(false);

    const result = model.toRmmz();
    expect(result.note)
      .toContain("<aiTrait:follower>");
    expect(result.note)
      .not
      .toContain("<aiTrait:leader>");
  });

  it("should enforce JABS Config mutual exclusivity via updateConfig", () =>
  {
    const model = new RPG_EnemyDomainModel(createMockRmmzEnemy());

    // Set Invincible
    model.jabsConfigs.updateConfig("invincible", true);
    expect(model.jabsConfigs.invincible)
      .toBe(true);
    expect(model.jabsConfigs.notInvincible)
      .toBe(false);

    // Toggle Not Invincible
    model.jabsConfigs.updateConfig("notInvincible", true);
    expect(model.jabsConfigs.notInvincible)
      .toBe(true);
    expect(model.jabsConfigs.invincible)
      .toBe(false);

    const result = model.toRmmz();
    expect(result.note)
      .toContain("<jabsConfig:notInvincible>");
  });

  it("should handle SDP data and parameter growth formulas", () =>
  {
    const rmmz = createMockRmmzEnemy({
      note: "<sdpDropData: [SlimePanel,50]>\n<atkBuffPlus:[a.level * 2]>"
    });

    const model = new RPG_EnemyDomainModel(rmmz);

    expect(model.sdpDrop.key)
      .toBe("SlimePanel");
    // ID 2 corresponds to 'atk' in RPG Maker
    expect(model.growths.get(2))
      .toBe("a.level * 2");

    model.growths.set(2, "a.level * 5");
    const result = model.toRmmz();
    expect(result.note)
      .toContain("<atkBuffPlus:[a.level * 5]>");
  });

  it("should handle malformed or missing data without crashing", () =>
  {
    const rmmz = createMockRmmzEnemy({
      note: "<level: NaN>\n<maxTp: -50>\n<sdpDropData: [Invalid]>"
    });

    const model = new RPG_EnemyDomainModel(rmmz);

    // Should fall back to safe defaults where parsing fails
    expect(model.level)
      .toBe(0);
    expect(model.sdpDrop.key)
      .toBe("");

    // Note: maxTp currently allows negatives based on Parser implementation
    expect(model.maxTp)
      .toBe(-50);

    const result = model.toRmmz();
    expect(result.note)
      .toBeDefined();
  });
});
