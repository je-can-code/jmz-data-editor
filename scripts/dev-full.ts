/// <reference types="bun-types" />

type HealthEnvelope = {
  path: string;
  error?: string;
  data?: {
    ok: boolean;
    projectRoot?: string;
    projectRootOk: boolean;
  };
};

type RunnerOptions = {
  apiBase: string;
  projectRoot: string;
};

function parseArgs(argv: string[]): Partial<RunnerOptions>
{
  const out: Partial<RunnerOptions> = {};

  for (let i = 0; i < argv.length; i++)
  {
    const a = argv[i];
    if (a === "--api-base")
    {
      out.apiBase = String(argv[i + 1] ?? "");
      i++;
      continue;
    }
    if (a === "--project-root")
    {
      out.projectRoot = String(argv[i + 1] ?? "");
      i++;
      continue;
    }
    if (a === "--help" || a === "-h")
    {
      // eslint-disable-next-line no-console
      console.log(
        [
          "dev-full: run Go API + Vite UI together.",
          "",
          "Options:",
          "  --project-root <path>   (defaults to JMZ_PROJECT_ROOT)",
          "  --api-base <origin>     (defaults to VITE_JMZ_API_BASE or http://127.0.0.1:8080)",
          "",
          "Examples:",
          "  JMZ_PROJECT_ROOT=/games/chef-adventure bun run dev",
          "  bun run dev --project-root /games/chef-adventure",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  return out;
}

function normalizeApiBase(s: string): string
{
  return s.trim().replace(/\/$/, "");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response>
{
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  try
  {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
  }
  finally
  {
    clearTimeout(handle);
  }
}

async function waitForHealth(apiBase: string, timeoutMs: number): Promise<boolean>
{
  const start = Date.now();
  const deadline = start + timeoutMs;
  const url = `${apiBase}/api/health`;
  let lastLoggedSecond = -1;

  while (Date.now() < deadline)
  {
    const now = Date.now();
    const remainingMs = Math.max(0, deadline - now);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    if (remainingSeconds !== lastLoggedSecond)
    {
      lastLoggedSecond = remainingSeconds;
      // eslint-disable-next-line no-console
      console.log(`[dev-full] waiting for backend health (${remainingSeconds}s before timeout): ${url}`);
    }

    try
    {
      const res = await fetchWithTimeout(url, 500);
      if (!res.ok)
      {
        await Bun.sleep(250);
        continue;
      }

      const json = await res.json() as HealthEnvelope;
      const ok = json.data?.ok === true;
      const rootOk = json.data?.projectRootOk === true;

      if (ok && rootOk)
      {
        // eslint-disable-next-line no-console
        console.log("[dev-full] backend is healthy.");
        return true;
      }
    }
    catch
    {
      // ignore until timeout.
    }

    await Bun.sleep(250);
  }

  // eslint-disable-next-line no-console
  console.error(`[dev-full] timed out waiting for backend health: ${url}`);
  return false;
}

type Subprocess = ReturnType<typeof Bun.spawn>;

function killProcessTree(proc: Subprocess | null | undefined): void
{
  if (!proc)
  {
    return;
  }

  const pid = typeof proc.pid === "number"
    ? proc.pid
    : 0;

  // First try: kill the whole process group (works best when spawned detached).
  if (pid > 0)
  {
    try
    {
      process.kill(-pid, "SIGTERM");
      return;
    }
    catch
    {
      // fall through.
    }
  }

  // Second try: kill just the parent process.
  try
  {
    proc.kill("SIGTERM");
  }
  catch
  {
    // ignore
  }
}

async function killProcessTreeHard(proc: Subprocess | null | undefined): Promise<void>
{
  if (!proc)
  {
    return;
  }

  const pid = typeof proc.pid === "number"
    ? proc.pid
    : 0;

  // Give the normal SIGTERM a moment.
  killProcessTree(proc);
  await Bun.sleep(250);

  if (pid > 0)
  {
    try
    {
      process.kill(-pid, "SIGKILL");
      return;
    }
    catch
    {
      // fall through.
    }
  }

  try
  {
    proc.kill("SIGKILL");
  }
  catch
  {
    // ignore
  }
}

async function main(): Promise<void>
{
  const overrides = parseArgs(process.argv.slice(2));

  const projectRoot = (overrides.projectRoot ?? process.env.JMZ_PROJECT_ROOT ?? "").trim();
  if (projectRoot === "")
  {
    // eslint-disable-next-line no-console
    console.error("JMZ_PROJECT_ROOT is required (or pass --project-root).");
    process.exit(1);
  }

  const apiBase = normalizeApiBase(
    overrides.apiBase
    ?? process.env.VITE_JMZ_API_BASE
    ?? "http://127.0.0.1:8080",
  );

  // eslint-disable-next-line no-console
  console.log(`[dev-full] apiBase=${apiBase}`);
  // eslint-disable-next-line no-console
  console.log(`[dev-full] JMZ_PROJECT_ROOT=${projectRoot}`);

  let server: Bun.Subprocess | null = null;
  let ui: Bun.Subprocess | null = null;
  let exiting = false;

  const shutdown = async (code: number) =>
  {
    if (exiting)
    {
      return;
    }
    exiting = true;

    // Best-effort: give the processes a moment to die before we exit.
    // If we call process.exit() immediately, the Go child binary can outlive the runner and keep 8080 bound.
    await Promise.allSettled([
      killProcessTreeHard(ui),
      killProcessTreeHard(server),
    ]);

    process.exitCode = code;
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  process.on("exit", () =>
  {
    // best-effort cleanup when the process exits unexpectedly.
    killProcessTree(ui);
    killProcessTree(server);
  });
  process.on("uncaughtException", (err) =>
  {
    // eslint-disable-next-line no-console
    console.error(err);
    void shutdown(1);
  });
  process.on("unhandledRejection", (err) =>
  {
    // eslint-disable-next-line no-console
    console.error(err);
    void shutdown(1);
  });

  try
  {
    server = Bun.spawn(
      [ "go", "run", "./cmd/api" ],
      {
        cwd: "server",
        env: {
          ...process.env,
          JMZ_PROJECT_ROOT: projectRoot,
        },
        stdout: "inherit",
        stderr: "inherit",
        stdin: "ignore",
        detached: true,
      },
    );

    server.exited.then((code) =>
    {
      // If the server exits, bring everything down so we don't leave the UI running.
      void shutdown(code ?? 1);
    }).catch(() =>
    {
      void shutdown(1);
    });

    const healthy = await waitForHealth(apiBase, 5_000);
    if (healthy === false)
    {
      await shutdown(1);
      return;
    }

    ui = Bun.spawn(
      [ "bun", "run", "start" ],
      {
        cwd: "app",
        env: {
          ...process.env,
          VITE_JMZ_API_BASE: apiBase,
        },
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      },
    );

    const uiCode = await ui.exited;
    await shutdown(uiCode ?? 0);
  }
  catch (err)
  {
    // eslint-disable-next-line no-console
    console.error(err);
    await shutdown(1);
  }
}

void main();

