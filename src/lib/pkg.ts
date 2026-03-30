import "webrtc-adapter";
import axios from "axios";

import customRtc from "./module/volc/customRtc";
import armcloudRtc from "./module/p2p/webRtc";
import tcgRtc from "./module/tcg/tcgRtc";
import {
  RotateDirection,
  InjectStreamStatusType,
  KeyboardMode,
} from "./types/index";

import type {
  CustomDefinition,
  ArmcloudEngineParams,
  ArmcloudRtcOptions,
  ArmcloudCallbacks,
  EquipmentInfoType,
} from "./types/index";
import { MessageKey, MediaType } from "./types/webrtcType";
import { COMMON_CODE } from "./constant/index";

export class ArmcloudEngine {
  // SDK版本号
  version: string = "1.5.5";

  rtcInstance: customRtc | armcloudRtc | tcgRtc | null = null;

  rtcOptions: ArmcloudRtcOptions | null = null;

  callbacks: ArmcloudCallbacks | null = null;

  streamType: number | null = null;

  private axiosSource: any = null;

  constructor(params: ArmcloudEngineParams) {
    this.axiosSource = axios.CancelToken.source(); // 创建一个取消令牌

    this.setupInitConfig(params);
    this.setupCallbacks(params);

    // 初始化参数校验
    const missingParams = [];
    if (!params.token) missingParams.push("token");
    if (!params.deviceInfo) missingParams.push("deviceInfo");

    if (params.deviceInfo) {
      if (!params.deviceInfo.padCode) missingParams.push("deviceInfo.padCode");
      if (!params.deviceInfo.userId) missingParams.push("deviceInfo.userId");
    }

    if (!params.viewId) missingParams.push("viewId");
    if (!params.callbacks) missingParams.push("callbacks");

    if (missingParams.length > 0) {
      const errorMsg = `初始化参数缺失，请检查参数: ${missingParams.join(
        ", "
      )}`;

      throw new Error(errorMsg);
    }

    // 允许数字、字母、"_"、"-" 、"@"，长度为1~128个字符
    if (!/^[a-zA-Z0-9_\-@]{1,128}$/.test(this.rtcOptions?.userId || "")) {
      throw new Error(
        `deviceInfo.userId 格式不正确，允许数字、字母、"_"、"-" 、"@"，长度为1~128个字符`
      );
    }

    // baseUrl不能为空
    if (!this.rtcOptions?.baseUrl) {
      throw new Error("baseUrl 不能为空");
    }

    // 初始化逻辑
    let uuid = this.rtcOptions?.uuid || "";

    if (!uuid) {
      uuid = localStorage.getItem("armcloud_uuid") || this.generateUUID();
      localStorage.setItem("armcloud_uuid", uuid || "");
    }

    const url = `${params.baseUrl}/rtc/open/room/applyToken`;

    const tokenParams = {
      sdkTerminal: "h5",
      userId: this.rtcOptions.userId,
      padCode: this.rtcOptions.padCode,
      uuid,
      expire: 86400,
      videoStream: this.rtcOptions.videoStream,
    };

    axios
      .post(url, tokenParams, {
        headers: {
          "Content-Type": "application/json",
          token: this.rtcOptions.token,
        },
        cancelToken: this.axiosSource.token, // 将取消令牌添加到请求配置中
      })
      .then((response) => {
        if (response.data.code === 200) {
          this.streamType = response.data.data.streamType;
          this.rtcOptions!.streamType = this.streamType as number;
          this.rtcOptions!.toolsWidth = params.toolsWidth ?? 0;
          this.rtcOptions!.uuid = uuid;
          if (this.streamType == 1) {
            this.rtcOptions!.appId = response.data.data.appId;
            this.rtcOptions!.roomCode = response.data.data.roomCode;
            this.rtcOptions!.roomToken = response.data.data.roomToken;

            // 创建引擎对象
            this.rtcInstance = new customRtc(
              params.viewId,
              this.rtcOptions,
              this.callbacks
            );
            this.callbacks?.onInit?.({
              code: COMMON_CODE.SUCCESS,
              msg: "初始化成功",
              streamType: this.streamType,
              uuid,
            });
          } else if (this.streamType == 2) {
            this.rtcOptions!.roomToken = response.data.data.roomToken;
            this.rtcOptions!.signalServer = response.data.data.signalServer;
            this.rtcOptions!.stuns = response.data.data.stuns;
            this.rtcOptions!.turns = response.data.data.turns;

            // 创建引擎对象
            this.rtcInstance = new armcloudRtc(
              params.viewId,
              this.rtcOptions!,
              this.callbacks!
            );
            this.callbacks?.onInit?.({
              code: COMMON_CODE.SUCCESS,
              msg: "初始化成功",
              streamType: this.streamType,
              uuid,
            });
          } else if (this.streamType == 3) {
            this.rtcOptions!.accessInfo = response.data.data.accessInfo;
            this.rtcOptions!.roomToken = response.data.data.roomToken;
            this.rtcInstance = new tcgRtc(
              params.viewId,
              this.rtcOptions!,
              this.callbacks!
            );
            console.log(response.data.data);
            this.callbacks?.onInit?.({
              code: COMMON_CODE.SUCCESS,
              msg: "初始化成功",
              streamType: this.streamType,
              uuid,
            });
          }
        } else {
          this.callbacks?.onInit?.({
            code: response?.data?.code || COMMON_CODE.FAIL,
            msg: response?.data?.msg,
            streamType: this.streamType || undefined,
            uuid: uuid || "",
          });
        }
      })
      .catch((error) => {
        if (axios.isCancel(error)) {
          return;
        }
        console.error("获取初始化配置失败:", error);
        this.callbacks?.onInit?.({
          code: COMMON_CODE.FAIL,
          msg: error.message || error.name,
          uuid: uuid || "",
        });
      });
  }

