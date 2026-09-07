#!/usr/bin/env node
/**
 * One-command deploy to Vercel.
 *
 *   node scripts/deploy.mjs              # production deploy
 *   node scripts/deploy.mjs --preview    # preview deploy
 *   node scripts/deploy.mjs --dry-run    # run every local check, touch nothing remote
 *   node scripts/deploy.mjs --yes        # skip the confirmation prompt (CI)
 *   node scripts/deploy.mjs --skip-checks
 *
 * Order matters: everything that can fail locally fails *before* anything is
 * pushed to a third party. A broken build should never reach a real URL.
 *
 * Local tools are invoked by their resolved paths rather than through
 * `npm run`, so this works even where the npm shim itself is broken.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = new Set(process.argv.slice(2));
const IS_PREVIEW = args.has("--preview");
const IS_DRY_RUN = args.has("--dry-run");
const AUTO_YES = args.has("--yes") || args.has("-y");
const SKIP_CHECKS = args.has("--skip-checks");

const TARGET = IS_PREVIEW ? "preview" : "production";

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColour ? `[${code}m${text}[0m` : text);
const bold = (t) => paint("1", t);
const dim = (t) => paint("2", t);
const green = (t) => paint("32", t);
const yellow = (t) => paint("33", t);
const red = (t) => paint("31", t);
const cyan = (t) => paint("36", t);

let stepNumber = 0;
const step = (title) => console.log(`\n${bold(`[${++stepNumber}]`)} ${bold(title)}`);
const ok = (msg) => console.log(`    ${green("✓")} ${msg}`);
const warn = (msg) => console.log(`    ${yellow("!")} ${msg}`);
const info = (msg) => console.log(`    ${dim(msg)}`);

function fail(message, hint) {
  console.error(`\n${red("✗ Deploy aborted:")} ${message}`);
  if (hint) console.error(`\n${hint}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Process helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * `shell` is opt-in, and only for `npx`, which is a .cmd shim on Windows.
 * A shell does not escape arguments, so any path containing a space — a
 * project directory called "Study assistant", say — would be split in two.
 * Node binaries are therefore spawned directly.
 */
