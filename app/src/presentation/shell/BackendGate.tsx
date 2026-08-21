import React from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { HashRouter } from "react-router-dom";
import { AppRouter } from "@presentation/routing/app.router.tsx";
import { AppProviders } from "@presentation/shell/app.providers.tsx";

type HealthEnvelope = {
  path: string;
  error?: string;
  data?: {
    ok: boolean;
    projectRoot?: string;
    projectRootOk: boolean;
  };
};

type BackendState =
  | { type: "checking" }
  | { type: "missing-api-base" }
  | { type: "unreachable"; apiBase: string }
  | { type: "missing-project-root"; apiBase: string }
  | { type: "ready"; apiBase: string };

type BackendGateProps = {
  apiBase: string | null;
};

const BackendGate = (props: BackendGateProps) =>
{
  const { apiBase } = props;

  const [ state, setState ] = React.useState<BackendState>(() =>
  {
    if (apiBase === null)
    {
      return { type: "missing-api-base" };
    }
    return { type: "checking" };
  });

  React.useEffect(() =>
  {
    if (apiBase === null)
    {
      return;
    }

    let cancelled = false;

    const probeBackendHealth = async () =>
    {
      try
      {
        const res = await fetch(`${apiBase}/api/health`, { method: "GET" });
        if (!res.ok)
        {
          if (!cancelled)
          {
            setState({ type: "unreachable", apiBase });
          }
          return;
        }

        const json = await res.json() as HealthEnvelope;
        if (cancelled)
        {
          return;
        }

        if (json.error && json.error.trim().length > 0)
        {
          setState({ type: "unreachable", apiBase });
          return;
        }

        const ok = json.data?.ok === true;
        const rootOk = json.data?.projectRootOk === true;

        if (!ok)
        {
          setState({ type: "unreachable", apiBase });
          return;
        }

        if (!rootOk)
        {
          setState({ type: "missing-project-root", apiBase });
          return;
        }

        setState({ type: "ready", apiBase });
      }
      catch
      {
        if (!cancelled)
        {
          setState({ type: "unreachable", apiBase });
        }
      }
    };

    // An effect body cannot be async, so the probe is started and not awaited.
    probeBackendHealth();

    return () =>
    {
      cancelled = true;
    };
  }, [ apiBase ]);

  if (state.type === "ready")
  {
    return (
      <HashRouter>
        <AppProviders>
          <AppRouter/>
        </AppProviders>
      </HashRouter>
    );
  }

  const content = (() =>
  {
    switch (state.type)
    {
      case "checking":
        return (
          <>
            <CircularProgress/>
            <Typography variant={"h6"}>Checking backend…</Typography>
            <Typography variant={"body2"} color={"text.secondary"}>
              Looking for `GET /api/health`.
            </Typography>
          </>
        );
      case "missing-api-base":
        return (
          <>
            <Typography variant={"h5"}>Backend not configured</Typography>
            <Typography variant={"body2"} color={"text.secondary"}>
              Set `VITE_JMZ_API_BASE` (or run in dev where it defaults to `http://127.0.0.1:8080`).
            </Typography>
          </>
        );
      case "missing-project-root":
        return (
          <>
            <Typography variant={"h5"}>Backend is up, but project root is missing</Typography>
            <Typography variant={"body2"} color={"text.secondary"}>
              Set `JMZ_PROJECT_ROOT` for the Go server and restart it.
            </Typography>
            <Typography variant={"body2"} color={"text.secondary"}>
              API base: {state.apiBase}
            </Typography>
          </>
        );
      case "unreachable":
        return (
          <>
            <Typography variant={"h5"}>Backend not reachable</Typography>
            <Typography variant={"body2"} color={"text.secondary"}>
              Start the Go server and try again.
            </Typography>
            <Typography variant={"body2"} color={"text.secondary"}>
              API base: {state.apiBase}
            </Typography>
          </>
        );
    }
  })();

  return (
    <Box sx={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 2,
      p: 2,
      textAlign: "center",
    }}>
      {content}
    </Box>
  );
};

export { BackendGate };

