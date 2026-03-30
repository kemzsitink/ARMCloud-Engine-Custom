import type { IRTCEngine } from "@volcengine/rtc";
import customGroupRtc from "./customGroupRtc";
import VERTC, { StreamIndex } from "@volcengine/rtc";
import Shake from "../../common/shake";
import type { CustomDefinition, TouchInfo } from "../../types/index";
import { KeyboardMode, RotateDirection } from "../../types/index";
import { generateTouchCoord } from "../../common/mixins";
import { copyText } from "../../utils/index";
import { addInputElement } from "../../common/textInput";
import ScreenshotOverlay from "../../common/screenshotOverlay";
import { MetricsReporter, ReportEventType } from "../../common/metrics-reporter";
import { MediaType, MessageKey, SdkEventType, TouchType, MediaOperationType } from "../../types/webrtcType";
import { getFps, getKbps, type FramerateId, type BitrateId } from "../tcg/config/streamProfiles";
import { bindTouchEvents } from "./module/touchHandler";
import { startMediaStream, stopMediaStream, cameraInject, microphoneInject, type MediaStreamState } from "./module/mediaStream";
import { setupRoomMessageHandler, setupUserMessageHandler } from "./module/messageHandler";
import { initRotateScreen, rotateScreen, setRemoteVideoRotation, type RotationState } from "./module/screenRotation";

class customRtc {
  private initDomId: string = "";
  private videoDomId: string = "";
  private hasPushDown: boolean = false;
  private enableMicrophone: boolean = true;
  private enableCamera: boolean = true;
  private screenShotInstance: ScreenshotOverlay | null = null;
  private isFirstRotate: boolean = false;
  private metricsReporter: MetricsReporter | null = null;
  private remoteResolution = { width: 0, height: 0 };
  private touchConfig: any = {
    action: 0,
    widthPixels: document.body.clientWidth,
    heightPixels: document.body.clientHeight,
    pointCount: 1,
    touchType: "gesture",
    properties: [],
    coords: [],
  };
  private _listenKeyboardShortcut: (e: KeyboardEvent) => void = () => {};
  private touchInfo: TouchInfo = generateTouchCoord();
  private simulateTouchInfo: TouchInfo = generateTouchCoord();
  private options: any;
  private groupControlSync: boolean = true;
  private engine: IRTCEngine | null = null;
  private groupEngine: IRTCEngine | null = null;
  private groupRtc: any | null = null;
  private inputElement: HTMLInputElement | null = null;
  private promiseMap: any = {
    streamStatus: { resolve: () => {}, reject: () => {} },
    injectStatus: { resolve: null, reject: null },
  };
  public roomMessage: any = {};
  public autoRecoveryTimer: any = null;
  public isFirstFrame: boolean = false;
  public firstFrameCount: number = 0;
  public rotation: number = 0;
  public isGroupControl: boolean = false;
  private metricsTimer: any = null;
  public enterkeyhintObj: Record<number, string> = {
    2: "go", 3: "search", 4: "send", 5: "next", 6: "done", 7: "previous",
  };
  public callbacks: any = {};
  public remoteUserId: string = "";
  private rotateType: number = 0;
  private videoDeviceId: string = "";
  private audioDeviceId: string = "";
  private isCameraInject: boolean = false;
  private isMicrophoneInject: boolean = false;
  private cameraResolution = { width: 0, height: 0 };
  private _visibilityHandler: (() => void) | null = null;

