import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const nextDir = join(root, ".next");
const tsBuildInfo = join(root, "tsconfig.tsbuildinfo");
const runtimePath = join(nextDir, "server", "webpack-runtime.js");
const vendorChunksDir = join(nextDir, "server", "vendor-chunks");
const zustandVendorChunk = join(vendorChunksDir, "zustand.js");

function hasJsFiles(dir) {
  try {
    return readdirSync(dir).some((entry) => entry.endsWith(".js"));
  } catch {
    return false;
  }
}

function shouldResetNextCache() {
  if (!existsSync(runtimePath)) return false;

  let runtime = "";
  try {
    runtime = readFileSync(runtimePath, "utf8");
  } catch {
    return false;
  }

  const runtimeRequestsZustandChunk = runtime.includes("vendor-chunks/zustand");
  if (!runtimeRequestsZustandChunk) return false;

  if (!existsSync(zustandVendorChunk)) return true;
  if (!hasJsFiles(vendorChunksDir)) return true;

  return false;
}

if (!shouldResetNextCache()) {
  process.exit(0);
}

console.log("[ensure-next-dev-cache] Detectada cache inconsistente de Next. Limpiando .next...");
rmSync(nextDir, { recursive: true, force: true });
rmSync(tsBuildInfo, { force: true });