  /** 静态方法 浏览器是否支持webrTC */
  public static isSupported() {
    // 检查是否支持 WebRTC
    if (!window.RTCPeerConnection) {
      return false;
    }

    // 检查是否支持 DataChannel
    try {
      const pc = new RTCPeerConnection();
      pc.createDataChannel("test");
      pc.close();
      return true;
    } catch (error) {
      return false;
    }
  }
  reshapeWindow() {
    this.rtcInstance?.reshapeWindow?.();
  }
  /** 触发快捷键 */
  triggerKeyboardShortcut(
    metaState: number | string,
    actionKey: number | string,
    forwardOff?: boolean
  ) {
    this.rtcInstance?.triggerKeyboardShortcut?.(
      metaState,
      actionKey,
      forwardOff
    );
  }
  /** 获取初始化配置 */
  setupInitConfig(params: ArmcloudEngineParams) {
    // 初始化入参
    this.rtcOptions = {
      appId: "", // 火山rtc参数
      roomCode: "", // 火山rtc参数
      roomToken: "", // 火山rtc参数
      signalServer: "", // ws地址
      stuns: "", // 信令服务
      turns: "", // 信令服务
      token: params.token, // 服务端所给token，用来换取火山rtc信息
      uuid: params.uuid || "", // 火山rtc参数
      clientId: params.deviceInfo.padCode, // 房间号
      padCode: params.deviceInfo.padCode, // 房间号
      userId: params.deviceInfo.userId, // 用户id
      retryCount: params.retryCount ?? 2, // ws重连次数
      retryTime: params.retryTime ?? 2000, // ws每次重连间隔
      isLog: params.isLog ?? true,
      disable: params.disable ?? false,
      enableMicrophone: params.enableMicrophone ?? true,
      enableCamera: params.enableCamera ?? true,
      baseUrl: params.baseUrl,
      isWsProxy: params.isWsProxy ? JSON.parse(params.isWsProxy) : false,
      manageToken: params.manageToken ?? "",
      masterIdPrefix: params.masterIdPrefix ?? "",
      // 视频流信息
      videoStream: {
        resolution: params?.deviceInfo?.videoStream?.resolution ?? 12, // 分辨率
        frameRate: params?.deviceInfo?.videoStream?.frameRate ?? 2, // 帧率
        bitrate: params?.deviceInfo?.videoStream?.bitrate ?? 3, // 码率
      },

      // 禁用本地键盘
      disableLocalIME: params.deviceInfo.disableLocalIME ?? false, // 禁用本地键盘
      allowLocalIMEInCloud: params.deviceInfo.allowLocalIMEInCloud ?? false, // 云机键盘时能否使用本地输入法
      autoRecoveryTime: params.deviceInfo.autoRecoveryTime ?? 300, // 自动回收时间
      mediaType: params.deviceInfo.mediaType ?? 2, // 拉流媒体类型
      rotateType: params.deviceInfo.rotateType, // 是否旋转横屏
      keyboard: params.deviceInfo.keyboard ?? KeyboardMode.PAD, // 键盘模式
      disableContextMenu: params.deviceInfo.disableContextMenu ?? false, // 是否禁用右键菜单
      saveCloudClipboard: params.deviceInfo.saveCloudClipboard ?? true, // 云机剪切板回调开关
      videoDeviceId: params.deviceInfo.videoDeviceId, // 摄像头ID
      audioDeviceId: params.deviceInfo.audioDeviceId, // 麦克风ID
    };
  }

