import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const nextDir = join(root, ".next");
const tsBuildInfo = join(root, "tsconfig.tsbuildinfo");
const routesManifest = join(nextDir, "routes-manifest.json");
const vendorChunksDir = join(nextDir, "server", "vendor-chunks");

function hasVendorChunks(dir) {
  try {
    return readdirSync(dir).some((name) => name.endsWith(".js"));
  } catch {
    return false;
  }
}

const needsBuild = !existsSync(routesManifest) || !hasVendorChunks(vendorChunksDir);

if (!needsBuild) {
  process.exit(0);
}

console.log("[ensure-next-build] .next incompleto o faltante. Reconstruyendo...");
rmSync(nextDir, { recursive: true, force: true });
rmSync(tsBuildInfo, { force: true });

const nextBin = process.platform === "win32" ? "next.cmd" : "next";
const build = spawnSync(nextBin, ["build"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}
