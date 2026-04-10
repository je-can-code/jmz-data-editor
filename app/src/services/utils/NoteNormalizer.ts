class NoteNormalizer
{
  /**
   * Normalizes line endings and reduces blank lines:
   * - Converts CRLF/CR to LF
   * - Collapses multiple blank lines to a single LF
   * - Trims at both ends
   */
  static normalize(input: string): string
  {
    let s = (input ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // collapse 2+ newlines to a single newline
    s = s.replace(/\n{2,}/g, '\n');

    // trim both ends
    s = s.trim();

    return s;
  }

  /**
   * Removes any lines matching the regex, then normalizes.
   */
  static removeLinesMatching(
    input: string,
    regex: RegExp
  ): string
  {
    const asLf = (input ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const filtered = asLf
      .split('\n')
      .filter(line =>
      {
        regex.lastIndex = 0;
        return !regex.test(line);
      })
      .join('\n');

    return NoteNormalizer.normalize(filtered);
  }

  /**
   * Appends a block to a base text with a single separating newline (if both present),
   * then normalizes the result.
   */
  static appendBlock(
    base: string,
    block: string
  ): string
  {
    const left = NoteNormalizer.normalize(base);
    const right = NoteNormalizer.normalize(block);

    const joined = [ left, right ]
      .filter(Boolean)
      .join('\n');

    return NoteNormalizer.normalize(joined);
  }

  static prependBlock(
    base: string,
    block: string
  ): string
  {
    const left = NoteNormalizer.normalize(base);
    const right = NoteNormalizer.normalize(block);
    const joined = right.length > 0
      ? [ right, left ].filter(Boolean)
        .join('\n')
      : left;
    return NoteNormalizer.normalize(joined);
  }

  static replaceOrAppendInline(
    base: string,
    regex: RegExp,
    newTag: string
  ): string
  {
    const lf = NoteNormalizer.normalize(base);
    const lines = lf.split('\n');

    let replaced = false;
    const out = lines.map(line =>
    {
      regex.lastIndex = 0;
      if (!replaced && regex.test(line))
      {
        replaced = true;
        return newTag;
      }

      return line;
    });

    if (!replaced)
    {
      out.push(newTag);
    }

    return NoteNormalizer.normalize(out.join('\n'));
  }

}

export { NoteNormalizer };
