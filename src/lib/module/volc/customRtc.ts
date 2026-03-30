import type { IRTCEngine } from "@volcengine/rtc";
import customGroupRtc from "./customGroupRtc";
import VERTC, { StreamIndex } from "@volcengine/rtc";
import Shake from "../../common/shake";
import type { CustomDefinition, TouchInfo } from "../../types/index";
import { KeyboardMode } from "../../types/index";
import { generateTouchCoord } from "../../common/mixins";
import { isMobile, isTouchDevice, debounce, copyText } from "../../utils/index";
import { addInputElement } from "../../common/textInput";
import ScreenshotOverlay from "../../common/screenshotOverlay";
import {
  MetricsReporter,
  ReportEventType,
} from "../../common/metrics-reporter";
import { RotateDirection } from "../../types/index";
import {
  MediaType,
  MessageKey,
  SdkEventType,
  TouchType,
  MediaOperationType,
} from "../../types/webrtcType";
import {
  getFps,
  getKbps,
  type FramerateId,
  type BitrateId,
} from "../tcg/config/streamProfiles";
class customRtc {
  // 初始外部H5传入DomId
  private initDomId: string = "";
  // video容器id
  private videoDomId: string = "";
  // 鼠标、触摸事件时是否按下
  private hasPushDown: boolean = false;
  private enableMicrophone: boolean = true;
  private enableCamera: boolean = true;
  private screenShotInstance: ScreenshotOverlay | null = null;
  private isFirstRotate: boolean = false;
  private metricsReporter: MetricsReporter | null = null;
  private remoteResolution = {
    width: 0,
    height: 0,
  };

  // 触摸信息
  private touchConfig: any = {
    action: 0, // 0 按下 1 抬起 2 触摸中
    widthPixels: document.body.clientWidth,
    heightPixels: document.body.clientHeight,
    pointCount: 1, // 手指操作数量
    touchType: "gesture",
    properties: [], // 手指id， toolType: 1写死
    coords: [], // 操作坐标 pressure: 1.0, size: 1.0,写死
  };
  // 键盘快捷键监听函数
  private _listenKeyboardShortcut: (e: KeyboardEvent) => void = () => {};
  // 触摸坐标信息
  private touchInfo: TouchInfo = generateTouchCoord();
  // 模拟触摸
  private simulateTouchInfo: TouchInfo = generateTouchCoord();
  private options: any;

  // 群控同步
  private groupControlSync: boolean = true;

  private engine: IRTCEngine | null = null;
  private groupEngine: IRTCEngine | null = null;
  private groupRtc: any | null = null;
  private inputElement: HTMLInputElement | null = null;

  // 当前推流状态promise 缓存
  private promiseMap: any = {
    streamStatus: {
      resolve: () => {},
      reject: () => {},
    },
    injectStatus: {
      resolve: null,
      reject: null,
    },
  };

  public roomMessage: any = {};

  // 回收时间定时器
  public autoRecoveryTimer: any = null;

  public isFirstFrame: boolean = false;

  public firstFrameCount: number = 0;
  public rotation: number = 0;

  // 是否群控
  public isGroupControl: boolean = false;

  // 埋点定时器
  private metricsTimer: any = null;

  /**
   * 安卓对应回车值
   * go：前往 2
   * search：搜索 3
   * send：发送 4
   * next：下一个 5
   * done：完成 6
   * previous：上一个 7
   */
  public enterkeyhintObj: Record<number, string> = {
    2: "go",
    3: "search",
    4: "send",
    5: "next",
    6: "done",
    7: "previous",
  };

  // 回调函数集合
  public callbacks: any = {};

  public remoteUserId: string = "";
  private rotateType: number = 0;
  private videoDeviceId: string = "";
  private audioDeviceId: string = "";
  private isCameraInject: boolean = false;
  private isMicrophoneInject: boolean = false;

  // 摄像头分辨率信息
  private cameraResolution: {
    width: number;
    height: number;
  } = {
    width: 0,
    height: 0,
  };

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

    // 获取外部容器div元素
    const h5Dom = document.getElementById(this.initDomId);

    // 创建一个id为armcloudVideo的新的div元素
    const newDiv = document.createElement("div");
    const divId = `${masterIdPrefix}_${padCode}_armcloudVideo`;
    newDiv.setAttribute("id", divId);
    this.videoDomId = divId;
    // 将div元素添加到外部容器中
    h5Dom?.appendChild(newDiv);