  constructor(viewId: string, params: any, callbacks: any) {
    const { masterIdPrefix, padCode } = params;
    this.initDomId = viewId;
    this.options = params;
    this.callbacks = callbacks;
    this.remoteUserId = params.padCode;
    this.enableMicrophone = params.enableMicrophone;
    this.enableCamera = params.enableCamera;
    this.videoDeviceId = params.videoDeviceId;
    this.audioDeviceId = params.audioDeviceId;

    const h5Dom = document.getElementById(this.initDomId);
    const newDiv = document.createElement("div");
    const divId = `${masterIdPrefix}_${padCode}_armcloudVideo`;
    newDiv.setAttribute("id", divId);
    this.videoDomId = divId;
    h5Dom?.appendChild(newDiv);
    this.createEngine();
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private _mediaState(): MediaStreamState {
    return {
      isCameraInject: this.isCameraInject,
      isMicrophoneInject: this.isMicrophoneInject,
      videoDeviceId: this.videoDeviceId,
      audioDeviceId: this.audioDeviceId,
      options: this.options,
      callbacks: this.callbacks,
      engine: this.engine,
      enableCamera: this.enableCamera,
      enableMicrophone: this.enableMicrophone,
    };
  }

  private _rotationState(): RotationState {
    return {
      rotateType: this.rotateType,
      rotation: this.rotation,
      isFirstRotate: this.isFirstRotate,
      remoteResolution: this.remoteResolution,
      options: this.options,
      callbacks: this.callbacks,
      initDomId: this.initDomId,
      videoDomId: this.videoDomId,
      engine: this.engine,
    };
  }

  private _syncFromMediaState(s: MediaStreamState) {
    this.isCameraInject = s.isCameraInject;
    this.isMicrophoneInject = s.isMicrophoneInject;
  }

  private _syncFromRotationState(s: RotationState) {
    this.rotateType = s.rotateType;
    this.rotation = s.rotation;
    this.isFirstRotate = s.isFirstRotate;
  }

  getMsgTemplate(touchType: string, content: object) {
    return JSON.stringify({ touchType, content: JSON.stringify(content) });
  }

  isSupported() { return VERTC.isSupported(); }
  setMicrophone(val: boolean) { this.enableMicrophone = val; }
  setCamera(val: boolean) { this.enableCamera = val; }

  // ─── device ─────────────────────────────────────────────────────────────────

  async setVideoDeviceId(val: string) {
    this.videoDeviceId = val;
    if (this.isCameraInject) await this._cameraInject();
  }

  async setAudioDeviceId(val: string) {
    this.audioDeviceId = val;
    if (this.isMicrophoneInject) await this._microphoneInject();
  }

  // ─── recovery timer ─────────────────────────────────────────────────────────

  triggerRecoveryTimeCallback() {
    if (this.options.disable || !this.options.autoRecoveryTime || this.isCameraInject || this.isMicrophoneInject) return;
    if (this.autoRecoveryTimer) clearTimeout(this.autoRecoveryTimer);
    this.autoRecoveryTimer = setTimeout(() => {
      this.stop();
      this.callbacks.onAutoRecoveryTime();
    }, this.options.autoRecoveryTime * 1000);
  }

  // ─── video encoder ───────────────────────────────────────────────────────────

  setVideoEncoder(width: number, height: number) {
    if (!width || !height) return;
    this.cameraResolution = { width, height };
    const { frameRate, bitrate } = this.options.videoStream;
    this.engine?.setVideoEncoderConfig({
      width, height,
      frameRate: getFps(frameRate as FramerateId),
      maxKbps: getKbps(bitrate as BitrateId),
    });
  }

  // ─── engine ──────────────────────────────────────────────────────────────────

  async createEngine() {
    if (!this.inputElement && !this.options.disable && !this.options.disableLocalIME) {
      addInputElement(this);
    }
    this.engine = VERTC.createEngine(this.options.appId);
    VERTC.setParameter("ICE_CONFIG_REQUEST_URLS", [
      "rtcg-access.volcvideos.com", "rtcg-access-va.volcvideos.com",
      "rtcg-access-fr.volcvideos.com", "rtcg-access-sg.volcvideos.com",
      "rtc-access-ag.bytedance.com", "rtc-access.bytedance.com",
      "rtc-access2-hl.bytedance.com", "rtcg-access.bytevcloud.com",
    ]);
    // ── Jitter stepper: tắt hoàn toàn, set thủ công sau subscribe
    VERTC.setParameter("JITTER_STEPPER_INTERVAL_MS" as any, 0);
    VERTC.setParameter("JITTER_STEPPER_MAX_AV_SYNC_DIFF" as any, 0);
    VERTC.setParameter("JITTER_STEPPER_MAX_SET_DIFF" as any, 0);
    VERTC.setParameter("JITTER_STEPPER_STEP_SIZE_MS" as any, 1);
    VERTC.setParameter("JITTER_STEPPER_MAX_DIFF_EXCEED_COUNT" as any, 0);
    // ── ICE: pre-gather trước joinRoom
    VERTC.setParameter("PRE_ICE" as any, true);
    // ── Hardware codec: giảm encode/decode latency
    VERTC.setParameter("H264_HW_ENCODER" as any, true);
    // ── Tắt stall detection: tránh buffer inflate giả
    VERTC.setParameter("AUDIO_STALL" as any, false);
    VERTC.setParameter("VIDEO_STALL" as any, false);
    VERTC.setParameter("VIDEO_STALL_100MS" as any, false);
    // ── Stats nhanh hơn
    VERTC.setParameter("STATS_LOOP_INTERVAL" as any, 500);
    // ── Tắt overhead không cần thiết
    VERTC.setParameter("DISABLE_COMPUTE_PRESSURE" as any, true);

    this.engine?.on(VERTC.events.onLocalVideoSizeChanged, (r) => {
      const { width, height } = r?.info || {};
      this.setVideoEncoder(width, height);
    });
    this.engine.on(VERTC.events.onError, (e) => this.callbacks.onErrorMessage(e));
    this.engine.on(VERTC.events.onAutoplayFailed, (e) => this.callbacks.onAutoplayFailed(e));
    this.engine.on(VERTC.events.onRemoteStreamStats, (e) => this.callbacks.onRunInformation(e));
    this.engine.on(VERTC.events.onNetworkQuality, (up: number, down: number) =>
      this.callbacks.onNetworkQuality(up, down)
    );
  }

  destroyEngine() {
    if (this.engine) VERTC.destroyEngine(this.engine);
    if (this.groupEngine) VERTC.destroyEngine(this.groupEngine);
  }

  // ─── group control ───────────────────────────────────────────────────────────

  async createGroupEngine(pads = [], config?: any) {
    this.groupRtc = new customGroupRtc({ ...this.options, ...config }, pads, this.callbacks);
    try {
      const example = await this.groupRtc.getEngine();
      this.groupEngine = example.engine;
    } catch (error: any) {
      this.callbacks.onGroupControlError({ code: error.code, msg: error.message });
    }
  }

  public kickItOutRoom(pads: Array<string>) {
    if (Array.isArray(pads)) this.groupRtc?.kickItOutRoom(pads);
  }

  public joinGroupRoom(pads: any) {
    const arr = pads?.filter((v: any) => v !== this.remoteUserId);
    if (!arr.length || !this.isGroupControl) return;
    if (!this.groupRtc && this.isGroupControl) { this.createGroupEngine(arr); return; }
    this.groupRtc?.joinRoom(arr);
  }

  public toggleGroupControlSync(flag: boolean = true) {
    if (!this.isGroupControl) return;
    this.groupControlSync = flag;
  }

  public sendGroupInputString(pads: any, strs: any) {
    strs?.map((v: string, index: number) => {
      this.groupRtc?.sendRoomMessage(JSON.stringify({ text: v, pads: [pads[index]], touchType: TouchType.INPUT_BOX }));
    });
  }

  public sendGroupInputClipper(pads: any, strs: any) {
    strs?.map((v: string, index: number) => {
      this.groupRtc?.sendRoomMessage(JSON.stringify({ text: v, pads: [pads[index]], touchType: TouchType.CLIPBOARD }));
    });
  }

  async sendGroupRoomMessage(message: string) {
    return await this?.groupRtc?.sendRoomMessage(message);
  }

  // ─── messaging ───────────────────────────────────────────────────────────────

  sendUserMessage(userId: string, message: string, notSendInGroups?: boolean) {
    // Chỉ reset recovery timer khi user thực sự tương tác (không phải mỗi message)
    if (!notSendInGroups) this.triggerRecoveryTimeCallback();
    if (!notSendInGroups && this.groupControlSync) this.sendGroupRoomMessage(message);
    const p = this.engine?.sendUserMessage(userId, message);
    p?.catch((error: any) => this.callbacks?.onSendUserError(error));
    return p;
  }

  // ─── media stream ────────────────────────────────────────────────────────────

  muted()   { this.engine?.unsubscribeStream(this.options.clientId, MediaType.AUDIO); }
  unmuted() { this.engine?.subscribeStream(this.options.clientId, MediaType.AUDIO); }
  startPlay() { if (this.engine) this.engine.play(this.options.clientId); }

  async startMediaStream(mediaType: MediaType, msgData?: any) {
    const s = this._mediaState();
    const res = await startMediaStream(s, this.sendUserMessage.bind(this), mediaType, msgData);
    this._syncFromMediaState(s);
    return res;
  }

  async stopMediaStream(mediaType: MediaType) {
    const s = this._mediaState();
    await stopMediaStream(s, this.sendUserMessage.bind(this), mediaType);
    this._syncFromMediaState(s);
  }

  private async _cameraInject(msgData?: any) {
    const s = this._mediaState();
    try {
      await cameraInject(s, this.sendUserMessage.bind(this), msgData);
    } catch (e) { this.callbacks.onVideoError(e); }
    this._syncFromMediaState(s);
  }

  private async _microphoneInject() {
    const s = this._mediaState();
    try {
      await microphoneInject(s, this.sendUserMessage.bind(this));
    } catch (e) { this.callbacks.onAudioError(e); }
    this._syncFromMediaState(s);
  }

  // ─── inject stream status ────────────────────────────────────────────────────

  getInjectStreamStatus(type: "video" | "camera" | "audio", timeout: number = 0) {
    return new Promise((resolve) => {
      let timeoutHandler: any = null;
      if (timeout !== 0) {
        timeoutHandler = setTimeout(() => resolve({ status: "unknown", type }), timeout);
      }
      switch (type) {
        case "video":
          try {
            Object.assign(this.promiseMap.streamStatus, {
              resolve: (result: any) => { if (timeoutHandler) clearTimeout(timeoutHandler); resolve(result); },
            });
            this.sendUserMessage(this.options.clientId, this.getMsgTemplate(TouchType.EVENT_SDK, { type: "injectionVideoStats" }), true);
          } catch { if (timeoutHandler) clearTimeout(timeoutHandler); resolve({ status: "unknown", type }); }
          break;
        case "camera":
          if (timeoutHandler) clearTimeout(timeoutHandler);
          resolve({ status: this.isCameraInject ? "live" : "offline", type });
          break;
        case "audio":
          if (timeoutHandler) clearTimeout(timeoutHandler);
          resolve({ status: this.isMicrophoneInject ? "live" : "offline", type });
          break;
      }
    });
  }

  injectVideoStream(
    type: MessageKey.START_INJECTION_VIDEO | MessageKey.STOP_INJECTION_VIDEO,
    options: any, timeout: number = 0, forwardOff: boolean = true
  ) {
    return new Promise(async (resolve) => {
      const userId = this.options.clientId;
      if (!userId) return;
      let timeoutHandler: any = null;
      if (timeout) {
        timeoutHandler = setTimeout(() => resolve({ type, status: "timeout", result: null }), timeout);
      }
      try {
        Object.assign(this.promiseMap.injectStatus, {
          resolve: (result: any) => { if (timeoutHandler) clearTimeout(timeoutHandler); resolve(result); },
        });
        const message = JSON.stringify({
          touchType: TouchType.EVENT_SDK,
          content: JSON.stringify(
            type === MessageKey.START_INJECTION_VIDEO
              ? { type, fileUrl: options?.fileUrl, isLoop: options?.isLoop ?? true, fileName: options?.fileName }
              : { type }
          ),
        });
        await this.sendUserMessage(userId, message, forwardOff);
      } catch { resolve({ type, status: "unknown", result: null }); }
    });
  }

  // ─── equipment / adb ─────────────────────────────────────────────────────────

  getEquipmentInfo(type: "app" | "attr") {
    this.sendUserMessage(this.options.clientId, this.getMsgTemplate(TouchType.EQUIPMENT_INFO, { type }), true);
  }

  appUnInstall(pkgNames: Array<string>) {
    this.sendUserMessage(this.options.clientId, this.getMsgTemplate(TouchType.APP_UNINSTALL, pkgNames), true);
  }

  executeAdbCommand(command: string, forwardOff: boolean = true) {
    this.sendUserMessage(this.options.clientId, JSON.stringify({
      touchType: "eventSdk",
      content: JSON.stringify({ type: "inputAdb", content: command }),
    }), forwardOff);
  }

  setMonitorOperation(isMonitor: boolean, forwardOff: boolean = true) {
    this.sendUserMessage(this.options.clientId, this.getMsgTemplate(TouchType.EVENT_SDK, {
      type: MessageKey.OPERATE_SWITCH, isOpen: isMonitor,
    }), forwardOff);
  }

  // ─── input / clipboard ───────────────────────────────────────────────────────

  async sendInputClipper(inputStr: string, forwardOff: boolean = false) {
    await this.sendUserMessage(this.options.clientId, JSON.stringify({ text: inputStr, touchType: TouchType.CLIPBOARD }), forwardOff);
  }

  async sendInputString(inputStr: string, forwardOff: boolean = false) {
    await this.sendUserMessage(this.options.clientId, JSON.stringify({ text: inputStr, touchType: TouchType.INPUT_BOX }), forwardOff);
  }

  setKeyboardStyle(keyBoardType: KeyboardMode) {
    this.options.keyboard = keyBoardType;
    this.sendUserMessage(this.options.clientId, JSON.stringify({
      touchType: "eventSdk",
      content: JSON.stringify({ type: "keyBoardType", isLocalKeyBoard: keyBoardType === "local" }),
    }));
  }

  async onCheckInputState() {
    await this.sendUserMessage(this.options.clientId, JSON.stringify({ touchType: "inputState" }));
  }

  saveCloudClipboard(flag: boolean) {
    this.options.saveCloudClipboard = flag;
  }

  // ─── stream config ───────────────────────────────────────────────────────────

  setStreamConfig(config: CustomDefinition, forwardOff: boolean = true) {
    const regExp = /^[1-9]\d*$/;
    if (config.definitionId && config.framerateId && config.bitrateId) {
      if (Object.values(config).every((v) => regExp.test(v))) {
        this.sendUserMessage(this.options.clientId, JSON.stringify({
          touchType: TouchType.EVENT_SDK,
          content: JSON.stringify({
            type: SdkEventType.DEFINITION_UPDATE,
            definitionId: config.definitionId,
            framerateId: config.framerateId,
            bitrateId: config.bitrateId,
          }),
        }), forwardOff);
      }
    }
  }

  pauseAllSubscribedStream(mediaType: number = 3) {
    this.triggerRecoveryTimeCallback();
    this.engine?.sendUserMessage(this.options.clientId, JSON.stringify({
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify({ type: MediaOperationType.OPEN_AUDIO_AND_VIDEO, isOpen: false }),
    }));
    return this.engine?.pauseAllSubscribedStream(mediaType);
  }

  resumeAllSubscribedStream(mediaType: number = 3) {
    this.triggerRecoveryTimeCallback();
    this.startPlay();
    if (mediaType !== 3) return this.engine?.resumeAllSubscribedStream(mediaType);
    this.sendUserMessage(this.options.clientId, JSON.stringify({
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify({ type: MediaOperationType.OPEN_AUDIO_AND_VIDEO, isOpen: true }),
    }));
    return this.engine?.resumeAllSubscribedStream(mediaType);
  }

  async subscribeStream(mediaType: MediaType) {
    return await this.engine?.subscribeStream(this.options.clientId, mediaType);
  }

  unsubscribeStream(mediaType: MediaType) {
    return this.engine?.unsubscribeStream(this.options.clientId, mediaType);
  }

  // ─── screen rotation ─────────────────────────────────────────────────────────

  private async _initRotateScreen(width: number, height: number) {
    const s = this._rotationState();
    await initRotateScreen(s, width, height);
    this._syncFromRotationState(s);
  }

  async setRemoteVideoRotation(rotation: number) {
    await setRemoteVideoRotation(this._rotationState(), rotation);
  }

  setPhoneRotation(type: number) {
    this.triggerRecoveryTimeCallback();
    this._rotateScreen(type);
  }

  private async _rotateScreen(type: number) {
    const s = this._rotationState();
    await rotateScreen(s, type);
    this._syncFromRotationState(s);
  }

  getRotateType() { return this.rotateType; }

  setViewSize(width: number, height: number, rotateType: 0 | 1 = 0) {
    const h5Dom = document.getElementById(this.initDomId)! as HTMLDivElement;
    const videoDom = document.getElementById(this.videoDomId)! as HTMLDivElement;
    if (!h5Dom || !videoDom) return;
    h5Dom.style.width  = width  + "px";
    h5Dom.style.height = height + "px";
    if (rotateType == 1) {
      videoDom.style.width  = height + "px";
      videoDom.style.height = width  + "px";
    } else {
      videoDom.style.width  = width  + "px";
      videoDom.style.height = height + "px";
    }
  }

  setScreenResolution(
    options: { width: number; height: number; dpi: number; type: MessageKey.RESET_DENSITY | MessageKey.UPDATE_DENSITY },
    forwardOff: boolean = true
  ) {
    const contentObj = options.type === MessageKey.UPDATE_DENSITY
      ? { type: options.type, width: options.width, height: options.height, density: options.dpi }
      : { type: options.type };
    this.sendUserMessage(this.options.clientId, this.getMsgTemplate(TouchType.EVENT_SDK, contentObj), forwardOff);
  }

  // ─── screenshot ──────────────────────────────────────────────────────────────

  takeScreenshot(rotation: number = 0)          { this.screenShotInstance?.takeScreenshot(rotation); }
  resizeScreenshot(width: number, height: number){ this.screenShotInstance?.resizeScreenshot(width, height); }
  showScreenShot()                               { this.screenShotInstance?.showScreenShot(); }
  hideScreenShot()                               { this.screenShotInstance?.hideScreenShot(); }
  clearScreenShot()                              { this.screenShotInstance?.clearScreenShot(); }
  setScreenshotRotation(_rotation: number = 0)  { /* reserved */ }

  saveScreenShotToLocal() {
    return this.engine?.takeRemoteSnapshot(this.options.clientId, 0);
  }

  saveScreenShotToRemote() {
    this.sendUserMessage(this.options.clientId, JSON.stringify({
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify({ type: SdkEventType.LOCAL_SCREENSHOT }),
    }));
  }

  // ─── keyboard shortcuts ──────────────────────────────────────────────────────

  startCV() {
    this._listenKeyboardShortcut = this.listenKeyboardShortcut.bind(this);
    this.disableKeyboardShortcut();
    this.enableKeyboardShortcut();
  }

  enableKeyboardShortcut()  { document.addEventListener("keydown", this._listenKeyboardShortcut); }
  disableKeyboardShortcut() { document.removeEventListener("keydown", this._listenKeyboardShortcut); }

  listenKeyboardShortcut(e: KeyboardEvent) {
    if (e.isComposing) return;
    const key = e.key.toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (ctrlOrCmd && key === "a") { e.preventDefault(); this.triggerKeyboardShortcut(8192, 29); }
    else if (ctrlOrCmd && key === "c") { e.preventDefault(); this.triggerKeyboardShortcut(8192, 31); }
  }

  triggerKeyboardShortcut(metaState: number | string, keyCode: number | string, forwardOff: boolean = true) {
    this.sendUserMessage(this.options.clientId, JSON.stringify({
      touchType: MessageKey.SHORTCUT_KEY,
      metaState: metaState + "",
      keyCode: keyCode + "",
    }), forwardOff);
  }

  // ─── commands ────────────────────────────────────────────────────────────────

  sendCommand(command: string, forwardOff: boolean = false) {
    const keyCodeMap: Record<string, number> = { back: 4, home: 3, menu: 187 };
    const keyCode = keyCodeMap[command] ?? command;
    const userId = this.options.clientId;
    if (!userId) return;
    this.sendUserMessage(userId, JSON.stringify({ action: 1, touchType: "keystroke", keyCode, text: "" }), forwardOff);
  }

  increaseVolume(forwardOff: boolean = true) {
    this.startPlay();
    this.sendUserMessage(this.options.clientId, JSON.stringify({ action: 1, touchType: TouchType.KEYSTROKE, keyCode: 24, text: "" }), forwardOff);
  }

  decreaseVolume(forwardOff: boolean = true) {
    this.startPlay();
    this.sendUserMessage(this.options.clientId, JSON.stringify({ action: 1, touchType: TouchType.KEYSTROKE, keyCode: 25, text: "" }), forwardOff);
  }

  setGPS(longitude: number, latitude: number) {
    this.sendUserMessage(this.options.clientId, JSON.stringify({
      touchType: "eventSdk",
      content: JSON.stringify({ type: "sdkLocation", content: JSON.stringify({ latitude, longitude, time: Date.now() }) }),
    }));
  }

  setAutoRecycleTime(second: number) {
    this.options.autoRecoveryTime = second;
    this.triggerRecoveryTimeCallback();
  }

  getAutoRecycleTime() { return this.options.autoRecoveryTime; }
  reshapeWindow() {}

  // ─── simulate pointer ────────────────────────────────────────────────────────

  triggerClickEvent(options: { x: number; y: number; width: number; height: number }, forwardOff: boolean = false) {
    this.triggerPointerEvent(0, options, forwardOff);
    setTimeout(() => this.triggerPointerEvent(1, options, forwardOff), 15 + Math.floor(Math.random() * 11));
  }

  triggerPointerEvent(action: 0 | 1 | 2, options: { x: number; y: number; width: number; height: number }, forwardOff: boolean = false) {
    const { x, y, width, height } = options;
    if (action == 0) this.simulateTouchInfo = generateTouchCoord();
    this.sendUserMessage(this.options.clientId, JSON.stringify({
      action, pointCount: 1, touchType: "gesture", widthPixels: width, heightPixels: height,
      coords: [{ ...this.simulateTouchInfo, orientation: 0.01 * Math.random(), x, y }],
      properties: [{ id: 0, toolType: 1 }],
    }), forwardOff);
  }

  sendShakeInfo(time: number) {
    const userId = this.options.clientId;
    const shake = new Shake();
    shake.startShakeSimulation(time, (content: any) => {
      const getOptions = (sensorType: string) => JSON.stringify({
        coords: [], heightPixels: 0, isOpenScreenFollowRotation: false, keyCode: 0,
        pointCount: 0, properties: [], text: "", touchType: TouchType.EVENT_SDK, widthPixels: 0, action: 0,
        content: JSON.stringify({ ...content, type: SdkEventType.SDK_SENSOR, sensorType }),
      });
      this.sendUserMessage(userId, getOptions("gyroscope"));
      this.sendUserMessage(userId, getOptions("gravity"));
      this.sendUserMessage(userId, getOptions("acceleration"));
    });
  }

  // ─── room lifecycle ──────────────────────────────────────────────────────────

  start(isGroupControl = false, pads: string[] = []) {    this.isGroupControl = isGroupControl;
    this.metricsReporter = new MetricsReporter({
      endpoint: `${this.options.baseUrl}/traffic-info/open/traffic/rtcMonitor`,
      commonParams: { padCode: this.remoteUserId, streamType: this.options.streamType, sdkTerminal: "h5" },
      onceOnlyKeys: [ReportEventType.FIRST_FRAME],
      useBeacon: false, enableLog: true,
    });
    this.metricsReporter.addParam(ReportEventType.FIRST_FRAME, { joinRoomTime: Date.now() });
    this.metricsTimer = setTimeout(() => {
      this.metricsReporter?.addParam(ReportEventType.FIRST_FRAME, { judgeTime: Date.now(), result: 0 });
      this.metricsReporter?.instant(ReportEventType.FIRST_FRAME);
    }, 5000);

    this.engine?.joinRoom(
      this.options.roomToken, this.options.roomCode,
      { userId: this.options.userId },
      { isAutoPublish: false, isAutoSubscribeAudio: false, isAutoSubscribeVideo: false }
    )
    .then(async () => {
      const arr = pads?.filter((v) => v !== this.remoteUserId);
      if (isGroupControl && arr.length) this.createGroupEngine(arr as any);

      const { disableContextMenu, clientId: userId } = this.options;
      const videoDom = document.getElementById(this.videoDomId);
      if (videoDom) {
        videoDom.style.width = "0px";
        videoDom.style.height = "0px";

        bindTouchEvents(videoDom, userId, {
          hasPushDown: this.hasPushDown,
          touchConfig: this.touchConfig,
          touchInfo: this.touchInfo,
          rotateType: this.rotateType,
          remoteResolution: this.remoteResolution,
          options: this.options,
          inputElement: this.inputElement,
          roomMessage: this.roomMessage,
        }, this.sendUserMessage.bind(this));

        // sync hasPushDown back (touchHandler mutates the state object)
        // Note: touchHandler mutates the passed state object directly

        const msgCtx = {
          ...this._mediaState(),
          engine: this.engine,
          enableCamera: this.enableCamera,
          enableMicrophone: this.enableMicrophone,
          remoteResolution: this.remoteResolution,
          roomMessage: this.roomMessage,
          inputElement: this.inputElement,
          enterkeyhintObj: this.enterkeyhintObj,
          promiseMap: this.promiseMap,
          sendMessage: this.sendUserMessage.bind(this),
          initRotateScreen: this._initRotateScreen.bind(this),
        };
        setupRoomMessageHandler(msgCtx);
        setupUserMessageHandler(msgCtx);

        this._setupUserJoined();
        this._setupUserLeave();
        this._setupFirstFrame();
        this._setupUserPublishStream();

        this.startCV();
        this._setupVisibilityHandler();
        this.callbacks.onConnectSuccess();
      }

      this.engine?.on(VERTC.events.onConnectionStateChanged, (e) => this.callbacks.onConnectionStateChanged(e));
    })
    .catch((error) => {
      this.metricsReporter?.addParam(ReportEventType.FIRST_FRAME, { judgeTime: Date.now(), result: 0 });
      this.metricsReporter?.instant(ReportEventType.FIRST_FRAME);
      this.callbacks.onConnectFail({ code: error.code, msg: error.message });
    });
  }

  private _setupUserJoined() {
    this.engine?.on(VERTC.events.onUserJoined, (user) => {
      if (user.userInfo?.userId === this.options.clientId) {
        this._updateUiH5(true);
        this._getCameraState(true);
        this.onCheckInputState();
        this.setKeyboardStyle(this.options.keyboard);
        this.triggerRecoveryTimeCallback();
        this.callbacks?.onUserJoined(user);
      }
    });
  }

  private _setupUserLeave() {
    this.engine?.on(VERTC.events.onUserLeave, (res) => {
      this.disableKeyboardShortcut();
      this.callbacks.onUserLeave(res);
    });
  }

  private _setupFirstFrame() {
    this.engine?.on(VERTC.events.onRemoteVideoFirstFrame, async (event) => {
      try {
        if (!this.isFirstRotate) await this._initRotateScreen(event.width, event.height);
        this.metricsReporter?.addParam(ReportEventType.FIRST_FRAME, { judgeTime: Date.now(), result: 1 });
        this.metricsReporter?.instant(ReportEventType.FIRST_FRAME);
      } finally {
        this.callbacks.onRenderedFirstFrame(event);
      }
    });
  }

  private _setupUserPublishStream() {
    this.engine?.on(VERTC.events.onUserPublishStream, async (e: { userId: string; mediaType: any }) => {
      if (e.userId !== this.options.clientId) return;
      const player: any = document.querySelector(`#${this.videoDomId}`);
      await this.setRemoteVideoRotation(this.rotation);
      await this.engine?.subscribeStream(this.options.clientId, this.options.mediaType);

      // Set audio jitter buffer = 0 → browser clamp về minimum (~10ms)
      try {
        (this.engine as any)?.setJitterBufferTarget?.(
          this.options.clientId,
          0, // STREAM_INDEX_MAIN
          0, // 0 = minimum possible
          false
        );
      } catch (_) {}

      // Set video jitter buffer = 0 trực tiếp trên RTCRtpReceiver
      try {
        const remoteStreams = (this.engine as any)?._room?.remoteStreams;
        const stream = Array.isArray(remoteStreams)
          ? remoteStreams.find((s: any) => s.userId === this.options.clientId)
          : remoteStreams?.get?.(this.options.clientId);
        const videoReceiver = stream?.videoTransceiver?.receiver;
        if (videoReceiver) {
          // Thử tất cả các property name tùy browser
          for (const hint of ["jitterBufferTarget", "playoutDelayHint", "jitterBufferDelayHint"]) {
            if (hint in videoReceiver) {
              (videoReceiver as any)[hint] = 0; // 0 = minimum
              break;
            }
          }
        }
        // Tương tự cho audio receiver
        const audioReceiver = stream?.audioTransceiver?.receiver;
        if (audioReceiver) {
          for (const hint of ["jitterBufferTarget", "playoutDelayHint", "jitterBufferDelayHint"]) {
            if (hint in audioReceiver) {
              (audioReceiver as any)[hint] = 0;
              break;
            }
          }
        }
      } catch (_) {}

      if (!this.screenShotInstance) {
        this.screenShotInstance = new ScreenshotOverlay(player, this.rotation);
      }
    });
  }

  async stop() {
    try {
      this.disableKeyboardShortcut();
      if (this._visibilityHandler) {
        document.removeEventListener("visibilitychange", this._visibilityHandler);
        this._visibilityHandler = null;
      }
      clearTimeout(this.metricsTimer);
      this.metricsTimer = null;
      clearTimeout(this.autoRecoveryTimer);
      await Promise.allSettled([
        this.engine?.unsubscribeStream(this.options.clientId, this.options.mediaType),
        this.engine?.stopAudioCapture(),
        this.engine?.stopVideoCapture(),
        this.engine?.leaveRoom(),
        this.groupEngine?.leaveRoom(),
      ]);
      this.destroyEngine();
      this.groupRtc?.close();
      this.screenShotInstance?.destroy();
      const videoDomElement = document.getElementById(this.videoDomId);
      if (videoDomElement?.parentNode) videoDomElement.parentNode.removeChild(videoDomElement);
      this.inputElement?.remove();
      this.groupEngine = null;
      this.groupRtc = null;
      this.screenShotInstance = null;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // ─── internal helpers ────────────────────────────────────────────────────────

  private async _getCameraState(isRetry = false) {
    try {
      await this.sendUserMessage(this.options.clientId, JSON.stringify({
        touchType: "eventSdk", content: JSON.stringify({ type: "cameraState" }),
      }));
    } catch { if (isRetry) setTimeout(() => this._getCameraState(false), 1000); }
  }

  private async _updateUiH5(isRetry = false) {
    try {
      await this.sendUserMessage(this.options.clientId, JSON.stringify({
        touchType: "eventSdk", content: JSON.stringify({ type: "updateUiH5" }),
      }));
    } catch { if (isRetry) setTimeout(() => this._updateUiH5(false), 1000); }
  }

  getRequestId() { return (this.engine as any)?.getRequestId?.(); }

  // ─── visibility: flush buffer khi quay lại tab ───────────────────────────────

  private _setupVisibilityHandler() {
    this._visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        // Tab bị ẩn: pause nhận stream để tránh buffer tích lũy
        this.engine?.pauseAllSubscribedStream(this.options.mediaType ?? 3);
      } else {
        // Tab active trở lại: flush buffer bằng cách unsubscribe rồi subscribe lại ngay
        const mediaType = this.options.mediaType ?? 3;
        this.engine?.unsubscribeStream(this.options.clientId, mediaType);

        // Delay nhỏ để browser flush decoder buffer cũ
        requestAnimationFrame(() => {
          this.engine?.subscribeStream(this.options.clientId, mediaType);
          this.engine?.resumeAllSubscribedStream(mediaType);

          // Reset jitter buffer target về 0 sau khi resume
          try {
            (this.engine as any)?.setJitterBufferTarget?.(
              this.options.clientId, 0, 0, false
            );
          } catch (_) {}
        });
      }
    };
    document.addEventListener("visibilitychange", this._visibilityHandler);
  }
}

export default customRtc;
