#!/usr/bin/env node

import { constants, realpathSync } from "node:fs";
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

export const CONFIG_FILE = "better-auth-ac.json";
export const DEFAULT_SOURCE = "http://localhost:3000/api/auth/iam/catalog/casl.ts";
export const DEFAULT_OUTPUT = "src/generated/better-auth-ac.ts";
export const DEFAULT_AUTHORIZATION_ENV = "BETTER_AUTH_AC_CATALOG_TOKEN";

const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;

function caslModuleEtag(contents: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < contents.length; index += 1) {
    hash ^= contents.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `"casl-${(hash >>> 0).toString(16).padStart(8, "0")}"`;
}

export interface PolicyConfig {
  source: string;
  output: string;
  authorizationEnv?: string;
}

export interface InitOptions {
  source?: string;
  output?: string;
  authorizationEnv?: string;
  force?: boolean;
  pull?: boolean;
}

export interface CliIO {
  ask(question: string): Promise<string>;
  write(message: string): void;
}

interface CommandDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  io?: CliIO;
  write?: (message: string) => void;
}

export type PullResult = "created" | "updated" | "unchanged";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Configuration field "${name}" must be a non-empty string.`);
  }
  return value;
}

export function validateConfig(value: unknown): PolicyConfig {
  if (!isRecord(value)) {
    throw new Error("Configuration must be a JSON object.");
  }

  const source = requiredString(value.source, "source");
  const output = requiredString(value.output, "output");
  const url = new URL(source);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error('Configuration field "source" must use HTTP or HTTPS.');
  }
  if (isAbsolute(output)) {
    throw new Error('Configuration field "output" must be relative to the project directory.');
  }

  const authorizationEnv =
    value.authorizationEnv === undefined
      ? undefined
      : requiredString(value.authorizationEnv, "authorizationEnv");
  if (url.username || url.password) {
    throw new Error('Configuration field "source" must not contain credentials.');
  }
  const localHost =
    url.hostname === "localhost" ||
    url.hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (authorizationEnv && url.protocol === "http:" && !localHost) {
    throw new Error("Authenticated catalog sources must use HTTPS unless they use loopback.");
  }
  return authorizationEnv === undefined ? { source, output } : { source, output, authorizationEnv };
}

async function outputPath(cwd: string, output: string): Promise<string> {
  const path = resolve(cwd, output);
  if (path === resolve(cwd, CONFIG_FILE)) {
    throw new Error(`Configuration field "output" must not overwrite ${CONFIG_FILE}.`);
  }
  const pathFromProject = relative(cwd, path);
  if (
    pathFromProject === ".." ||
    pathFromProject.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error('Configuration field "output" must stay inside the project directory.');
  }

  let existingParent = dirname(path);
  while (true) {
    try {
      const [projectPath, parentPath] = await Promise.all([
        realpath(cwd),
        realpath(existingParent),
      ]);
      const parentFromProject = relative(projectPath, parentPath);
      if (
        parentFromProject === ".." ||
        parentFromProject.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      ) {
        throw new Error('Configuration field "output" must stay inside the project directory.');
      }
      break;
    } catch (error) {
      if (!isNodeError(error, "ENOENT")) throw error;
      const parent = dirname(existingParent);
      if (parent === existingParent) throw error;
      existingParent = parent;
    }
  }
  return path;
}

export async function readConfig(cwd = process.cwd()): Promise<PolicyConfig> {
  const path = resolve(cwd, CONFIG_FILE);
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      throw new Error(`Missing ${CONFIG_FILE}. Run "better-auth-ac-casl init" first.`);
    }
    throw error;
  }

  try {
    return validateConfig(JSON.parse(contents) as unknown);
  } catch (error) {
    throw new Error(`Invalid ${CONFIG_FILE}: ${errorMessage(error)}`);
  }
}

export function validateArtifact(contents: string): string {
  if (Buffer.byteLength(contents) > MAX_ARTIFACT_BYTES) {
    throw new Error("The CASL artifact exceeds the 5 MB limit.");
  }

  const version = contents.match(/export const catalogVersion = ("(?:[^"\\]|\\.)*");/)?.[1];
  const requiredParts = [
    "// Generated by @better-auth-ac/casl. Do not edit.",
    'import type { MongoAbility } from "@casl/ability";',
    "export const Policy =",
    "export type AppAbilities =",
    "export type AppAbility = MongoAbility<AppAbilities>;",
  ];
  if (!version || requiredParts.some((part) => !contents.includes(part))) {
    throw new Error("The response is not a generated Better Auth AC CASL module.");
  }

  const jsonString = String.raw`"(?:[^"\\\r\n]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"`;
  const safeLines = [
    /^$/,
    /^\/\/ Generated by @better-auth-ac\/casl\. Do not edit\.$/,
    /^import type \{ MongoAbility \} from "@casl\/ability";$/,
    new RegExp(`^export const catalogVersion = ${jsonString};$`),
    /^export const Policy = \{$/,
    /^} as const;$/,
    /^export type AppAbilities =$/,
    /^export type AppAbilities = never;$/,
    new RegExp(`^  \\| \\[${jsonString}, ${jsonString}\\];?$`),
    /^export type AppAbility = MongoAbility<AppAbilities>;$/,
    /^\s+(?:[A-Z][A-Za-z0-9]*|_\d[A-Za-z0-9]*): \{$/,
    new RegExp(`^\\s+(?:key|action|subject): ${jsonString},$`),
    /^\s+fields: \[$/,
    new RegExp(`^\\s+${jsonString},$`),
    /^\s+],$/,
    new RegExp(`^\\s+fields: \\[(?:${jsonString}(?:, ${jsonString})*)?\\],$`),
    /^\s+},$/,
  ];
  if (contents.split("\n").some((line) => !safeLines.some((pattern) => pattern.test(line)))) {
    throw new Error("The response contains code outside the generated CASL module format.");
  }

  const parsedVersion: unknown = JSON.parse(version);
  if (typeof parsedVersion !== "string" || parsedVersion === "") {
    throw new Error("The generated CASL module has an invalid catalog version.");
  }
  return parsedVersion;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = resolve(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function fetchArtifact(
  config: PolicyConfig,
  localContents: string | undefined,
  fetcher: typeof fetch,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const headers = new Headers({ accept: "text/plain" });
  if (config.authorizationEnv) {
    const token = env[config.authorizationEnv];
    if (!token) {
      throw new Error(`Environment variable ${config.authorizationEnv} is not set.`);
    }
    headers.set("authorization", `Bearer ${token}`);
  }
  if (localContents) {
    try {
      validateArtifact(localContents);
      headers.set("if-none-match", caslModuleEtag(localContents));
    } catch {
      // Pull replaces an invalid local artifact instead of requiring manual deletion.
    }
  }

  let response: Response;
  try {
    response = await fetcher(config.source, { headers });
  } catch (error) {
    throw new Error(`Could not download the CASL artifact: ${errorMessage(error)}`);
  }
  if (response.status === 304) {
    if (localContents === undefined) {
      throw new Error("The server returned 304, but no local CASL artifact exists.");
    }
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`Could not download the CASL artifact: HTTP ${response.status}.`);
  }

  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_ARTIFACT_BYTES) {
    throw new Error("The CASL artifact exceeds the 5 MB limit.");
  }
  const contents = await response.text();
  validateArtifact(contents);
  return contents;
}

