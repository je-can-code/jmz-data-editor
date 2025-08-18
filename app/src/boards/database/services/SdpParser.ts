type SdpDropData = {
  key: string;
  dropChance: number;
};

class SdpParser
{
  static #dropRegex = /<sdpDropData: ?(\[[-\w]+, ?\d+])>/i;
  static #pointsRegex = /<sdpPoints: ?-?([\d+]+)>/i

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
      const parts = arrayContent.split(',').map(part => part.trim());

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
  /**
   * Writes SDP drop data to a note.
   * @param originalNote The original note to update.
   * @param sdpData The SDP drop data to write.
   * @returns The updated note.
   */
  static writeDrop(originalNote: string, sdpData: SdpDropData): string
  {
    // Skip updating if key is empty
    if (!sdpData.key.trim())
    {
      // If there's an existing tag, remove it
      if (originalNote.match(this.#dropRegex))
      {
        return originalNote.replace(this.#dropRegex, "");
      }

      return originalNote;
    }

    const newTag = `<sdpDropData: [${sdpData.key},${sdpData.dropChance}]>`;

    let newNote = originalNote;
    if (originalNote.match(this.#dropRegex))
    {
      // Replace existing tag
      newNote = originalNote.replace(this.#dropRegex, newTag);
    }
    else
    {
      // Add new tag
      newNote = `${newNote}\n${newTag}`;
    }

    return this.#cleanupLineEndings(newNote);
  }

  static deleteDrop(originalNote: string): string
  {
    return originalNote.replace(this.#dropRegex, "");
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

    let newNote = originalNote;
    if (originalNote.match(this.#pointsRegex))
    {
      // Replace existing tag
      newNote = originalNote.replace(this.#pointsRegex, newTag);
    }
    else
    {
      // Add new tag
      newNote = `${newNote}\n${newTag}`;
    }

    return this.#cleanupLineEndings(newNote);
  }

  static #cleanupLineEndings(note: string): string
  {
    return note
      .replace(/\r\r/gmi, '\r')
      .replace(/\n\n/gmi, '\n')
      .trim();
  }
}

export { SdpParser };