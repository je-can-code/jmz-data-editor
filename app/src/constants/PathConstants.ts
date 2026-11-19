/**
 * @param projectRoot Absolute path to the RMMZ project root (parent of {@code data}).
 * @returns Absolute path to the {@code data} directory for JSON database files.
 */
function resolveRmmzDataDirectory(projectRoot: string): string
{
  const root = projectRoot.trim()
    .replace(/[/\\]+$/u, '');
  if (root.length === 0)
  {
    return '';
  }

  const sep = root.includes('\\')
    ? '\\'
    : '/';
  return `${root}${sep}data`;
}

export {
  resolveRmmzDataDirectory,
};
