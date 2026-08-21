import fs from "node:fs";
import path from "node:path";

/*
  Write a file so a crash mid-write does not leave a half-updated dest.

  POSIX rename replaces dest. Windows often cannot, so unlink then rename.
  The crash window with no dest is after dest has been fsynced to tmp.
*/

export function atomicWriteFile(dest: string, data: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, data, undefined, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  try {
    fs.renameSync(tmp, dest);
  } catch {
    fs.rmSync(dest, { force: true });
    fs.renameSync(tmp, dest);
  }
}
