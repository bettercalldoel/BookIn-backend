import { mkdir, readdir, stat, copyFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src");
const distRoot = path.join(projectRoot, "dist", "src");

const copyMjsAssets = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await copyMjsAssets(absolutePath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".mjs")) continue;

    const relativePath = path.relative(sourceRoot, absolutePath);
    const destinationPath = path.join(distRoot, relativePath);
    const destinationDirectory = path.dirname(destinationPath);

    await mkdir(destinationDirectory, { recursive: true });
    await copyFile(absolutePath, destinationPath);
  }
};

const ensureSourceExists = async () => {
  const sourceStats = await stat(sourceRoot).catch(() => null);
  if (!sourceStats?.isDirectory()) {
    throw new Error(`Source directory not found: ${sourceRoot}`);
  }
};

const main = async () => {
  await ensureSourceExists();
  await copyMjsAssets(sourceRoot);
  console.info("Copied .mjs runtime assets into dist/src.");
};

void main();
