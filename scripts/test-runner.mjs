import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const mode = process.argv[2];

if (mode !== "unit" && mode !== "integration") {
  console.error("Usage: node scripts/test-runner.mjs <unit|integration>");
  process.exit(1);
}

const srcDir = resolve(process.cwd(), "src");

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) return listFiles(fullPath);
      return [fullPath];
    }),
  );
  return nested.flat();
}

const allFiles = await listFiles(srcDir);
const allTests = allFiles.filter((file) => file.endsWith(".test.ts"));

const selectedTests =
  mode === "integration"
    ? allTests.filter((file) => file.endsWith(".integration.test.ts"))
    : allTests.filter((file) => !file.endsWith(".integration.test.ts"));

if (selectedTests.length === 0) {
  console.log(`No ${mode} tests found.`);
  process.exit(0);
}

const tsxBin = resolve(process.cwd(), "node_modules", ".bin", "tsx");
const result = spawnSync(tsxBin, ["--test", ...selectedTests], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