  /** 设置回调 */
  setupCallbacks(params: ArmcloudEngineParams) {
    this.callbacks = {
      // 初始化回调
      onInit: params.callbacks?.onInit || (() => {}),
      // 连接成功回调
      onConnectSuccess: params.callbacks?.onConnectSuccess || (() => {}),
      // 连接失败回调
      onConnectFail: params.callbacks?.onConnectFail || (() => {}),
      // 触发自动回收回调
      onAutoRecoveryTime: params.callbacks?.onAutoRecoveryTime || (() => {}),
      // 自动播放失败回调
      onAutoplayFailed: params.callbacks?.onAutoplayFailed || (() => {}),
      // 运行信息回调
      onRunInformation: params.callbacks?.onRunInformation || (() => {}),
      // 分辨率切换回调
      onChangeResolution: params.callbacks?.onChangeResolution || (() => {}),
      // 横竖屏切换回调：0 竖屏 1 横屏
      onChangeRotate: params.callbacks?.onChangeRotate || (() => {}),
      // 消息透传回调
      onTransparentMsg: params.callbacks?.onTransparentMsg || (() => {}),
      // 连接状态回调
      onConnectionStateChanged:
        params.callbacks?.onConnectionStateChanged || (() => {}),
      // 错误回调
      onErrorMessage: params.callbacks?.onErrorMessage || (() => {}),
      // 剪切板回调
      onOutputClipper: params.callbacks?.onOutputClipper || (() => {}),
      // 横竖屏切换回调
      onBeforeRotate: params.callbacks?.onBeforeRotate || (() => {}),
      // 首帧画面已加载
      onRenderedFirstFrame:
        params.callbacks?.onRenderedFirstFrame || (() => {}),
      // 视频采集成功
      onVideoInit: params.callbacks?.onVideoInit || (() => {}),
      // 视频采集失败
      onVideoError: params.callbacks?.onVideoError || (() => {}),
      // 音频采集成功
      onAudioInit: params.callbacks?.onAudioInit || (() => {}),
      // 音频采集失败
      onAudioError: params.callbacks?.onAudioError || (() => {}),
      // 加载进度相关回调
      onProgress: params.callbacks?.onProgress || (() => {}),
      // onSocketCallback websocket相关回调
      onSocketCallback: params.callbacks?.onSocketCallback || (() => {}),
      // 远端用户加入房间
      onUserJoined: params.callbacks?.onUserJoined || (() => {}),
      // 用户离开
      onUserLeave: params.callbacks?.onUserLeave || (() => {}),
      // 用户进退出
      onUserLeaveOrJoin: params.callbacks?.onUserLeaveOrJoin || (() => {}),
      // 群控错误相关回调
      onGroupControlError: params.callbacks?.onGroupControlError || (() => {}),
      // 云机信息回调
      onEquipmentInfo: params.callbacks?.onEquipmentInfo || (() => {}),
      // 发送用户错误
      onSendUserError: params.callbacks?.onSendUserError || (() => {}),
      // 执行adb命令后结果回调
      onAdbOutput: params.callbacks?.onAdbOutput || (() => {}),
      // 收到本端上行及下行的网络质量信息。
      onNetworkQuality: params.callbacks?.onNetworkQuality || (() => {}),
      // 视频注入结果
      onInjectVideoResult: params.callbacks?.onInjectVideoResult || (() => {}),
      // 打开或关闭(摄像头/麦克风)回调
      onMediaDevicesToggle:
        params.callbacks?.onMediaDevicesToggle || (() => {}),
      // 监控操作信息
      onMonitorOperation: params.callbacks?.onMonitorOperation || (() => {}),
    };
  }

