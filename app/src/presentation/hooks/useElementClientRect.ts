import {
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

type ElementSize = {
  width: number;
  height: number;
};

/**
 * Tracks the client width and height of a DOM element via {@link ResizeObserver}.
 *
 * @param ref Element whose {@code clientWidth} / {@code clientHeight} are observed.
 * @returns Last measured size; zeros before the first layout pass.
 */
function useElementClientRect(
  ref: RefObject<HTMLElement | null>
): ElementSize
{
  const [ size, setSize ] = useState<ElementSize>({ width: 0, height: 0 });

  useLayoutEffect(() =>
  {
    const el = ref.current;
    if (!el)
    {
      return;
    }

    const measure = () =>
    {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      if (w > 0 && h > 0)
      {
        setSize({ width: w, height: h });
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () =>
    {
      ro.disconnect();
    };
  }, [ ref ]);

  return size;
}

export {
  useElementClientRect,
};
export type { ElementSize };