function run(command, commandArgs, { capture = false, stdin, shell = false } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      shell: shell && process.platform === "win32",
      stdio: [stdin === undefined ? "inherit" : "pipe", capture ? "pipe" : "inherit", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (!capture) process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (!capture) process.stderr.write(chunk);
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
      child.stdin.end();
    }

    child.on("error", (error) => resolvePromise({ code: 1, stdout, stderr: error.message }));
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

async function confirm(question) {
  if (AUTO_YES) return true;
  if (!process.stdin.isTTY) {
    fail("Not an interactive terminal and --yes was not passed.", "Re-run with --yes to confirm non-interactively.");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\n${question} ${dim("(y/N)")} `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function readEnvFile() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) {
    fail(
      "No .env.local found.",
      `Create one first:\n\n  cp .env.example .env.local\n\nThen add your key from ${cyan("https://console.groq.com/keys")}`,
    );
  }

  const vars = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

function checkPrerequisites() {
  step("Checking prerequisites");

  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) fail(`Node ${process.versions.node} is too old. Node 18.18+ is required.`);
  ok(`Node ${process.versions.node}`);

  if (!existsSync(join(ROOT, "node_modules"))) {
    fail("Dependencies are not installed.", "Run:\n\n  npm install");
  }
  ok("Dependencies installed");

  const env = readEnvFile();
  if (!env.GROQ_API_KEY) {
    fail("GROQ_API_KEY is empty in .env.local.", `Get a free key at ${cyan("https://console.groq.com/keys")}`);
  }
  // Never print the key itself — only enough to confirm which one is in use.
  ok(`GROQ_API_KEY present (${env.GROQ_API_KEY.length} chars, ends …${env.GROQ_API_KEY.slice(-4)})`);
  info(`Model: ${env.GROQ_MODEL || "openai/gpt-oss-120b (default)"}`);

  return env;
}

/** Resolve a locally installed tool, bypassing the npm shim entirely. */
function localBin(relativePath) {
  const full = join(ROOT, relativePath);
  return existsSync(full) ? full : null;
}

async function runLocalChecks() {
  if (SKIP_CHECKS) {
    step("Local checks");
    warn("Skipped via --skip-checks");
    return;
  }

  step("Typechecking");
  const tsc = localBin("node_modules/typescript/lib/tsc.js");
  if (!tsc) fail("TypeScript is not installed.", "Run:\n\n  npm install");
  const typecheck = await run(process.execPath, [tsc, "--noEmit"]);
  if (typecheck.code !== 0) fail("Typecheck failed. Fix the errors above before deploying.");
  ok("No type errors");

  step("Building");
  const next = localBin("node_modules/next/dist/bin/next");
  if (!next) fail("Next.js is not installed.", "Run:\n\n  npm install");
  // `next build` runs ESLint too, so this covers linting as well.
  const build = await run(process.execPath, [next, "build"]);
  if (build.code !== 0) fail("Build failed. Nothing was deployed.");
  ok("Production build succeeded");
}

async function resolveVercel() {
  step("Locating the Vercel CLI");

  const local = localBin("node_modules/vercel/dist/index.js");
  if (local) {
    ok("Using the locally installed Vercel CLI");
    return { command: process.execPath, prefix: [local], shell: false };
  }

  const probe = await run("npx", ["--yes", "vercel@latest", "--version"], { capture: true, shell: true });
  if (probe.code === 0) {
    ok(`Using npx (vercel ${probe.stdout.trim()})`);
    return { command: "npx", prefix: ["--yes", "vercel@latest"], shell: true };
  }

  fail(
    "Could not run the Vercel CLI.",
    `Install it locally, then re-run this script:\n\n  npm install --save-dev vercel\n\n${dim(
      "(If npx itself is broken, that is an npm installation problem, not a Vercel one.)",
    )}`,
  );
}

async function pushEnvVars(vercel, env) {
  step(`Syncing environment variables to ${TARGET}`);

  const wanted = {
    GROQ_API_KEY: env.GROQ_API_KEY,
    ...(env.GROQ_MODEL ? { GROQ_MODEL: env.GROQ_MODEL } : {}),
  };

  for (const [name, value] of Object.entries(wanted)) {
    // Remove first so a re-deploy updates a rotated key instead of failing
    // with "already exists". A missing variable makes this a harmless no-op.
    await run(vercel.command, [...vercel.prefix, "env", "rm", name, TARGET, "--yes"], { capture: true, shell: vercel.shell });

    const add = await run(vercel.command, [...vercel.prefix, "env", "add", name, TARGET], {
      capture: true,
      stdin: `${value}\n`,
      shell: vercel.shell,
    });

    if (add.code !== 0) {
      fail(`Could not set ${name} on Vercel.`, add.stderr.trim() || add.stdout.trim());
    }
    ok(`${name} set`);
  }
}

async function deploy(vercel) {
  step(`Deploying to ${TARGET}`);

  const deployArgs = [...vercel.prefix, "deploy", "--yes"];
  if (!IS_PREVIEW) deployArgs.push("--prod");

  const result = await run(vercel.command, deployArgs, { capture: true, shell: vercel.shell });
  process.stdout.write(result.stderr); // the CLI logs progress on stderr

  if (result.code !== 0) fail("Vercel deploy failed.", result.stdout.trim());

  const url = result.stdout.trim().split(/\s+/).filter((line) => line.startsWith("https://")).pop();
  if (!url) fail("Deploy reported success but no URL was returned.", result.stdout.trim());

  ok(`Deployed to ${cyan(url)}`);
  return url;
}

/** A deploy isn't done until the deployed thing answers. */
async function smokeTest(url) {
  step("Smoke-testing the deployment");

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`, {
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json();

      if (body.status === "ok") {
        ok(`Health check passed — Groq reachable in ${body.latencyMs}ms via ${body.model}`);
        return true;
      }
      if (body.status === "no_key") {
        warn("Deployed, but the server reports no API key.");
        info("The environment variable did not apply. Re-run this script, or set it in the Vercel dashboard.");
        return false;
      }
      warn(`Deployed, but Groq is unreachable: ${body.message}`);
      return false;
    } catch (error) {
      if (attempt === 5) {
        warn(`Could not reach ${url}/api/health after 5 attempts (${error.message}).`);
        info("The deployment may still be propagating. Open the URL in a browser to check.");
        return false;
      }
      info(`Attempt ${attempt} failed, retrying in 3s…`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(bold(`\n  Study Assistant → ${TARGET}${IS_DRY_RUN ? dim("  (dry run)") : ""}\n`));

  const env = checkPrerequisites();
  await runLocalChecks();

  if (IS_DRY_RUN) {
    console.log(`\n${green("✓")} Dry run complete. Every local check passed; nothing was deployed.\n`);
    return;
  }

  const vercel = await resolveVercel();

  const proceed = await confirm(
    `Deploy to ${bold(TARGET)} and upload ${bold("GROQ_API_KEY")} to Vercel?`,
  );
  if (!proceed) {
    console.log(`\n${yellow("Cancelled.")} Nothing was deployed.\n`);
    process.exit(0);
  }

  await pushEnvVars(vercel, env);
  const url = await deploy(vercel);
  const healthy = await smokeTest(url);

  console.log(`\n${green(bold("Done."))} ${url}\n`);
  if (!healthy) process.exitCode = 1;
}

main().catch((error) => fail(error?.stack || String(error)));
