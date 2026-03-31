import VERTC, {
  type IRTCEngine,
  MediaType,
  StreamIndex,
  type RemoteStreamStats,
  type ConnectionStateChangeEvent,
} from "@volcengine/rtc";
import { fetchRoomToken, type FetchRoomTokenParams } from "../../common/api/fetchRoomToken";
import { createVideoContainer, fitVideoToContainer, getRenderDom, removeVideoContainer } from "../../common/ui/videoPlayer";
import { bindTouchEvents, type TouchState } from "../../common/ui/touchHandler";
import { generateTouchCoord } from "../../common/utils/mixins";
import type {
  FirstFrameEvent,
  RunInformationStats,
  NetworkQualityLevel,
  AutoplayFailedEvent,
  ErrorMessagePayload,
  SendUserErrorEvent,
  ConnectionStateChangedPayload,
  UserJoinedPayload,
  UserLeaveEvent,
} from "../../types/index";

export interface VolcRtcOptions {
  appId?: string;
  roomToken?: string;
  roomCode?: string;
  fetchParams?: FetchRoomTokenParams;
  userId: string;
  clientId: string;
  mediaType: MediaType;
  videoStream?: { frameRate?: string; bitrate?: string };
  disable?: boolean;
  disableLocalIME?: boolean;
  autoRecoveryTime?: number;
  baseUrl?: string;
  streamType?: string;
}

export interface VolcRtcCallbacks {
  onConnectSuccess?: () => void;
  onConnectFail?: (e: { code: string; msg: string }) => void;
  onConnectionStateChanged?: (e: ConnectionStateChangedPayload) => void;
  onUserJoined?: (user: UserJoinedPayload) => void;
  onUserLeave?: (res: UserLeaveEvent) => void;
  onRenderedFirstFrame?: (event?: FirstFrameEvent) => void;
  onRunInformation?: (stats: RunInformationStats) => void;
  onNetworkQuality?: (up: NetworkQualityLevel, down: NetworkQualityLevel) => void;
  onErrorMessage?: (e: ErrorMessagePayload) => void;
  onAutoplayFailed?: (e: AutoplayFailedEvent) => void;
  onSendUserError?: (e: SendUserErrorEvent) => void;
}

// Internal SDK parameter keys not exposed in the public type definitions
type VolcInternalParam =
  | "ICE_CONFIG_REQUEST_URLS"
  | "PRE_ICE"
  | "JITTER_STEPPER_INTERVAL_MS"
  | "JITTER_STEPPER_MAX_AV_SYNC_DIFF"
  | "JITTER_STEPPER_MAX_SET_DIFF"
  | "JITTER_STEPPER_STEP_SIZE_MS"
  | "JITTER_STEPPER_MAX_DIFF_EXCEED_COUNT"
  | "H264_HW_ENCODER"
  | "AUDIO_STALL"
  | "VIDEO_STALL"
  | "VIDEO_STALL_100MS"
  | "STATS_LOOP_INTERVAL"
  | "DISABLE_COMPUTE_PRESSURE";

const setParam = (key: VolcInternalParam, value: unknown) =>
  VERTC.setParameter(key as Parameters<typeof VERTC.setParameter>[0], value as Parameters<typeof VERTC.setParameter>[1]);

export default class VolcRtc {
  protected engine: IRTCEngine | null = null;
  protected options: VolcRtcOptions;
  protected callbacks: VolcRtcCallbacks;
  protected remoteUserId: string;
  protected initDomId: string;
  protected videoDomId: string;

  private touchState: TouchState = {
    hasPushDown: false,
    touchConfig: {
      action: 0,
      widthPixels: 0,
      heightPixels: 0,
      pointCount: 1,
      touchType: "gesture",
      properties: [],
      coords: [],
    },
    touchInfo: generateTouchCoord(),
    rotateType: 0,
    remoteResolution: { width: 0, height: 0 },
    options: null,
    inputElement: null,
    roomMessage: {},
  };

