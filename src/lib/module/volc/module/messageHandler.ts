import type { IRTCEngine } from "@volcengine/rtc";
import VERTC from "@volcengine/rtc";
import { copyText } from "../../../utils/index";
import { MediaType, MessageKey, TouchType } from "../../../types/webrtcType";
import { cameraInject, microphoneInject, stopMediaStream } from "./mediaStream";
import type { MediaStreamState } from "./mediaStream";

export interface MessageHandlerContext extends MediaStreamState {
  engine: IRTCEngine | null;
  enableCamera: boolean;
  enableMicrophone: boolean;
  remoteResolution: { width: number; height: number };
  roomMessage: any;
  inputElement: HTMLInputElement | null;
  enterkeyhintObj: Record<number, string>;
  promiseMap: any;
  sendMessage: (userId: string, msg: string, notSendInGroups?: boolean) => any;
  initRotateScreen: (width: number, height: number) => Promise<void>;
}

export function setupRoomMessageHandler(ctx: MessageHandlerContext) {
  ctx.engine?.on(VERTC.events.onRoomMessageReceived, async (e: { userId: string; message: string }) => {
    if (!e.message) return;
    const msg = JSON.parse(e.message);

    if (msg.key === "message") {
      ctx.callbacks.onTransparentMsg(0, msg.data);
    }

    if (msg.key === "refreshUiType") {
      const msgData = JSON.parse(msg.data);
      ctx.roomMessage.isVertical = msgData.isVertical;
      if (msgData.width == ctx.remoteResolution.width && msgData.height == ctx.remoteResolution.height) return;
      ctx.initRotateScreen(msgData.width, msgData.height);
    }

    if (msg.key === "inputState" && ctx.inputElement) {
      handleInputState(ctx, msg);
    }

    if (msg.key === "clipboard" && ctx.options.saveCloudClipboard) {
      const msgData = JSON.parse(msg.data);
      copyText(msgData?.content || "");
      ctx.callbacks.onOutputClipper(msgData);
    }
  });
}

export function setupUserMessageHandler(ctx: MessageHandlerContext) {
  const parseResolution = (resolution: string) => {
    const [width, height] = resolution?.split("*").map(Number);
    return { width, height };
  };

  ctx.engine?.on(VERTC.events.onUserMessageReceived, async (e: { userId: string; message: string }) => {
    if (!e.message) return;
    const msg = JSON.parse(e.message);

    if (msg.key === MessageKey.CALL_BACK_EVENT) {
      const callData = JSON.parse(msg.data);
      const result = JSON.parse(callData.data);
      switch (callData.type) {
        case MessageKey.DEFINITION:
          ctx.callbacks.onChangeResolution({
            from: parseResolution(result.from),
            to: parseResolution(result.to),
          });
          break;
        case MessageKey.START_INJECTION_VIDEO:
        case MessageKey.STOP_INJECTION_VIDEO: {
          const { resolve: injectResolve } = ctx.promiseMap.injectStatus;
          if (injectResolve) {
            injectResolve({ type: callData.type, status: result?.isSuccess ? "success" : "error", result });
            ctx.promiseMap.injectStatus.resolve = null;
          }
          ctx.callbacks?.onInjectVideoResult(callData.type, result);
          break;
        }
        case MessageKey.INJECTION_VIDEO_STATS: {
          const { resolve } = ctx.promiseMap.streamStatus;
          resolve?.({ path: result.path, status: result.status || (result.path ? "live" : "offline"), type: "video" });
          break;
        }
        case MessageKey.OPERATE_SWITCH:
          ctx.callbacks?.onMonitorOperation(result);
          break;
      }
    }

    if (msg.key === MessageKey.EQUIPMENT_INFO) {
      ctx.callbacks?.onEquipmentInfo(JSON.parse(msg.data || []));
    }
    if (msg.key === MessageKey.INPUT_ADB) {
      ctx.callbacks?.onAdbOutput(JSON.parse(msg.data || {}));
    }

    if (msg.key === MessageKey.VIDEO_AND_AUDIO_CONTROL) {
      const msgData = JSON.parse(msg.data);
      ctx.callbacks.onMediaDevicesToggle({ type: "media", enabled: msgData.isOpen, isFront: msgData.isFront });
      if (!ctx.enableMicrophone && !ctx.enableCamera) return;
      const pushType = ctx.enableMicrophone && ctx.enableCamera
        ? MediaType.AUDIO_AND_VIDEO
        : ctx.enableCamera ? MediaType.VIDEO : MediaType.AUDIO;
      if (msgData.isOpen) {
        if (ctx.enableCamera) await cameraInject(ctx, ctx.sendMessage, msgData).catch((e) => ctx.callbacks.onVideoError(e));
        if (ctx.enableMicrophone) await microphoneInject(ctx, ctx.sendMessage).catch((e) => ctx.callbacks.onAudioError(e));
      } else {
        await stopMediaStream(ctx, ctx.sendMessage, pushType);
      }
    }

    if (msg.key === MessageKey.INPUT_STATE && ctx.inputElement) {
      handleInputState(ctx, msg);
    }

    if (msg.key === MessageKey.VIDEO_CONTROL) {
      const msgData = JSON.parse(msg.data);
      ctx.callbacks.onMediaDevicesToggle({ type: "camera", enabled: msgData.isOpen, isFront: msgData.isFront });
      if (!ctx.enableCamera) return;
      if (msgData.isOpen) {
        await cameraInject(ctx, ctx.sendMessage, msgData).catch((e) => ctx.callbacks.onVideoError(e));
      } else {
        await stopMediaStream(ctx, ctx.sendMessage, MediaType.VIDEO);
      }
    }

    if (msg.key === MessageKey.AUDIO_CONTROL) {
      const msgData = JSON.parse(msg.data);
      ctx.callbacks.onMediaDevicesToggle({ type: "microphone", enabled: msgData.isOpen });
      if (!ctx.enableMicrophone) return;
      if (msgData.isOpen) {
        await microphoneInject(ctx, ctx.sendMessage).catch((e) => ctx.callbacks.onAudioError(e));
      } else {
        await stopMediaStream(ctx, ctx.sendMessage, MediaType.AUDIO);
      }
    }
  });
}

export function handleInputState(ctx: MessageHandlerContext, msg: any) {
  const { allowLocalIMEInCloud, keyboard } = ctx.options;
  const msgData = JSON.parse(msg.data);
  ctx.roomMessage.inputStateIsOpen = msgData.isOpen;
  const hint = ctx.enterkeyhintObj[msgData.imeOptions as any];
  if (hint) ctx.inputElement?.setAttribute("enterkeyhint", hint);
  const shouldHandleFocus = (allowLocalIMEInCloud && keyboard === "pad") || keyboard === "local";
  if (shouldHandleFocus && typeof msgData.isOpen === "boolean") {
    msgData.isOpen ? ctx.inputElement?.focus() : ctx.inputElement?.blur();
  }
}
