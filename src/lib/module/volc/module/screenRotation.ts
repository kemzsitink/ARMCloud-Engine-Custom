import { StreamIndex } from "@volcengine/rtc";
import type { IRTCEngine } from "@volcengine/rtc";
import { isMobile, isTouchDevice } from "../../../utils/index";
import { RotateDirection } from "../../../types/index";

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

export async function setRemoteVideoRotation(state: RotationState, rotation: number) {
  const player = document.querySelector(`#${state.videoDomId}`);
  await state.engine?.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
    userId: state.options.clientId,
    renderDom: player as any,
    renderMode: 2,
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
    targetRotateType = width > height ? 1 : 0;
  }
  await rotateScreen(state, targetRotateType);
}

export async function rotateScreen(state: RotationState, type: number) {
  state.rotateType = type;
  try {
    await state.callbacks?.onBeforeRotate(type);
  } catch (_) {}

  const h5Dom = document.getElementById(state.initDomId);
  if (!h5Dom) return;

  let parentWidth  = Math.min(h5Dom.clientWidth,  window.innerWidth);
  let parentHeight = Math.min(h5Dom.clientHeight, window.innerHeight);

  const bigSide   = Math.max(parentWidth, parentHeight);
  const smallSide = Math.min(parentWidth, parentHeight);

  const wrapperBoxWidth = h5Dom.parentElement?.clientWidth ?? bigSide;
  const toolsWidth = state.options.toolsWidth ?? 0;

  if (type == RotateDirection.LANDSCAPE) {
    parentWidth  = toolsWidth && bigSide > wrapperBoxWidth ? wrapperBoxWidth - toolsWidth : bigSide;
    parentHeight = smallSide;
  } else {
    parentWidth  = smallSide;
    parentHeight = bigSide;
  }

  h5Dom.style.width  = parentWidth  + "px";
  h5Dom.style.height = parentHeight + "px";

  const videoIsLandscape = state.remoteResolution.width > state.remoteResolution.height;
  let armcloudVideoWidth  = 0;
  let armcloudVideoHeight = 0;
  let videoWrapperRotate  = 0;

  if (type == 1) {
    const w = videoIsLandscape ? state.remoteResolution.width  : state.remoteResolution.height;
    const h = videoIsLandscape ? state.remoteResolution.height : state.remoteResolution.width;
    const scale = Math.min(parentWidth / w, parentHeight / h);
    armcloudVideoWidth  = w * scale;
    armcloudVideoHeight = h * scale;
    videoWrapperRotate  = videoIsLandscape ? 0 : 270;
  } else {
    const w = videoIsLandscape ? state.remoteResolution.height : state.remoteResolution.width;
    const h = videoIsLandscape ? state.remoteResolution.width  : state.remoteResolution.height;
    const scale = Math.min(parentWidth / w, parentHeight / h);
    armcloudVideoWidth  = w * scale;
    armcloudVideoHeight = h * scale;
    videoWrapperRotate  = videoIsLandscape ? 90 : 0;
  }

  state.rotation = videoWrapperRotate;

  const videoDom = document.getElementById(state.videoDomId) as HTMLDivElement;
  if (videoDom) {
    videoDom.style.width  = `${armcloudVideoWidth}px`;
    videoDom.style.height = `${armcloudVideoHeight}px`;
  }

  await setRemoteVideoRotation(state, videoWrapperRotate);

  state.callbacks.onChangeRotate(type, {
    width:  armcloudVideoWidth,
    height: armcloudVideoHeight,
  });
}
