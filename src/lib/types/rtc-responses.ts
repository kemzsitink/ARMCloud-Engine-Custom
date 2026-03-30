/**
 * Response/event payload types from RTC SDKs (TCG, Volc, P2P).
 * Internal to the module layer — not part of the public API.
 */

// ---------------------------------------------------------------------------
// TCG SDK responses
// ---------------------------------------------------------------------------

export interface ConnectFailResponse {
    code: number;
    msg?: string;
}

export interface ScreenConfig {
    orientation: "landscape" | "portrait";
    deg: 0 | 90 | 180 | 270;
    width: number;
    height: number;
}

export interface ConfigurationChangeResponse {
    screen_config: ScreenConfig;
}

export interface VideoStreamConfigResponse {
    width: number;
    height: number;
}

export interface AndroidInstanceEventResponse {
    type: string;
    data?: { event_type?: string };
}

export interface RawAudioStats {
    packet_lost: number;
    packet_received: number;
    bit_rate: number;
    rtt: number;
    jitter_buffer: number;
    channels: number;
    sample_rate: number;
    concealed_samples: number;
    concealment_events: number;
    codec: string;
}

export interface RawVideoStats {
    width: number;
    height: number;
    packet_lost: number;
    packet_received: number;
    bit_rate: number;
    fps: number;
    edge_rtt: number;
    rtt: number;
    codec: string;
    raw_rtt: number;
}

export interface SdkEventData {
    code?: number;
    mediaType?: "video" | "audio";
    audioStats?: RawAudioStats;
    videoStats?: RawVideoStats;
}

export interface SdkEventResponse {
    type: string;
    data?: SdkEventData;
}

// ---------------------------------------------------------------------------
// Inject stream
// ---------------------------------------------------------------------------

export interface InjectVideoOptions {
    fileUrl?: string;
    isLoop?: boolean;
    fileName?: string;
}

export interface InjectResult {
    type: string;
    status: string;
    result: unknown;
}

export interface StreamStatusResult {
    path?: string;
    status: string;
    type: string;
}
