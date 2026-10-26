import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const flavor = process.argv[2] || "mobile";
if (!["mobile", "tv"].includes(flavor))
  throw new Error("Expected mobile or tv");
const windows = process.platform === "win32";
function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: windows,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(windows ? "npm.cmd" : "npm", ["run", "build:native"]);
run(windows ? "npx.cmd" : "npx", ["cap", "sync", "android"]);
run(
  windows ? "gradlew.bat" : "./gradlew",
  [`assemble${flavor === "tv" ? "Tv" : "Mobile"}Release`],
  fileURLToPath(new URL("../android", import.meta.url))
);