  constructor(viewId: string, options: VolcRtcOptions, callbacks: VolcRtcCallbacks) {
    this.initDomId = viewId;
    this.options = options;
    this.callbacks = callbacks;
    this.remoteUserId = options.clientId;
    this.videoDomId = `${options.clientId}_armcloudVideo`;
    createVideoContainer(viewId, this.videoDomId);
    this.touchState.options = options as unknown as Record<string, unknown>;
  }

  // ─── engine ──────────────────────────────────────────────────────────────────

  static isSupported() {
    return VERTC.isSupported();
  }

  getRequestId(): string | undefined {
    return (this.engine as IRTCEngine & { getRequestId?: () => string })?.getRequestId?.();
  }

  private _applyGlobalParams() {
    setParam("ICE_CONFIG_REQUEST_URLS", [
      "rtcg-access.volcvideos.com",
      "rtcg-access-sg.volcvideos.com",
      "rtcg-access-va.volcvideos.com",
      "rtcg-access-fr.volcvideos.com",
      "rtc-access-ag.bytedance.com",
      "rtc-access.bytedance.com",
      "rtc-access2-hl.bytedance.com",
      "rtcg-access.bytevcloud.com",
    ]);
    setParam("PRE_ICE", true);
    setParam("JITTER_STEPPER_INTERVAL_MS", 0);
    setParam("JITTER_STEPPER_MAX_AV_SYNC_DIFF", 0);
    setParam("JITTER_STEPPER_MAX_SET_DIFF", 0);
    setParam("JITTER_STEPPER_STEP_SIZE_MS", 1);
    setParam("JITTER_STEPPER_MAX_DIFF_EXCEED_COUNT", 0);
    setParam("H264_HW_ENCODER", true);
    setParam("AUDIO_STALL", false);
    setParam("VIDEO_STALL", false);
    setParam("VIDEO_STALL_100MS", false);
    setParam("STATS_LOOP_INTERVAL", 500);
    setParam("DISABLE_COMPUTE_PRESSURE", true);
  }

  async initEngine() {
    this._applyGlobalParams();
    this.engine = VERTC.createEngine(this.options.appId!);
    this.engine.setRemoteStreamRenderSync(false);
    // AudioProfileType.fluent = 1
    this.engine.setAudioProfile(1 as Parameters<IRTCEngine["setAudioProfile"]>[0]);
    // SubscribeFallbackOption.DISABLE = 0
    this.engine.setSubscribeFallbackOption(0 as Parameters<IRTCEngine["setSubscribeFallbackOption"]>[0]);
    this._registerEngineEvents();
  }

  private _registerEngineEvents() {
    if (!this.engine) return;
    this.engine.on(VERTC.events.onError, (e: unknown) =>
      this.callbacks.onErrorMessage?.(e as ErrorMessagePayload)
    );
    this.engine.on(VERTC.events.onAutoplayFailed, (e: AutoplayFailedEvent) =>
      this.callbacks.onAutoplayFailed?.(e)
    );
    this.engine.on(VERTC.events.onRemoteStreamStats, (e: RemoteStreamStats) =>
      this.callbacks.onRunInformation?.(e as unknown as RunInformationStats)
    );
    this.engine.on(VERTC.events.onNetworkQuality, (up: NetworkQualityLevel, down: NetworkQualityLevel) =>
      this.callbacks.onNetworkQuality?.(up, down)
    );
    this.engine.on(VERTC.events.onConnectionStateChanged, (e: ConnectionStateChangeEvent) =>
      this.callbacks.onConnectionStateChanged?.(e as unknown as ConnectionStateChangedPayload)
    );
  }

  destroyEngine() {
    if (this.engine) {
      VERTC.destroyEngine(this.engine);
      this.engine = null;
    }
  }

  // ─── room ────────────────────────────────────────────────────────────────────

