import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  loadIconSetPng,
  normalizeProjectDataPathForFilesystem,
  resolveIconSetPngPath,
} from "@services/ImageService.ts";
import { useProjectPath } from "@presentation/context/project-path.context.tsx";

type IconSetAtlasValue = {
  atlasUrl: string | null;
  imgWidth: number;
  imgHeight: number;
  loadError: string | null;
  resolvedPath: string;
};

const defaultValue: IconSetAtlasValue = {
  atlasUrl: null,
  imgWidth: 0,
  imgHeight: 0,
  loadError: null,
  resolvedPath: "",
};

const Ctx = createContext<IconSetAtlasValue>(defaultValue);

/**
 * Decodes PNG dimensions without keeping a second object URL (falls back to {@code Image} when needed).
 * @param buf Raw PNG bytes.
 */
async function decodePngDimensions(buf: ArrayBuffer): Promise<{ w: number; h: number }>
{
  const blob = new Blob([ buf ], { type: "image/png" });
  if (typeof createImageBitmap === "function")
  {
    const bmp = await createImageBitmap(blob);
    const w = bmp.width;
    const h = bmp.height;
    bmp.close();
    return {
      w,
      h,
    };
  }
  return await new Promise<{ w: number; h: number }>((resolve, reject) =>
  {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () =>
    {
      resolve({
        w: img.naturalWidth,
        h: img.naturalHeight,
      });
      URL.revokeObjectURL(url);
    };
    img.onerror = () =>
    {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode IconSet.png dimensions."));
    };
    img.src = url;
  });
}

/**
 * Loads {@code IconSet.png} once per {@link useProjectPath} project root so icon pickers do not re-read the file on each board mount.
 */
function IconSetAtlasProvider({ children }: { children: React.ReactNode })
{
  const { projectRoot, projectReloadGeneration } = useProjectPath();

  const [ atlasUrl, setAtlasUrl ] = useState<string | null>(null);
  const [ imgWidth, setImgWidth ] = useState(0);
  const [ imgHeight, setImgHeight ] = useState(0);
  const [ loadError, setLoadError ] = useState<string | null>(null);

  const objectUrlRef = useRef<string | null>(null);

  const resolvedPath = useMemo(() =>
  {
    if (projectRoot.trim() === "")
    {
      return "";
    }
    return resolveIconSetPngPath(projectRoot);
  }, [ projectRoot ]);

  useEffect(() =>
  {
    if (objectUrlRef.current !== null)
    {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setAtlasUrl(null);
    setImgWidth(0);
    setImgHeight(0);
    setLoadError(null);

    if (projectRoot.trim() === "")
    {
      setLoadError("No project root.");
      return;
    }

    let cancelled = false;

    (async () =>
    {
      try
      {
        const normalized = normalizeProjectDataPathForFilesystem(projectRoot);
        const buf = await loadIconSetPng(normalized);
        if (cancelled)
        {
          return;
        }
        const { w, h } = await decodePngDimensions(buf);
        if (cancelled)
        {
          return;
        }
        const blob = new Blob([ buf ], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setImgWidth(w);
        setImgHeight(h);
        setAtlasUrl(url);
        setLoadError(null);
      }
      catch (e: unknown)
      {
        if (cancelled)
        {
          return;
        }
        const msg = e instanceof Error
          ? e.message
          : "Could not load IconSet.png.";
        setLoadError(msg);
      }
    })();

    return () =>
    {
      cancelled = true;
      if (objectUrlRef.current !== null)
      {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [ projectRoot, projectReloadGeneration ]);

  const value = useMemo((): IconSetAtlasValue => (
    {
      atlasUrl,
      imgWidth,
      imgHeight,
      loadError,
      resolvedPath,
    }
  ), [
    atlasUrl,
    imgHeight,
    imgWidth,
    loadError,
    resolvedPath,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useIconSetAtlas(): IconSetAtlasValue
{
  return useContext(Ctx);
}

export {
  IconSetAtlasProvider,
  useIconSetAtlas,
  type IconSetAtlasValue,
};
