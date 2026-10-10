import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * A hook that synchronizes a board's selection with a URL query parameter.
 *
 * The row a link names is read from the router's query, not the page's own: the data editor routes inside the hash, so
 * the page's own query is always empty, and a board reading it would never see the row a link names.
 * @param {string} paramKey The key of the query parameter (e.g., 'enemyId', 'sdpKey').
 * @param {T[]} dataList The list of items to search through.
 * @param {(item: T) => string | number} idAccessor A function to get the unique ID from an item.
 * @param {(index: number) => void} onSelect A callback to trigger when a new selection is detected in the URL.
 * @param {(index: number) => void} onScroll A callback to trigger scrolling to the selected item.
 * @returns {{ updateUrl: (item: T) => void, linkedIndex: number }} Puts an item's ID in the URL; and the index of the
 * row the URL links to, or -1 when it links to none in the list. While a link names a row, the board holds off choosing
 * its first row for itself, so a link from outside the board, such as another board's or another window's, lands on
 * the row it names.
 */
export function useUrlSelection<T>(
  paramKey: string,
  dataList: T[],
  idAccessor: (item: T) => string | number,
  onSelect: (index: number) => void,
  onScroll: (index: number) => void
)
{
  const location = useLocation();
  const navigate = useNavigate();

  const targetId = new URLSearchParams(location.search).get(paramKey);
  const linkedIndex = targetId
    ? dataList.findIndex(item => item && String(idAccessor(item)) === targetId)
    : -1;

  /**
   * A listener for when the URL search parameters change.
   */
  useEffect(() =>
  {
    if (linkedIndex !== -1)
    {
      onSelect(linkedIndex);
      requestAnimationFrame(() => onScroll(linkedIndex));
    }
  }, [ location.search, dataList.length ]);

  /**
   * Updates the URL to include the selected item's ID while preserving other params.
   */
  const updateUrl = (item: T) =>
  {
    const id = idAccessor(item);
    const params = new URLSearchParams(window.location.search);
    params.set(paramKey, String(id));

    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  return { updateUrl, linkedIndex };
}
