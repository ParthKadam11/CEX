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
    out.push(JSON.parse(trimmed) as EngineCommand);
  }
  return out;
}

function lastSeqInFile(filePath: string): number {
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return 0;

  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]?.trim();
    if (!trimmed) continue;
    return (JSON.parse(trimmed) as EngineCommand).seq;
  }
  return 0;
}
