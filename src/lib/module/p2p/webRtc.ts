import CryptoJS from "crypto-js";
import Shake from "../../common/shake";
import type { CustomDefinition } from "../../types/index";

import { KeyboardMode, RotateDirection } from "../../types/index";
import {
  COMMON_CODE,
  MEDIA_CONTROL_TYPE,
  PROGRESS_INFO,
  ERROR_CODE,
} from "../../constant/index";
import {
  blobToText,
  arrayBufferToText,
  checkType,
  isMobile,
  isTouchDevice,
} from "../../utils/index";
import webGroupRtc from "./webGroupRtc";
import { VideoElement } from "./videoElement";
import {
  MediaType,
  TouchType,
  WebSocketEventType,
  MessageKey,
  SdkEventType,
  SensorType,
  MediaOperationType,
  MediaStreamType,
} from "../../types/webrtcType";
import { generateTouchCoord } from "../../common/mixins";
import { addInputElement } from "../../common/textInput";
import ScreenshotOverlay from "../../common/screenshotOverlay";
import type {
  TouchInfo,
  ArmcloudRtcOptions,
  ArmcloudCallbacks,
} from "../../types/index";

class WebRTC {
  // 初始外部H5传入DomId
  private initDomId: string = "";
  // video容器id
  private videoDomId: string = "";
  private remoteVideoContainerId: string = "";
  private remoteVideoId: string = "";
  private screenShotInstance: ScreenshotOverlay | null = null;
  private pingTimer: any = null;
  // 鼠标、触摸事件时是否按下
  private hasPushDown: boolean = false;
  // 刷新ui消息次数
  private refreshUiMsgNumber: number = 0;
  private isVideoFirstFrame: boolean = false;
  private enableMicrophone: boolean = true;
  private enableCamera: boolean = true;
  private videoDeviceId: string = "";
  private audioDeviceId: string = "";
  private isCameraInject: boolean = false;
  private isMicrophoneInject: boolean = false;
  // 群控同步
  private groupControlSync: boolean = true;
  // 当前推流状态promise 缓存
  private promiseMap: any = {
    streamStatus: {
      resolve: () => { },
      reject: () => { },
    },
    injectStatus: {
      resolve: null,
      reject: null,
    },
  };
  private remoteResolution = {
    width: 0,
    height: 0,
  };

  private roomMessage: any = {
    inputStateIsOpen: false,
    isVertical: true,
  };

  private options: ArmcloudRtcOptions;

  // websocket
  private socket: any;
  private retryCount: number;
  private retryCountBackup: number;
  private retryTime: number;
  private remotePc: any = null;
  private dataChannel: any;
  private remoteUserId: string;
  private inputElement: HTMLInputElement | undefined;
  // 回收时间定时器
  private autoRecoveryTimer: any = null;
  // 运行信息定时器
  private runInfoTimer: any = null;

  // 触摸信息
  private touchConfig: any = {
    action: 0, // 0 按下 1 抬起 2 触摸中
    widthPixels: document.body.clientWidth,
    heightPixels: document.body.clientHeight,
    pointCount: 1, // 手指操作数量
    touchType: TouchType.GESTURE,
    properties: [], // 手指id， toolType: 1写死
    coords: [], // 操作坐标 pressure: 1.0, size: 1.0,写死
  };

  // 触摸坐标信息
  private touchInfo: TouchInfo = generateTouchCoord();
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

  private socketParams: any;

  // 回调函数集合
  private callbacks: ArmcloudCallbacks = {};

  private videoStreams: Array<MediaStream> = [];
  private audioStreams: Array<MediaStream> = [];
  private videoSenders: Array<RTCRtpSender> = [];
  private audioSenders: Array<RTCRtpSender> = [];

  private senderVideoTracks: Array<MediaStreamTrack> = [];
  private senderAudioTracks: Array<MediaStreamTrack> = [];

  // 是否群控
  private isGroupControl: boolean = false;

  private groupRtc: any = null;
  private groupPads: any = [];
  private masterIdPrefix: string = "";

  private stopOperation: boolean = false;
  private videoElement: VideoElement | null = null;

