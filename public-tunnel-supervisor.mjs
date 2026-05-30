import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendFile, writeFile } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_PORT = Number(process.env.TARGET_PORT || process.env.PORT || 8787);
const LOCAL_URL = `http://127.0.0.1:${TARGET_PORT}/`;
const HEALTH_INTERVAL_MS = 25_000;
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 45_000;
const PUBLIC_FAILURE_LIMIT = 2;
const LOCAL_FAILURE_LIMIT = 4;
const SSH_PATH = "C:/WINDOWS/System32/OpenSSH/ssh.exe";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const PROVIDER_COOKIE = "agreed=1";

const outFile = path.join(__dirname, "public-supervisor.out.log");
const errFile = path.join(__dirname, "public-supervisor.err.log");
const urlFile = path.join(__dirname, "public-url.txt");
const pidFile = path.join(__dirname, "public-supervisor.pid");
const stateFile = path.join(__dirname, "public-tunnel-state.json");

let shuttingDown = false;
let currentTunnel = null;

await writeFile(outFile, "", "utf8");
await writeFile(errFile, "", "utf8");
await writeFile(pidFile, String(process.pid), "utf8");
await writePublicUrl("");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logLine(file, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(file, line, "utf8");
}

async function setPublicState(payload) {
  await writeFile(stateFile, JSON.stringify(payload, null, 2), "utf8");
}

async function writePublicUrl(url) {
  await writeFile(urlFile, url ?? "", "utf8");
  await setPublicState({
    updatedAt: new Date().toISOString(),
    url: url ?? "",
    localUrl: LOCAL_URL,
    provider: "optimistixtunnel",
    pid: process.pid,
  });
}

async function fetchWithTimeout(url, timeoutMs = 12_000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      headers: {
        "User-Agent": BROWSER_UA,
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function isHealthyPage(url, includeCookie = false) {
  try {
    const response = await fetchWithTimeout(url, 15_000, {
      headers: includeCookie ? { Cookie: PROVIDER_COOKIE } : {},
    });

    if (!response.ok) {
      return false;
    }

    const text = await response.text();
    return /WOFORY|Vista simple para validar/i.test(text);
  } catch {
    return false;
  }
}

async function isLocalHealthy() {
  return await isHealthyPage(LOCAL_URL);
}

async function isPublicHealthy(url) {
  return await isHealthyPage(url, true);
}

function extractTunnelUrl(chunk) {
  const text = chunk.toString();
  const match = text.match(/https:\/\/[a-z0-9.-]+\.otnl\.link/i);
  return match?.[0] ?? null;
}

async function startTunnel() {
  const child = spawn(
    SSH_PATH,
    [
      "-p",
      "1122",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3",
      "-R",
      `80:127.0.0.1:${TARGET_PORT}`,
      "ssh.optimistixtunnel.com",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  const wrapped = {
    child,
    url: "",
    closed: false,
  };

  currentTunnel = wrapped;

  child.stdout.on("data", async (chunk) => {
    const text = chunk.toString();
    await appendFile(outFile, text, "utf8");

    if (!wrapped.url) {
      const url = extractTunnelUrl(text);
      if (url) {
        wrapped.url = url;
        await writePublicUrl(url);
        await logLine(outFile, `tunnel abierto en ${url}`);
      }
    }
  });

  child.stderr.on("data", async (chunk) => {
    await appendFile(errFile, chunk.toString(), "utf8");
  });

  child.on("exit", async (code, signal) => {
    wrapped.closed = true;
    await logLine(errFile, `ssh exit code=${code ?? "null"} signal=${signal ?? "null"}`);
  });

  return await waitForTunnelUrl(wrapped);
}

async function waitForTunnelUrl(wrapped) {
  const startedAt = Date.now();

  while (!shuttingDown && !wrapped.closed && Date.now() - startedAt < 20_000) {
    if (wrapped.url) {
      return wrapped;
    }
    await sleep(250);
  }

  await stopTunnel(wrapped);
  throw new Error("No se pudo obtener URL publica del tunnel");
}

async function stopTunnel(wrapped) {
  if (!wrapped || wrapped.closed) {
    return;
  }

  try {
    wrapped.child.kill("SIGTERM");
  } catch {
    // noop
  }

  const startedAt = Date.now();
  while (!wrapped.closed && Date.now() - startedAt < 5_000) {
    await sleep(200);
  }

  if (!wrapped.closed) {
    try {
      wrapped.child.kill("SIGKILL");
    } catch {
      // noop
    }
  }
}

async function superviseTunnel(wrapped) {
  let publicFailures = 0;
  let localFailures = 0;

  while (!shuttingDown && !wrapped.closed) {
    await sleep(HEALTH_INTERVAL_MS);

    const localOk = await isLocalHealthy();
    if (!localOk) {
      localFailures += 1;
      await logLine(errFile, `health local fallo (${localFailures}/${LOCAL_FAILURE_LIMIT})`);
    } else {
      localFailures = 0;
    }

    const publicOk = wrapped.url ? await isPublicHealthy(wrapped.url) : false;
    if (!publicOk) {
      publicFailures += 1;
      await logLine(
        errFile,
        `health publico fallo (${publicFailures}/${PUBLIC_FAILURE_LIMIT}) en ${wrapped.url || "sin-url"}`
      );
    } else {
      publicFailures = 0;
    }

    if (localFailures >= LOCAL_FAILURE_LIMIT || publicFailures >= PUBLIC_FAILURE_LIMIT) {
      await logLine(outFile, `reiniciando tunnel por health-check en ${wrapped.url || "sin-url"}`);
      await stopTunnel(wrapped);
      return;
    }
  }
}

async function main() {
  let attempt = 0;

  while (!shuttingDown) {
    const localOk = await isLocalHealthy();
    if (!localOk) {
      await logLine(errFile, "la app local aun no responde; reintentando");
      await sleep(RECONNECT_BASE_MS);
      continue;
    }

    try {
      const wrapped = await startTunnel();
      attempt = 0;
      await superviseTunnel(wrapped);
      currentTunnel = null;

      if (!shuttingDown) {
        await writePublicUrl("");
        await logLine(outFile, "tunnel cerrado; preparando reconexion");
      }
    } catch (error) {
      attempt += 1;
      const waitMs = Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_MS);
      await logLine(
        errFile,
        `fallo al levantar tunnel :: ${error?.message ?? error}; reintento en ${waitMs}ms`
      );
      await writePublicUrl("");
      await sleep(waitMs);
    }
  }
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await logLine(outFile, `shutdown recibido (${signal})`);

  if (currentTunnel) {
    await stopTunnel(currentTunnel);
  }

  await writePublicUrl("");
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", async (error) => {
  await logLine(errFile, `uncaughtException :: ${error?.stack ?? error}`);
  await shutdown("uncaughtException");
});

process.on("unhandledRejection", async (error) => {
  await logLine(errFile, `unhandledRejection :: ${error?.stack ?? error}`);
  await shutdown("unhandledRejection");
});

await main();