  /** 打开或关闭监控操作 */
  setMonitorOperation(isMonitor: boolean, forwardOff?: boolean) {
    if (this.rtcInstance)
      this.rtcInstance.setMonitorOperation(isMonitor, forwardOff);
  }

  /** 获取注入推流状态 */
  getInjectStreamStatus(type: InjectStreamStatusType, timeout?: number) {
    if (this.rtcInstance)
      return this.rtcInstance.getInjectStreamStatus(type, timeout);
    return undefined;
  }

  /** 生成uuid */
  // eslint-disable-next-line class-methods-use-this
  generateUUID() {
    // 生成UUID v4
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      // eslint-disable-next-line no-bitwise
      const r = (Math.random() * 16) | 0;
      // eslint-disable-next-line no-bitwise
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      const uuid = v.toString(16);
      return uuid;
    });
  }

  getRequestId() {
    // @ts-ignore
    return this.rtcInstance?.getRequestId();
  }

  // 模拟点击事件
  triggerClickEvent(
    options: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    forwardOff?: boolean
  ) {
    if (this.rtcInstance)
      this.rtcInstance.triggerClickEvent(options, forwardOff);
  }
  // 模拟触摸事件 0 按下 1 抬起 2 触摸中
  triggerPointerEvent(
    action: 0 | 1 | 2,
    options: { x: number; y: number; width: number; height: number },
    forwardOff?: boolean
  ) {
    if (this.rtcInstance)
      this.rtcInstance.triggerPointerEvent(action, options, forwardOff);
  }
  /** 是否开启麦克风 */
  setMicrophone(val: boolean) {
    if (this.rtcInstance) this.rtcInstance.setMicrophone(val);
  }
  /** 是否开启摄像头 */
  setCamera(val: boolean) {
    if (this.rtcInstance) this.rtcInstance.setCamera(val);
  }
  /** 手动开启音视频流播放 */
  startPlay() {
    if (this.rtcInstance) this.rtcInstance.startPlay();
  }

  setViewSize(width: number, height: number, rotateType: 0 | 1 = 0) {
    if (this.rtcInstance)
      this.rtcInstance.setViewSize(width, height, rotateType);
  }
  /** 加入房间 */
  start(isGroupControl = false, pads = []) {
    if (this.rtcInstance) this.rtcInstance.start(isGroupControl, pads);
  }
  /** 群控加入房间 */
  joinGroupRoom(pads = []) {
    if (this.rtcInstance) this.rtcInstance.joinGroupRoom(pads);
  }
  /** 踢出群控房间 */
  kickItOutRoom(pads = []) {
    if (this.rtcInstance) this.rtcInstance.kickItOutRoom(pads);
  }
  // 群控同步开关
  toggleGroupControlSync(flag: boolean = true) {
    this.rtcInstance?.toggleGroupControlSync?.(flag);
  }
  /** 离开房间 */
  async stop() {
    this.axiosSource?.cancel();
    this.axiosSource = null;
    return this?.rtcInstance?.stop();
  }

  /**
   * 静音
   */
  muted() {
    if (this.rtcInstance) this.rtcInstance.muted();
  }

  /**
   * 取消静音
   */
  unmuted() {
    if (this.rtcInstance) this.rtcInstance.unmuted();
  }

  /** app卸载 */
  appUnInstall(pkgNames: Array<string>) {
    if (this.rtcInstance) this.rtcInstance.appUnInstall(pkgNames);
  }

  /** 获取云机信息 */
  getEquipmentInfo(type: EquipmentInfoType) {
    if (this.rtcInstance) this.rtcInstance.getEquipmentInfo(type);
  }
  /** 指定摄像头 */
  setVideoDeviceId(val: string) {
    if (this.rtcInstance) this.rtcInstance.setVideoDeviceId(val);
  }
  /** 指定麦克风 */
  setAudioDeviceId(val: string) {
    if (this.rtcInstance) this.rtcInstance.setAudioDeviceId(val);
  }

  /**
   * 将字符串发送到云手机的粘贴板中
   * @param inputStr 剪切板内容
   */
  sendInputClipper(inputStr: string, forwardOff?: boolean) {
    if (this.rtcInstance)
      this.rtcInstance.sendInputClipper(inputStr, forwardOff);
  }

  /**
   * 将字符串 分别发到云机的剪切板中
   * @param inputStr 剪切板内容
   */
  sendGroupInputClipper(pads: any, strs: any) {
    if (this.rtcInstance) this.rtcInstance.sendGroupInputClipper(pads, strs);
  }

  /**
   * 将字符串 分别发到云机的输入框中
   * @param inputStr 剪切板内容
   */
  sendGroupInputString(pads: any, strs: any) {
    if (this.rtcInstance) this.rtcInstance.sendGroupInputString(pads, strs);
  }

  /**
   * 当云手机处于输入状态时，将字符串直接发送到云手机，完成输入
   * @param inputStr 剪切板内容
   */
  sendInputString(inputStr: string, forwardOff?: boolean) {
    if (this.rtcInstance)
      this.rtcInstance.sendInputString(inputStr, forwardOff);
  }

  /** 清晰度切换 */
  setStreamConfig(config: CustomDefinition, forwardOff?: boolean) {
    if (this.rtcInstance) this.rtcInstance.setStreamConfig(config, forwardOff);
  }

  /**
   * 暂停接收来自远端的媒体流
   * 该方法仅暂停远端流的接收，并不影响远端流的采集和发送。
   * @param mediaType 1 只控制音频; 2 只控制视频; 3 同时控制音频和视频
   */
  pauseAllSubscribedStream(mediaType: number = 3) {
    if (this.rtcInstance) return this.rtcInstance.unsubscribeStream(mediaType);
    return undefined;
  }

  /**
   * 恢复接收来自远端的媒体流
   * 该方法仅恢复远端流的接收，并不影响远端流的采集和发送。
   * @param mediaType 1 只控制音频; 2 只控制视频; 3 同时控制音频和视频
   */
  resumeAllSubscribedStream(mediaType: number = 3) {
    if (this.rtcInstance) return this.rtcInstance.subscribeStream(mediaType);
    return undefined;
  }

  /**
   * 订阅房间内指定的通过摄像头/麦克风采集的媒体流。
   */
  subscribeStream(mediaType: number = 2) {
    if (!this.rtcInstance) {
      return Promise.reject(
        new Error(
          "RTC instance does not exist and cannot subscribe to the media stream"
        )
      );
    }
    return this.rtcInstance.subscribeStream(mediaType);
  }

  /**
   * 取消订阅房间内指定的通过摄像头/麦克风采集的媒体流。
   * 该方法对自动订阅和手动订阅模式均适用。
   */
  unsubscribeStream(mediaType: number = 2) {
    if (!this.rtcInstance) {
      return Promise.reject(
        new Error(
          "RTC instance does not exist and cannot unsubscribe from media stream"
        )
      );
    }
    return this.rtcInstance?.unsubscribeStream(mediaType);
  }
  /** 截图-保存到本地 */
  saveScreenShotToLocal() {
    return new Promise((resolve, reject) => {
      if (this.rtcInstance) {
        try {
          this.rtcInstance?.saveScreenShotToLocal()?.then((res) => {
            resolve(res);
          });
        } catch (error) {
          reject(error);
        }
      }
    });
  }

  /** 修改屏幕分辨率和dpi */
  setScreenResolution(
    options: {
      width: number;
      height: number;
      dpi: number;
      type: MessageKey.RESET_DENSITY | MessageKey.UPDATE_DENSITY;
    },
    forwardOff?: boolean
  ) {
    if (this.rtcInstance)
      this.rtcInstance.setScreenResolution(options, forwardOff);
  }
  /** 截图-保存到云机 */
  saveScreenShotToRemote() {
    if (this.rtcInstance) this.rtcInstance.saveScreenShotToRemote();
  }
  /** 重新设置大小 */
  resizeScreenshot(width: number, height: number) {
    this.rtcInstance?.resizeScreenshot(width, height);
  }
  /** 显示封面图 */
  showScreenShot() {
    this.rtcInstance?.showScreenShot();
  }
  /** 隐藏封面图 */
  hideScreenShot() {
    this.rtcInstance?.hideScreenShot();
  }

  /** 旋转截图 */
  setScreenshotRotation(rotation: number = 0) {
    this.rtcInstance?.setScreenshotRotation(rotation);
  }
  /** 生成封面图 */
  takeScreenshot(rotation: number = 0) {
    this.rtcInstance?.takeScreenshot(rotation);
  }

  /** 清空封面图 */
  clearScreenShot() {
    this.rtcInstance?.clearScreenShot();
  }
  /**
   * 手动横竖屏
   */
  setPhoneRotation(type: RotateDirection) {
    if (this.rtcInstance) this.rtcInstance.setPhoneRotation(type);
  }

  setVideoEncoder(width: number, height: number) {
    if (this.rtcInstance) this.rtcInstance?.setVideoEncoder(width, height);
  }

  /** 手动定位 */
  setGPS(longitude: number, latitude: number) {
    if (this.rtcInstance) this.rtcInstance.setGPS(longitude, latitude);
  }

  /** 执行adb命令 */
  executeAdbCommand(command: string, forwardOff?: boolean) {
    if (this.rtcInstance)
      this.rtcInstance?.executeAdbCommand(command, forwardOff);
  }
  /** 云机/本地键盘切换(false-云机键盘，true-本地键盘) */
  setKeyboardStyle(keyBoardType: KeyboardMode) {
    if (this.rtcInstance) this.rtcInstance.setKeyboardStyle(keyBoardType);
  }

  /**
   * 设置无操作回收时间
   * @param second 秒 默认300s,最大7200s
   */
  setAutoRecycleTime(second: number) {
    if (this.rtcInstance) this.rtcInstance.setAutoRecycleTime(second);
  }

  /** 获取无操作回收时间 */
  getAutoRecycleTime() {
    if (this.rtcInstance) return this.rtcInstance.getAutoRecycleTime();
  }

  /** 底部栏操作按键 */
  sendCommand(command: string, forwardOff?: boolean) {
    if (this.rtcInstance) this.rtcInstance.sendCommand(command, forwardOff);
  }

  /** 音量增加按键事件 */
  increaseVolume(forwardOff?: boolean) {
    if (this.rtcInstance) this.rtcInstance.increaseVolume(forwardOff);
  }

  /** 音量减少按键事件 */
  decreaseVolume(forwardOff?: boolean) {
    if (this.rtcInstance) this.rtcInstance.decreaseVolume(forwardOff);
  }

  /**
   * 是否接收粘贴板内容回调
   * @param flag true:接收 false:不接收
   */
  saveCloudClipboard(flag: boolean) {
    if (this.rtcInstance) this.rtcInstance.saveCloudClipboard(flag);
  }

  /** 开启摄像头 或 麦克风注入 返回一个promise */
  startMediaStream(mediaType: MediaType) {
    if (this.rtcInstance) return this.rtcInstance.startMediaStream(mediaType);
    return undefined;
  }

  /** 关闭摄像头 或 麦克风注入 返回一个promise */
  stopMediaStream(mediaType: MediaType) {
    if (this.rtcInstance) return this.rtcInstance.stopMediaStream(mediaType);
    return undefined;
  }

  /**  注入视频到相机 */
  injectVideoStream(
    type: MessageKey.START_INJECTION_VIDEO | MessageKey.STOP_INJECTION_VIDEO,
    options?: any,
    timeout?: number,
    forwardOff?: boolean
  ) {
    if (this.rtcInstance)
      return this.rtcInstance.injectVideoStream(
        type,
        options,
        timeout
      );
    return undefined;
  }
  /**
   * 摇一摇
   * @param time
   */
  sendShake(time?: number) {
    if (this.rtcInstance) this.rtcInstance.sendShakeInfo(time ?? 1500);
  }
  /**
   * 获取当前旋转类型
   * @returns 0 竖屏 1 横屏
   */
  getRotateType() {
    if (this.rtcInstance) return this.rtcInstance.getRotateType();
    return undefined;
  }
}

export default ArmcloudEngine;
