import { spawn } from "node:child_process";
import { writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetPort = Number(process.env.TARGET_PORT || process.env.PORT || 8787);

const outFile = path.join(__dirname, "public-live.out.log");
const errFile = path.join(__dirname, "public-live.err.log");
const urlFile = path.join(__dirname, "public-url.txt");
const pidFile = path.join(__dirname, "public-tunnel.pid");

await writeFile(outFile, "", "utf8");
await writeFile(errFile, "", "utf8");
await writeFile(urlFile, "", "utf8");
await writeFile(pidFile, String(process.pid), "utf8");

const child = spawn(
  "C:/WINDOWS/System32/OpenSSH/ssh.exe",
  [
    "-tt",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "ServerAliveInterval=30",
    "-R",
    `80:localhost:${targetPort}`,
    "nokey@localhost.run",
    "--",
    "--output",
    "json",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let urlCaptured = false;

child.stdout.on("data", async (chunk) => {
  const text = chunk.toString();
  await appendFile(outFile, text, "utf8");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const address = parsed?.address;
      if (address && !urlCaptured) {
        urlCaptured = true;
        await writeFile(urlFile, `https://${address}`, "utf8");
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }
});

child.stderr.on("data", async (chunk) => {
  await appendFile(errFile, chunk.toString(), "utf8");
});

child.on("exit", async (code, signal) => {
  const line = `\n[exit] code=${code ?? "null"} signal=${signal ?? "null"}\n`;
  await appendFile(errFile, line, "utf8");
  process.exit(code ?? 0);
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});
