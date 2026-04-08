import { describe, expect, it } from "vitest";
import { SkillExtendParser } from "../../../src/services/parsers/SkillExtendParser.ts";
import { NoteNormalizer } from "../../../src/services/utils/NoteNormalizer.ts";

describe("SkillExtendParser", () =>
{
  it("readBaseSkillIds merges tags in order and dedupes", () =>
  {
    const note = "x\n<skillExtend:[3, 1]>\n<skillExtend:[1, 2]>";
    expect(SkillExtendParser.readBaseSkillIds(note)).toEqual([ 3, 1, 2 ]);
  });

  it("readBaseSkillIds ignores invalid tokens", () =>
  {
    const note = "<skillExtend:[1, bad, 2]>";
    expect(SkillExtendParser.readBaseSkillIds(note)).toEqual([ 1, 2 ]);
  });

  it("readBaseSkillIds is case-insensitive on tag name", () =>
  {
    const note = "<SKILLEXTEND:[5]>";
    expect(SkillExtendParser.readBaseSkillIds(note)).toEqual([ 5 ]);
  });

  it("writeSkillExtend strips prior tags and prepends one", () =>
  {
    const start = "<skillExtend:[9]>\nkeep\n<skillExtend:[1]>";
    const out = SkillExtendParser.writeSkillExtend(start, [ 4, 5 ]);
    expect(out).toContain("<skillExtend:[4,5]>");
    expect(out.includes("9")).toBe(false);
    expect(out).toContain("keep");
  });

  it("writeSkillExtend clears when ids empty", () =>
  {
    const cleared = SkillExtendParser.writeSkillExtend("<skillExtend:[1]>\na", []);
    expect(NoteNormalizer.normalize(cleared)).toBe("a");
  });
});
