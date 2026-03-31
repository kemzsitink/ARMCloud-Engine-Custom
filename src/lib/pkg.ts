import "webrtc-adapter";
import axios from "axios";

import VolcRtc, { type VolcRtcOptions, type VolcRtcCallbacks } from "./module/volc/volcRtc";
import armcloudRtc from "./module/p2p/webRtc";
import tcgRtc from "./module/tcg/tcgRtc";
import { KeyboardMode } from "./types/index";
import type { ArmcloudEngineParams, ArmcloudCallbacks } from "./types/index";
import { MediaType } from "./types/webrtcType";
import { COMMON_CODE } from "./constant/index";

export class ArmcloudEngine {
  version: string = "CUSTOM";

  rtcInstance: any = null;
  callbacks: ArmcloudCallbacks | null = null;
  streamType: number | null = null;

  private axiosSource: any = null;
  private viewId: string = "";

  constructor(params: ArmcloudEngineParams) {
    this.viewId = params.viewId;
    this.axiosSource = axios.CancelToken.source();
    this.callbacks = params.callbacks ?? {};

    // validate
    if (!params.token) throw new Error("token is required");
    if (!params.baseUrl) throw new Error("baseUrl is required");
    if (!params.viewId) throw new Error("viewId is required");
    if (!params.deviceInfo?.padCode) throw new Error("deviceInfo.padCode is required");
    if (!params.deviceInfo?.userId) throw new Error("deviceInfo.userId is required");
    if (!/^[a-zA-Z0-9_\-@]{1,128}$/.test(params.deviceInfo.userId)) {
      throw new Error("userId format invalid");
    }

    const uuid = params.uuid || localStorage.getItem("armcloud_uuid") || this._uuid();
    localStorage.setItem("armcloud_uuid", uuid);

    axios.post(
      `${params.baseUrl}/rtc/open/room/applyToken`,
      {
        sdkTerminal: "h5",
        userId: params.deviceInfo.userId,
        padCode: params.deviceInfo.padCode,
        uuid,
        expire: 86400,
        videoStream: params.deviceInfo.videoStream,
      },
      {
        headers: { "Content-Type": "application/json", token: params.token },
        cancelToken: this.axiosSource.token,
      }
    )
    .then((res) => {
      if (res.data.code !== 200) {
        this.callbacks?.onInit?.({ code: res.data.code, msg: res.data.msg, uuid });
        return;
      }

      const data = res.data.data;
      this.streamType = data.streamType;

      if (data.streamType === 1) {
        const opts: VolcRtcOptions = {
          appId: data.appId, roomCode: data.roomCode, roomToken: data.roomToken,
          userId: params.deviceInfo.userId,
          clientId: params.deviceInfo.padCode,
          mediaType: params.deviceInfo.mediaType ?? MediaType.VIDEO,
          videoStream: params.deviceInfo.videoStream
            ? { frameRate: String(params.deviceInfo.videoStream.frameRate), bitrate: String(params.deviceInfo.videoStream.bitrate) }
            : undefined,
          disable: params.disable,
          disableLocalIME: params.deviceInfo.disableLocalIME,
          autoRecoveryTime: params.deviceInfo.autoRecoveryTime,
          baseUrl: params.baseUrl,
        };
        const cbs: VolcRtcCallbacks = {
          onConnectSuccess:         this.callbacks?.onConnectSuccess,
          onConnectFail:            this.callbacks?.onConnectFail
            ? (e) => this.callbacks!.onConnectFail!({ code: Number(e.code), msg: e.msg })
            : undefined,
          onConnectionStateChanged: this.callbacks?.onConnectionStateChanged,
          onUserJoined:             this.callbacks?.onUserJoined,
          onUserLeave:              this.callbacks?.onUserLeave,
          onRenderedFirstFrame:     this.callbacks?.onRenderedFirstFrame,
          onRunInformation:         this.callbacks?.onRunInformation,
          onNetworkQuality:         this.callbacks?.onNetworkQuality
            ? (up, down) => this.callbacks!.onNetworkQuality!(up as any, down as any)
            : undefined,
          onErrorMessage:           this.callbacks?.onErrorMessage,
          onAutoplayFailed:         this.callbacks?.onAutoplayFailed,
          onSendUserError:          this.callbacks?.onSendUserError,
        };
        this.rtcInstance = new VolcRtc(params.viewId, opts, cbs);

      } else if (data.streamType === 2) {
        const rtcOpts = {
          ...params.deviceInfo, token: params.token, baseUrl: params.baseUrl,
          clientId: params.deviceInfo.padCode, padCode: params.deviceInfo.padCode,
          roomToken: data.roomToken, signalServer: data.signalServer,
          stuns: data.stuns, turns: data.turns,
          masterIdPrefix: params.masterIdPrefix ?? "",
          retryCount: params.retryCount ?? 2, retryTime: params.retryTime ?? 2000,
          keyboard: params.deviceInfo.keyboard ?? KeyboardMode.PAD,
        };
        this.rtcInstance = new armcloudRtc(params.viewId, rtcOpts as any, this.callbacks as any);

      } else if (data.streamType === 3) {
        const rtcOpts = {
          ...params.deviceInfo, token: params.token, baseUrl: params.baseUrl,
          clientId: params.deviceInfo.padCode, padCode: params.deviceInfo.padCode,
          roomToken: data.roomToken, accessInfo: data.accessInfo,
          masterIdPrefix: params.masterIdPrefix ?? "",
          keyboard: params.deviceInfo.keyboard ?? KeyboardMode.PAD,
        };
        this.rtcInstance = new tcgRtc(params.viewId, rtcOpts as any, this.callbacks as any);
      }

      this.callbacks?.onInit?.({ code: COMMON_CODE.SUCCESS, msg: "ok", streamType: this.streamType ?? undefined, uuid });
    })
    .catch((err) => {
      if (axios.isCancel(err)) return;
      this.callbacks?.onInit?.({ code: COMMON_CODE.FAIL, msg: err.message, uuid });
    });
  }

