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
  options: any;
  callbacks: any;
  initDomId: string;
  videoDomId: string;
  engine: IRTCEngine | null;
}

/**
 * Re-bind SDK renderer to the inner renderDom with correct rotation.
 * renderMode=1 (FIT): SDK letterboxes inside renderDom — but since renderDom
 * already has the exact stream AR, there will be no letterbox.
 */
export function applyVideoPlayer(state: RotationState, rotation: number) {
  const renderDom = getRenderDom(state.videoDomId);
  if (!renderDom) return;

  state.engine?.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
    userId: state.options.clientId,
    renderDom,
    renderMode: 1, // FIT
    rotation,
  });
}

export async function initRotateScreen(state: RotationState, width: number, height: number) {
  if (isTouchDevice() || isMobile()) {
    state.options.rotateType = 0;
  }

  const { rotateType } = state.options;
  if (rotateType && state.isFirstRotate) return;
  if (!state.isFirstRotate) state.isFirstRotate = true;

  Object.assign(state.remoteResolution, { width, height });

  let targetRotateType: number;
  if (rotateType == 0 || rotateType == 1) {
    targetRotateType = rotateType;
  } else {
    targetRotateType = width > height ? RotateDirection.LANDSCAPE : RotateDirection.PORTRAIT;
  }

  await rotateScreen(state, targetRotateType);
}

export async function rotateScreen(state: RotationState, type: number) {
  state.rotateType = type;

  try {
    await state.callbacks?.onBeforeRotate(type);
  } catch (_) {}

  const { width: rw, height: rh } = state.remoteResolution;
  const videoIsLandscape = rw > rh;

  // Effective stream dimensions after rotation
  // When we rotate 90/270, width and height swap from the viewer's perspective
  let displayWidth: number;
  let displayHeight: number;
  let rotation = 0;

  if (type === RotateDirection.LANDSCAPE) {
    if (videoIsLandscape) {
      // Stream already landscape — no rotation needed
      displayWidth  = rw;
      displayHeight = rh;
      rotation = 0;
    } else {
      // Stream is portrait, rotate 270° to show landscape
      displayWidth  = rh;
      displayHeight = rw;
      rotation = 270;
    }
  } else {
    // PORTRAIT
    if (!videoIsLandscape) {
      // Stream already portrait — no rotation needed
      displayWidth  = rw;
      displayHeight = rh;
      rotation = 0;
    } else {
      // Stream is landscape, rotate 90° to show portrait
      displayWidth  = rh;
      displayHeight = rw;
      rotation = 90;
    }
  }

  state.rotation = rotation;

  // Resize renderDom to match the effective display aspect ratio
  fitVideoToContainer(state.videoDomId, displayWidth, displayHeight);

  // Re-bind SDK renderer with new rotation
  applyVideoPlayer(state, rotation);

  const renderDom = getRenderDom(state.videoDomId);
  state.callbacks.onChangeRotate(type, {
    width:  renderDom?.clientWidth  ?? displayWidth,
    height: renderDom?.clientHeight ?? displayHeight,
  });
}
