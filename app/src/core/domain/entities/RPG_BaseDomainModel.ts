import RPG_Base = Rmmz.Base.RPG_Base;
import { NoteNormalizer } from "@services/utils/NoteNormalizer.ts";

/**
 * The architectural foundation for all domain-level entities that
 * wrap native RMMZ data objects. It enforces the "Capture and Overlay"
 * pattern and manages the note-tag lifecycle.
 */
abstract class RPG_BaseDomainModel<T extends RPG_Base>
{
  // Capture the original DTO to preserve unhandled fields (the "Capture")
  protected readonly _original: T;

  public id: number;
  public name: string;
  public note: string;

  constructor(data: T)
  {
    this._original = data;
    this.id = data.id;
    this.name = data.name;

    // Automatic normalization ensures a clean slate for all child parsers
    this.note = NoteNormalizer.normalize(data.note);
  }

  /**
   * Serializes the domain state back into the original RMMZ DTO format.
   * This is the "Overlay" part of the pattern.
   */
  public abstract toRmmz(): T;

  /**
   * Common helper for children to synchronize their specific
   * note-tags back into a single string.
   */
  protected abstract syncNote(): string;
}

export { RPG_BaseDomainModel };
