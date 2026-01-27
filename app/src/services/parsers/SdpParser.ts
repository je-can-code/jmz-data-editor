import { NoteNormalizer } from "../utils/NoteNormalizer.ts";
import NoteReader from "@services/utils/NoteReader.ts";

type SdpDropData = {
  key: string;
  dropChance: number;
};

class SdpParser
{
  static #dropRegex = /<sdpDropData: ?(\[[-\w]+, ?\d+])>/gi;
  static #pointsRegex = /<sdpPoints:\s*(-?\d+)>/gi;

  /**
   * Reads the SDP drop data from a note.
   * @param note The note to parse.
   * @returns The SDP drop data or null if not found.
   */
  static readDrop(note: string): SdpDropData | null
  {
    const result = NoteReader.getArraysFromNotesByRegex(note, this.#dropRegex, true);

    if (result && result.length > 0)
    {
      const [ key, dropChance ] = result[0];
      return {
        key: String(key),
        dropChance: Number(dropChance) || 0
      };
    }
    return null;

    return null;
  }

  static writeDrop(originalNote: string, sdpData: SdpDropData): string
  {
    // empty key => remove any existing drop lines and normalize
    if (!sdpData.key.trim())
    {
      return NoteNormalizer.removeLinesMatching(originalNote, this.#dropRegex);
    }

    const newTag = `<sdpDropData: [${sdpData.key},${sdpData.dropChance}]>`;

    // ensure only one tag remains by removing then appending
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#dropRegex);
    return NoteNormalizer.appendBlock(base, newTag);
  }

  static deleteDrop(originalNote: string): string
  {
    return NoteNormalizer.removeLinesMatching(originalNote, this.#dropRegex);
  }

  /**
   * Reads the SDP points value from a note.
   * @param note The note to parse.
   * @returns The SDP points value or null if not found.
   */
  static readPoints(note: string): number | null
  {
    const match = note.match(this.#pointsRegex);
    if (match)
    {
      return parseInt(match[1]);
    }

    return null;
  }

  /**
   * Writes SDP points value to a note.
   * @param originalNote The original note to update.
   * @param points The SDP points value to write.
   * @returns The updated note.
   */
  static writePoints(originalNote: string, points: number): string
  {
    const newTag = `<sdpPoints: ${points}>`;

    // ensure only one points tag by removing then appending
    const base = NoteNormalizer.removeLinesMatching(originalNote, this.#pointsRegex);
    return NoteNormalizer.appendBlock(base, newTag);
  }
}

export { SdpParser };