  constructor(
    viewId: string,
    params: ArmcloudRtcOptions,
    callbacks: ArmcloudCallbacks
  ) {
    this.initDomId = viewId;
    this.options = params;
    const whileCallList = ["onAutoRecoveryTime"];
    callbacks &&
      Object.keys(callbacks).forEach((key) => {
        const originalCallback = callbacks[key as keyof ArmcloudCallbacks];
        this.callbacks[key as keyof ArmcloudCallbacks] = (...args: any[]) => {
          if (!this.stopOperation || whileCallList.includes(key)) {
            // @ts-ignore
            originalCallback?.(...args);
          }
        };
      });
    this.enableMicrophone = params.enableMicrophone;
    this.enableCamera = params.enableCamera;
    this.remoteUserId = params.padCode;
    this.retryCount = params.retryCount;
    this.retryCountBackup = params.retryCount;
    this.retryTime = params.retryTime;
    this.masterIdPrefix = params.masterIdPrefix;
    this.videoDeviceId = params.videoDeviceId || "";
    this.audioDeviceId = params.audioDeviceId || "";

    // 获取外部容器div元素
    const h5Dom = document.getElementById(this.initDomId);
    this.videoElement = new VideoElement(
      this.masterIdPrefix,
      this.remoteUserId
    );

    // 获取video元素
    this.videoDomId = this.videoElement?.getVideoDomId();
    this.remoteVideoContainerId = this.videoElement?.getContainerId();
    this.remoteVideoId = this.videoElement?.getRemoteVideoId();
    const videoContainer = this.videoElement?.createElements();
    // 将div元素添加到外部容器中
    h5Dom?.appendChild(videoContainer);

    if (!this.options.disable) {
      addInputElement(this, true);
    }
    // 解密-ws地址
    const signalServer = this.decryptAES(
      this.options.signalServer,
      this.options.padCode
    );

    const { isWsProxy } = this.options;

    let wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host
      }/sdk-ws/${this.options.roomToken}`;
    if (!isWsProxy) {
      wsUrl = `${signalServer}/${this.options.roomToken}`;
    }

    // stuns地址
    const stuns = this.decryptAES(this.options.stuns, this.options.padCode);
    const stunsArr = JSON.parse(stuns as string);
    // turns地址
    const turns = this.decryptAES(this.options.turns, this.options.padCode);
    const turnsArr = JSON.parse(turns as string);

    // 信令服务器
    const rtcConfig = {
      iceServers: [
        {
          urls: [stunsArr?.[0]?.uri],
        },
        {
          urls: [turnsArr[0].uri],
          username: turnsArr[0].username,
          credential: turnsArr[0].pwd,
        },
      ],
    };

    const audioElement = document.createElement("audio");
    audioElement.id = `${this.masterIdPrefix}_${this.remoteUserId}_remoteAudio`;
    audioElement.style.display = "none";
    audioElement.setAttribute("playsinline", "");
    audioElement.setAttribute("webkit-playsinline", "");
    audioElement.setAttribute("x5-playsinline", "");
    audioElement.setAttribute("x5-video-player-type", "h5");
    h5Dom?.appendChild(audioElement);

    this.socketParams = {
      wsUrl,
      rtcConfig,
      remoteVideo: this.videoElement?.getRemoteVideo(),
      remoteAudio: audioElement,
    };

    // 初始化当前视频
    this.remotePc = new RTCPeerConnection(this.socketParams.rtcConfig);
  }

  /**
   * AES 解密方法
   * @param {*} encryptData 加密数据
   * @param {*} key 秘钥
   * @returns 解密后数据
   */
  private decryptAES(encryptData: string, key: string) {
    try {
      const ciphertext = CryptoJS.enc.Base64.parse(encryptData); // Base64解密
      const stringEncryptData = CryptoJS.format.Hex.parse(
        ciphertext.toString()
      );
      let keyFormat = key.padEnd(16, "0");

      // 超过16就截取
      if (keyFormat.length > 16) {
        keyFormat = keyFormat.slice(0, 16);
      }
      const keyValue = CryptoJS.enc.Utf8.parse(keyFormat); // 密钥
      const decrypt = CryptoJS.AES.decrypt(stringEncryptData, keyValue, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7,
      });
      // 将解密后的结果转换为字符串，并解析为JSON对象
      const source = CryptoJS.enc.Utf8.stringify(decrypt);
      return source;
    } catch (error) {
      return null; // 返回 null 或其他自定义的错误标识
    }
  }

  private getMsgTemplate(touchType: TouchType, content: object) {
    return JSON.stringify({
      touchType,
      content: JSON.stringify(content),
    });
  }
  /** 获取应用信息 */
  public getEquipmentInfo(type: "app" | "attr") {
    if (this.stopOperation) return;
    this.sendUserMessage(
      this.getMsgTemplate(TouchType.EQUIPMENT_INFO, {
        type,
      })
    );
  }
  /** 停止或开启群控同步 */
  public toggleGroupControlSync(flag: boolean = true) {
    if (!this.isGroupControl) return;
    this.groupControlSync = flag;
  }
  /** 应用卸载 */
  public appUnInstall(pkgNames: Array<string>) {
    if (this.stopOperation) return;
    this.sendUserMessage(
      this.getMsgTemplate(TouchType.APP_UNINSTALL, pkgNames)
    );
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

    this.sendUserMessage(content, forwardOff);
  }
  /** 旋转截图 */
  public setScreenshotRotation(rotation: number = 0) {
    // this.screenShotInstance?.setScreenshotRotation(rotation);
  }
  /** 生成封面图 */
  public takeScreenshot(rotation: number = 0) {
    this.screenShotInstance?.takeScreenshot(rotation);
  }
  /** 重新设置大小 */
  public resizeScreenshot(width: number, height: number) {
    this.screenShotInstance?.resizeScreenshot(width, height);
  }
  /** 显示封面图 */
  public showScreenShot() {
    this.screenShotInstance?.showScreenShot();
  }
  /** 显示封面图 */
  public hideScreenShot() {
    this.screenShotInstance?.hideScreenShot();
  }

  /** 清空封面图 */
  public clearScreenShot() {
    this.screenShotInstance?.clearScreenShot();
  }
  public setViewSize(width: number, height: number, rotateType: 0 | 1 = 0) {
    const videoDom = document.getElementById(this.videoDomId)!;
    const remoteVideoContainerDom = document.getElementById(
      this.remoteVideoContainerId
    )! as HTMLDivElement;
    const remoteVideo = document.getElementById(
      this.remoteVideoId
    )! as HTMLDivElement;
    if (videoDom && remoteVideo) {
      const setDimensions = (
        element: HTMLElement,
        width: number,
        height: number
      ) => {
        element.style.width = width + "px";
        element.style.height = height + "px";
      };

      // 设置宽高
      setDimensions(videoDom, width, height);

      // 设置宽高
      setDimensions(remoteVideoContainerDom, width, height);
      if (rotateType == 1) {
        setDimensions(remoteVideo, height, width);
        return;
      }
      setDimensions(remoteVideo, width, height);
    }
  }
  /**
   * 获取媒体流的通用方法
   * @param type 媒体类型：'video' 或 'audio'
   * @param msgData 消息数据（仅视频需要）
   * @returns MediaStream
   */
  private async getMediaStream(
    type: MediaStreamType,
    msgData?: any
  ): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      video: false,
      audio: false,
    };

    if (type === MediaStreamType.VIDEO) {
      constraints.video = this.videoDeviceId
        ? {
          deviceId: {
            exact:
              this.videoDeviceId ||
              (msgData?.isFront ? "user" : "environment"),
          },
        }
        : true;
    } else {
      constraints.audio = this.audioDeviceId
        ? { deviceId: { exact: this.audioDeviceId } }
        : true;
    }

    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  /** 设置摄像头设备 */
  async setVideoDeviceId(val: string) {
    if (this.stopOperation) return;
    this.videoDeviceId = val;

    if (this.isCameraInject) {
      try {
        await this.smoothTrackReplace(MediaStreamType.VIDEO);
      } catch (error) {
        throw error;
      }
    }
  }

  /** 设置麦克风设备 */
  async setAudioDeviceId(val: string) {
    if (this.stopOperation) return;
    this.audioDeviceId = val;
    if (this.isMicrophoneInject) {
      try {
        await this.smoothTrackReplace(MediaStreamType.AUDIO);
      } catch (error) {
        throw error;
      }
    }
  }

  /** 推送摄像头 */
  private async captureVideo(msgData?: any): Promise<void> {
    if (this.stopOperation) return;
    try {
      // 如果存在 就需要平滑过渡
      if (this.videoSenders.length) {
        await this.smoothTrackReplace(MediaStreamType.VIDEO, msgData);
        return;
      }

      // 1) 获取流
      const videoStream = await this.getMediaStream(
        MediaStreamType.VIDEO,
        msgData
      );

      this.videoStreams.push(videoStream);
      const vTrack = videoStream.getVideoTracks()[0];
      this.senderVideoTracks.push(vTrack);

      this.videoSenders.push(this.remotePc.addTrack(vTrack, videoStream));

      this.callbacks?.onVideoInit?.();
    } catch (error: any) {
      this.callbacks?.onVideoError?.({
        code: COMMON_CODE.FAIL,
        msg: error?.message || error?.name || String(error),
      });
      throw error;
    }
  }

  getRotateType() {
    return this.options.rotateType;
  }

  /** 推送麦克风 */
  private async captureAudio(): Promise<void> {
    if (this.stopOperation) return;
    try {
      // 如果存在 就需要平滑过渡
      if (this.audioSenders.length) {
        await this.smoothTrackReplace(MediaStreamType.AUDIO);
        return;
      }
      // 1) 获取流
      const audioStream = await this.getMediaStream(MediaStreamType.AUDIO);
      this.audioStreams.push(audioStream);
      const aTrack = audioStream.getAudioTracks()[0];
      this.senderAudioTracks.push(aTrack);

      this.audioSenders.push(this.remotePc.addTrack(aTrack, audioStream));

      this.callbacks?.onAudioInit?.();
    } catch (error: any) {
      this.callbacks?.onAudioError?.({
        code: COMMON_CODE.FAIL,
        msg: error?.message || error?.name || String(error),
      });
      throw error;
    }
  }

  /**
   * 停止轨道和流的通用方法
   * @param type 媒体类型：'video' 或 'audio'
   */
  private stopTracksAndStreams(type: MediaStreamType): void {
    const tracks =
      type === MediaStreamType.VIDEO
        ? this.senderVideoTracks
        : this.senderAudioTracks;
    const streams =
      type === MediaStreamType.VIDEO ? this.videoStreams : this.audioStreams;

    // 1. 停止轨道
    if (tracks.length) {
      try {
        tracks.forEach((track) => {
          track.stop();
        });
      } catch (error: any) {
        console.log(`停止${type}轨道失败: ${error.message}`, "error");
      }
    }

    // 2. 停止流中的所有轨道
    if (streams.length) {
      streams.forEach((stream) => {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (error: any) {
            console.log(`停止流轨道失败: ${error.message}`, "error");
          }
        });
      });
    }

    // 3. 清理引用
    if (type === MediaStreamType.VIDEO) {
      this.senderVideoTracks = [];
      this.videoStreams = [];
    } else {
      this.senderAudioTracks = [];
      this.audioStreams = [];
    }
  }

  /**
   * 平滑切换轨道的通用方法
   * @param type 媒体类型：'video' 或 'audio'
   * @param msgData 消息数据（仅视频需要）
   */
  private async smoothTrackReplace(
    type: MediaStreamType,
    msgData?: any
  ): Promise<void> {
    const senders =
      type === MediaStreamType.VIDEO ? this.videoSenders : this.audioSenders;
    const oldTracks =
      type === MediaStreamType.VIDEO
        ? this.senderVideoTracks
        : this.senderAudioTracks;
    const oldStreams =
      type === MediaStreamType.VIDEO ? this.videoStreams : this.audioStreams;

    // 1. 获取新的媒体流和轨道
    const newStream = await this.getMediaStream(type, msgData);
    const newTrack =
      type === MediaStreamType.VIDEO
        ? newStream.getVideoTracks()[0]
        : newStream.getAudioTracks()[0];

    // 2. 过滤有效的发送者并替换轨道
    const validSenders = senders.filter((sender) => {
      if (sender.transport) {
        return true;
      }
      this.remotePc.removeTrack(sender);
      return false;
    });

    validSenders.forEach((sender) => sender.replaceTrack(newTrack));

    console.log(`${type}轨道已平滑切换`);

    // 3. 停止旧的轨道和流
    oldTracks.forEach((track) => track.stop());
    oldStreams.forEach((stream) => stream.getTracks().forEach((t) => t.stop()));

    // 4. 更新本地引用
    if (type === MediaStreamType.VIDEO) {
      this.videoSenders = validSenders;
      this.senderVideoTracks = [newTrack];
      this.videoStreams = [newStream];
    } else {
      this.audioSenders = validSenders;
      this.senderAudioTracks = [newTrack];
      this.audioStreams = [newStream];
    }
  }

  private startHeartbeat() {
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            event: WebSocketEventType.PING,
          })
        );
        return;
      }
      clearInterval(this.pingTimer);
    }, 5000);
  }

  /** 麦克风注入 */
  private async microphoneInject() {
    try {
      await this.stopMediaStream(MediaType.AUDIO);

      await this.startMediaStream(MediaType.AUDIO);
      this.callbacks?.onAudioInit?.();
    } catch (error: any) {
      this.callbacks?.onAudioError?.({
        code: COMMON_CODE.FAIL,
        msg: error?.message || error?.name || String(error),
      });
      throw error;
    }
  }

  /** 摄像头注入 */
  private async cameraInject(msgData: any) {
    try {
      await this.stopMediaStream(MediaType.VIDEO);

      await this.startMediaStream(MediaType.VIDEO, msgData);
      this.callbacks?.onVideoInit?.();
    } catch (error: any) {
      this.callbacks?.onVideoError?.({
        code: COMMON_CODE.FAIL,
        msg: error?.message || error?.name || String(error),
      });
      throw error;
    }
  }

  /** 开启摄像头 或 麦克风注入 返回一个promise */
  public async startMediaStream(
    mediaType: MediaType,
    msgData?: any
  ): Promise<void> {
    if (this.stopOperation) return;
    try {
      if (mediaType === MediaType.VIDEO) {
        await this.notifyInject(SdkEventType.INJECTION_CAMERA, true);
        await this.captureVideo(msgData);
        this.isCameraInject = true;
      }
      if (mediaType === MediaType.AUDIO) {
        await this.notifyInject(SdkEventType.INJECTION_AUDIO, true);
        await this.captureAudio();
        this.isMicrophoneInject = true;
      }
      if (mediaType === MediaType.AUDIO_AND_VIDEO) {
        await this.notifyInject(SdkEventType.INJECTION_AUDIO, true);
        await this.notifyInject(SdkEventType.INJECTION_CAMERA, true);
        await this.captureVideo(msgData);
        this.isCameraInject = true;

        await this.captureAudio();
        this.isMicrophoneInject = true;
      }
    } catch (error) {
      throw error;
    }
  }

  /** 通知手机需要注入 */
  private async notifyInject(
    type: SdkEventType.INJECTION_CAMERA | SdkEventType.INJECTION_AUDIO,
    isOpen: boolean
  ) {
    await this.sendUserMessage(
      this.getMsgTemplate(TouchType.EVENT_SDK, {
        type,
        isOpen,
      }),
      true
    );
  }
  // 修改屏幕分辨率和dpi
  public setScreenResolution(
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
    const message = this.getMsgTemplate(TouchType.EVENT_SDK, contentObj);
    this.sendUserMessage(message, forwardOff);
  }
  setVideoEncoder(width: number, height: number) {}

  // 模拟点击事件
  triggerClickEvent(
    options: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    forwardOff: boolean = false
  ) { }
  // 模拟触摸事件 0 按下 1 抬起 2 触摸中
  triggerPointerEvent(
    action: 0 | 1 | 2,
    options: { x: number; y: number; width: number; height: number },
    forwardOff: boolean = false
  ) { }
  /** 关闭摄像头 或 麦克风注入 返回一个promise */
  public async stopMediaStream(mediaType: MediaType): Promise<void> {
    if (this.stopOperation) return;
    try {
      if (mediaType === MediaType.VIDEO) {
        await this.notifyInject(SdkEventType.INJECTION_CAMERA, false);
        await this.stopTracksAndStreams(MediaStreamType.VIDEO);
        this.isCameraInject = false;
      }
      if (mediaType === MediaType.AUDIO) {
        await this.notifyInject(SdkEventType.INJECTION_AUDIO, false);
        await this.stopTracksAndStreams(MediaStreamType.AUDIO);
        this.isMicrophoneInject = false;
      }
      if (mediaType === MediaType.AUDIO_AND_VIDEO) {
        await this.notifyInject(SdkEventType.INJECTION_CAMERA, false);
        await this.notifyInject(SdkEventType.INJECTION_AUDIO, false);
        await this.stopTracksAndStreams(MediaStreamType.VIDEO);
        this.isCameraInject = false;
        await this.stopTracksAndStreams(MediaStreamType.AUDIO);
        this.isMicrophoneInject = false;
      }
    } catch (error) {
      throw error;
    }
  }
  /** 初始化ws */
  private setupWebSocket() {
    let isGetSdp = false;
    const iceCandidataArr: any[] = [];

    this.callbacks?.onProgress?.(PROGRESS_INFO.WS_CONNECT);
    // 连接websocket
    this.socket = new WebSocket(this.socketParams?.wsUrl);
    // ws连接成功回调
    this.socket.onopen = () => {
      this.retryCount = this.retryCountBackup;

      this.callbacks?.onSocketCallback?.({
        code: COMMON_CODE.SUCCESS,
      });
      this.callbacks?.onProgress?.(PROGRESS_INFO.WS_SUCCESS);

      this.isGroupControl && this.createWebGroupRtc(this.groupPads);
      this.startHeartbeat();
      this.setupPeerConnectionEvents();
      this.setupDataChannelEvents();
      this.setupTouchEvents();
    };
    // ws连接关闭回调
    this.socket.onclose = (event: any) => {
      console.log(
        "WebSocket closed. Code: ",
        event.code,
        " Reason: ",
        event.reason
      );

      if (this.retryCount === this.retryCountBackup) {
        this.callbacks?.onSocketCallback?.({
          code: COMMON_CODE.CLOSE,
        });
        this.callbacks?.onProgress?.(PROGRESS_INFO.WS_CLOSE);
      }
    };
    // ws连接错误回调
    this.socket.onerror = (error: any) => {
      this.retryCount--;
      if (this.retryCount > 0) {
        setTimeout(() => {
          this.setupWebSocket();
        }, this.retryTime);
        this.callbacks?.onProgress?.(PROGRESS_INFO.WS_RETRY);
      } else {
        this.callbacks?.onSocketCallback?.({
          code: COMMON_CODE.FAIL,
        });
        this.callbacks?.onProgress?.(PROGRESS_INFO.WS_ERROR);

        this.stopOperations();
      }
    };

    const setIce = (item: any) => {
      this.remotePc
        ?.addIceCandidate({
          candidate: item.candidate,
          sdpMLiineIndex: item.label,
          sdpMid: item.id,
        })
        .then(() => {
          this.callbacks?.onProgress?.(PROGRESS_INFO.RECEIVE_ICE);
        })
        .catch((error: any) => {
          this.callbacks?.onProgress?.(PROGRESS_INFO.RECEIVE_ICE_ERR);
        });
    };

    // ws收到消息回调
    this.socket.onmessage = async (event: any) => {
      const messageObj = JSON.parse(event.data);

      if (messageObj.event === WebSocketEventType.SPECIFIED_MSG) {
        const msgDataObj = JSON.parse(messageObj.data);

        if (msgDataObj.key === MessageKey.RE_ANSWER) {
          const sdp = JSON.parse(msgDataObj.value)?.sdp;
          this.receiveAnswer(sdp);
        }

        if (msgDataObj.key === MessageKey.OFFER) {
          const msgValueOPbj = JSON.parse(msgDataObj.value);

          // 接收offer
          await this.receiveOffer(msgValueOPbj.sdp);
          // 发送Answer
          await this.sendAnswer();

          // 已发送sdp相关信息
          isGetSdp = true;
          for (const item of iceCandidataArr) {
            setIce(item);
          }
        }

        if (msgDataObj.key === MessageKey.ICE_CANDIDATE) {
          const msgValueOPbj = JSON.parse(msgDataObj.value);
          !isGetSdp ? iceCandidataArr.push(msgValueOPbj) : setIce(msgValueOPbj);
        }
      } else if (messageObj.event === WebSocketEventType.OWN_JOIN_ROOM) {
        this.callbacks?.onProgress?.(PROGRESS_INFO.OWN_JOIN_ROOM);
      }
    };
  }

  /**
   * 静音
   */
  public muted() {
    if (this.stopOperation) return;
    this.handleMediaPlay(MediaType.AUDIO, false);
  }

  /**
   * 取消静音
   */
  public unmuted() {
    if (this.stopOperation) return;
    const mediaType = Number(this.options.mediaType);
    const { remoteAudio } = this.socketParams;
    this.handleMediaPlay(MediaType.AUDIO, true);

    if (mediaType === MediaType.VIDEO) {
      remoteAudio.muted = false;
      remoteAudio.play();
    }
  }

  // 火山存在手动播放
  public startPlay() {
    if (this.stopOperation) return;
    const mediaType = Number(this.options.mediaType);
    const { remoteVideo, remoteAudio } = this.socketParams;
    if (
      [MEDIA_CONTROL_TYPE.AUDIO_VIDEO, MEDIA_CONTROL_TYPE.VIDEO_ONLY].includes(
        mediaType
      )
    ) {
      remoteVideo.play();
    }
    if (
      [MEDIA_CONTROL_TYPE.AUDIO_ONLY, MEDIA_CONTROL_TYPE.AUDIO_VIDEO].includes(
        mediaType
      )
    ) {
      remoteAudio.play();
      remoteAudio.muted = false;
    }
  }
  private sendGroupMag(msg: string) {
    this.groupRtc?.sendMessage(
      JSON.stringify({
        event: WebSocketEventType.BROADCAST_MSG,
        data: msg,
      })
    );
  }
  /** 群控退出房间 */
  public kickItOutRoom(pads: any) {
    if (this.stopOperation) return;
    this.groupRtc?.sendMessage(
      JSON.stringify({
        event: WebSocketEventType.BROADCAST_MSG,
        data: JSON.stringify({
          touchType: TouchType.KICK_OUT_USER,
          content: JSON.stringify(pads),
        }),
      })
    );
  }
  /** 群控加入房间 */
  public joinGroupRoom(pads: any) {
    if (this.stopOperation) return;
    const arr = pads?.filter((v: any) => v !== this.remoteUserId);
    arr.length && this.groupRtc?.joinRoom(arr);
  }
  private createWebGroupRtc(pads: any) {
    const arr = pads?.filter((v: any) => v !== this.remoteUserId);
    this.groupRtc = new webGroupRtc(this.options, arr, this.callbacks);
  }
  /** 滚轮事件 */
  private handleVideoWheel(videoDom: HTMLVideoElement) {
    this.videoElement?.bindDomEvent("wheel", (e: any) => {
      if (this.options.disable) return;
      let { offsetX, offsetY, deltaY } = e;
      const touchConfigMousedown = {
        coords: [{ pressure: 1.0, size: 1.0, x: offsetX, y: offsetY }],
        widthPixels: videoDom.clientWidth,
        heightPixels: videoDom.clientHeight,
        pointCount: 1,
        properties: [{ id: 0, toolType: 1 }],
        touchType: TouchType.GESTURE_SWIPE,
        swipe: deltaY > 0 ? -1 : 1,
      };
      const messageMousedown = JSON.stringify(touchConfigMousedown);
      this.sendUserMessage(messageMousedown);
    });
  }
  /** 鼠标移出 */
  private handleVideoMouseleave() {
    this.videoElement?.bindDomEvent("mouseleave", (e: any) => {
      if (this.options.disable) return;
      // 若未按下时，不发送鼠标移动事件
      if (!this.hasPushDown) {
        return;
      }
      this.touchConfig.action = 1; // 抬起
      const message = JSON.stringify(this.touchConfig);

      this.sendUserMessage(message);
    });
  }
  /** 鼠标按下 */
  private handleVideoMousedown(
    key: string,
    isMobileFlag: boolean,
    videoDom: HTMLVideoElement
  ) {
    this.videoElement?.bindDomEvent(key, (e: any) => {
      if (this.options.disable) return;
      this.hasPushDown = true;
      const { allowLocalIMEInCloud, keyboard } = this.options;
      const { inputStateIsOpen } = this.roomMessage;
      // 处理输入框焦点逻辑
      const shouldHandleFocus =
        (allowLocalIMEInCloud && keyboard === "pad") || keyboard === "local";
      // 处理IOS本机键盘
      if (
        this.inputElement &&
        shouldHandleFocus &&
        typeof inputStateIsOpen === "boolean"
      ) {
        inputStateIsOpen ? this.inputElement.focus() : this.inputElement.blur();
      }
      this.touchInfo = generateTouchCoord();
      const videoDomIdRect = videoDom.getBoundingClientRect();
      const distanceToTop = videoDomIdRect.top;
      const distanceToLeft = videoDomIdRect.left;
      // 初始化
      this.touchConfig.properties = [];
      this.touchConfig.coords = [];
      // 计算触摸手指数量
      const touchCount = isMobileFlag ? e?.touches?.length : 1;
      this.touchConfig.action = 0; // 按下操作
      this.touchConfig.pointCount = touchCount;
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
        this.options.rotateType == 1 ? bigSide : smallSide;
      this.touchConfig.heightPixels =
        this.options.rotateType == 1 ? smallSide : bigSide;

      // 横屏但是远端流是竖屏（用户手动旋转屏幕）
      if (
        this.options.rotateType == 1 &&
        this.remoteResolution.height > this.remoteResolution.width
      ) {
        this.touchConfig.widthPixels = smallSide;
        this.touchConfig.heightPixels = bigSide;
      } else if (
        this.options.rotateType == 0 &&
        this.remoteResolution.width > this.remoteResolution.height
      ) {
        // 竖屏但是远端流是横屏（用户手动旋转屏幕）
        this.touchConfig.widthPixels = bigSide;
        this.touchConfig.heightPixels = smallSide;
      }

      for (let i = 0; i < touchCount; i += 1) {
        const touch = isMobileFlag ? e.touches[i] : e;
        this.touchConfig.properties[i] = {
          id: i,
          toolType: 1,
        };

        let x = touch.offsetX;
        let y = touch.offsetY;
        if (x == undefined) {
          x = touch.clientX - distanceToLeft;
          y = touch.clientY - distanceToTop;

          if (
            this.options.rotateType == 1 &&
            this.remoteResolution.height > this.remoteResolution.width
          ) {
            x = videoDomIdRect.bottom - touch.clientY;
            y = touch.clientX - distanceToLeft;
          } else if (
            this.options.rotateType == 0 &&
            this.remoteResolution.width > this.remoteResolution.height
          ) {
            x = touch.clientY - distanceToTop;
            y = videoDomIdRect.right - touch.clientX;
          }
        }

        this.touchConfig.coords.push({
          ...this.touchInfo,
          orientation: 0.01 * Math.random(),
          x: x,
          y: y,
        });
      }
      const touchConfig = {
        action: touchCount > 1 ? 261 : 0,
        widthPixels: this.touchConfig.widthPixels,
        heightPixels: this.touchConfig.heightPixels,
        pointCount: touchCount,
        touchType: TouchType.GESTURE,
        properties: this.touchConfig.properties,
        coords: this.touchConfig.coords,
      };
      const message = JSON.stringify(touchConfig);
      this.sendUserMessage(message);
    });
  }
  /** 鼠标移动 */
  private handleVideoMousemove(
    key: string,
    isMobileFlag: boolean,
    videoDom: HTMLVideoElement
  ) {
    this.videoElement?.bindDomEvent(key, (e: any) => {
      if (this.options.disable) return;
      // 若未按下时，不发送鼠标移动事件
      if (!this.hasPushDown) {
        return;
      }
      const videoDomIdRect = videoDom.getBoundingClientRect();
      const distanceToTop = videoDomIdRect.top;
      const distanceToLeft = videoDomIdRect.left;
      // 计算触摸手指数量
      const touchCount = isMobileFlag ? e?.touches?.length : 1;
      this.touchConfig.action = 2; // 触摸中
      this.touchConfig.pointCount = touchCount;
      this.touchConfig.coords = [];
      const coords = [];
      for (let i = 0; i < touchCount; i += 1) {
        const touch = isMobileFlag ? e.touches[i] : e;
        this.touchConfig.properties[i] = {
          id: i,
          toolType: 1,
        };
        let x = touch.offsetX;
        let y = touch.offsetY;
        if (x == undefined) {
          x = touch.clientX - distanceToLeft;
          y = touch.clientY - distanceToTop;

          if (
            this.options.rotateType == 1 &&
            this.remoteResolution.height > this.remoteResolution.width
          ) {
            x = videoDomIdRect.bottom - touch.clientY;
            y = touch.clientX - distanceToLeft;
          } else if (
            this.options.rotateType == 0 &&
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
      this.touchConfig.coords = coords;

      const touchConfig = {
        action: 2,
        widthPixels: this.touchConfig.widthPixels,
        heightPixels: this.touchConfig.heightPixels,
        pointCount: touchCount,
        touchType: TouchType.GESTURE,
        properties: this.touchConfig.properties,
        coords: this.touchConfig.coords,
      };
      const message = JSON.stringify(touchConfig);
      this.sendUserMessage(message);
    });
  }
  /** 鼠标结束 */
  private handleVideoMouseup(key: string, isMobileFlag: boolean) {
    this.videoElement?.bindDomEvent(key, (e: any) => {
      if (this.options.disable) return;
      this.hasPushDown = false; // 按下状态重置
      this.touchConfig.action = 1;

      if (!isMobileFlag || (isMobileFlag && e.touches.length === 0)) {
        const message = JSON.stringify(this.touchConfig);
        this.sendUserMessage(message);
      }
    });
  }
  /** 加入房间 */
  public start(isGroupControl = false, pads = []) {
    if (this.stopOperation) return;
    this.isGroupControl = isGroupControl;
    this.groupPads = pads;

    this.setupWebSocket();
  }

  /** 注册PeerConnection事件 */
  private setupPeerConnectionEvents() {
    // 接收ICE候选人
    this.remotePc.addEventListener("icecandidate", (e: any) => {
      if (e.candidate) {
        const candidateMsg = {
          event: WebSocketEventType.SPECIFIED_MSG,
          targetUserIds: [this.remoteUserId],
          data: JSON.stringify({
            key: MessageKey.ICE_CANDIDATE,
            value: JSON.stringify({
              candidate: e.candidate?.candidate,
              label: e.candidate.sdpMLineIndex,
              id: e.candidate.sdpMid,
            }),
          }),
        };
        const candidateMsgStr = JSON.stringify(candidateMsg);
        this.socket.send(candidateMsgStr);
        this.callbacks?.onProgress?.(PROGRESS_INFO.SEND_ICE);
      }
    });

    //  远端接收到流，交给video去播放
    this.remotePc.addEventListener("track", (event: any) => {
      const { remoteVideo: video, remoteAudio: audio } = this.socketParams;
      const mediaType = Number(this.options.mediaType);
      switch (event?.track?.kind) {
        case "video":
          // if (supportsSetCodecPreferences) {
          //   const { codecs } = RTCRtpReceiver.getCapabilities("video")
          //   const preferredCodecs = ["video/H264", "video/VP9", "video/VP8"]
          //   const sortedCodecs = sortByMimeTypes(codecs, preferredCodecs)
          //   event.transceiver.setCodecPreferences(sortedCodecs)
          // }
          // 监听事件

          const videoMediaStream = new MediaStream([event?.track]);

          video.srcObject = videoMediaStream;
          video.addEventListener("loadeddata", (event: any) => {
            video.play().catch((err: any) => {
              console.error("播放失败:", err);
              this.callbacks?.onAutoplayFailed?.({
                userId: this.options.userId,
                kind: "video",
              });
            });

            this.isVideoFirstFrame = true;

            if (this.refreshUiMsgNumber > 0) {
              this.renderedFirstFrame();
            }
          });

          this.callbacks?.onProgress?.(PROGRESS_INFO.RTC_TRACK_VIDEO);

          break;
        case "audio":
          const audioMediaStream = new MediaStream([event?.track]);

          audio.srcObject = audioMediaStream;

          audio.addEventListener("loadeddata", (event: any) => {
            const flag = [
              MEDIA_CONTROL_TYPE.AUDIO_ONLY,
              MEDIA_CONTROL_TYPE.AUDIO_VIDEO,
            ].includes(mediaType);
            audio.muted = !flag;
            if (flag) {
              audio.play().catch((err: any) => {
                console.error("播放失败:", err);
                this.callbacks?.onAutoplayFailed?.({
                  userId: this.options.userId,
                  kind: "audio",
                });
              });
            }
          });

          break;
      }
    });

    // 连接状态，其返回值为以下字符串之一：new、connecting、connected、disconnected、failed 或 closed。
    this.remotePc.addEventListener("connectionstatechange", (event: any) => {
      switch (this.remotePc.connectionState) {
        // 正在连接
        case "new":
        case "connecting":
          this.callbacks?.onProgress?.(PROGRESS_INFO.RTC_CONNECTING);
          break;
        // 连接成功
        case "connected":
          this.triggerRecoveryTimeCallback();
          this.callbacks?.onConnectSuccess?.();
          this.callbacks?.onProgress?.(PROGRESS_INFO.RTC_CONNECTED);

          break;
        // 断开连接
        case "disconnected":
          console.log("disconnected", this.remoteUserId);

          this.callbacks?.onConnectFail?.({
            code: COMMON_CODE.FAIL,
            msg: "云机连接断开",
          });

          this.callbacks?.onProgress?.(PROGRESS_INFO.RTC_DISCONNECTED);

          this.stopOperations();
          break;
        // 连接关闭
        case "closed":
          console.log("rtc closed");

          this.callbacks?.onProgress?.(PROGRESS_INFO.RTC_CLOSE);

          this.stopOperations();
          break;
        // 连接失败
        case "failed":
          console.log("failed", this.remoteUserId);

          this.callbacks?.onConnectFail?.({
            code: COMMON_CODE.FAIL,
            msg: "云机连接失败",
          });

          this.callbacks?.onProgress?.(PROGRESS_INFO.RTC_FAILED);
          this.stopOperations();
          break;
      }
    });

    // ICE协商错误
    // this.remotePc.addEventListener("icecandidateerror", (error) => {
    //   console.log("icecandidateerror", error);
    //   // ICE协商错误处理
    // });
  }

  /** 注册dataChannel事件 */
  private setupDataChannelEvents() {
    this.dataChannel = this.remotePc.createDataChannel("dataChannel");
    // 监听通道正常打开
    this.dataChannel.addEventListener("open", (event: any) => {
      this.handleMediaPlay(this.options.mediaType, true);
      // this.waitForFirstFrameRendered(videoElement)
      // 每隔一段时间获取一次统计信息
      if (this.remotePc) {
        if (this.runInfoTimer) {
          clearInterval(this.runInfoTimer);
          this.runInfoTimer = null;
        }
        if (this.stopOperation) return;
        this.runInfoTimer = setInterval(() => {
          this.getStats();
        }, 2000);
      }

      // 查询输入状态
      this.onCheckInputState();
      this.setKeyboardStyle(this.options.keyboard);
      this.getCameraState();

      // 有些情况下用户收取不到UI消息，需手动触发
      const messageObj = {
        touchType: TouchType.EVENT_SDK,
        content: JSON.stringify({
          type: SdkEventType.UPDATE_UI_H5,
        }),
      };
      const message = JSON.stringify(messageObj);
      this.sendUserMessage(message);
      this.callbacks?.onProgress?.(PROGRESS_INFO.RTC_CHANNEL_OPEN);
    });
    // 监听数据通道的状态变化和错误事件
    this.dataChannel.addEventListener("error", (error: any) => {
      console.error(
        "dataChannel error: ",
        error.errorDetail,
        error.message,
        error
      );
      clearInterval(this.runInfoTimer);

      this.callbacks?.onErrorMessage?.({
        code: ERROR_CODE.DELAY,
        msg: error.message || error.name,
      });
      this.callbacks?.onProgress?.(PROGRESS_INFO.RTC_CHANNEL_ERR);

      this.stopOperations();
    });

    this.onRoomMessageReceived();
  }
  /** 注册Touch事件 */
  private setupTouchEvents() {
    // 添加触摸事件
    const videoDom = document.getElementById(
      this.videoDomId
    ) as HTMLVideoElement;

    const isMobileFlag = isTouchDevice() || isMobile();

    let eventTypeStart = "touchstart";
    let eventTypeMove = "touchmove";
    let eventTypeEnd = "touchend";

    if (!isMobileFlag) {
      eventTypeStart = "mousedown";
      eventTypeMove = "mousemove";
      eventTypeEnd = "mouseup";
    }

    /** 滚轮事件 */
    this.handleVideoWheel(videoDom);
    // 触摸开始
    this.handleVideoMousedown(eventTypeStart, isMobileFlag, videoDom);
    // 触摸中
    this.handleVideoMousemove(eventTypeMove, isMobileFlag, videoDom);
    // 触摸结束
    this.handleVideoMouseup(eventTypeEnd, isMobileFlag);
    // 触摸离开
    this.handleVideoMouseleave();
  }

  /**  发送local offer */
  private async sendOffer() {
    try {
      const offer = await this.remotePc.createOffer();
      await this.remotePc.setLocalDescription(offer);

      const offerMsg = {
        event: WebSocketEventType.SPECIFIED_MSG,
        targetUserIds: [this.remoteUserId],
        data: JSON.stringify({
          key: MessageKey.RE_OFFER,
          value: JSON.stringify({
            sdp: offer.sdp,
          }),
        }),
      };
      const offerMsgStr = JSON.stringify(offerMsg);
      this.socket.send(offerMsgStr);
    } catch (error) {
      console.error("发送webrtc offer失败:", error);
    }
  }

  /** 接收remote offer */
  private async receiveOffer(offer: any) {
    // 建立连接，此时就会触发onicecandidate，然后注册ontrack
    const remoteSdp = {
      type: MessageKey.OFFER,
      sdp: offer,
    };

    try {
      await this.remotePc.setRemoteDescription(remoteSdp);

      this.callbacks?.onProgress?.(PROGRESS_INFO.RECEIVE_OFFER);
    } catch (error) {
      console.error("接收webrtc offer失败:", error);
      this.callbacks?.onProgress?.(PROGRESS_INFO.RECEIVE_OFFER_ERR);
    }
  }
  /** 获取注入推流状态 */
  getInjectStreamStatus(
    type: "video" | "camera" | "audio",
    timeout: number = 0
  ) {
    return new Promise((resolve: any) => {
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
                this.getMsgTemplate(TouchType.EVENT_SDK, {
                  type: MessageKey.INJECTION_VIDEO_STATS,
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

  /** 注入视频到相机 */
  injectVideoStream(
    type: MessageKey.START_INJECTION_VIDEO | MessageKey.STOP_INJECTION_VIDEO,
    options: any,
    timeout: number = 0,
    forwardOff: boolean = true
  ) {
    return new Promise(async (resolve) => {
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

        const message = this.getMsgTemplate(
          TouchType.EVENT_SDK,
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
        );
        await this.sendUserMessage(message, forwardOff);
      } catch {
        resolve({
          type,
          status: "unknown",
          result: null,
        });
      }
    });
  }

  /** 获取摄像头状态 */
  private getCameraState() {
    this.sendUserMessage(
      this.getMsgTemplate(TouchType.EVENT_SDK, {
        type: SdkEventType.GET_CAMERA_STATE,
      })
    );
  }

  /** 接收remote answer */
  private async receiveAnswer(answer: any) {
    try {
      const remoteSdp = {
        type: MessageKey.ANSWER,
        sdp: answer,
      };
      await this.remotePc.setRemoteDescription(remoteSdp);
    } catch (error) {
      console.log("接收remote answer失败:", error);
      throw error;
    }
  }
  /** 只保留最后一次协商（last-one-wins） */
  private negotiateOffer() {
    let running = false; // 当前是否在跑协商
    let pendingFlag = false; // 是否有“待协商”的请求（合并标记）

    const kick = async () => {
      if (running) return; // 已在跑，等这轮结束
      running = true;

      try {
        // 把本轮内积累的所有触发合并处理
        while (pendingFlag) {
          // “取走”这次待处理
          pendingFlag = false;

          // 仅在 stable 时发起；否则等下一轮
          if (this.remotePc.signalingState !== "stable") {
            // 等待状态回到 stable（可选：稍作延迟或直接 break，让下次 kick 再试）
            break;
          }

          await this.sendOffer();
        }
      } catch (e) {
        console.error("negotiateOffer error:", e);
      } finally {
        running = false;
      }
    };

    // 合并触发：只打标，不直接协商
    this.remotePc.addEventListener("negotiationneeded", () => {
      pendingFlag = true; // 只保留“有待处理”这个事实，之前的都被覆盖
      // 立即尝试启动一轮（如果已有在跑，会被 running 拦住）
      void kick();
    });
  }
  /** 发送local answer */
  private async sendAnswer() {
    try {
      const answer = await this.remotePc.createAnswer();
      await this.remotePc.setLocalDescription(answer);

      const answerMsg = {
        event: WebSocketEventType.SPECIFIED_MSG,
        targetUserIds: [this.remoteUserId],
        data: JSON.stringify({
          key: MessageKey.RE_ANSWER,
          value: JSON.stringify({
            sdp: answer.sdp,
          }),
        }),
      };
      const answerMsgStr = JSON.stringify(answerMsg);
      this.socket.send(answerMsgStr);

      this.callbacks?.onProgress?.(PROGRESS_INFO.SEND_ANSWER);
      this.negotiateOffer();
    } catch (error) {
      console.error("发送webrtc answer失败:", error);
      this.callbacks?.onProgress?.(PROGRESS_INFO.SEND_ANSWER_ERR);
    }
  }

  /** 第一帧加载完成 */
  private renderedFirstFrame() {
    if (this.stopOperation) return;
    this.callbacks?.onRenderedFirstFrame?.();

    this.callbacks?.onProgress?.(PROGRESS_INFO.VIDEO_FIRST_FRAME);
  }

  /**
   * 订阅房间内指定的通过摄像头/麦克风采集的媒体流。
   * @param mediaType
   * @returns
   */
  subscribeStream(mediaType: MediaType) {
    return new Promise<void>((resolve) => {
      this.handleMediaPlay(mediaType, true);

      resolve();
    });
  }

  public executeAdbCommand(command: string) {
    const userId = this.options.clientId;
    const message = JSON.stringify({
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify({
        type: SdkEventType.INPUT_ADB,
        content: command,
      }),
    });
    this.sendUserMessage(message, false);
  }

  /**
   * 取消订阅房间内指定的通过摄像头/麦克风采集的媒体流。
   */
  async unsubscribeStream(mediaType: MediaType) {
    this.handleMediaPlay(mediaType, false);
    return Promise.resolve();
  }

  private handleMediaPlay(mediaType: MediaType, isOpen: boolean) {
    switch (Number(mediaType)) {
      case MediaType.AUDIO:
        this.sendUserMessage(
          this.handleSendData({
            type: MediaOperationType.OPEN_AUDIO,
            isOpen,
          })
        );
        break;
      case MediaType.VIDEO:
        this.sendUserMessage(
          this.handleSendData({
            type: MediaOperationType.OPEN_VIDEO,
            isOpen,
          })
        );
        break;
      case MediaType.AUDIO_AND_VIDEO:
        this.sendUserMessage(
          this.handleSendData({
            type: MediaOperationType.OPEN_AUDIO_AND_VIDEO,
            isOpen,
          })
        );
        break;
    }
  }
  /** 等待视频首帧画面被渲染 */
  private waitForFirstFrameRendered(video: HTMLVideoElement) {
    if (this.stopOperation) return;
    // 1 只控制音频; 2 只控制视频; 3 同时控制音频和视频
    if (video.currentTime > 0) {
      if (this.isVideoFirstFrame && this.refreshUiMsgNumber <= 0) {
        this.callbacks?.onProgress?.(PROGRESS_INFO.VIDEO_UI_NUMBER);
      }
    } else {
      // 如果currentTime仍然是0，继续请求下一帧
      !this.stopOperation &&
        requestAnimationFrame(() => {
          this.waitForFirstFrameRendered(video);
        });
    }
  }
  /** 停止所有操作 */
  private stopOperations() {
    this.stopOperation = true;

    clearTimeout(this.autoRecoveryTimer);
    clearInterval(this.runInfoTimer);
    clearInterval(this.pingTimer);
    this.autoRecoveryTimer = null;
    this.runInfoTimer = null;
    this.pingTimer = null;
    this.videoElement?.removeAllEvents();
  }
  /** 关闭所有资源 但不销毁元素 */
  private close() {
    this.stopOperations();
    // 断开webrtc
    if (this.remotePc) {
      this.remotePc
        ?.getSenders()
        ?.forEach((sender: any) => this.remotePc.removeTrack(sender));
      this.remotePc?.close();
      this.dataChannel?.close();
      this.remotePc = null;
      this.dataChannel = null;
      this.stopTracksAndStreams(MediaStreamType.VIDEO);
      this.stopTracksAndStreams(MediaStreamType.AUDIO);

      this.videoSenders = [];
      this.audioSenders = [];
      this.senderVideoTracks = [];
      this.senderAudioTracks = [];
      this.videoStreams = [];
      this.audioStreams = [];
      this.remotePc?.close();
    }

    // 断开ws连接
    this.socket?.close();
    this.groupRtc?.close();
    this.groupRtc = null;
    this.socket = null;
  }

  /** 销毁 */
  private destroy() {
    this.close();
    this.inputElement?.remove();
    this.videoElement?.destroy();
    this.socketParams?.remoteVideo?.remove();
    this.socketParams?.remoteAudio?.remove();
    this.screenShotInstance?.destroy();
    this.screenShotInstance = null;
    this.videoElement = null;
    this.socketParams = null;
  }

  public stop() {
    this.destroy();
  }

  /** 定期获取统计信息的函数 */
  private async getStats() {
    try {
      const stats = await this.remotePc?.getStats();
      // 丢包率
      let packetLossRate = 0;
      // 延迟
      let rtt: string = "0";

      stats.forEach((report: any) => {
        // 处理RTT（往返时间）统计信息
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          const currentRoundTripTime = report.currentRoundTripTime || 0;
          rtt = (currentRoundTripTime * 1000).toFixed(2);
        }
      });
      const remoteStreamStats = {
        userId: this.options.userId,
        audioStats: null,
        videoStats: {
          // videoLossRate: packetLossRate, // 视频丢包率
          rtt, // 客户端到服务端数据传输的往返时延，单位：ms
          statsInterval: 2000, // 统计间隔。此次统计周期的间隔，单位为 ms 。
        },
      };
      this.callbacks?.onRunInformation?.(remoteStreamStats);
    } catch (error: any) {
      console.error("获取统计信息时出错:", error);
      this.callbacks?.onErrorMessage?.({
        code: ERROR_CODE.DATA_CHANNEL,
        msg: error.message || error.name,
      });
    }
  }

  /** 浏览器是否支持 */
  public isSupported() {
    const support = {
      RTCPeerConnection: typeof RTCPeerConnection !== "undefined",
      RTCDataChannel: typeof RTCDataChannel !== "undefined",
      RTCIceCandidate: typeof RTCIceCandidate !== "undefined",
      RTCSessionDescription: typeof RTCSessionDescription !== "undefined",
    };
    return support.RTCPeerConnection && support.RTCDataChannel;
  }

  /** 触发无操作回收回调函数 */
  private triggerRecoveryTimeCallback() {
    if (
      this.options.disable ||
      !this.options.autoRecoveryTime ||
      this.isCameraInject ||
      this.isMicrophoneInject
    )
      return;
    if (this.autoRecoveryTimer) {
      clearTimeout(this.autoRecoveryTimer);
      this.autoRecoveryTimer = null;
    }
    if (this.stopOperation) return;
    this.autoRecoveryTimer = setTimeout(() => {
      this.destroy();
      this.callbacks?.onAutoRecoveryTime?.();
    }, this.options.autoRecoveryTime * 1000);
  }

  /** 发送消息 */
  async sendUserMessage(message: string, notRecycling = false) {
    if (!this.stopOperation) {
      // 重置无操作回收定时器
      if (!notRecycling && this.groupControlSync) {
        this.sendGroupMag(message);
        this.triggerRecoveryTimeCallback();
      }
      if (this.dataChannel) await this.dataChannel?.send(message);
    }
  }

  public setMicrophone(val: boolean) {
    if (this.stopOperation) return;
    this.enableMicrophone = val;
  }

  public setCamera(val: boolean) {
    if (this.stopOperation) return;
    this.enableCamera = val;
  }
  public setMonitorOperation(isMonitor: boolean, forwardOff: boolean = true) { }

  /** 监听广播消息 */
  private onRoomMessageReceived() {
    let soundRecordCount = 0;

    const parseResolution = (resolution: string) => {
      const [width, height] = resolution?.split("*").map(Number);
      return { width, height };
    };
    this.remotePc?.addEventListener("datachannel", (event: any) => {
      // 成功拿到 RTCDataChannel
      const dataChannel = event.channel;
      const run = async (msgString: string) => {
        const msg = JSON.parse(msgString || "{}");

        if ([MessageKey.VIDEO_AND_AUDIO_CONTROL].includes(msg.key)) {
          const msgData = JSON.parse(msg.data) || {};
          console.log("VIDEO_AND_AUDIO_CONTROL", msg);
          this.callbacks?.onMediaDevicesToggle?.({
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
            if (this.enableCamera && this.enableMicrophone) {
              await Promise.allSettled([
                this.cameraInject(msgData),
                this.microphoneInject(),
              ]);
            } else if (this.enableCamera) {
              await this.cameraInject(msgData);
            } else if (this.enableMicrophone) {
              await this.microphoneInject();
            }
          } else {
            await this.stopMediaStream(pushType);
          }
        }

        if ([MessageKey.AUDIO_CONTROL].includes(msg.key)) {
          const { isOpen } = JSON.parse(msg.data) || {};
          console.log("AUDIO_CONTROL", msg);
          if (isOpen) {
            await this.microphoneInject();
          } else {
            await this.stopMediaStream(MediaType.AUDIO);
          }
        }

        // 消息透传
        if (msg.key === MessageKey.MESSAGE) {
          this.callbacks?.onTransparentMsg?.(0, msg.data as string);
        }
        if (msg.key === MessageKey.INPUT_ADB) {
          this.callbacks?.onAdbOutput?.(JSON.parse(msg.data || {}));
        }
        if (msg.key === MessageKey.EQUIPMENT_INFO) {
          this.callbacks?.onEquipmentInfo?.(JSON.parse(msg.data || []));
        }

        if (msg.key === MessageKey.CALL_BACK_EVENT) {
          const callData = JSON.parse(msg.data);
          const result = JSON.parse(callData.data);

          switch (callData.type) {
            case MessageKey.DEFINITION:
              this.callbacks?.onChangeResolution?.({
                from: parseResolution(result.from),
                to: parseResolution(result.to),
              });
              break;
            case MessageKey.STOP_INJECTION_VIDEO:
            case MessageKey.START_INJECTION_VIDEO:
              const { resolve: injectResolve } = this.promiseMap.injectStatus;
              if (injectResolve) {
                injectResolve({
                  type: callData.type,
                  status: result?.isSuccess ? "success" : "error",
                  result,
                });
                this.promiseMap.injectStatus.resolve = null;
              }
              this.callbacks?.onInjectVideoResult?.(callData.type, result);
              break;
            case MessageKey.INJECTION_VIDEO_STATS:
              const { resolve: streamResolve } = this.promiseMap.streamStatus;
              streamResolve({
                path: result.path,
                status: result.status || (result.path ? "live" : "offline"),
                type: "video",
              });
              break;
          }
        }

        // ui消息
        if (msg.key === MessageKey.REFRESH_UI_TYPE) {
          const msgData = JSON.parse(msg.data);
          // 若宽高没变，则不重新绘制页面
          if (
            msgData.width == this.remoteResolution.width &&
            msgData.height == this.remoteResolution.height
          ) {
            return;
          }

          if (this.isVideoFirstFrame && this.refreshUiMsgNumber <= 0) {
            this.callbacks?.onProgress?.(PROGRESS_INFO.VIDEO_UI_NUMBER);
          }

          this.roomMessage.isVertical = msgData.isVertical;

          // 储存云机分辨率
          this.remoteResolution.width = msgData.width;
          this.remoteResolution.height = msgData.height;

          // 移动端需要强制竖屏
          if (isTouchDevice() || isMobile()) {
            this.options.rotateType = 0;
          }

          const { rotateType } = this.options;
          // 0 为竖屏，1 为横屏
          let targetRotateType;

          // 判断是否为 0 或 1
          if (rotateType == 0 || rotateType == 1) {
            targetRotateType = rotateType;
          } else {
            // 根据宽高自动设置旋转类型，
            targetRotateType = msgData.width > msgData.height ? 1 : 0;
          }

          this.rotateScreen(targetRotateType);

          this.refreshUiMsgNumber++;
          // 只有在初次渲染的ui的时候，才把流交给video去播放
          if (this.isVideoFirstFrame) {
            this.renderedFirstFrame();
          }
        }
        // 云机、本机键盘使用消息
        if (msg.key === MessageKey.INPUT_STATE && this.inputElement) {
          const msgData = JSON.parse(msg.data);
          this.roomMessage.inputStateIsOpen = msgData.isOpen;

          const { allowLocalIMEInCloud, keyboard } = this.options;
          const { inputStateIsOpen } = this.roomMessage;
          // 处理输入框焦点逻辑
          const shouldHandleFocus =
            (allowLocalIMEInCloud && keyboard === "pad") ||
            keyboard === "local";

          // 设置回车按钮文案
          const enterkeyhintText = this.enterkeyhintObj[msgData.imeOptions];
          this.inputElement?.setAttribute("enterkeyhint", enterkeyhintText);
          console.log("inputStateIsOpen", inputStateIsOpen);
          // 若存在inputElement，则判断当前本机键盘是否打开
          if (
            this.inputElement &&
            shouldHandleFocus &&
            typeof inputStateIsOpen === "boolean"
          ) {
            inputStateIsOpen
              ? this.inputElement.focus()
              : this.inputElement.blur();
          }
        }
        // 将云机内容复制到本机剪切板
        if (msg.key === MessageKey.CLIPBOARD) {
          if (this.options.saveCloudClipboard) {
            const msgData = JSON.parse(msg.data);
            this.callbacks?.onOutputClipper?.(msgData);
          }
        }
      };
      dataChannel?.addEventListener("message", (e: any) => {
        if (e.data) {
          switch (checkType(e.data)) {
            case "ArrayBuffer":
              run(arrayBufferToText(e.data));
              break;
            case "Blob":
              blobToText(e.data).then((res) => {
                run(res as string);
              });
              break;
            default:
              run(e.data);
              break;
          }
        }
      });
    });
  }

  /** 设置摄像头设备 */
  // public async setVideoDeviceId(val: string) {
  //   if (this.stopOperation) return;
  //   this.videoDeviceId = val;
  //   if (this.isCameraInject) {
  //     try {
  //       await this.stopMediaStream(MediaType.VIDEO);
  //     } catch (error) {}
  //     return this.cameraInject();
  //   }
  // }

  /** 调整坐标 */
  reshapeWindow() {
  }

  /**
   * 将字符串发送到云手机的粘贴板中
   * @param inputStr 需要发送的字符串
   */
  public async sendInputClipper(inputStr: string) {
    if (this.stopOperation) return;
    const message = JSON.stringify({
      text: inputStr,
      touchType: TouchType.CLIPBOARD,
    });
    await this.sendUserMessage(message);
  }
  /** 群控剪切板 */
  public sendGroupInputClipper(pads: any, strs: any) {
    if (this.stopOperation) return;
    strs?.map((v: string, index: number) => {
      const message = JSON.stringify({
        text: v,
        pads: [pads[index]],
        touchType: TouchType.CLIPBOARD,
      });
      this.groupRtc?.sendMessage(
        JSON.stringify({
          event: WebSocketEventType.BROADCAST_MSG,
          data: message,
        })
      );
    });
  }
  /** 按顺序发送文本框 */
  public sendGroupInputString(pads: any, strs: any) {
    strs?.map((v: string, index: number) => {
      const message = JSON.stringify({
        text: v,
        pads: [pads[index]],
        touchType: TouchType.INPUT_BOX,
      });
      this.groupRtc?.sendMessage(
        JSON.stringify({
          event: WebSocketEventType.BROADCAST_MSG,
          data: message,
        })
      );
    });
  }
  /**
   * 当云手机处于输入状态时，将字符串直接发送到云手机，完成输入
   * @param inputStr 需要发送的字符串
   */
  public async sendInputString(inputStr: string) {
    if (this.stopOperation) return;
    const message = JSON.stringify({
      text: inputStr,
      touchType: TouchType.INPUT_BOX,
    });
    await this.sendUserMessage(message);
  }

  /**
   * 发送摇一摇信息
   */
  public sendShakeInfo(time: number) {
    if (this.stopOperation) return;
    const shake = new Shake();
    shake.startShakeSimulation(time, (content: any) => {
      const getOptions = (sensorType: SensorType) => {
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
      this.sendUserMessage(getOptions(SensorType.GYROSCOPE));
      this.sendUserMessage(getOptions(SensorType.GRAVITY));
      this.sendUserMessage(getOptions(SensorType.ACCELERATION));
    });
  }
  /** 清晰度切换 */
  public setStreamConfig(config: CustomDefinition) {
    if (this.stopOperation) return;
    const regExp = /^[1-9]\d*$/;
    // 判断字段是否缺失
    if (config.definitionId && config.framerateId && config.bitrateId) {
      const values = Object.values(config);
      // 判断输入值是否为正整数
      if (values.every((value) => regExp.test(value))) {
        if (
          config.definitionId >= 7 &&
          config.definitionId <= 20 &&
          config.framerateId >= 1 &&
          config.framerateId <= 9 &&
          config.bitrateId >= 1 &&
          config.bitrateId <= 15
        ) {
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
          // const userId = this.options.clientId;
          const message = JSON.stringify(messageObj);
          this.sendUserMessage(message);
        }
      }
    }
  }
  private handleSendData(options: any) {
    const messageObj = {
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify(options),
    };
    return JSON.stringify(messageObj);
  }
  /**
   * 暂停接收来自远端的媒体流
   * 该方法仅暂停远端流的接收，并不影响远端流的采集和发送。
   * @param mediaType 1 只控制音频; 2 只控制视频; 3 同时控制音频和视频
   */
  public pauseAllSubscribedStream(mediaType: number = 3) {
    // 重置无操作回收定时器
    this.triggerRecoveryTimeCallback();
    this.handleMediaPlay(mediaType, false);
  }

  /**
   * 恢复接收来自远端的媒体流
   * 该方法仅恢复远端流的接收，并不影响远端流的采集和发送。
   * @param mediaType 1 只控制音频; 2 只控制视频; 3 同时控制音频和视频
   */
  public resumeAllSubscribedStream(mediaType: number = 3) {
    // 重置无操作回收定时器
    this.triggerRecoveryTimeCallback();
    this.handleMediaPlay(mediaType, true);
  }

  /** 截图-保存到本地 */
  public saveScreenShotToLocal() {
    if (this.stopOperation) return;
    return new Promise((resolve, reject) => {
      try {
        const video = document.getElementById(
          this.remoteVideoId
        ) as HTMLVideoElement;
        const canvas: HTMLCanvasElement = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        resolve(imageData);
      } catch (error) {
        reject(error);
      }
    });
  }

  /** 截图-保存到云机 */
  public saveScreenShotToRemote() {
    if (this.stopOperation) return;
    const contentObj = {
      type: SdkEventType.LOCAL_SCREENSHOT,
    };
    const messageObj = {
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify(contentObj),
    };
    // const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    this.sendUserMessage(message);
  }

  /**
   * 手动横竖屏：0竖屏，1横屏
   * 对标百度API
   */
  public setPhoneRotation(type: RotateDirection) {
    if (this.stopOperation) return;
    this.triggerRecoveryTimeCallback();
    this.rotateScreen(type);
  }

  /**
   * 旋转屏幕
   * @param type 旋转方向：0竖屏，1横屏
   */
  public async rotateScreen(type: RotateDirection) {
    this.options.rotateType = type;

    try {
      await this.callbacks?.onBeforeRotate?.(type);
    } catch (error) { }

    // 获取父元素（调用方）的原始宽度和高度，这里要重新获取，因为外层的div可能宽高发生变化
    const h5Dom = document.getElementById(this.initDomId)!;
    let parentWidth = h5Dom?.clientWidth;
    let parentHeight = h5Dom?.clientHeight;

    let bigSide = parentHeight;
    let smallSide = parentWidth;
    if (parentWidth > parentHeight) {
      bigSide = parentWidth;
      smallSide = parentHeight;
    }

    const wrapperBox = h5Dom.parentElement!
    const wrapperBoxWidth = wrapperBox.clientWidth
    const toolsWidth = this.options.toolsWidth ?? 0;
    if (type == RotateDirection.LANDSCAPE) {
      // 因为右侧可能有操作栏，所以预留60px
      if (toolsWidth) {
        parentWidth = bigSide > wrapperBoxWidth ? wrapperBoxWidth - toolsWidth : bigSide
      } else {
        parentWidth = bigSide;
      }
      parentHeight = smallSide
    } else {
      parentWidth = smallSide;
      parentHeight = bigSide;
    }
    h5Dom.style.width = parentWidth + "px";
    h5Dom.style.height = parentHeight + "px";

    // 判断视频的宽高方向

    // video 是否是横屏
    const videoIsLandscape =
      this.remoteResolution.width > this.remoteResolution.height;

    // 判断当前界面中的video宽高方向
    const videoWrapperDom = document.getElementById(
      this.remoteVideoContainerId
    )! as HTMLDivElement;
    let videoWrapperWidth = videoWrapperDom.clientWidth;
    let videoWrapperHeight = videoWrapperDom.clientHeight;

    // 外层 div
    let armcloudVideoWidth = 0;
    let armcloudVideoHeight = 0;
    // 旋转角度
    let videoWrapperRotate = 0;
    let videoWrapperTop = 0;
    let videoWrapperLeft = 0;

    if (type == 1) {
      // 横屏
      const w = videoIsLandscape
        ? this.remoteResolution.width
        : this.remoteResolution.height;
      const h = videoIsLandscape
        ? this.remoteResolution.height
        : this.remoteResolution.width;

      const scale = Math.min(parentWidth / w, parentHeight / h);
      armcloudVideoWidth = w * scale;
      armcloudVideoHeight = h * scale;

      videoWrapperWidth = armcloudVideoWidth;
      videoWrapperHeight = armcloudVideoHeight;

      // 顺时针旋转视频90度
      if (!videoIsLandscape) {
        videoWrapperRotate = -90;
        videoWrapperTop = (armcloudVideoHeight - armcloudVideoWidth) / 2;
        videoWrapperLeft = (armcloudVideoWidth - armcloudVideoHeight) / 2;
        videoWrapperWidth = armcloudVideoHeight;
        videoWrapperHeight = armcloudVideoWidth;
      } else {
        videoWrapperRotate = 0;
        videoWrapperTop = 0;
        videoWrapperLeft = 0;
      }
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

      videoWrapperWidth = videoIsLandscape
        ? armcloudVideoHeight
        : armcloudVideoWidth;
      videoWrapperHeight = videoIsLandscape
        ? armcloudVideoWidth
        : armcloudVideoHeight;
      videoWrapperRotate = videoIsLandscape ? 90 : 0;
      videoWrapperTop = videoIsLandscape
        ? (armcloudVideoHeight - armcloudVideoWidth) / 2
        : 0;
      videoWrapperLeft = videoIsLandscape
        ? (armcloudVideoWidth - armcloudVideoHeight) / 2
        : 0;
    }

    // armcloudVideo
    const videoDom = document.getElementById(this.videoDomId)!;
    videoDom.style.width = `${armcloudVideoWidth}px`;
    videoDom.style.height = `${armcloudVideoHeight}px`;

    videoWrapperDom.style.width = `${videoWrapperWidth}px`;
    videoWrapperDom.style.height = `${videoWrapperHeight}px`;
    videoWrapperDom.style.top = `${videoWrapperTop}px`;
    videoWrapperDom.style.left = `${videoWrapperLeft}px`;
    videoWrapperDom.style.transform = `rotate(${videoWrapperRotate}deg)`;

    this.callbacks?.onChangeRotate?.(type, {
      width: armcloudVideoWidth,
      height: armcloudVideoHeight,
    });
  }

  /** 手动定位 */
  public setGPS(longitude: number, latitude: number) {
    if (this.stopOperation) return;
    const contentObj1 = {
      latitude,
      longitude,
      time: new Date().getTime(),
    };
    const contentObj2 = {
      type: SdkEventType.SDK_LOCATION,
      content: JSON.stringify(contentObj1),
    };
    const messageObj = {
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify(contentObj2),
    };
    const message = JSON.stringify(messageObj);
    this.sendUserMessage(message);
  }

  /** 云机/本地键盘切换(false-云机键盘，true-本地键盘) */
  public setKeyboardStyle(keyBoardType: KeyboardMode) {
    if (this.stopOperation) return;
    const contentObj = {
      type: SdkEventType.KEYBOARD_TYPE,
      isLocalKeyBoard: keyBoardType === "local",
    };
    const messageObj = {
      touchType: TouchType.EVENT_SDK,
      content: JSON.stringify(contentObj),
    };
    // const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    this.options.keyboard = keyBoardType;
    this.sendUserMessage(message);
  }

  /** 查询输入状态 */
  public async onCheckInputState() {
    if (this.stopOperation) return;
    const message = JSON.stringify({
      touchType: TouchType.INPUT_STATE,
    });
    this.sendUserMessage(message);
  }

  /**
   * 设置无操作回收时间
   * @param second 秒 默认300s,最大7200s
   */
  public setAutoRecycleTime(second: number) {
    if (this.stopOperation) return;
    // 设置过期时间，单位为毫秒
    this.options.autoRecoveryTime = second;
    // 定时器，当指定时间内无操作时执行离开房间操作
    this.triggerRecoveryTimeCallback();
  }

  /** 获取无操作回收时间 */
  public getAutoRecycleTime() {
    if (this.stopOperation) return;
    return this.options.autoRecoveryTime;
  }

  /** 底部栏操作按键 */
  public sendCommand(command: string) {
    if (this.stopOperation) return;
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
      touchType: TouchType.KEYSTROKE,
      keyCode,
      text: "",
    };
    const message = JSON.stringify(messageObj);
    const userId = this.options.clientId;
    if (userId) {
      // 按下
      this.sendUserMessage(message);
    }
  }

  /** 返回按键事件 */
  private goAppUpPage() {
    const messageObj = {
      action: 1,
      touchType: TouchType.KEYSTROKE,
      keyCode: 4,
      text: "",
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    if (userId) {
      // 抬起
      this.sendUserMessage(message);
    }
  }

  /** 主页按键事件 */
  private goAppHome() {
    const messageObj = {
      action: 1,
      touchType: TouchType.KEYSTROKE,
      keyCode: 3,
      text: "",
    };
    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    if (userId) {
      // 按下
      this.sendUserMessage(message);
    }
  }

  /** 菜单按键事件 */
  private goAppMenu() {
    const messageObj = {
      action: 1,
      touchType: TouchType.KEYSTROKE,
      keyCode: 187,
      text: "",
    };

    const userId = this.options.clientId;
    const message = JSON.stringify(messageObj);
    if (userId) {
      // 按下
      this.sendUserMessage(message);
    }
  }

  /** 音量增加按键事件 */
  public increaseVolume() {
    if (this.stopOperation) return;
    const messageObj = {
      action: 1,
      touchType: TouchType.KEYSTROKE,
      keyCode: 24,
      text: "",
    };

    const message = JSON.stringify(messageObj);

    // 按下
    this.sendUserMessage(message);
  }

  /** 音量减少按键事件 */
  public decreaseVolume() {
    if (this.stopOperation) return;
    const messageObj = {
      action: 1,
      touchType: TouchType.KEYSTROKE,
      keyCode: 25,
      text: "",
    };

    const message = JSON.stringify(messageObj);

    // 按下
    this.sendUserMessage(message);
  }

  /**
   * 是否接收粘贴板内容回调
   * @param flag true:接收 false:不接收
   */
  public saveCloudClipboard(flag: boolean) {
    if (this.stopOperation) return;
    this.options.saveCloudClipboard = flag;
  }
}

export default WebRTC;