export async function pullPolicy(dependencies: CommandDependencies = {}): Promise<PullResult> {
  const cwd = dependencies.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  const path = await outputPath(cwd, config.output);
  const localContents = await readOptional(path);
  const remoteContents = await fetchArtifact(
    config,
    localContents,
    dependencies.fetch ?? fetch,
    dependencies.env ?? process.env,
  );
  if (remoteContents === undefined || remoteContents === localContents) return "unchanged";

  await atomicWrite(path, remoteContents);
  return localContents === undefined ? "created" : "updated";
}

export async function checkPolicy(dependencies: CommandDependencies = {}): Promise<void> {
  const cwd = dependencies.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  const path = await outputPath(cwd, config.output);
  const localContents = await readOptional(path);
  if (localContents === undefined) {
    throw new Error(`Missing ${config.output}. Run "better-auth-ac-casl pull".`);
  }
  validateArtifact(localContents);

  const remoteContents = await fetchArtifact(
    config,
    localContents,
    dependencies.fetch ?? fetch,
    dependencies.env ?? process.env,
  );
  if (remoteContents !== undefined && remoteContents !== localContents) {
    throw new Error(`${config.output} is stale. Run "better-auth-ac-casl pull".`);
  }
}

function answerOrDefault(answer: string, fallback: string): string {
  return answer.trim() || fallback;
}

function confirmed(answer: string, defaultValue: boolean): boolean {
  const value = answer.trim().toLowerCase();
  if (value === "") return defaultValue;
  if (value === "y" || value === "yes") return true;
  if (value === "n" || value === "no") return false;
  throw new Error('Answer must be "yes" or "no".');
}

function printNextSteps(write: (message: string) => void, config: PolicyConfig): void {
  write("\nNext steps:");
  if (config.authorizationEnv) {
    write(`1. Set ${config.authorizationEnv}.`);
  } else {
    write("1. No authorization environment variable is configured.");
  }
  write("2. Run: bunx @better-auth-ac/casl pull");
  write(`3. Import AppAbility from ./${config.output} in your CASL integration.`);
  write(`4. Commit ${CONFIG_FILE} and ${config.output}.`);
}