    // 创建引擎对象
    this.createEngine();
  }

  /** 浏览器是否支持 */

  // eslint-disable-next-line class-methods-use-this
  isSupported() {
    return VERTC.isSupported();
  }

  setMicrophone(val: boolean) {
    this.enableMicrophone = val;
  }
  setCamera(val: boolean) {
    this.enableCamera = val;
  }

  /** 设置摄像头设备 */
  async setVideoDeviceId(val: string) {
    this.videoDeviceId = val;
    if (this.isCameraInject) {
      return this.cameraInject();
    }
  }

  /** 设置麦克风设备 */
  async setAudioDeviceId(val: string) {
    this.audioDeviceId = val;
    if (this.isMicrophoneInject) {
      return this.microphoneInject();
    }
    return;
  }

  /** 打开或关闭监控操作 */
  setMonitorOperation(isMonitor: boolean, forwardOff: boolean = true) {
    this.sendUserMessage(
      this.options.clientId,
      this.getMsgTemplate(TouchType.EVENT_SDK, {
        type: MessageKey.OPERATE_SWITCH,
        isOpen: isMonitor,
      }),
      forwardOff
    );
  }

  /** 触发无操作回收回调函数 */
  triggerRecoveryTimeCallback() {
    if (
      this.options.disable ||
      !this.options.autoRecoveryTime ||
      this.isCameraInject ||
      this.isMicrophoneInject
    ) {
      return;
    }

    if (this.autoRecoveryTimer) {
      // console.log("清除计时器");
      clearTimeout(this.autoRecoveryTimer);
    }
    this.autoRecoveryTimer = setTimeout(() => {
      console.log("触发无操作回收了");
      this.stop();
      this.callbacks.onAutoRecoveryTime();
    }, this.options.autoRecoveryTime * 1000);
  }

  setVideoEncoder(width: number, height: number) {
    if (!width || !height) return;

    this.cameraResolution = { width, height };

    const { frameRate, bitrate } = this.options.videoStream;
    const fps    = getFps(frameRate as FramerateId);
    const maxKbps = getKbps(bitrate as BitrateId);

    this.engine?.setVideoEncoderConfig({ width, height, frameRate: fps, maxKbps });
  }
  /** 调用 createEngine 创建一个本地 Engine 引擎对象 */
  async createEngine() {
    if (!this.inputElement) {
      // 若不存在inputElement， 则创建一个隐藏的input输入框
      if (!this.options.disable && !this.options.disableLocalIME) {
        addInputElement(this);
      }
    }
    this.engine = VERTC.createEngine(this.options.appId);

    VERTC.setParameter("ICE_CONFIG_REQUEST_URLS", [
      "rtcg-access.volcvideos.com",
      "rtcg-access-va.volcvideos.com",
      "rtcg-access-fr.volcvideos.com",
      "rtcg-access-sg.volcvideos.com",
      "rtc-access-ag.bytedance.com",
      "rtc-access.bytedance.com",
      "rtc-access2-hl.bytedance.com",
      "rtcg-access.bytevcloud.com",
    ]);

    this.engine?.on(VERTC.events.onLocalVideoSizeChanged, (resolution) => {
      const { width, height } = resolution?.info || {};
      this.setVideoEncoder(width, height);
    });

    /** 监听失败回调 */
    this.engine.on(VERTC.events.onError, (error) => {
      this.callbacks.onErrorMessage(error);
    });

    /** 监听播放失败回调 */
    this.engine.on(VERTC.events.onAutoplayFailed, (e) => {
      this.callbacks.onAutoplayFailed(e);
    });

    /** 用户订阅的远端音/视频流统计信息以及网络状况，统计周期为 2s */
    this.engine.on(VERTC.events.onRemoteStreamStats, (e) => {
      this.callbacks.onRunInformation(e);
    });

    /** 加入房间后，会以每2秒一次的频率，收到本端上行及下行的网络质量信息。 */
    this.engine.on(
      VERTC.events.onNetworkQuality,
      (uplinkNetworkQuality: number, downlinkNetworkQuality: number) => {
        this.callbacks.onNetworkQuality(
          uplinkNetworkQuality,
          downlinkNetworkQuality
        );
      }
    );
  }

  // 创建群控实例
  async createGroupEngine(pads = [], config?: any) {
    this.groupRtc = new customGroupRtc(
      { ...this.options, ...config },
      pads,
      this.callbacks
    );
    try {
      const example = await this.groupRtc.getEngine();
      this.groupEngine = example.engine;
    } catch (error: any) {
      this.callbacks.onGroupControlError({
        code: error.code,
        msg: error.message,
      });
    }
  }

  /** 手动销毁通过 createEngine 所创建的引擎对象 */
  destroyEngine() {
    if (this.engine) VERTC.destroyEngine(this.engine);
    if (this.groupEngine) VERTC.destroyEngine(this.groupEngine);
  }

  /**
   * 静音
   */
  muted() {
    this.engine?.unsubscribeStream(this.options.clientId, MediaType.AUDIO);
  }

  /**
   * 取消静音
   */
  unmuted() {
    this.engine?.subscribeStream(this.options.clientId, MediaType.AUDIO);
  }
  /** 按顺序发送文本框 */
  public sendGroupInputString(pads: any, strs: any) {
    strs?.map((v: string, index: number) => {
      const message = JSON.stringify({
        text: v,
        pads: [pads[index]],
        touchType: TouchType.INPUT_BOX,
      });
      this.groupRtc?.sendRoomMessage(message);
    });
  }
  /**  群控剪切板  */
  public sendGroupInputClipper(pads: any, strs: any) {
    strs?.map((v: string, index: number) => {
      const message = JSON.stringify({
        text: v,
        pads: [pads[index]],
        touchType: TouchType.CLIPBOARD,
      });
      this.groupRtc?.sendRoomMessage(message);
    });
  }
  /** 手动开启音视频流播放 */
  startPlay() {
    if (this.engine) this.engine.play(this.options.clientId);
  }
  /** 群控房间信息 */
  async sendGroupRoomMessage(message: string) {
    return await this?.groupRtc?.sendRoomMessage(message);
  }
  getMsgTemplate(touchType: string, content: object) {
    return JSON.stringify({
      touchType,
      content: JSON.stringify(content),
    });
  }

  /** 获取应用信息 */
  getEquipmentInfo(type: "app" | "attr") {
    this.sendUserMessage(
      this.options.clientId,
      this.getMsgTemplate(TouchType.EQUIPMENT_INFO, {
        type,
      }),
      true
    );
  }
  /** 获取注入推流状态 */
  getInjectStreamStatus(
    type: "video" | "camera" | "audio",
    timeout: number = 0
  ) {
    return new Promise((resolve) => {
      // 创建超时处理器
      let timeoutHandler: any = null;

      if (timeout !== 0) {
        timeoutHandler = setTimeout(() => {
          resolve({
            status: "unknown",
            type,
          });
        }, timeout);
      }

      // 根据类型处理不同的流状态
      const handleStreamStatus = () => {
        switch (type) {
          case "video":
            try {
              // 保存resolve函数以便在收到响应时调用
              Object.assign(this.promiseMap.streamStatus, {
                resolve: (result: any) => {
                  if (timeoutHandler) clearTimeout(timeoutHandler);
                  resolve(result);
                },
              });

              this.sendUserMessage(
                this.options.clientId,
                this.getMsgTemplate(TouchType.EVENT_SDK, {
                  type: "injectionVideoStats",
                }),
                true
              );
            } catch (error) {
              if (timeoutHandler) clearTimeout(timeoutHandler);
              resolve({
                status: "unknown",
                type,
              });
            }
            break;

          case "camera":
            if (timeoutHandler) clearTimeout(timeoutHandler);
            resolve({
              status: this.isCameraInject ? "live" : "offline",
              type,
            });
            break;

          case "audio":
            if (timeoutHandler) clearTimeout(timeoutHandler);
            resolve({
              status: this.isMicrophoneInject ? "live" : "offline",
              type,
            });
            break;
        }
      };

      handleStreamStatus();
    });
  }

  /** 应用卸载 */
  appUnInstall(pkgNames: Array<string>) {
    this.sendUserMessage(
      this.options.clientId,
      this.getMsgTemplate(TouchType.APP_UNINSTALL, pkgNames),
      true
    );
  }

  /** 通知手机需要注入 */
  private async notifyInject(
    type: SdkEventType.INJECTION_CAMERA | SdkEventType.INJECTION_AUDIO,
    isOpen: boolean
  ) {
    await this.sendUserMessage(
      this.options.clientId,
      this.getMsgTemplate(TouchType.EVENT_SDK, {
        type,
        isOpen,
      }),
      true
    );
  }

  /** 开启摄像头 或 麦克风注入 返回一个promise */
  async startMediaStream(
    mediaType: MediaType,
    msgData?: any
  ): Promise<{ audio: any; video: any }> {
    try {
      const res: { audio: any; video: any } = {
        audio: null,
        video: null,
      };

      // 处理视频设备
      if ([MediaType.VIDEO, MediaType.AUDIO_AND_VIDEO].includes(mediaType)) {
        await this.notifyInject(SdkEventType.INJECTION_CAMERA, true);
        const videoDeviceId =
          this.videoDeviceId || (msgData?.isFront ? "user" : "environment");
        await this.engine?.setVideoCaptureDevice(videoDeviceId);
        res.video = await this.engine?.startVideoCapture();
      //  this.setVideoEncoder(res?.video?.width, res?.video?.height);

        await this.engine?.publishStream(MediaType.VIDEO);
        this.isCameraInject = true;
      }

      // 处理音频设备
      if ([MediaType.AUDIO, MediaType.AUDIO_AND_VIDEO].includes(mediaType)) {
        await this.notifyInject(SdkEventType.INJECTION_AUDIO, true);
        if (this.audioDeviceId) {
          await this.engine?.setAudioCaptureDevice(this.audioDeviceId);
        }
        res.audio = await this.engine?.startAudioCapture();
        await this.engine?.publishStream(MediaType.AUDIO);
        this.isMicrophoneInject = true;
      }

      return res;
    } catch (error) {
      return Promise.reject(error);
    }
  }
  /** 关闭摄像头 或 麦克风注入 返回一个promise */
  public async stopMediaStream(mediaType: MediaType): Promise<void> {
    try {
      const stopOperations = [];

      // 根据媒体类型添加对应操作
      if (
        mediaType === MediaType.VIDEO ||
        mediaType === MediaType.AUDIO_AND_VIDEO
      ) {
        await this.notifyInject(SdkEventType.INJECTION_CAMERA, false);
        stopOperations.push(
          this.engine?.stopVideoCapture(),
          this.engine?.unpublishStream(MediaType.VIDEO)
        );
      }

      if (
        mediaType === MediaType.AUDIO ||
        mediaType === MediaType.AUDIO_AND_VIDEO
      ) {
        await this.notifyInject(SdkEventType.INJECTION_AUDIO, false);
        stopOperations.push(
          this.engine?.stopAudioCapture(),
          this.engine?.unpublishStream(MediaType.AUDIO)
        );
      }

      // 并行执行所有停止操作
      await Promise.all(stopOperations);

      switch (mediaType) {
        case MediaType.VIDEO:
          this.isCameraInject = false;
          break;
        case MediaType.AUDIO:
          this.isMicrophoneInject = false;
          break;
        case MediaType.AUDIO_AND_VIDEO:
          this.isCameraInject = false;
          this.isMicrophoneInject = false;
          break;
      }
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** 摄像头注入 */
  private async cameraInject(msgData?: any) {
    try {
      await this.stopMediaStream(MediaType.VIDEO);

      const res = await this.startMediaStream(MediaType.VIDEO, msgData);
      debugger
      this.callbacks.onVideoInit(res.video);
    } catch (error) {
      this.callbacks.onVideoError(error);
      return Promise.reject(error);
    }
  }

  /** 麦克风注入 */
  private async microphoneInject() {
    try {
      await this.stopMediaStream(MediaType.AUDIO);

      const res = await this.startMediaStream(MediaType.AUDIO);
      this.callbacks.onAudioInit(res.audio);
      this.isMicrophoneInject = true;
      return res.audio;
    } catch (error) {
      this.callbacks.onAudioError(error);
      this.isMicrophoneInject = false;
      return Promise.reject(error);
    }
  }
  /** 发送消息 */
  async sendUserMessage(
    userId: string,
    message: string,
    notSendInGroups?: boolean
  ) {
    try {
      // 重置无操作回收定时器
      this.triggerRecoveryTimeCallback();

      !notSendInGroups &&
        this.groupControlSync &&
        this.sendGroupRoomMessage(message);

      return await this.engine?.sendUserMessage(userId, message);
    } catch (error: any) {
      this.callbacks?.onSendUserError(error);
      return Promise.reject(error);
    }
  }
  /** 群控退出房间 */
  public kickItOutRoom(pads: Array<string>) {
    if (Array.isArray(pads)) {
      this.groupRtc?.kickItOutRoom(pads);
    }
  }
  /** 群控加入房间 */
  public joinGroupRoom(pads: any) {
    const arr = pads?.filter((v: any) => v !== this.remoteUserId);
    if (!arr.length || !this.isGroupControl) return;

    if (!this.groupRtc && this.isGroupControl) {
      this.createGroupEngine(arr);
      return;
    }
    this.groupRtc?.joinRoom(arr);
  }

  /** 进入 RTC 房间 */
  start(isGroupControl = false, pads = []) {
    this.isGroupControl = isGroupControl;
    this.metricsReporter = new MetricsReporter({
      endpoint: `${this.options.baseUrl}/traffic-info/open/traffic/rtcMonitor`,
      commonParams: {
        padCode: this.remoteUserId,
        streamType: this.options.streamType,
        sdkTerminal: "h5",
      },
      onceOnlyKeys: [ReportEventType.FIRST_FRAME],
      useBeacon: false,
      enableLog: true,
    });

    this.metricsReporter?.addParam(ReportEventType.FIRST_FRAME, {
      joinRoomTime: Date.now(),
    });

    this.metricsTimer = setTimeout(() => {
      this.metricsReporter?.addParam(ReportEventType.FIRST_FRAME, {
        judgeTime: Date.now(),
        result: 0,
      });
      this.metricsReporter?.instant(ReportEventType.FIRST_FRAME);
    }, 5000);
    const config = {
      appId: this.options.appId,
      roomId: this.options.roomCode,
      uid: this.options.userId,
      token: this.options.roomToken,
    };
    const isAutoSubscribeAudio =
      this.options.mediaType === 1 || this.options.mediaType === 3;
    const isAutoSubscribeVideo =
      this.options.mediaType === 2 || this.options.mediaType === 3;
    this.engine
      ?.joinRoom(
        config.token,
        config.roomId,
        {
          userId: config.uid,
        },
        {
          isAutoPublish: false, // 是否自动发布音视频流，默认为自动发布。
          isAutoSubscribeAudio: false, // 是否自动订阅音频流，默认为自动订阅。
          isAutoSubscribeVideo: false, // 是否自动订阅视频流，默认为自动订阅。
        }
      )
      .then(async (res) => {
        const arr = pads?.filter((v: any) => v !== this.remoteUserId);
        isGroupControl && arr.length && this.createGroupEngine(arr);
        // 加入房间成功
        const that = this;
        const { disableContextMenu, clientId: userId } = this.options;
        const videoDom = document.getElementById(that.videoDomId);
        if (videoDom) {
          videoDom.style.width = "0px";
          videoDom.style.height = "0px";

          const isMobileFlag = isTouchDevice() || isMobile();
          let eventTypeStart = "touchstart";
          let eventTypeMove = "touchmove";
          let eventTypeEnd = "touchend";

          if (!isMobileFlag) {
            eventTypeStart = "mousedown";
            eventTypeMove = "mousemove";
            eventTypeEnd = "mouseup";
          }
          if (disableContextMenu) {
            videoDom.addEventListener("contextmenu", (e) => {
              e.preventDefault();
            });
          }
          // 监听鼠标滚轮事件
          videoDom.addEventListener("wheel", (e) => {
            // e.preventDefault()
            if (this.options.disable) return;
            const { offsetX, offsetY, deltaY } = e;

            const touchConfigMousedown = {
              coords: [{ pressure: 1.0, size: 1.0, x: offsetX, y: offsetY }],
              widthPixels: videoDom.clientWidth,
              heightPixels: videoDom.clientHeight,
              pointCount: 1,
              properties: [{ id: 0, toolType: 1 }],
              touchType: "gestureSwipe",
              swipe: deltaY > 0 ? -1 : 1,
            };
            const messageMousedown = JSON.stringify(touchConfigMousedown);
            this.sendUserMessage(userId, messageMousedown);
          });

          /** 鼠标移出 */
          videoDom.addEventListener("mouseleave", (e: any) => {
            e.preventDefault();
            if (this.options.disable) return;
            // 若未按下时，不发送鼠标移动事件
            if (!this.hasPushDown) {
              return;
            }
            this.touchConfig.action = 1; // 抬起
            const message = JSON.stringify(this.touchConfig);

            this.sendUserMessage(userId, message);
          });

          // 添加触摸事件监听器到新节点
          // 触摸开始
          videoDom.addEventListener(eventTypeStart, (e: any) => {
            e.preventDefault();

            if (this.options.disable) return;
            that.hasPushDown = true;
            const { allowLocalIMEInCloud, keyboard } = that.options;
            const { inputStateIsOpen } = that.roomMessage;
            // 处理输入框焦点逻辑
            const shouldHandleFocus =
              (allowLocalIMEInCloud && keyboard === "pad") ||
              keyboard === "local";

            if (
              that.inputElement &&
              shouldHandleFocus &&
              typeof inputStateIsOpen === "boolean"
            ) {
              inputStateIsOpen
                ? that.inputElement?.focus()
                : that.inputElement?.blur();
            }

            this.touchInfo = generateTouchCoord();
            // 获取节点相对于视口的位置信息
            const videoDomIdRect = videoDom.getBoundingClientRect();
            const distanceToTop = videoDomIdRect.top;
            const distanceToLeft = videoDomIdRect.left;
            // 初始化
            that.touchConfig.properties = [];
            that.touchConfig.coords = [];
            // 计算触摸手指数量
            const touchCount = isMobileFlag ? e?.touches?.length : 1;
            that.touchConfig.action = 0; // 按下操作
            that.touchConfig.pointCount = touchCount;
            // 手指触控节点宽高
            const bigSide =
              videoDom.clientWidth > videoDom.clientHeight
                ? videoDom.clientWidth
                : videoDom.clientHeight;
            const smallSide =
              videoDom.clientWidth > videoDom.clientHeight
                ? videoDom.clientHeight
                : videoDom.clientWidth;

            this.touchConfig.widthPixels =
              this.rotateType == 1 ? bigSide : smallSide;
            this.touchConfig.heightPixels =
              this.rotateType == 1 ? smallSide : bigSide;

            if (
              this.rotateType == 1 &&
              this.remoteResolution.height > this.remoteResolution.width
            ) {
              this.touchConfig.widthPixels = smallSide;
              this.touchConfig.heightPixels = bigSide;
            } else if (
              this.rotateType == 0 &&
              this.remoteResolution.width > this.remoteResolution.height
            ) {
              // 竖屏但是远端流是横屏（用户手动旋转屏幕）
              this.touchConfig.widthPixels = bigSide;
              this.touchConfig.heightPixels = smallSide;
            }

            for (let i = 0; i < touchCount; i += 1) {
              const touch = isMobileFlag ? e.touches[i] : e;
              that.touchConfig.properties[i] = {
                id: i,
                toolType: 1,
              };

              let x = touch.offsetX;
              let y = touch.offsetY;
              if (x == undefined) {
                x = touch.clientX - distanceToLeft;
                y = touch.clientY - distanceToTop;

                if (
                  this.rotateType == 1 &&
                  this.remoteResolution.height > this.remoteResolution.width
                ) {
                  x = videoDomIdRect.bottom - touch.clientY;
                  y = touch.clientX - distanceToLeft;
                } else if (
                  this.rotateType == 0 &&
                  this.remoteResolution.width > this.remoteResolution.height
                ) {
                  x = touch.clientY - distanceToTop;
                  y = videoDomIdRect.right - touch.clientX;
                }
              }
              that.touchConfig.coords.push({
                ...this.touchInfo,
                orientation: 0.01 * Math.random(),
                x: x,
                y: y,
              });
            }
            const touchConfig = {
              action: touchCount > 1 ? 261 : 0,
              widthPixels: that.touchConfig.widthPixels,
              heightPixels: that.touchConfig.heightPixels,
              pointCount: touchCount,
              touchType: "gesture",
              properties: that.touchConfig.properties,
              coords: that.touchConfig.coords,
            };
            const message = JSON.stringify(touchConfig);
            that.sendUserMessage(userId, message);
          });
          // 触摸中
          videoDom.addEventListener(eventTypeMove, (e: any) => {
            e.preventDefault();
            if (this.options.disable) return;
            // 若未按下时，不发送鼠标移动事件
            if (!that.hasPushDown) {
              return;
            }
            // 获取节点相对于视口的位置信息
            const videoDomIdRect = videoDom.getBoundingClientRect();
            const distanceToTop = videoDomIdRect.top;
            const distanceToLeft = videoDomIdRect.left;
            // 计算触摸手指数量
            const touchCount = isMobileFlag ? e?.touches?.length : 1;
            that.touchConfig.action = 2; // 触摸中
            that.touchConfig.pointCount = touchCount;
            that.touchConfig.coords = [];
            const coords = [];
            for (let i = 0; i < touchCount; i += 1) {
              const touch = isMobileFlag ? e.touches[i] : e;
              that.touchConfig.properties[i] = {
                id: i,
                toolType: 1,
              };
              let x = touch.offsetX;
              let y = touch.offsetY;
              if (x == undefined) {
                x = touch.clientX - distanceToLeft;
                y = touch.clientY - distanceToTop;

                if (
                  this.rotateType == 1 &&
                  this.remoteResolution.height > this.remoteResolution.width
                ) {
                  x = videoDomIdRect.bottom - touch.clientY;
                  y = touch.clientX - distanceToLeft;
                } else if (
                  this.rotateType == 0 &&
                  this.remoteResolution.width > this.remoteResolution.height
                ) {
                  x = touch.clientY - distanceToTop;
                  y = videoDomIdRect.right - touch.clientX;
                }
              }
              coords.push({
                ...this.touchInfo,
                orientation: 0.01 * Math.random(),
                x: x,
                y: y,
              });
            }
            that.touchConfig.coords = coords;
            const touchConfig = {
              action: 2,
              widthPixels: that.touchConfig.widthPixels,
              heightPixels: that.touchConfig.heightPixels,
              pointCount: touchCount,
              touchType: "gesture",
              properties: that.touchConfig.properties,
              coords: that.touchConfig.coords,
            };
            const message = JSON.stringify(touchConfig);
            // console.log('2222触摸中', message)
            that.sendUserMessage(userId, message);
          });
          // 触摸结束
          videoDom.addEventListener(eventTypeEnd, (e: any) => {
            e.preventDefault();
            if (this.options.disable) return;
            that.hasPushDown = false; // 按下状态重置
            if (isMobileFlag) {
              if (e.touches.length === 0) {
                that.touchConfig.action = 1; // 抬起
                const message = JSON.stringify(that.touchConfig);
                that.sendUserMessage(userId, message);
              }
            } else {
              that.touchConfig.action = 1; // 抬起
              const message = JSON.stringify(that.touchConfig);
              // console.log("触摸结束", message);
              that.sendUserMessage(userId, message);
            }
          });

          // 监听广播消息
          that.onRoomMessageReceived();
          that.onUserMessageReceived();
          that.onUserJoined();
          that.onUserLeave();
          that.onRemoteVideoFirstFrame();

          // 远端摄像头/麦克风采集音视频流的回调
          that.onUserPublishStream();

          this.startCV();
          this.callbacks.onConnectSuccess();
        }

        /**
         * 监听连接状态的变化
         * @return
         * 0 进行连接前准备，锁定相关资源,
         * 1 连接断开,
         * 2 首次连接，正在连接中,
         * 3 首次连接成功,
         * 4 连接断开后重新连接中,
         * 5 连接断开后重连成功,
         * 6 处于 CONNECTION_STATE_DISCONNECTED 状态超过 10 秒，且期间重连未成功。SDK将继续尝试重连
         */
        that.engine?.on(VERTC.events.onConnectionStateChanged, (e) => {
          that.callbacks.onConnectionStateChanged(e);
        });
        // that.engine?.on(
        //   VERTC.events.onAudioDeviceStateChanged,
        //   debounce((e) => {
        //     console.log("音频设备状态变化", e);
        //     if (e.deviceState == "active" && this.enableMicrophone) {
        //       this.microphoneInject();
        //     }
        //     that.callbacks?.onAudioDeviceStateChanged?.(e);
        //   }, 500)
        // );
      })
      .catch((error) => {
        this.metricsReporter?.addParam(ReportEventType.FIRST_FRAME, {
          judgeTime: Date.now(),
          result: 0,
        });
        this.metricsReporter?.instant(ReportEventType.FIRST_FRAME);
        console.log("进房错误", error);
        this.callbacks.onConnectFail({ code: error.code, msg: error.message });
      });
  }
  startCV() {
    console.log("startCV", this.videoDomId)
    this._listenKeyboardShortcut = this.listenKeyboardShortcut.bind(this)
    this.disableKeyboardShortcut()
    this.enableKeyboardShortcut()
  }
  enableKeyboardShortcut() {
    document.addEventListener("keydown", this._listenKeyboardShortcut)
  }
  disableKeyboardShortcut(){
    console.log("disableKeyboardShortcut")
    document.removeEventListener("keydown", this._listenKeyboardShortcut)
  }
  /**
 * 监听键盘快捷键
 */
  listenKeyboardShortcut(e: KeyboardEvent) {
    if (e.isComposing) return // 忽略输入法组合键
    const key = e.key.toLowerCase() // 统一小写
    const ctrlOrCmd = e.ctrlKey || e.metaKey // Win/Linux = Ctrl, macOS = Cmd

    if (ctrlOrCmd && key === "a") {
      e.preventDefault()
      console.log("Ctrl/Cmd + A pressed")
      this?.triggerKeyboardShortcut(8192, 29)
    } else if (ctrlOrCmd && key === "c") {
      e.preventDefault()
      console.log("Ctrl/Cmd + C pressed")
      this?.triggerKeyboardShortcut(8192, 31)
    }
  }
  /** 远端用户离开房间 */
  onUserLeave() {
    this.engine?.on(VERTC.events.onConnectionStateChanged, (e) => {
      console.log("onConnectionStateChanged ", e)
        // this.disableKeyboardShortcut()
    })
    this.engine?.on(VERTC.events.onUserLeave, (res) => {
      console.log("onUserLeave ", res)
      this.disableKeyboardShortcut()
      this.callbacks.onUserLeave(res);
    });
  }
  setViewSize(width: number, height: number, rotateType: 0 | 1 = 0) {
    const h5Dom = document.getElementById(this.initDomId)!;
    const videoDom = document.getElementById(
      this.videoDomId
    )! as HTMLDivElement;

    if (h5Dom && videoDom) {
      const setDimensions = (
        element: HTMLElement,
        width: number,
        height: number
      ) => {
        element.style.width = width + "px";
        element.style.height = height + "px";
      };

      // 设置宽高
      setDimensions(h5Dom, width, height);

      if (rotateType == 1) {
        setDimensions(videoDom, height, width);
        return;
      }
      setDimensions(videoDom, width, height);
    }
  }
  async getCameraState(isRetry = false) {
    try {
      const userId = this.options.clientId;
      const contentObj = {
        type: "cameraState",
      };
      const messageObj = {
        touchType: "eventSdk",
        content: JSON.stringify(contentObj),
      };
      const message = JSON.stringify(messageObj);

      const res = await this.sendUserMessage(userId, message);
    } catch (error) {
      if (!isRetry) {
        return;
      }
      setTimeout(() => {
        this.getCameraState(false);
      }, 1000);
    }
  }
  async updateUiH5(isRetry = false) {
    try {
      const userId = this.options.clientId;
      const contentObj = {
        type: "updateUiH5",
      };
      const messageObj = {
        touchType: "eventSdk",
        content: JSON.stringify(contentObj),
      };
      const message = JSON.stringify(messageObj);
      const res = await this.sendUserMessage(userId, message);
    } catch (error) {
      if (!isRetry) {
        return;
      }
      setTimeout(() => {
        this.updateUiH5(false);
      }, 1000);
    }
  }
  // 模拟点击事件
  triggerClickEvent(
    options: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    forwardOff: boolean = false
  ) {
    this.triggerPointerEvent(0, options, forwardOff);

    setTimeout(() => {
      this.triggerPointerEvent(1, options, forwardOff);
    }, 15 + Math.floor(Math.random() * 11));
  }
  // 模拟触摸事件 0 按下 1 抬起 2 触摸中
  triggerPointerEvent(
    action: 0 | 1 | 2,
    options: { x: number; y: number; width: number; height: number },
    forwardOff: boolean = false
  ) {
    const { x, y, width, height } = options;
    if (action == 0) {
      this.simulateTouchInfo = generateTouchCoord();
    }

    const touchInfo = {
      action,
      pointCount: 1,
      touchType: "gesture",
      widthPixels: width,
      heightPixels: height,
      coords: [
        {
          ...this.simulateTouchInfo,
          orientation: 0.01 * Math.random(),
          x,
          y,
        },
      ],
      properties: [
        {
          id: 0,
          toolType: 1,
        },
      ],
    };
    const userId = this.options.clientId;
    this.sendUserMessage(userId, JSON.stringify(touchInfo), forwardOff);
  }

  /** 远端可见用户加入房间 */
  onUserJoined() {
    const that = this;
    this.engine?.on(VERTC.events.onUserJoined, (user) => {
      if (user.userInfo?.userId === this.options.clientId) {
        setTimeout(() => {
          that.updateUiH5(true);
          that.getCameraState(true);
          // 查询输入状态
          that.onCheckInputState();
          that.setKeyboardStyle(that.options.keyboard);
          that.triggerRecoveryTimeCallback();
          that.callbacks?.onUserJoined(user);
        }, 300);
      }
    });
  }

  /** 视频首帧渲染 */
  onRemoteVideoFirstFrame() {
    this.engine?.on(VERTC.events.onRemoteVideoFirstFrame, async (event) => {
      try {
        if (!this.isFirstRotate) {
          await this.initRotateScreen(event.width, event.height);
        }
        this.metricsReporter?.addParam(ReportEventType.FIRST_FRAME, {
          judgeTime: Date.now(),
          result: 1,
        });
        this.metricsReporter?.instant(ReportEventType.FIRST_FRAME);
      } finally {
        this.callbacks.onRenderedFirstFrame(event);
      }
    });
  }

  /** 离开 RTC 房间 */
  async stop() {
    try {
      this.disableKeyboardShortcut()
      clearTimeout(this.metricsTimer);
      this.metricsTimer = null;
      clearTimeout(this.autoRecoveryTimer);
      const { clientId, mediaType } = this.options;
      const promises = [
        this.engine?.unsubscribeStream(this.options.clientId, mediaType),
        this.engine?.stopAudioCapture(),
        this.engine?.stopVideoCapture(),
        this.engine?.leaveRoom(),
        this.groupEngine?.leaveRoom(),
      ];
      await Promise.allSettled(promises);
      this.destroyEngine();

      this.groupRtc?.close();
      this.screenShotInstance?.destroy();

      const videoDomElement = document.getElementById(this.videoDomId);
      if (videoDomElement && videoDomElement.parentNode) {
        videoDomElement.parentNode.removeChild(videoDomElement);
      }
      this.inputElement?.remove();
      this.groupEngine = null;
      this.groupRtc = null;
      this.screenShotInstance = null;
    } catch (error) {
      return Promise.reject(error);
    }
  }
  /** 房间内新增远端摄像头/麦克风采集音视频流的回调 */
  onUserPublishStream() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    const handleUserPublishStream = async (e: {
      userId: string;
      mediaType: any;
    }) => {
      if (e.userId === this.options.clientId) {
        const player: any = document.querySelector(`#${that.videoDomId}`);

        await this.setRemoteVideoRotation(this.rotation);

        await this.engine?.subscribeStream(
          this.options.clientId,
          this.options.mediaType
        );

        if (!this.screenShotInstance) {
          this.screenShotInstance = new ScreenshotOverlay(
            player,
            this.rotation
          );
        }
      }
    };
    this.engine?.on(VERTC.events.onUserPublishStream, handleUserPublishStream);
  }

  /**
   * 发送摇一摇信息
   */
  sendShakeInfo(time: number) {
    const userId = this.options.clientId;
    const shake = new Shake();
    shake.startShakeSimulation(time, (content: any) => {
      const getOptions = (sensorType: string) => {
        return JSON.stringify({
          coords: [],
          heightPixels: 0,
          isOpenScreenFollowRotation: false,
          keyCode: 0,
          pointCount: 0,
          properties: [],
          text: "",
          touchType: TouchType.EVENT_SDK,
          widthPixels: 0,
          action: 0,
          content: JSON.stringify({
            ...content,
            type: SdkEventType.SDK_SENSOR,
            sensorType,
          }),
        });
      };
      this.sendUserMessage(userId, getOptions("gyroscope"));
      this.sendUserMessage(userId, getOptions("gravity"));
      this.sendUserMessage(userId, getOptions("acceleration"));
    });
  }

  checkInputState(msg: any) {
    const { allowLocalIMEInCloud, keyboard } = this.options;
    const msgData = JSON.parse(msg.data);

    this.roomMessage.inputStateIsOpen = msgData.isOpen;
    // 仅在 enterkeyhint 存在时设置属性
    const enterkeyhintText = this.enterkeyhintObj[msgData.imeOptions as any];
    if (enterkeyhintText) {
      this.inputElement?.setAttribute("enterkeyhint", enterkeyhintText);
    }
    // 处理输入框焦点逻辑
    const shouldHandleFocus =
      (allowLocalIMEInCloud && keyboard === "pad") || keyboard === "local";
    debugger
    if (shouldHandleFocus && typeof msgData.isOpen === "boolean") {
      msgData.isOpen ? this.inputElement?.focus() : this.inputElement?.blur();
    }
  }

  /** 监听 onRoomMessageReceived 事件 */
  onRoomMessageReceived() {
    const onRoomMessageReceived = async (e: {
      userId: string;
      message: string;
    }) => {
      if (e.message) {
        const msg = JSON.parse(e.message);
        // 消息透传
        if (msg.key === "message") {
          this.callbacks.onTransparentMsg(0, msg.data);
        }
        // ui消息
        if (msg.key === "refreshUiType") {
          const msgData = JSON.parse(msg.data);
          this.roomMessage.isVertical = msgData.isVertical;
          // 若宽高没变，则不重新绘制页面
          if (
            msgData.width == this.remoteResolution.width &&
            msgData.height == this.remoteResolution.height
          ) {
            console.log("宽高没变，不重新绘制页面", this.remoteUserId);
            return;
          }

          this.initRotateScreen(msgData.width, msgData.height);
        }
        // 云机、本机键盘使用消息
        if (msg.key === "inputState" && this.inputElement) {
          this.checkInputState(msg);
        }
        // 将云机内容复制到本机剪切板
        if (msg.key === "clipboard") {
          if (this.options.saveCloudClipboard) {
            const msgData = JSON.parse(msg.data);
            copyText(msgData?.content || "")
            this.callbacks.onOutputClipper(msgData);
          }
        }
      }
    };
    this.engine?.on(VERTC.events.onRoomMessageReceived, onRoomMessageReceived);
  }

  /** 监听 onUserMessageReceived 事件 */
  onUserMessageReceived() {
    const that = this;
    const parseResolution = (resolution: string) => {
      const [width, height] = resolution?.split("*").map(Number);
      return { width, height };
    };
    const onUserMessageReceived = async (e: {
      userId: string;
      message: string;
    }) => {
      if (e.message) {
        const msg = JSON.parse(e.message);
        if (msg.key === MessageKey.CALL_BACK_EVENT) {
          const callData = JSON.parse(msg.data);
          const result = JSON.parse(callData.data);
          switch (callData.type) {
            case MessageKey.DEFINITION:
              this.callbacks.onChangeResolution({
                from: parseResolution(result.from),
                to: parseResolution(result.to),
              });
              break;
            case MessageKey.START_INJECTION_VIDEO:
            case MessageKey.STOP_INJECTION_VIDEO:
              const { resolve: injectResolve } = this.promiseMap.injectStatus;

              if (injectResolve) {
                injectResolve({
                  type: callData.type,
                  status: result?.isSuccess ? "success" : "error",
                  result,
                });
                this.promiseMap.injectStatus.resolve = null;
              }
              this.callbacks?.onInjectVideoResult(callData.type, result);
              break;
            case MessageKey.INJECTION_VIDEO_STATS:
              const { resolve } = this.promiseMap.streamStatus;
              resolve({
                path: result.path,
                status: result.status || (result.path ? "live" : "offline"),
                type: "video",
              });
              break;
            case MessageKey.OPERATE_SWITCH:
              this.callbacks?.onMonitorOperation(result);
              break;
          }
        }

        if (msg.key === MessageKey.EQUIPMENT_INFO) {
          this.callbacks?.onEquipmentInfo(JSON.parse(msg.data || []));
        }
        if (msg.key === MessageKey.INPUT_ADB) {
          this.callbacks?.onAdbOutput(JSON.parse(msg.data || {}));
        }
        // 音视频采集
        if (msg.key === MessageKey.VIDEO_AND_AUDIO_CONTROL) {
          const msgData = JSON.parse(msg.data);

          this.callbacks.onMediaDevicesToggle({
            type: "media",
            enabled: msgData.isOpen,
            isFront: msgData.isFront,
          });

          if (!this.enableMicrophone && !this.enableCamera) {
            return;
          }

          const pushType =
            this.enableMicrophone && this.enableCamera
              ? MediaType.AUDIO_AND_VIDEO
              : this.enableCamera
              ? MediaType.VIDEO
              : MediaType.AUDIO;
          if (msgData.isOpen) {
            if (this.enableCamera) {
              await this.cameraInject(msgData);
            }
            if (this.enableMicrophone) {
              await this.microphoneInject();
            }
          } else {
            await this.stopMediaStream(pushType);
          }
        }
        // 云机、本机键盘使用消息
        if (msg.key === MessageKey.INPUT_STATE && this.inputElement) {
          this.checkInputState(msg);
        }
        // 视频采集
        if (msg.key === MessageKey.VIDEO_CONTROL) {
          const msgData = JSON.parse(msg.data);

          this.callbacks.onMediaDevicesToggle({
            type: "camera",
            enabled: msgData.isOpen,
            isFront: msgData.isFront,
          });

          if (!this.enableCamera) {
            return;
          }

          if (msgData.isOpen) {
            await this.cameraInject(msgData);
          } else {
            await this.stopMediaStream(MediaType.VIDEO);
          }
        }
        // 音频采集
        if (msg.key === MessageKey.AUDIO_CONTROL) {
          const msgData = JSON.parse(msg.data);

          this.callbacks.onMediaDevicesToggle({
            type: "microphone",
            enabled: msgData.isOpen,
          });

          if (!this.enableMicrophone) {
            return;
          }

          if (msgData.isOpen) {
            await this.microphoneInject();
          } else {
            await this.stopMediaStream(MediaType.AUDIO);
          }
        }
      }
    };
    that.engine?.on(VERTC.events.onUserMessageReceived, onUserMessageReceived);
  }
  /**
   * 将字符串发送到云手机的粘贴板中
   * @param inputStr 需要发送的字符串
   */
  async sendInputClipper(inputStr: string, forwardOff: boolean = false) {
    const userId = this.options.clientId;
    const message = JSON.stringify({
      text: inputStr,
      touchType: TouchType.CLIPBOARD,
    });
    await this.sendUserMessage(userId, message, forwardOff);
  }

  /**
   * 当云手机处于输入状态时，将字符串直接发送到云手机，完成输入
   * @param inputStr 需要发送的字符串
   */
  async sendInputString(inputStr: string, forwardOff: boolean = false) {
    const userId = this.options.clientId;
    const message = JSON.stringify({
      text: inputStr,
      touchType: TouchType.INPUT_BOX,
    });
    await this.sendUserMessage(userId, message, forwardOff);
  }

  /** 清晰度切换 */
  setStreamConfig(config: CustomDefinition, forwardOff: boolean = true) {
    const regExp = /^[1-9]\d*$/;
    // 判断字段是否缺失
    if (config.definitionId && config.framerateId && config.bitrateId) {
      const values = Object.values(config);
      // 判断输入值是否为正整数
      if (values.every((value) => regExp.test(value))) {
        const contentObj = {
          type: SdkEventType.DEFINITION_UPDATE,
          definitionId: config.definitionId,
          framerateId: config.framerateId,
          bitrateId: config.bitrateId,
        };
        const messageObj = {
          touchType: TouchType.EVENT_SDK,
          content: JSON.stringify(contentObj),
        };
        const userId = this.options.clientId;
        const message = JSON.stringify(messageObj);
        this.sendUserMessage(userId, message, forwardOff);
      }
    }
  }

  /**
   * 暂停接收来自远端的媒体流
   * 该方法仅暂停远端流的接收，并不影响远端流的采集和发送。
   * @param mediaType 1 只控制音频; 2 只控制视频; 3 同时控制音频和视频
   */
  pauseAllSubscribedStream(mediaType: number = 3) {
    // 重置无操作回收定时器
    this.triggerRecoveryTimeCallback();

    const contentObj = {
      type: MediaOperationType.OPEN_AUDIO_AND_VIDEO,
      isOpen: false,
    };
    const messageObj = {
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify(contentObj),
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    this.engine?.sendUserMessage(userId, message);
    return this.engine?.pauseAllSubscribedStream(mediaType);
  }

  /**
   * 恢复接收来自远端的媒体流
   * 该方法仅恢复远端流的接收，并不影响远端流的采集和发送。
   * @param mediaType 1 只控制音频; 2 只控制视频; 3 同时控制音频和视频
   */
  resumeAllSubscribedStream(mediaType: number = 3) {
    // 重置无操作回收定时器
    this.triggerRecoveryTimeCallback();

    // 防止用户在自动拉取音视频流失败时，没手动开启
    this.startPlay();

    if (mediaType !== 3) {
      return this.engine?.resumeAllSubscribedStream(mediaType);
    }
    const contentObj = {
      type: MediaOperationType.OPEN_AUDIO_AND_VIDEO,
      isOpen: true,
    };
    const messageObj = {
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify(contentObj),
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    this.sendUserMessage(userId, message);
    return this.engine?.resumeAllSubscribedStream(mediaType);
  }
  async setRemoteVideoRotation(rotation: number) {
    const player: any = document.querySelector(`#${this.videoDomId}`);
    await this.engine?.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
      userId: this.options.clientId,
      renderDom: player,
      renderMode: 2,
      rotation,
    });
  }
  // 修改屏幕分辨率和dpi
  setScreenResolution(
    options: {
      width: number;
      height: number;
      dpi: number;
      type: MessageKey.RESET_DENSITY | MessageKey.UPDATE_DENSITY;
    },
    forwardOff: boolean = true
  ) {
    const contentObj =
      options.type === MessageKey.UPDATE_DENSITY
        ? {
            type: options.type,
            width: options.width,
            height: options.height,
            density: options.dpi,
          }
        : {
            type: options.type,
          };
    const userId = this.options.clientId;
    const message = this.getMsgTemplate(TouchType.EVENT_SDK, contentObj);
    this.sendUserMessage(userId, message, forwardOff);
  }
  /**
   * 订阅房间内指定的通过摄像头/麦克风采集的媒体流。
   */
  async subscribeStream(mediaType: MediaType) {
    return await this.engine?.subscribeStream(this.options.clientId, mediaType);
  }

  /** 旋转截图 */
  setScreenshotRotation(rotation: number = 0) {
    // this.screenShotInstance?.setScreenshotRotation(rotation);
  }
  /** 生成封面图 */
  takeScreenshot(rotation: number = 0) {
    this.screenShotInstance?.takeScreenshot(rotation);
  }
  /** 重新设置大小 */
  resizeScreenshot(width: number, height: number) {
    this.screenShotInstance?.resizeScreenshot(width, height);
  }
  /** 显示封面图 */
  showScreenShot() {
    this.screenShotInstance?.showScreenShot();
  }
  /** 显示封面图 */
  hideScreenShot() {
    this.screenShotInstance?.hideScreenShot();
  }

  /** 清空封面图 */
  clearScreenShot() {
    this.screenShotInstance?.clearScreenShot();
  }
  /**
   * 取消订阅房间内指定的通过摄像头/麦克风采集的媒体流。
   */
  unsubscribeStream(mediaType: MediaType) {
    return this.engine?.unsubscribeStream(this.options.clientId, mediaType);
  }
  /** 截图-保存到本地 */
  saveScreenShotToLocal() {
    const userId = this.options.clientId;
    return this.engine?.takeRemoteSnapshot(userId, 0);
  }

  /** 截图-保存到云机 */
  saveScreenShotToRemote() {
    const contentObj = {
      type: SdkEventType.LOCAL_SCREENSHOT,
    };
    const messageObj = {
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify(contentObj),
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    this.sendUserMessage(userId, message);
  }

  /**
   * 手动横竖屏：0竖屏，1横屏
   * 对标百度API
   */
  setPhoneRotation(type: number) {
    this.triggerRecoveryTimeCallback();
    this.rotateScreen(type);
  }
  getRotateType() {
    return this.rotateType;
  }

  private async initRotateScreen(width: number, height: number) {
    // 移动端需要强制竖屏
    if (isTouchDevice() || isMobile()) {
      this.options.rotateType = 0;
    }

    const { rotateType } = this.options;
    if (rotateType && this.isFirstRotate) {
      return;
    }

    /** 是否首次旋转 */
    if (!this.isFirstRotate) {
      this.isFirstRotate = true;
    }

    // 存储云机分辨率
    Object.assign(this.remoteResolution, {
      width,
      height,
    });
    // 0 为竖屏，1 为横屏
    let targetRotateType;

    // 判断是否为 0 或 1
    if (rotateType == 0 || rotateType == 1) {
      targetRotateType = rotateType;
    } else {
      // 根据宽高自动设置旋转类型，
      targetRotateType = width > height ? 1 : 0;
    }

    await this.rotateScreen(targetRotateType);
  }
  /**
   * 旋转屏幕
   * @param type 横竖屏：0竖屏，1横屏
   */
  async rotateScreen(type: number) {
    this.rotateType = type;
    try {
      await this.callbacks?.onBeforeRotate(type);
    } catch (error) {}

    // 获取父元素（调用方）的原始宽度和高度，这里要重新获取，因为外层的div可能宽高发生变化
    const h5Dom = document.getElementById(this.initDomId)!;
    if (!h5Dom) return;

    let parentWidth =
      h5Dom.clientWidth > window.innerWidth
        ? window.innerWidth
        : h5Dom.clientWidth;
    let parentHeight =
      h5Dom.clientHeight > window.innerHeight
        ? window.innerHeight
        : h5Dom.clientHeight;

    let bigSide = parentHeight;
    let smallSide = parentWidth;
    if (parentWidth > parentHeight) {
      bigSide = parentWidth;
      smallSide = parentHeight;
    }
    const wrapperBox = h5Dom.parentElement!;
    const wrapperBoxWidth = wrapperBox.clientWidth;
    const toolsWidth = this.options.toolsWidth ?? 0;
    if (type == RotateDirection.LANDSCAPE) {
      if (toolsWidth) {
        parentWidth =
          bigSide > wrapperBoxWidth ? wrapperBoxWidth - toolsWidth : bigSide;
      } else {
        parentWidth = bigSide;
      }
      parentHeight = smallSide;
    } else {
      parentWidth = smallSide;
      parentHeight = bigSide;
    }

    h5Dom.style.width = parentWidth + "px";
    h5Dom.style.height = parentHeight + "px";

    const videoIsLandscape =
      this.remoteResolution.width > this.remoteResolution.height;

    // 外层 div
    let armcloudVideoWidth = 0;
    let armcloudVideoHeight = 0;
    // 旋转角度
    let videoWrapperRotate = 0;

    const videoDom = document.getElementById(this.videoDomId) as HTMLDivElement;

    if (type == 1) {
      const w = videoIsLandscape
        ? this.remoteResolution.width
        : this.remoteResolution.height;
      const h = videoIsLandscape
        ? this.remoteResolution.height
        : this.remoteResolution.width;

      const scale = Math.min(parentWidth / w, parentHeight / h);
      armcloudVideoWidth = w * scale;
      armcloudVideoHeight = h * scale;
      videoWrapperRotate = videoIsLandscape ? 0 : 270;
    } else {
      // 竖屏处理
      const w = videoIsLandscape
        ? this.remoteResolution.height
        : this.remoteResolution.width;
      const h = videoIsLandscape
        ? this.remoteResolution.width
        : this.remoteResolution.height;

      const scale = Math.min(parentWidth / w, parentHeight / h);
      armcloudVideoWidth = w * scale;
      armcloudVideoHeight = h * scale;
      videoWrapperRotate = videoIsLandscape ? 90 : 0;
    }

    this.rotation = videoWrapperRotate;
    // armcloudVideo
    videoDom.style.width = `${armcloudVideoWidth}px`;
    videoDom.style.height = `${armcloudVideoHeight}px`;

    await this.setRemoteVideoRotation(videoWrapperRotate);

    this.callbacks.onChangeRotate(type, {
      width: armcloudVideoWidth,
      height: armcloudVideoHeight,
    });
  }
  /** 触发快捷键 */
  triggerKeyboardShortcut(
    metaState: number | string,
    keyCode: number | string,
    forwardOff: boolean = true
  ) {
    const content = JSON.stringify({
      touchType: MessageKey.SHORTCUT_KEY,
      metaState: metaState + "",
      keyCode: keyCode + "",
    });
    const userId = this.options.clientId;

    this.sendUserMessage(userId, content, forwardOff);
  }

  /** 手动定位 */
  setGPS(longitude: number, latitude: number) {
    const contentObj1 = {
      latitude,
      longitude,
      time: new Date().getTime(),
    };
    const contentObj2 = {
      type: "sdkLocation",
      content: JSON.stringify(contentObj1),
    };
    const messageObj = {
      touchType: "eventSdk",
      content: JSON.stringify(contentObj2),
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    console.log("手动传入经纬度", message);
    this.sendUserMessage(userId, message);
  }

  /** 停止或开启群控同步 */
  public toggleGroupControlSync(flag: boolean = true) {
    if (!this.isGroupControl) return;
    this.groupControlSync = flag;
  }
  executeAdbCommand(command: string, forwardOff: boolean = true) {
    const userId = this.options.clientId;
    const message = JSON.stringify({
      touchType: "eventSdk",
      content: JSON.stringify({
        type: "inputAdb",
        content: command,
      }),
    });
    this.sendUserMessage(userId, message, forwardOff);
  }
  /** 云机/本地键盘切换(false-云机键盘，true-本地键盘) */
  setKeyboardStyle(keyBoardType: KeyboardMode) {
    const contentObj = {
      type: "keyBoardType",
      isLocalKeyBoard: keyBoardType === "local",
    };
    const messageObj = {
      touchType: "eventSdk",
      content: JSON.stringify(contentObj),
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    this.options.keyboard = keyBoardType;
    this.sendUserMessage(userId, message);
  }

  /** 查询输入状态 */
  async onCheckInputState() {
    const userId = this.options.clientId;
    const message = JSON.stringify({
      touchType: "inputState",
    });
    await this.sendUserMessage(userId, message);
  }

  /**
   * 设置无操作回收时间
   * @param second 秒 默认300s,最大7200s
   */
  setAutoRecycleTime(second: number) {
    // 设置过期时间，单位为毫秒
    this.options.autoRecoveryTime = second;
    // 定时器，当指定时间内无操作时执行离开房间操作
    this.triggerRecoveryTimeCallback();
  }

  /** 获取无操作回收时间 */
  getAutoRecycleTime() {
    return this.options.autoRecoveryTime;
  }

  /** 调整坐标 */
  reshapeWindow() {}

  /** 底部栏操作按键 */
  sendCommand(command: string, forwardOff: boolean = false) {
    // 定义按键映射表 兼容老版本
    const keyCodeMap: Record<string, number> = {
      back: 4,
      home: 3,
      menu: 187,
    };
    // 获取keyCode,如果command不在映射表中则使用command本身
    const keyCode = keyCodeMap[command] ?? command;

    const messageObj = {
      action: 1,
      touchType: "keystroke",
      keyCode,
      text: "",
    };

    const userId = this.options.clientId;
    if (!userId) return;

    const message = JSON.stringify(messageObj);
    this.sendUserMessage(userId, message, forwardOff);
  }

  /**  注入视频到相机 */
  injectVideoStream(
    type: MessageKey.START_INJECTION_VIDEO | MessageKey.STOP_INJECTION_VIDEO,
    options: any,
    timeout: number = 0,
    forwardOff: boolean = true
  ) {
    return new Promise(async (resolve) => {
      const userId = this.options.clientId;
      if (!userId) return;

      let timeoutHandler: any = null;
      if (timeout) {
        timeoutHandler = setTimeout(() => {
          resolve({
            type,
            status: "timeout",
            result: null,
          });
        }, timeout);
      }
      try {
        // 保存resolve函数以便在收到响应时调用
        Object.assign(this.promiseMap.injectStatus, {
          resolve: (result: any) => {
            if (timeoutHandler) clearTimeout(timeoutHandler);
            resolve(result);
          },
        });

        const message = JSON.stringify({
          touchType: TouchType.EVENT_SDK,
          content: JSON.stringify(
            type === MessageKey.START_INJECTION_VIDEO
              ? {
                  type,
                  fileUrl: options?.fileUrl,
                  isLoop: options?.isLoop ?? true,
                  fileName: options?.fileName,
                }
              : {
                  type,
                }
          ),
        });
        await this.sendUserMessage(userId, message, forwardOff);
      } catch {
        resolve({
          type,
          status: "unknown",
          result: null,
        });
      }
    });
  }

  /** 音量增加按键事件 */
  increaseVolume(forwardOff: boolean = true) {
    // 防止用户在自动拉取音视频流失败时，没手动开启
    this.startPlay();

    const messageObj = {
      action: 1,
      touchType: TouchType.KEYSTROKE,
      keyCode: 24,
      text: "",
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    if (userId) {
      // 按下
      this.sendUserMessage(userId, message, forwardOff);
    }
  }

  /** 音量减少按键事件 */
  decreaseVolume(forwardOff: boolean = true) {
    // 防止用户在自动拉取音视频流失败时，没手动开启
    this.startPlay();

    const messageObj = {
      action: 1,
      touchType: TouchType.KEYSTROKE,
      keyCode: 25,
      text: "",
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    if (userId) {
      // 按下
      this.sendUserMessage(userId, message, forwardOff);
    }
  }

  /**
   * 是否接收粘贴板内容回调
   * @param flag true:接收 false:不接收
   */
  saveCloudClipboard(flag: boolean) {
    this.options.saveCloudClipboard = flag;
  }
}

export default customRtc;
