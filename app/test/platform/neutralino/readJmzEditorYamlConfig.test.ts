/**
 * @vitest-environment jsdom
 */

import {
  afterEach,
  describe,
  expect,
  it
} from "vitest";
import { candidateJmzEditorConfigYamlAbsolutePaths } from "../../../src/platform/neutralino/readJmzEditorYamlConfig";

describe("candidateJmzEditorConfigYamlAbsolutePaths", () =>
{
  const original = typeof window !== "undefined"
    ? window.NL_PATH
    : undefined;

  afterEach(() =>
  {
    if (typeof window === "undefined")
    {
      return;
    }
    if (original === undefined)
    {
      delete window.NL_PATH;
    }
    else
    {
      window.NL_PATH = original;
    }
  });

  it("returns an empty list when NL_PATH is unset", () =>
  {
    delete window.NL_PATH;
    expect(candidateJmzEditorConfigYamlAbsolutePaths())
      .toEqual([]);
  });

  it("joins .config/config.yaml under NL_PATH", () =>
  {
    window.NL_PATH = "/repo";
    expect(candidateJmzEditorConfigYamlAbsolutePaths())
      .toEqual([ "/repo/.config/config.yaml" ]);
  });

  it("tries the parent directory when NL_PATH ends with app", () =>
  {
    window.NL_PATH = "/repo/app";
    expect(candidateJmzEditorConfigYamlAbsolutePaths())
      .toEqual([
        "/repo/app/.config/config.yaml",
        "/repo/.config/config.yaml",
      ]);
  });

  it("uses backslashes when NL_PATH contains them", () =>
  {
    window.NL_PATH = "C:\\games\\jmz-data-editor\\app";
    expect(candidateJmzEditorConfigYamlAbsolutePaths())
      .toEqual([
        "C:\\games\\jmz-data-editor\\app\\.config\\config.yaml",
        "C:\\games\\jmz-data-editor\\.config\\config.yaml",
      ]);
  });
});