export async function initPolicy(
  options: InitOptions = {},
  dependencies: CommandDependencies = {},
): Promise<"created" | "cancelled"> {
  const cwd = dependencies.cwd ?? process.cwd();
  const io = dependencies.io;
  const write = io?.write ?? dependencies.write;
  try {
    await access(resolve(cwd, "package.json"), constants.R_OK);
  } catch {
    throw new Error("The current directory does not contain a readable package.json.");
  }
  write?.("Found package.json in the current frontend project.");
  write?.("The source URL must return a generated CASL TypeScript artifact.");

  const configPath = resolve(cwd, CONFIG_FILE);
  const existingConfig = await readOptional(configPath);
  if (existingConfig !== undefined && !options.force) {
    if (!io) {
      throw new Error(`${CONFIG_FILE} already exists. Use --force to overwrite it.`);
    }
    if (!confirmed(await io.ask(`Overwrite ${CONFIG_FILE}? [y/N] `), false)) {
      io.write("Initialization cancelled.");
      return "cancelled";
    }
  }

  const source =
    options.source ??
    answerOrDefault(
      await requireIO(io).ask(`CASL artifact URL [${DEFAULT_SOURCE}]: `),
      DEFAULT_SOURCE,
    );
  const output =
    options.output ??
    answerOrDefault(
      await requireIO(io).ask(`Generated file [${DEFAULT_OUTPUT}]: `),
      DEFAULT_OUTPUT,
    );
  let authorizationEnv = options.authorizationEnv;
  if (authorizationEnv === undefined && (!options.source || !options.output)) {
    const needsAuthorization = confirmed(
      await requireIO(io).ask("Does the endpoint require authorization? [Y/n] "),
      true,
    );
    if (needsAuthorization) {
      authorizationEnv = answerOrDefault(
        await requireIO(io).ask(
          `Authorization environment variable [${DEFAULT_AUTHORIZATION_ENV}]: `,
        ),
        DEFAULT_AUTHORIZATION_ENV,
      );
    }
  }
  const config = validateConfig({ source, output, authorizationEnv });

  if (io && (!options.source || !options.output)) {
    io.write(`\nProposed ${CONFIG_FILE}:\n${JSON.stringify(config, null, 2)}`);
    if (!confirmed(await io.ask("Create this configuration? [Y/n] "), true)) {
      io.write("Initialization cancelled.");
      return "cancelled";
    }
  }

  await atomicWrite(configPath, `${JSON.stringify(config, null, 2)}\n`);
  write?.(`Created ${CONFIG_FILE}.`);

  const shouldPull =
    options.pull ??
    (io && (!options.source || !options.output)
      ? confirmed(await io.ask("Pull the policy module now? [Y/n] "), true)
      : true);
  if (shouldPull) {
    const result = await pullPolicy({ ...dependencies, cwd });
    write?.(`Policy module ${result}.`);
  }
  if (write) printNextSteps(write, config);
  return "created";
}

function requireIO(io: CliIO | undefined): CliIO {
  if (!io) {
    throw new Error("Both --source and --output are required for non-interactive init.");
  }
  return io;
}

function parseInitOptions(args: string[]): InitOptions {
  const options: InitOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--force") options.force = true;
    else if (argument === "--pull") options.pull = true;
    else if (argument === "--no-pull") options.pull = false;
    else if (
      argument === "--source" ||
      argument === "--output" ||
      argument === "--authorization-env"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--source") options.source = value;
      else if (argument === "--output") options.output = value;
      else options.authorizationEnv = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function usage(): string {
  return `Usage:
  better-auth-ac-casl init [--source URL --output PATH] [--authorization-env NAME] [--force] [--pull | --no-pull]
  better-auth-ac-casl pull
  better-auth-ac-casl check`;
}

export async function runCli(
  args = process.argv.slice(2),
  dependencies: CommandDependencies = {},
): Promise<void> {
  const [command, ...commandArgs] = args;
  const write = dependencies.write ?? dependencies.io?.write ?? console.log;
  if (!command || command === "--help" || command === "-h") {
    write(usage());
    return;
  }
  if (command === "init") {
    const options = parseInitOptions(commandArgs);
    const needsIO = !options.source || !options.output;
    if (!dependencies.io && needsIO && process.stdin.isTTY) {
      const readline = createInterface({ input: process.stdin, output: process.stdout });
      try {
        await initPolicy(options, {
          ...dependencies,
          io: { ask: (question) => readline.question(question), write },
        });
      } finally {
        readline.close();
      }
    } else {
      await initPolicy(options, { ...dependencies, write });
    }
    return;
  }
  if (commandArgs.length > 0) throw new Error(`${command} does not accept options.`);
  if (command === "pull") {
    write(`Policy module ${await pullPolicy(dependencies)}.`);
    return;
  }
  if (command === "check") {
    await checkPolicy(dependencies);
    write("Policy module is current.");
    return;
  }
  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

const entryPath = process.argv[1] ? realpathSync(resolve(process.argv[1])) : undefined;
if (entryPath === realpathSync(fileURLToPath(import.meta.url))) {
  runCli().catch((error: unknown) => {
    console.error(`Error: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