  async joinRoom() {
    if (!this.engine) await this.initEngine();

    if (!this.options.appId || !this.options.roomToken || !this.options.roomCode) {
      if (!this.options.fetchParams) throw new Error("Missing room credentials or fetchParams");
      const result = await fetchRoomToken(this.options.fetchParams);
      this.options.appId = result.appId;
      this.options.roomToken = result.roomToken;
      this.options.roomCode = result.roomCode;
      this.destroyEngine();
      await this.initEngine();
    }

    return this.engine!.joinRoom(
      this.options.roomToken!,
      this.options.roomCode!,
      { userId: this.options.userId },
      { isAutoPublish: false, isAutoSubscribeAudio: false, isAutoSubscribeVideo: false }
    );
  }

  async leaveRoom() {
    await this.engine?.leaveRoom();
  }

  // ─── stream ──────────────────────────────────────────────────────────────────

  async subscribeStream(mediaType: MediaType = this.options.mediaType) {
    return this.engine?.subscribeStream(this.options.clientId, mediaType);
  }

  async unsubscribeStream(mediaType: MediaType = this.options.mediaType) {
    return this.engine?.unsubscribeStream(this.options.clientId, mediaType);
  }

  pauseAllSubscribedStream(mediaType: MediaType = MediaType.AUDIO_AND_VIDEO) {
    return this.engine?.pauseAllSubscribedStream(mediaType);
  }

  resumeAllSubscribedStream(mediaType: MediaType = MediaType.AUDIO_AND_VIDEO) {
    return this.engine?.resumeAllSubscribedStream(mediaType);
  }

  play() {
    this.engine?.play(this.options.clientId);
  }

  startPlay() {
    this.engine?.play(this.options.clientId);
  }

  muted() {
    this.engine?.unsubscribeStream(this.options.clientId, MediaType.AUDIO);
  }

  unmuted() {
    this.engine?.subscribeStream(this.options.clientId, MediaType.AUDIO);
  }

  // ─── messaging ───────────────────────────────────────────────────────────────

  sendUserMessage(userId: string, message: string) {
    const p = this.engine?.sendUserMessage(userId, message);
    p?.catch((e: SendUserErrorEvent) => this.callbacks.onSendUserError?.(e));
    return p;
  }

  sendUserBinaryMessage(userId: string, message: ArrayBuffer) {
    const p = this.engine?.sendUserBinaryMessage(userId, message);
    p?.catch((e: SendUserErrorEvent) => this.callbacks.onSendUserError?.(e));
    return p;
  }

  sendRoomMessage(message: string) {
    return this.engine?.sendRoomMessage(message);
  }

  // ─── lifecycle ───────────────────────────────────────────────────────────────

  async start() {
    if (this.options.appId) {
      await this.initEngine();
    }
    try {
      await this.joinRoom();
      this._setupStreamEvents();
      this.callbacks.onConnectSuccess?.();
    } catch (error: unknown) {
      const e = error as { code?: string; message?: string };
      this.callbacks.onConnectFail?.({ code: e.code ?? "UNKNOWN", msg: e.message ?? "" });
    }
  }

  async stop() {
    await Promise.allSettled([
      this.engine?.unsubscribeStream(this.options.clientId, this.options.mediaType),
      this.engine?.stopAudioCapture(),
      this.engine?.stopVideoCapture(),
      this.engine?.leaveRoom(),
    ]);
    this.destroyEngine();
    removeVideoContainer(this.videoDomId);
  }

  // ─── private ─────────────────────────────────────────────────────────────────

