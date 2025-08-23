import { NoteNormalizer } from "../utils/NoteNormalizer.ts";

type SdpDropData = {
  key: string;
  dropChance: number;
};

class SdpParser
{
  static #dropRegex = /<sdpDropData: ?(\[[-\w]+, ?\d+])>/i;
  static #pointsRegex = /<sdpPoints:\s*(-?\d+)>/i;

  /**
   * Reads the SDP drop data from a note.
   * @param note The note to parse.
   * @returns The SDP drop data or null if not found.
   */
  static readDrop(note: string): SdpDropData | null
  {
    const match = note.match(this.#dropRegex);
    if (match)
    {
      // Extract the array content without brackets
      const arrayContent = match[1].replace(/^\[|]$/g, '');
      const parts = arrayContent.split(',')
        .map(part => part.trim());

      const key = parts[0];
      const dropChance = parseInt(parts[1]);

      // Extract the key, itemId, and dropChance
      return {
        key,
        dropChance,
      };
    }

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