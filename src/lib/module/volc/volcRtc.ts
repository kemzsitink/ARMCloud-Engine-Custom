import VERTC, { type IRTCEngine, MediaType, StreamIndex } from "@volcengine/rtc";
import { fetchRoomToken, type FetchRoomTokenParams } from "../../common/api/fetchRoomToken";
import { createVideoContainer, fitVideoToContainer, getRenderDom, removeVideoContainer } from "../../common/ui/videoPlayer";
import { bindTouchEvents, type TouchState } from "../../common/ui/touchHandler";
import { generateTouchCoord } from "../../common/utils/mixins";

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
  onConnectionStateChanged?: (e: any) => void;
  onUserJoined?: (user: any) => void;
  onUserLeave?: (res: any) => void;
  onRenderedFirstFrame?: (event: any) => void;
  onRunInformation?: (stats: any) => void;
  onNetworkQuality?: (up: number, down: number) => void;
  onErrorMessage?: (e: any) => void;
  onAutoplayFailed?: (e: any) => void;
  onSendUserError?: (e: any) => void;
}

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
    this.touchState.options = options;
  }

  // ─── engine ──────────────────────────────────────────────────────────────────

  static isSupported() {
    return VERTC.isSupported();
  }

  getRequestId() {
    return (this.engine as any)?.getRequestId?.();
  }

  /**
   * Global SDK params — called BEFORE createEngine.
   * These are internal knobs that control buffering and processing behavior.
   */
  private _applyGlobalParams() {
    // Prioritize HK edge nodes (closest to northern Vietnam ~30ms ping).
    // List order matters — SDK tries them in sequence, first match wins.
    VERTC.setParameter("ICE_CONFIG_REQUEST_URLS" as any, [
      "rtcg-access.volcvideos.com",       // HK / Asia primary
      "rtcg-access-sg.volcvideos.com",    // Singapore fallback
      "rtcg-access-va.volcvideos.com",    // VA fallback
      "rtcg-access-fr.volcvideos.com",    // FR fallback
      "rtc-access-ag.bytedance.com",
      "rtc-access.bytedance.com",
      "rtc-access2-hl.bytedance.com",
      "rtcg-access.bytevcloud.com",
    ]);

    // Pre-gather ICE candidates before joinRoom → cuts DTLS handshake time
    VERTC.setParameter("PRE_ICE" as any, true);

    // Jitter buffer stepper: zero all thresholds so the SDK never adds
    // extra delay trying to smooth out packet arrival variance
    VERTC.setParameter("JITTER_STEPPER_INTERVAL_MS" as any, 0);
    VERTC.setParameter("JITTER_STEPPER_MAX_AV_SYNC_DIFF" as any, 0);
    VERTC.setParameter("JITTER_STEPPER_MAX_SET_DIFF" as any, 0);
    VERTC.setParameter("JITTER_STEPPER_STEP_SIZE_MS" as any, 1);
    VERTC.setParameter("JITTER_STEPPER_MAX_DIFF_EXCEED_COUNT" as any, 0);

    // HW codec path → lower decode latency, less CPU contention
    VERTC.setParameter("H264_HW_ENCODER" as any, true);

    // Disable stall detection → SDK won't buffer ahead on freeze events
    VERTC.setParameter("AUDIO_STALL" as any, false);
    VERTC.setParameter("VIDEO_STALL" as any, false);
    VERTC.setParameter("VIDEO_STALL_100MS" as any, false);

    // Reduce stats loop frequency → less main-thread overhead
    VERTC.setParameter("STATS_LOOP_INTERVAL" as any, 500);

    // Disable CPU pressure API throttling → SDK won't downgrade quality
    VERTC.setParameter("DISABLE_COMPUTE_PRESSURE" as any, true);
  }

  async initEngine() {
    this._applyGlobalParams();
    this.engine = VERTC.createEngine(this.options.appId!);

    // ── Documented latency APIs from Volc docs ────────────────────────────────

    // setRemoteStreamRenderSync(false): docs explicitly state this achieves
    // "超低端到端延时" (ultra-low E2E latency) by removing the A/V sync buffer
    this.engine.setRemoteStreamRenderSync(false);

    // AudioProfileType.fluent (1): 单声道 16kHz 24kbps, 流畅优先、低功耗
    // Disables heavy audio processing pipeline that adds algorithmic delay
    this.engine.setAudioProfile(1 as any);

    // setSubscribeFallbackOption(DISABLE=0): must be called BEFORE joinRoom.
    // Disables adaptive stream downgrade — SDK won't switch to lower quality
    // stream or audio-only mode, which would cause a re-negotiation delay.
    // Docs: SubscribeFallbackOption.DISABLE = 0
    this.engine.setSubscribeFallbackOption(0 as any);

    // setRemoteUserPriority(HIGH=200): paired with setSubscribeFallbackOption.
    // Ensures the remote stream gets highest scheduling priority.
    // Docs: RemoteUserPriority.HIGH = 200
    this.engine.setRemoteUserPriority(this.options.clientId, 200 as any);

    // setUserVisibility(false): this client is a pure subscriber — it never
    // publishes. Invisible users don't trigger onUserJoined/onUserLeave on
    // the remote side, reducing signaling round-trips.
    // NOTE: Comment this out if the remote side requires visibility to push stream.
    // this.engine.setUserVisibility(false);

    this._registerEngineEvents();
  }

  private _registerEngineEvents() {
    if (!this.engine) return;
    this.engine.on(VERTC.events.onError, (e: any) =>
      this.callbacks.onErrorMessage?.(e)
    );
    this.engine.on(VERTC.events.onAutoplayFailed, (e: any) =>
      this.callbacks.onAutoplayFailed?.(e)
    );
    this.engine.on(VERTC.events.onRemoteStreamStats, (e: any) =>
      this.callbacks.onRunInformation?.(e)
    );
    this.engine.on(VERTC.events.onNetworkQuality, (up: number, down: number) =>
      this.callbacks.onNetworkQuality?.(up, down)
    );
    this.engine.on(VERTC.events.onConnectionStateChanged, (e: any) =>
      this.callbacks.onConnectionStateChanged?.(e)
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

    // isAutoSubscribeAudio/Video: false → subscribe manually inside
    // onUserPublishStream, immediately when the stream is available,
    // skipping the SDK's internal auto-subscribe queue delay.
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

  muted() {
    this.engine?.unsubscribeStream(this.options.clientId, MediaType.AUDIO);
  }

  unmuted() {
    this.engine?.subscribeStream(this.options.clientId, MediaType.AUDIO);
  }

  // ─── messaging ───────────────────────────────────────────────────────────────

  sendUserMessage(userId: string, message: string) {
    const p = this.engine?.sendUserMessage(userId, message);
    p?.catch((e: any) => this.callbacks.onSendUserError?.(e));
    return p;
  }

  /**
   * Binary variant — smaller payload than text, lower serialization overhead.
   * Use for high-frequency touch/input events.
   */
  sendUserBinaryMessage(userId: string, message: ArrayBuffer) {
    const p = this.engine?.sendUserBinaryMessage(userId, message);
    p?.catch((e: any) => this.callbacks.onSendUserError?.(e));
    return p;
  }

  sendRoomMessage(message: string) {
    return this.engine?.sendRoomMessage(message);
  }

  // ─── lifecycle ───────────────────────────────────────────────────────────────

  async start() {
    // Init engine early if appId is already known so PRE_ICE can start
    // gathering candidates while we wait for joinRoom
    if (this.options.appId) {
      await this.initEngine();
    }
    try {
      await this.joinRoom();
      this._setupStreamEvents();
      this.callbacks.onConnectSuccess?.();
    } catch (error: any) {
      this.callbacks.onConnectFail?.({ code: error.code, msg: error.message });
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
    this.engine?.on(VERTC.events.onUserJoined, (user: any) => {
      if (user.userInfo?.userId === this.options.clientId) {
        this.callbacks.onUserJoined?.(user);
      }
    });

    this.engine?.on(VERTC.events.onUserLeave, (res: any) => {
      this.callbacks.onUserLeave?.(res);
    });

    this.engine?.on(VERTC.events.onRemoteVideoFirstFrame, (event: any) => {
      this.touchState.remoteResolution = { width: event.width, height: event.height };
      fitVideoToContainer(this.videoDomId, event.width, event.height);
      this.callbacks.onRenderedFirstFrame?.(event);
    });

    // Fire when device rotates — stream dimensions change (e.g. 720×1280 → 1280×720)
    // Signature: (key: RemoteStreamKey, info: { width, height })
    this.engine?.on(VERTC.events.onRemoteVideoSizeChanged, (key: any, info: any) => {
      if (key.userId !== this.options.clientId) return;
      const { width, height } = info;
      this.touchState.remoteResolution = { width, height };
      fitVideoToContainer(this.videoDomId, width, height);
      this.callbacks.onRenderedFirstFrame?.({ width, height, userId: key.userId });
    });

    this.engine?.on(
      VERTC.events.onUserPublishStream,
      async (e: { userId: string; mediaType: any }) => {
        if (e.userId !== this.options.clientId) return;
        await this._subscribeAndPlay();
      }
    );

    // Re-subscribe when stream is republished (network drop / server restart)
    // Without this, screen goes black and never recovers
    this.engine?.on(
      VERTC.events.onUserUnpublishStream,
      (e: { userId: string }) => {
        if (e.userId !== this.options.clientId) return;
        // Stream dropped — wait for onUserPublishStream to fire again
      }
    );
  }

  private async _subscribeAndPlay() {
    const renderDom = getRenderDom(this.videoDomId) ?? this.videoDomId;
    this.engine?.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
      userId: this.options.clientId,
      renderDom,
      renderMode: 0, // HIDDEN — fill container, no letterbox
    });
    await this.subscribeStream();
    this.play();
    this._zeroJitterBuffer();
    this._bindTouch();
  }

  /**
   * Forces the browser-level RTCRtpReceiver jitter buffer to its minimum.
   *
   * - Chrome 113+: jitterBufferTarget (DOMHighResTimeStamp ms)
   * - Safari:      playoutDelayHint
   * - Older:       jitterBufferDelayHint
   *
   * Also tries the SDK-level hint if the method is exposed.
   */
  private _zeroJitterBuffer() {
    try {
      (this.engine as any)?.setJitterBufferTarget?.(this.options.clientId, 0, 0, false);
    } catch (_) {}

    try {
      const remoteStreams = (this.engine as any)?._room?.remoteStreams;
      const stream = Array.isArray(remoteStreams)
        ? remoteStreams.find((s: any) => s.userId === this.options.clientId)
        : remoteStreams?.get?.(this.options.clientId);

      for (const receiver of [
        stream?.videoTransceiver?.receiver,
        stream?.audioTransceiver?.receiver,
      ]) {
        if (!receiver) continue;
        if ("jitterBufferTarget" in receiver) {
          (receiver as any).jitterBufferTarget = 0;
        } else if ("playoutDelayHint" in receiver) {
          (receiver as any).playoutDelayHint = 0;
        } else if ("jitterBufferDelayHint" in receiver) {
          (receiver as any).jitterBufferDelayHint = 0;
        }
      }
    } catch (_) {}
  }

  private _bindTouch() {
    // Bind touch to the inner renderDom — touch coords are relative to it,
    // which matches exactly what the server expects (stream pixel coordinates)
    const renderDom = getRenderDom(this.videoDomId);
    const target = renderDom ?? document.getElementById(this.videoDomId);
    if (!target) return;

    const tryBind = (retries = 10) => {
      const videoEl = target.querySelector("video") as HTMLElement | null;
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