  private _setupStreamEvents() {
    this.engine?.on(VERTC.events.onUserJoined, (user: UserJoinedPayload) => {
      if (user.userInfo?.userId === this.options.clientId) {
        this.callbacks.onUserJoined?.(user);
      }
    });

    this.engine?.on(VERTC.events.onUserLeave, (res: unknown) => {
      this.callbacks.onUserLeave?.(res as UserLeaveEvent);
    });

    this.engine?.on(VERTC.events.onRemoteVideoFirstFrame, (event: FirstFrameEvent) => {
      this.touchState.remoteResolution = { width: event.width, height: event.height };
      fitVideoToContainer(this.videoDomId, event.width, event.height);
      this.callbacks.onRenderedFirstFrame?.(event);
    });

    // Signature per Volc docs: (key: RemoteStreamKey, info: { width, height })
    this.engine?.on(
      VERTC.events.onRemoteVideoSizeChanged,
      (key: { userId: string }, info: { width: number; height: number }) => {
        if (key.userId !== this.options.clientId) return;
        const { width, height } = info;
        this.touchState.remoteResolution = { width, height };
        fitVideoToContainer(this.videoDomId, width, height);
        this.callbacks.onRenderedFirstFrame?.({ width, height, userId: key.userId, isScreen: false });
      }
    );

    this.engine?.on(
      VERTC.events.onUserPublishStream,
      async (e: { userId: string; mediaType: MediaType }) => {
        if (e.userId !== this.options.clientId) return;
        await this._subscribeAndPlay();
      }
    );

    this.engine?.on(
      VERTC.events.onUserUnpublishStream,
      (_e: { userId: string }) => {
        // Stream dropped — onUserPublishStream will fire again on republish
      }
    );
  }

  private async _subscribeAndPlay() {
    // RemoteUserPriority.HIGH = 200 — must be called after joinRoom
    this.engine?.setRemoteUserPriority(
      this.options.clientId,
      200 as Parameters<IRTCEngine["setRemoteUserPriority"]>[1]
    );

    const renderDom = getRenderDom(this.videoDomId) ?? this.videoDomId;
    this.engine?.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
      userId: this.options.clientId,
      renderDom,
      renderMode: 0, // VideoRenderMode.RENDER_MODE_HIDDEN — fill container
    });
    await this.subscribeStream();
    this.play();
    this._zeroJitterBuffer();
    this._bindTouch();
  }

  /**
   * Forces the browser-level RTCRtpReceiver jitter buffer to its minimum.
   * Uses internal SDK/browser APIs — wrapped in try/catch as they may not exist.
   */
  private _zeroJitterBuffer() {
    // SDK-level hint (internal, may not be present)
    type EngineInternal = IRTCEngine & {
      setJitterBufferTarget?: (userId: string, a: number, b: number, c: boolean) => void;
      _room?: {
        remoteStreams?: Map<string, RemoteStreamInternal> | RemoteStreamInternal[];
      };
    };
    type RemoteStreamInternal = {
      userId: string;
      videoTransceiver?: { receiver?: RTCRtpReceiver };
      audioTransceiver?: { receiver?: RTCRtpReceiver };
    };
    type ReceiverWithHints = RTCRtpReceiver & {
      jitterBufferTarget?: number;
      playoutDelayHint?: number;
      jitterBufferDelayHint?: number;
    };

    try {
      (this.engine as EngineInternal)?.setJitterBufferTarget?.(this.options.clientId, 0, 0, false);
    } catch (_) { /* internal API may not exist */ }

    try {
      const eng = this.engine as EngineInternal;
      const remoteStreams = eng?._room?.remoteStreams;
      const stream = Array.isArray(remoteStreams)
        ? remoteStreams.find((s) => s.userId === this.options.clientId)
        : remoteStreams?.get?.(this.options.clientId);

      for (const raw of [
        stream?.videoTransceiver?.receiver,
        stream?.audioTransceiver?.receiver,
      ]) {
        if (!raw) continue;
        const r = raw as unknown as Record<string, number>;
        if ("jitterBufferTarget" in r)         r.jitterBufferTarget = 0;
        else if ("playoutDelayHint" in r)      r.playoutDelayHint = 0;
        else if ("jitterBufferDelayHint" in r) r.jitterBufferDelayHint = 0;
      }
    } catch (_) { /* browser API may not exist */ }
  }

  private _bindTouch() {
    const target = getRenderDom(this.videoDomId) ?? document.getElementById(this.videoDomId);
    if (!target) return;

    const tryBind = (retries = 10) => {
      const videoEl = target.querySelector("video");
      if (videoEl) {
        bindTouchEvents(
          videoEl,
          this.options.clientId,
          this.touchState,
          this.sendUserMessage.bind(this)
        );
      } else if (retries > 0) {
        setTimeout(() => tryBind(retries - 1), 100);
      }
    };
    tryBind();
  }
}
