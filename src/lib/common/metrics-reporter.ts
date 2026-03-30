import type { ReporterOptions } from "../types/internal";

export const enum ReportEventType {
  FIRST_FRAME = "FirstFrame",
}

/**
 * Lightweight metrics reporter with per-key serial queuing.
 * Supports one-shot keys that are reported at most once.
 */
export class MetricsReporter {
  private readonly options: ReporterOptions;
  private readonly keyParamsMap = new Map<string, Record<string, unknown>>();
  private readonly onceOnlyKeys: Set<string>;
  private readonly reportedKeys = new Set<string>();
  private readonly keyQueueMap = new Map<string, Promise<void>>();

  constructor(options: ReporterOptions) {
    this.options = options;
    this.onceOnlyKeys = new Set(options.onceOnlyKeys ?? []);
  }

  /** Merge `params` into the stored payload for `key`. */
  addParam(key: string, params: Record<string, unknown>): void {
    if (this.onceOnlyKeys.has(key) && this.reportedKeys.has(key)) {
      this.log(`[skip] ${key} already reported`);
      return;
    }
    const merged = { ...(this.keyParamsMap.get(key) ?? {}), ...params };
    this.keyParamsMap.set(key, merged);
    this.log(`[addParam] ${key}: ${JSON.stringify(merged)}`);
  }

  /** Enqueue a report for `key`, optionally merging `extraParams`. */
  instant(key: string, extraParams?: Record<string, unknown>): void {
    if (this.onceOnlyKeys.has(key) && this.reportedKeys.has(key)) {
      this.log(`[skip] ${key} already reported`);
      return;
    }
    if (this.onceOnlyKeys.has(key)) this.reportedKeys.add(key);

    const payload: Record<string, unknown> = {
      eventKey: key,
      ...(this.options.commonParams ?? {}),
      ...(this.keyParamsMap.get(key) ?? {}),
      ...extraParams,
    };

    // Serial queue per key — guarantees ordering.
    const prev = this.keyQueueMap.get(key) ?? Promise.resolve();
    const next = prev.then(() => this.report(payload, key)).finally(() => {
      if (this.keyQueueMap.get(key) === next) {
        this.keyQueueMap.delete(key);
        this.log(`[queue] ${key} cleared`);
      }
    });
    this.keyQueueMap.set(key, next);
  }

  private async report(data: Record<string, unknown>, key: string): Promise<void> {
    const { endpoint, useBeacon } = this.options;
    const body = JSON.stringify(data);
    this.log(`[report] ${key}: ${body}`);

    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, body);
      } else {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      }
      this.log(`[done] ${key}`);
    } catch (err) {
      this.log(`[error] ${key}: ${String(err)}`);
    }
  }

  private log(msg: string): void {
    if (this.options.enableLog) console.warn(`[MetricsReporter] ${msg}`);
  }
}
