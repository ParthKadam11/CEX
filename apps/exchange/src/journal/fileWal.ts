import fs from "node:fs";
import path from "node:path";
import type { EngineCommand, EngineCommandBody } from "@cex/exchange-types";

type NewCommand = EngineCommandBody;

/*
  FileWal (append-only JSONL on disk.)
  fsync after every write so a process restart can replay the file
  and restore the in-memory engine.
*/

export class FileWal {
  private seq = 0;

  constructor(private readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "");
    }
    const existing = this.readAll();
    this.seq = existing.at(-1)?.seq ?? 0;
  }

  append(command: NewCommand): EngineCommand {
    this.seq += 1;
    const full = { ...command, seq: this.seq } as EngineCommand;
    const line = `${JSON.stringify(full)}\n`;
    const fd = fs.openSync(this.filePath, "a");
    try {
      fs.writeSync(fd, line, undefined, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return full;
  }

  readAll(): EngineCommand[] {
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return [];

    const out: EngineCommand[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      out.push(JSON.parse(trimmed) as EngineCommand);
    }
    return out;
  }
}
