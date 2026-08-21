/*
  Single-writer queue: run jobs serially, then one afterBatch (WAL fsync)
  for whatever piled up. HTTP enqueues and awaits; matching stays single-threaded.

  Yields one microtask before taking a batch so same-tick enqueues (Promise.all,
  concurrent HTTP) share one fsync.
*/

type Job<T> = {
  run: () => T;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export class CommandQueue {
  private readonly jobs: Job<unknown>[] = [];
  private pumping = false;

  constructor(private readonly afterBatch: () => Promise<void>) {}

  enqueue<T>(run: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({
        run,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      await Promise.resolve();
      while (this.jobs.length > 0) {
        const batch = this.jobs.splice(0, this.jobs.length);
        const finished: Array<
          | { job: Job<unknown>; ok: true; value: unknown }
          | { job: Job<unknown>; ok: false; error: unknown }
        > = [];

        for (const job of batch) {
          try {
            finished.push({ job, ok: true, value: job.run() });
          } catch (error) {
            finished.push({ job, ok: false, error });
          }
        }

        try {
          await this.afterBatch();
        } catch (error) {
          for (const item of finished) {
            item.job.reject(item.ok ? error : item.error);
          }
          continue;
        }

        for (const item of finished) {
          if (item.ok) item.job.resolve(item.value);
          else item.job.reject(item.error);
        }
      }
    } finally {
      this.pumping = false;
      if (this.jobs.length > 0) void this.pump();
    }
  }
}