  // ─── core ────────────────────────────────────────────────────────────────────

  static isSupported() {
    if (!window.RTCPeerConnection) return false;
    try { const pc = new RTCPeerConnection(); pc.createDataChannel("t"); pc.close(); return true; }
    catch { return false; }
  }

  start(isGroupControl = false, pads: string[] = []) { this.rtcInstance?.start(isGroupControl, pads); }

  async stop() {
    this.axiosSource?.cancel();
    this.axiosSource = null;
    return this.rtcInstance?.stop();
  }

  muted()     { this.rtcInstance?.muted(); }
  unmuted()   { this.rtcInstance?.unmuted(); }
  startPlay() { this.rtcInstance?.startPlay(); }

  // ─── input ───────────────────────────────────────────────────────────────────

  sendInputString(text: string, forwardOff?: boolean)  { this.rtcInstance?.sendInputString?.(text, forwardOff); }
  sendInputClipper(text: string, forwardOff?: boolean) { this.rtcInstance?.sendInputClipper?.(text, forwardOff); }

  // ─── group control ───────────────────────────────────────────────────────────

  joinGroupRoom(pads: string[] = [])  { this.rtcInstance?.joinGroupRoom?.(pads); }
  kickItOutRoom(pads: string[] = [])  { this.rtcInstance?.kickItOutRoom?.(pads); }
  toggleGroupControlSync(flag = true) { this.rtcInstance?.toggleGroupControlSync?.(flag); }

  // ─── media ───────────────────────────────────────────────────────────────────

  setMicrophone(val: boolean) { this.rtcInstance?.setMicrophone?.(val); }
  setCamera(val: boolean)     { this.rtcInstance?.setCamera?.(val); }
  setVideoDeviceId(val: string) { this.rtcInstance?.setVideoDeviceId?.(val); }
  setAudioDeviceId(val: string) { this.rtcInstance?.setAudioDeviceId?.(val); }
  startMediaStream(mediaType: MediaType) { return this.rtcInstance?.startMediaStream?.(mediaType); }
  stopMediaStream(mediaType: MediaType)  { return this.rtcInstance?.stopMediaStream?.(mediaType); }

  // ─── utils ───────────────────────────────────────────────────────────────────

  getRequestId() { return this.rtcInstance?.getRequestId?.(); }

  private _uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

export default ArmcloudEngine;
