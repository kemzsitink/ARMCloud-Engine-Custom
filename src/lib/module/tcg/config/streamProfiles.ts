/**
 * ARMCLOUD H5 SDK - 分辨率/帧率/码率 映射
 * 参考文档: https://docs.armcloud.net/cn/client/h5/h5-sdk.html#设置分辨率码率帧率
 */

export type ResolutionId =
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

export type FramerateId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BitrateId =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15;

export interface ResolutionInfo {
  width: number;
  height: number;
}

export interface FramerateInfo {
  fps: number;
}

export interface BitrateInfo {
  kbps: number;
}

/** 分辨率ID -> 宽高 */
export const RESOLUTION_BY_ID: Record<ResolutionId, ResolutionInfo> = {
  7: { width: 144, height: 256 },
  8: { width: 216, height: 384 },
  9: { width: 288, height: 512 },
  10: { width: 360, height: 640 },
  11: { width: 480, height: 848 },
  12: { width: 540, height: 960 },
  13: { width: 600, height: 1024 },
  14: { width: 480, height: 1280 },
  15: { width: 720, height: 1280 },
  16: { width: 720, height: 1920 },
  17: { width: 1080, height: 1920 },
  18: { width: 1440, height: 1920 },
  19: { width: 1600, height: 2560 },
  20: { width: 2880, height: 1080 },
};

/** 帧率ID -> fps */
export const FRAMERATE_BY_ID: Record<FramerateId, FramerateInfo> = {
  1: { fps: 20 },
  2: { fps: 25 },
  3: { fps: 30 },
  4: { fps: 60 },
  5: { fps: 1 },
  6: { fps: 5 },
  7: { fps: 10 },
  8: { fps: 15 },
  9: { fps: 2 },
};

/** 码率ID -> kbps */
export const BITRATE_BY_ID: Record<BitrateId, BitrateInfo> = {
  1: { kbps: 1000 },
  2: { kbps: 1500 },
  3: { kbps: 2000 },
  4: { kbps: 2500 },
  5: { kbps: 3000 },
  6: { kbps: 3500 },
  7: { kbps: 4000 },
  8: { kbps: 5000 },
  9: { kbps: 6000 },
  10: { kbps: 8000 },
  11: { kbps: 10000 },
  12: { kbps: 12000 },
  13: { kbps: 200 },
  14: { kbps: 400 },
  15: { kbps: 600 },
};

/** 辅助函数 */
export function getResolution(definitionId: ResolutionId): ResolutionInfo {
  return RESOLUTION_BY_ID[definitionId];
}

export function getFps(framerateId: FramerateId): number {
  return FRAMERATE_BY_ID[framerateId].fps;
}

export function getKbps(bitrateId: BitrateId): number {
  return BITRATE_BY_ID[bitrateId].kbps;
}
