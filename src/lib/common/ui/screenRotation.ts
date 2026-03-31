import { StreamIndex } from "@volcengine/rtc";
import type { IRTCEngine } from "@volcengine/rtc";
import { isMobile, isTouchDevice } from "../../utils/index";
import { RotateDirection } from "../../types/index";
import { fitVideoToContainer, getRenderDom } from "./videoPlayer";

export interface RotationState {
  rotateType: number;
  rotation: number;
  isFirstRotate: boolean;
  remoteResolution: { width: number; height: number };
  options: {
    clientId: string;
    rotateType?: number;
    toolsWidth?: number;
  };
  callbacks: {
    onBeforeRotate?: (type: number) => void | Promise<void>;
    onChangeRotate: (type: number, info: { width: number; height: number }) => void;
  };
  initDomId: string;
  videoDomId: string;
  engine: IRTCEngine | null;
}

export function applyVideoPlayer(state: RotationState, rotation: number): void {
  const renderDom = getRenderDom(state.videoDomId);
  if (!renderDom) return;

  state.engine?.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
    userId: state.options.clientId,
    renderDom,
    renderMode: 1, // VideoRenderMode.RENDER_MODE_FIT
    rotation,
  });
}

export async function initRotateScreen(
  state: RotationState,
  width: number,
  height: number
): Promise<void> {
  if (isTouchDevice() || isMobile()) {
    state.options.rotateType = 0;
  }

  const { rotateType } = state.options;
  if (rotateType && state.isFirstRotate) return;
  if (!state.isFirstRotate) state.isFirstRotate = true;

  Object.assign(state.remoteResolution, { width, height });

  let targetRotateType: number;
  if (rotateType === 0 || rotateType === 1) {
    targetRotateType = rotateType;
  } else {
    targetRotateType = width > height ? RotateDirection.LANDSCAPE : RotateDirection.PORTRAIT;
  }

  await rotateScreen(state, targetRotateType);
}

export async function rotateScreen(state: RotationState, type: number): Promise<void> {
  state.rotateType = type;

  try {
    await state.callbacks?.onBeforeRotate?.(type);
  } catch (_) { /* callback may throw */ }

  const { width: rw, height: rh } = state.remoteResolution;
  const videoIsLandscape = rw > rh;

  let displayWidth: number;
  let displayHeight: number;
  let rotation: number;

  if (type === RotateDirection.LANDSCAPE) {
    if (videoIsLandscape) {
      displayWidth = rw; displayHeight = rh; rotation = 0;
    } else {
      displayWidth = rh; displayHeight = rw; rotation = 270;
    }
  } else {
    if (!videoIsLandscape) {
      displayWidth = rw; displayHeight = rh; rotation = 0;
    } else {
      displayWidth = rh; displayHeight = rw; rotation = 90;
    }
  }

  state.rotation = rotation;

  fitVideoToContainer(state.videoDomId, displayWidth, displayHeight);
  applyVideoPlayer(state, rotation);

  const renderDom = getRenderDom(state.videoDomId);
  state.callbacks.onChangeRotate(type, {
    width:  renderDom?.clientWidth  ?? displayWidth,
    height: renderDom?.clientHeight ?? displayHeight,
  });
}
