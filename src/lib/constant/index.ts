export const COMMON_CODE = {
  SUCCESS: 0,
  FAIL: -1,
  CLOSE: 1,
} as const;

export const ERROR_CODE = {
  /** Data channel interrupted */
  DATA_CHANNEL: 0,
  /** Error while fetching stats (latency / packet loss) */
  DELAY: 1,
} as const;

export const enum MEDIA_CONTROL_TYPE {
  AUDIO_ONLY = 1,
  VIDEO_ONLY = 2,
  AUDIO_VIDEO = 3,
}

export interface ProgressInfo {
  code: number;
  msg: string;
}

export const PROGRESS_INFO = {
  WS_CONNECT:          { code: 100, msg: "WS connecting" },
  WS_SUCCESS:          { code: 101, msg: "WS connected" },
  WS_CLOSE:            { code: 102, msg: "WS closed" },
  WS_ERROR:            { code: 103, msg: "WS error" },
  WS_RETRY:            { code: 104, msg: "WS retrying" },
  OWN_JOIN_ROOM:       { code: 200, msg: "Joined room" },
  RECEIVE_OFFER:       { code: 201, msg: "Offer applied" },
  RECEIVE_OFFER_ERR:   { code: 202, msg: "Offer failed" },
  SEND_ANSWER:         { code: 203, msg: "Answer sent" },
  SEND_ANSWER_ERR:     { code: 204, msg: "Answer failed" },
  RECEIVE_ICE:         { code: 205, msg: "ICE candidate added" },
  RECEIVE_ICE_ERR:     { code: 206, msg: "ICE candidate failed" },
  SEND_ICE:            { code: 207, msg: "ICE candidate sent" },
  RTC_CONNECTING:      { code: 300, msg: "RTC connecting" },
  RTC_CONNECTED:       { code: 301, msg: "RTC connected" },
  RTC_DISCONNECTED:    { code: 302, msg: "RTC disconnected" },
  RTC_CLOSE:           { code: 303, msg: "RTC closed" },
  RTC_FAILED:          { code: 304, msg: "RTC failed" },
  RTC_TRACK_VIDEO:     { code: 305, msg: "Video track received" },
  RTC_TRACK_VIDEO_LOAD:{ code: 306, msg: "Video track loaded" },
  RTC_CHANNEL_OPEN:    { code: 307, msg: "Data channel open" },
  RTC_CHANNEL_ERR:     { code: 308, msg: "Data channel error" },
  VIDEO_UI_NUMBER:     { code: 309, msg: "Video loaded, awaiting UI info" },
  VIDEO_FIRST_FRAME:   { code: 310, msg: "First frame rendered" },
} as const satisfies Record<string, ProgressInfo>;
