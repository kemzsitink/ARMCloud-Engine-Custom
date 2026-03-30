
import type { ReporterOptions } from "../types/internal";

export const enum ReportEventType {
    FIRST_FRAME = "FirstFrame",
}

export class MetricsReporter {
    private options: ReporterOptions;
    private keyParamsMap = new Map<string, Record<string, any>>();
    private onceOnlyKeys = new Set<string>();
    private reportedKeys = new Set<string>();
    private keyQueueMap = new Map<string, Promise<void>>(); // 🚀 每个 key 的顺序队列

    constructor(options: ReporterOptions) {
        this.options = options;
        if (options.onceOnlyKeys) {
            this.onceOnlyKeys = new Set(options.onceOnlyKeys);
        }
    }

    /** 设置或更新某个 key 的参数 */
    addParam(key: string, params: Record<string, any>) {
        // 如果是一次性事件, 并且上报过 就跳过
        if (this.onceOnlyKeys.has(key) && this.reportedKeys.has(key)) {
            this.log(`[skip] ${key} addParam is once-only and already reported`);
            return;
        }

        const existing = this.keyParamsMap.get(key) || {};
        const merged = { ...existing, ...params };
        this.keyParamsMap.set(key, merged);
        this.log(`[addParam] ${key}: ${JSON.stringify(merged)}`);
    }

    /** 上报某个 key（顺序保证） */
    instant(key: string, extraParams?: Record<string, any>) {

        const isOnceOnly = this.onceOnlyKeys.has(key);

        // 一次性 key 限制
        if (isOnceOnly && this.reportedKeys.has(key)) {
            this.log(`[skip] ${key} instant is once-only and already reported`);
            return;
        }

        isOnceOnly && this.reportedKeys.add(key);

        const { commonParams } = this.options;

        // 生成当前 payload
        const storedParams = this.keyParamsMap.get(key) || {};
        const payload = {
            eventKey: key,
            ...commonParams,
            ...storedParams,
            ...extraParams,
        };

        // 🚀 关键逻辑：串行队列执行
        const lastPromise = this.keyQueueMap.get(key) || Promise.resolve();
        const nextPromise = lastPromise.then(() => this.report(payload, key)).finally(() => {
            // 如果这是最后一个 Promise，清理它
            if (this.keyQueueMap.get(key) === nextPromise) {

                this.keyQueueMap.delete(key);

                this.log(`[finally] ${key} queue cleared ${this.keyQueueMap.size}`);
            }
        });

        this.keyQueueMap.set(key, nextPromise);
    }

    /** 实际上报逻辑 */
    private async report(data: Record<string, any>, key: string) {
        const { endpoint, useBeacon } = this.options;
        const body = JSON.stringify(data);
        this.log(`[report] ${key} payload: ${body}`);

        try {
            if (useBeacon && navigator.sendBeacon) {
                navigator.sendBeacon(endpoint, body);
            } else {
                await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                });
            }
            this.log(`[done] ${key} report success`);
        } catch (err) {
            this.log(`[error] ${key} report failed: ${err}`);
        }
    }

    private log(msg: string) {
        if (this.options.enableLog) console.log(`[MetricsReporter] ${msg}`);
    }
}
