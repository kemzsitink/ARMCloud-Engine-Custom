/**
 * Internal types shared across RTC module implementations.
 * Not part of the public API.
 */

// ---------------------------------------------------------------------------
// Promise-based state management
// ---------------------------------------------------------------------------

export interface PromiseResolver<T = unknown> {
    resolve: ((result: T) => void) | null;
}

export interface PromiseMap {
    streamStatus: PromiseResolver;
    injectStatus: PromiseResolver;
}

// ---------------------------------------------------------------------------
// Remote state
// ---------------------------------------------------------------------------

export interface RemoteInputState {
    isOpen: boolean;
    imeOptions: string;
}

// ---------------------------------------------------------------------------
// Metrics reporter
// ---------------------------------------------------------------------------

export interface ReporterOptions {
    endpoint: string;
    commonParams?: Record<string, unknown>;
    useBeacon?: boolean;
    enableLog?: boolean;
    onceOnlyKeys?: string[];
}

// ---------------------------------------------------------------------------
// Data channel
// ---------------------------------------------------------------------------

export type Listener<T = unknown> = (payload: T) => void;
