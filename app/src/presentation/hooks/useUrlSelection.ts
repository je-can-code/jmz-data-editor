import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * A hook that synchronizes a board's selection with a URL query parameter.
 * @param {string} paramKey The key of the query parameter (e.g., 'enemyId', 'sdpKey').
 * @param {T[]} dataList The list of items to search through.
 * @param {(item: T) => string | number} idAccessor A function to get the unique ID from an item.
 * @param {number} selectedIndex The currently selected index in the component state.
 * @param {(index: number) => void} onSelect A callback to trigger when a new selection is detected in the URL.
 * @param {(index: number) => void} onScroll A callback to trigger scrolling to the selected item.
 */
export function useUrlSelection<T>(
  paramKey: string,
  dataList: T[],
  idAccessor: (item: T) => string | number,
  selectedIndex: number,
  onSelect: (index: number) => void,
  onScroll: (index: number) => void
)
{
  const location = useLocation();
  const navigate = useNavigate();

  /**
   * A listener for when the URL search parameters change.
   */
  useEffect(() =>
  {
    const params = new URLSearchParams(location.search);
    const targetId = params.get(paramKey);

    if (targetId && dataList.length > 0)
    {
      const index = dataList.findIndex(item => item && String(idAccessor(item)) === String(targetId));

      if (index !== -1 && index !== selectedIndex)
      {
        onSelect(index);
        onScroll(index);
      }
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

  return { updateUrl };
}
