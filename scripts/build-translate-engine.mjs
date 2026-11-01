import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync, chmodSync, readFileSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.env.TATAKAI_TRANSLATE_TARGET;
const development = process.argv.includes("--dev");
if (process.platform === "darwin" && !target && !development) {
  for (const macTarget of ["x86_64-apple-darwin", "aarch64-apple-darwin"]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url)],
      {
        stdio: "inherit",
        shell: false,
        env: { ...process.env, TATAKAI_TRANSLATE_TARGET: macTarget },
      }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
  process.exit(0);
}
const cargoFallback = join(
  homedir(),
  ".cargo",
  "bin",
  process.platform === "win32" ? "cargo.exe" : "cargo"
);
const cargo = existsSync(cargoFallback) ? cargoFallback : "cargo";
const env = process.env;
const cachedCompiler = join(
  root,
  ".cache",
  "translate-toolchain",
  "mingw64",
  "bin"
);
if (process.platform === "win32" && existsSync(cachedCompiler))
  env.PATH = `${cachedCompiler}${delimiter}${env.PATH || ""}`;
// A project-local MSVC/Windows SDK toolchain (scripts/prepare-rtx-toolchain.py)
// is not registered with the system, so cc-rs cannot derive INCLUDE/LIB from it.
// When no Visual Studio developer environment is already active, feed the local
// toolchain into the environment so cl.exe finds the standard headers/libs.
if (process.platform === "win32") {
  const localToolchain = join(root, ".cache", "rtx-toolchain");
  const msvcRoot = join(localToolchain, "msvc", "VC", "Tools", "MSVC");
  const sdkRoot = join(localToolchain, "sdk", "c");
  if (existsSync(msvcRoot)) {
    const msvcVersions = readdirSync(msvcRoot)
      .filter((name) => existsSync(join(msvcRoot, name, "include")))
      .sort();
    const sdkIncludeRoot = join(sdkRoot, "Include");
    const sdkVersions = existsSync(sdkIncludeRoot)
      ? readdirSync(sdkIncludeRoot).sort()
      : [];
    const msvc = msvcVersions.at(-1);
    const sdkVersion = sdkVersions.at(-1);
    if (msvc && sdkVersion) {
      const include = [
        join(msvcRoot, msvc, "include"),
        ...[...["ucrt", "shared", "um", "winrt"]].map((kind) =>
          join(sdkRoot, "Include", sdkVersion, kind)
        ),
      ].join(";");
      const lib = [
        join(msvcRoot, msvc, "lib", "x64"),
        join(sdkRoot, "ucrt", "x64"),
        join(sdkRoot, "um", "x64"),
      ].join(";");
      const binDir = join(msvcRoot, msvc, "bin", "Hostx64", "x64");
      if (!env.INCLUDE) env.INCLUDE = include;
      if (!env.LIB) env.LIB = lib;
      if (!env.LIBPATH) env.LIBPATH = env.LIB;
      if (existsSync(binDir)) env.PATH = `${binDir}${delimiter}${env.PATH || ""}`;
    }
  }
}
const args = [
  "build",
  "--locked",
  "--manifest-path",
  join(root, "translate-engine", "Cargo.toml"),
];
if (!development) args.push("--release");
if (target) args.push("--target", target);
const result = spawnSync(cargo, args, {
  cwd: root,
  stdio: "inherit",
  shell: false,
  windowsHide: true,
  env,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const exe = (target ? target.includes("windows") : process.platform === "win32")
  ? ".exe"
  : "";
const name = `tatakai-translate${exe}`;
const source = join(
  root,
  "translate-engine",
  "target",
  ...(target ? [target] : []),
  development ? "debug" : "release",
  name
);
const arch = target
  ? target.startsWith("aarch64")
    ? "arm64"
    : target.startsWith("x86_64")
    ? "x64"
    : null
  : process.arch;
if (!arch)
  throw new Error("Unsupported translation engine target architecture");
const destination = join(root, "resources", "bin", "translate-engine", arch);
mkdirSync(destination, { recursive: true });
if (development) {
  // Windows locks running executables. Publish an immutable development binary
  // so rebuilding never overwrites the engine used by an open desktop window.
  const hash=createHash('sha256').update(readFileSync(source)).digest('hex');
  const directory=join(destination,'development');mkdirSync(directory,{recursive:true});
  const filename=`${hash}${exe}`;const binary=join(directory,filename);
  if(!existsSync(binary))copyFileSync(source,binary);
  if(!exe)chmodSync(binary,0o755);
  const pointer=join(directory,'current.json');
  writeFileSync(`${pointer}.tmp`,JSON.stringify({file:filename}));renameSync(`${pointer}.tmp`,pointer);
} else {
  copyFileSync(source, join(destination, name));
  if (!exe) chmodSync(join(destination, name), 0o755);
}
console.log(`Built ${name}${target ? ` for ${target}` : ""}`);
