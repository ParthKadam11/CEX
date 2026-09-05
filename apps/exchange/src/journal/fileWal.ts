import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { EngineCommand, EngineCommandBody } from "@cex/exchange-types";
import { atomicWriteFile } from "./atomicFile.js";

type NewCommand = EngineCommandBody;

const fsync = promisify(fs.fsync);

/*
  FileWal = append-only JSONL, one fd kept open.

  append() writes the line (no fsync).
  flush() fsyncs once — CommandQueue calls this after a batch of commands.
  Boot reads only commands after a snapshot seq (the tail).
  Checkpoint truncates the file down to that tail.
*/

export class FileWal {
  private seq = 0;
  private fd: number;
  private dirty = false;
  private closed = false;

  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "");
    }
    recoverWal(this.filePath);
    this.seq = lastSeqInFile(this.filePath);
    this.fd = fs.openSync(this.filePath, "a");
  }

  get currentSeq(): number {
    return this.seq;
  }

  /** Raise seq after loading a snapshot that is ahead of an empty/truncated WAL. */
  adoptSeq(seq: number): void {
    if (seq > this.seq) this.seq = seq;
  }

  append(command: NewCommand): EngineCommand {
    this.assertOpen();
    this.seq += 1;
    const full = { ...command, seq: this.seq } as EngineCommand;
    fs.writeSync(this.fd, `${JSON.stringify(full)}\n`, undefined, "utf8");
    this.dirty = true;
    return full;
  }

  async flush(): Promise<void> {
    if (this.closed || !this.dirty) return;
    await fsync(this.fd);
    this.dirty = false;
  }

  readAll(): EngineCommand[] {
    return parseCommands(this.filePath);
  }

  readAfter(afterSeq: number): EngineCommand[] {
    return parseCommands(this.filePath).filter((command) => command.seq > afterSeq);
  }

  /** Keep only commands with seq > afterSeq. Seq counter is unchanged. */
  truncateAfter(afterSeq: number): void {
    this.assertOpen();
    if (this.dirty) {
      fs.fsyncSync(this.fd);
      this.dirty = false;
    }
    fs.closeSync(this.fd);
    this.closed = true;

    const tail = parseCommands(this.filePath).filter(
      (command) => command.seq > afterSeq,
    );
    const body = tail.map((command) => `${JSON.stringify(command)}\n`).join("");
    atomicWriteFile(this.filePath, body);

    this.fd = fs.openSync(this.filePath, "a");
    this.closed = false;
  }

  /** Empty the WAL and reset the sequence (dev hard-reset). */
  wipe(): void {
    this.assertOpen();
    if (this.dirty) {
      fs.fsyncSync(this.fd);
      this.dirty = false;
    }
    fs.closeSync(this.fd);
    this.closed = true;
    atomicWriteFile(this.filePath, "");
    this.seq = 0;
    this.fd = fs.openSync(this.filePath, "a");
    this.closed = false;
  }

  close(): void {
    if (this.closed) return;
    if (this.dirty) fs.fsyncSync(this.fd);
    fs.closeSync(this.fd);
    this.closed = true;
    this.dirty = false;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("WAL is closed");
  }
}

function parseCommands(filePath: string): EngineCommand[] {
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return [];

  const out: EngineCommand[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(parseCommand(trimmed));
  }
  return out;
}

function lastSeqInFile(filePath: string): number {
  return parseCommands(filePath).at(-1)?.seq ?? 0;
}

// Keep the valid prefix and preserve the original file for manual recovery.
export function recoverWal(filePath: string): string | null {
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return null;

  const valid: string[] = [];
  let previousSeq = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const command = parseCommand(trimmed);
      if (command.seq <= previousSeq) throw new Error("non-monotonic seq");
      previousSeq = command.seq;
      valid.push(trimmed);
    } catch {
      const backupPath = `${filePath}.corrupt-${Date.now()}-${process.pid}`;
      fs.writeFileSync(backupPath, raw, "utf8");
      atomicWriteFile(
        filePath,
        valid.length > 0 ? `${valid.join("\n")}\n` : "",
      );
      return backupPath;
    }
  }
  return null;
}

function parseCommand(line: string): EngineCommand {
  const value: unknown = JSON.parse(line);
  if (
    typeof value !== "object" ||
    value === null ||
    !("seq" in value) ||
    typeof value.seq !== "number" ||
    !Number.isSafeInteger(value.seq) ||
    value.seq <= 0
  ) {
    throw new Error("invalid WAL command");
  }
  return value as EngineCommand;
}
