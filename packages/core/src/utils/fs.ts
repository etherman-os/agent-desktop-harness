import { createHash } from "node:crypto";
import { mkdir, rename, writeFile, appendFile, access, stat, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function fileSize(path: string): Promise<number> {
  const fileStat = await stat(path);
  return fileStat.size;
}

export async function hashFile(path: string): Promise<string> {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

export async function writeJsonAtomic(
  path: string,
  value: unknown
): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextAtomic(path: string, value: string): Promise<void> {
  await ensureDirectory(dirname(path));
  const tempPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tempPath, value, "utf8");
  await rename(tempPath, path);
}

export async function touchFile(path: string): Promise<void> {
  await ensureDirectory(dirname(path));
  await appendFile(path, "", "utf8");
}

export async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await ensureDirectory(dirname(path));
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const parent = resolve(parentPath);
  const child = resolve(childPath);
  const pathRelativeToParent = relative(parent, child);
  return (
    pathRelativeToParent === "" ||
    (!pathRelativeToParent.startsWith("..") && !isAbsolute(pathRelativeToParent))
  );
}
