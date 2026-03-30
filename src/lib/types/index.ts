export interface TouchInfo {
  pressure: number;
  size: number;
  touchMajor: number;
  touchMinor: number;
  toolMajor: number;
  toolMinor: number;
}

/**
 * 自定义清晰度
 * @definitionId 分辨率 7：144*256；8：216*384；9：288*512；10：360*640；11：480*848；12：540*960；13：600*1024；14：480*1280；15：720*1280；16：720*1920；17：1080*1920；18：1440*1920；19：1600*2560；20：2880*1080
 * @framerateId 帧率 1：20fps；2：25fps；3：30fps；4：60fps；5：1fps；6：5fps；7：10fps；8：15fps；9：2fps
 * @bitrateId 码率 1：1Mbps；2：1.5Mbps；3：2Mbps；4：2.5Mbps；5：3Mbps；6：3.5Mbps；7：4Mbps；8：5Mbps；9：6Mbps；10：8Mbps；11：10Mbps；12：12Mbps；13：200kbps；14：400kbps；15：600kbps
 */
export interface CustomDefinition {
  definitionId: number | null;
  framerateId: number | null;
  bitrateId: number | null;
}

export enum KeyboardMode {
  LOCAL = "local",
  PAD = "pad",
}
export type MediaType = 1 | 2 | 3; // 1:音频 2:视频 3:音视频
export type RotateType = 0 | 1; // 0:竖屏 1:横屏

export interface ArmcloudVideoStream {
  /** 视频分辨率ID，默认 12 */
  resolution?: number;
  /** 帧率ID，默认 2 */
  frameRate?: number;
  /** 码率ID，默认 3 */
  bitrate?: number;
}

export interface ArmcloudDeviceInfo {
  /** 房间号/实例编号（必填） */
  padCode: string;
  /** 用户ID（必填） */
  userId: string;

  /** 无操作回收时间(秒)，0表示禁用；默认 300 */
  autoRecoveryTime?: number;
  /** 媒体流类型(1:音频/2:视频/3:音视频)；默认 2 */
  mediaType?: MediaType;
  /** 屏幕方向(0:竖屏/1:横屏)；默认自动判断（不传） */
  rotateType?: RotateType;

  /** 键盘模式("local"/"pad")；默认 "pad" */
  keyboard?: KeyboardMode;
  /** 是否启用云机剪切板回调；默认 true */
  saveCloudClipboard?: boolean;
  /** 云机键盘时能否使用本地输入法；默认 false */
  allowLocalIMEInCloud?: boolean;
  /** 是否禁用右键菜单；默认 false */
  disableContextMenu?: boolean;

  /** 指定摄像头/麦克风设备ID；默认自动选择 */
  videoDeviceId?: string;
  audioDeviceId?: string;

  /** 禁用本地键盘；默认 false */
  disableLocalIME?: boolean;

  /** 视频流参数（resolution/frameRate/bitrate） */
  videoStream?: ArmcloudVideoStream;
}

/** 顶层初始化参数 */
export interface ArmcloudEngineParams {
  /** 服务端身份验证 Token（必填） */
  token: string;
  /** SDK 接口请求域名（必填） */
  baseUrl: string;

  /** 视图id */
  viewId: string;

  /** uuid */
  uuid?: string;

  /** 重试次数 */
  retryCount?: number;
  /** 重试间隔 */
  retryTime?: number;

  /** 是否启用日志 */
  isLog?: boolean;

  /** 是否禁用 */
  disable?: boolean;

  /** 是否启用ws代理 */
  isWsProxy?: string;

  /** 工具类宽度 */

  toolsWidth?: number;

  /** 管理token */
  manageToken?: string;

  /** 是否启用麦克风；默认 true */
  enableMicrophone?: boolean;
  /** 是否启用摄像头；默认 true */
  enableCamera?: boolean;
  /** 群控主控设备ID前缀；默认 "" */
  masterIdPrefix?: string;

  /** 设备信息（必填） */
  deviceInfo: ArmcloudDeviceInfo;

  /** 回调 */
  callbacks: ArmcloudCallbacks;
}

// ========== 基础枚举 / 联合类型 ==========
export type NetworkQualityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6; // UNKNOWN..DOWN
export type ConnectionStateCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type AutoplayKind = "video" | "audio" | undefined;
export type StreamIndex = 0 | 1; // 0: 主流, 1: 屏幕流
export type MediaTypeNum = 1 | 2 | 3; // 1: audio, 2: video, 3: audio+video

export type AVCaptureErrorCode =
  | "REPEAT_CAPTURE"
  | "GET_AUDIO_TRACK_FAILED"
  | "STREAM_TYPE_NOT_MATCH";

export type UserLeaveReason = 0 | 1 | 2 | 3; // QUIT, DROPPED, SWITCH_TO_INVISIBLE, KICKED_BY_ADMIN

export type InjectVideoType = "startVideoInjection" | "stopVideoInjection";

export interface ProgressEventPayload {
  code: number;
  msg?: string;
}

// ========== 具体事件入参结构 ==========
export interface InitResult {
  code: string | number; // '0' 成功, '-1' 失败, 以及文档中的业务码
  msg?: string;
  streamType?: number;
  uuid?: string;
}

export interface ConnectFailPayload {
  code: number;
  msg?: string;
}

export interface ConnectionStateChangedPayload {
  state: ConnectionStateCode;
  code?: number;
  msg?: string;
}

export interface SocketCallbackPayload {
  code: 0 | 1 | -1;
} // 0 成功 1 关闭 -1 失败

export interface FirstFrameEvent {
  width: number;
  height: number;
  userId: string;
  isScreen: boolean;
}

export interface ChangeResolutionPayload {
  from: { width: number; height: number };
  to: { width: number; height: number };
}

export interface AutoplayFailedEvent {
  userId?: string; // 不带该参数表示本地流播放失败
  kind: AutoplayKind; // "video" | "audio"
}

export type RotateTypeNum = 0 | 1;
export interface RotateInfo {
  width: number;
  height: number;
}

export interface AudioErrorEvent {
  code: number;
  msg?: string;
}
export interface VideoErrorEvent {
  code: number;
  msg?: string;
}

export interface ErrorMessagePayload {
  code: 0 | 1;
  msg?: string;
} // 0: RTC通道中断, 1: 获取统计信息时出错

export interface RunInformationStats {
  userId: string;
  audioStats: {
    audioLossRate: number; // [0,1]
    receivedKBitrate: number; // kbps
    stallCount?: number;
    stallDuration?: number; // ms
    totalRtt: number; // ms
    statsInterval: number; // ms
    rtt: number; // ms
    jitterBufferDelay: number; // ms
    numChannels: number;
    receivedSampleRate: number;
    concealedSamples: number;
    concealmentEvent: number;
  };
  videoStats: {
    width: number;
    height: number;
    videoLossRate: number; // [0,1]
    receivedKBitrate: number; // kbps
    decoderOutputFrameRate: number; // fps
    stallCount?: number;
    stallDuration?: number; // ms
    totalRtt: number; // ms
    isScreen: boolean;
    statsInterval: number; // ms
    rtt: number; // ms
    codecType: "H264" | "VP8";
  };
}

export interface UserLeaveOrJoinPayload {
  type: "join" | "leave";
  userInfo: { userId: string; extraInfo?: string };
}

export interface UserLeaveEvent {
  userId: string;
  reason: UserLeaveReason;
}

export interface UserJoinedPayload {
  userInfo: { userId: string; extraInfo?: string };
}

export interface GroupControlErrorEvent {
  code: string;
  msg: string;
}

export interface MonitorOperationEvent {
  actionTime: number;
  actionType: number;
  keyCode: number;
  simulateHeight: number;
  simulateWidth: number;
  swipe: number; // -1 上划, 1 下划
  touchType: string;
  x: number;
  y: number;
}

export interface TransparentMsgHandler {
  (type: number | string, msg: string): void; // type 当前默认 '0'
}

export interface OutputClipperData {
  content: string;
}

export interface AdbOutputEvent {
  isSuccess: boolean;
  content: string;
}

export interface InjectVideoResultData {
  isSuccess: boolean;
  content?: string; // 失败原因
}

export interface MediaDevicesToggleStats {
  type: "media" | "camera" | "microphone";
  enabled: boolean;
  isFront?: boolean; // type 为 media/camera 才有
}

export interface EquipmentInfoEvent {
  info: string;
}

export interface SendUserErrorEvent {
  code: string;
  msg: string;
}

// ========== 回调总接口（全部可选） ==========
export interface ArmcloudCallbacks {
  // 初始化
  onInit?: (result: InitResult) => void;

  // 连接
  onConnectSuccess?: () => void;
  onConnectFail?: (payload: ConnectFailPayload) => void;
  onConnectionStateChanged?: (payload: ConnectionStateChangedPayload) => void;
  onSocketCallback?: (payload: SocketCallbackPayload) => void;

  // 媒体
  onRenderedFirstFrame?: (event?: FirstFrameEvent) => void;
  onChangeResolution?: (payload: ChangeResolutionPayload) => void;
  onAutoplayFailed?: (event: AutoplayFailedEvent) => void;
  onBeforeRotate?: (type: RotateTypeNum) => void;
  onChangeRotate?: (type: RotateTypeNum, info: RotateInfo) => void;

  // 采集
  onAudioInit?: () => void;
  onAudioError?: (event: AudioErrorEvent) => void;
  onVideoInit?: () => void;
  onVideoError?: (event: VideoErrorEvent) => void;

  // 状态 / 诊断
  onErrorMessage?: (payload: ErrorMessagePayload) => void;
  onRunInformation?: (stats: any) => void;
  onNetworkQuality?: (
    uplink: NetworkQualityLevel,
    downlink: NetworkQualityLevel
  ) => void;
  onProgress?: (payload: ProgressEventPayload) => void;
  onSendUserError?: (event: SendUserErrorEvent) => void;

  // 用户交互
  onUserJoined?: (payload: UserJoinedPayload) => void;
  onUserLeave?: (event: UserLeaveEvent) => void;
  onUserLeaveOrJoin?: (payload: UserLeaveOrJoinPayload) => void;
  onAutoRecoveryTime?: () => void;
  onMonitorOperation?: (event: MonitorOperationEvent) => void;
  onGroupControlError?: (event: GroupControlErrorEvent) => void;
  onEquipmentInfo?: (event: EquipmentInfoEvent) => void;

  // 功能特性
  onTransparentMsg?: TransparentMsgHandler;
  onOutputClipper?: (data: OutputClipperData) => void;
  onAdbOutput?: (event: AdbOutputEvent) => void;
  onInjectVideoResult?: (
    type: InjectVideoType,
    data: InjectVideoResultData
  ) => void;
  onMediaDevicesToggle?: (stats: MediaDevicesToggleStats) => void;
}

export interface ArmcloudRtcOptions {
  /** 火山 RTC appId */
  appId: string;
  /** 房间号（火山 RTC） */
  roomCode: string;
  /** 房间 token（火山 RTC） */
  roomToken: string;

  /** WebSocket 地址 */
  signalServer: string;
  /** STUN 服务 */
  stuns: string;
  /** TURN 服务 */
  turns: string;

  /** 服务端下发的 token（用于换取火山 RTC 信息） */
  token: string;
  /** 火山 RTC 的 uuid */
  uuid: string;

  /** 房间号（客户端 ID，通常等于 padCode） */
  clientId: string;

  /** 房间号（冗余字段，与 clientId 一致） */
  padCode: string;
  /** 用户 ID */
  userId: string;

  /** 流类型 */
  streamType?: number;

  /** 工具类宽度 */
  toolsWidth?: number;

  /** WS 重连次数，默认 2 */
  retryCount: number;
  /** WS 每次重连间隔(ms)，默认 2000 */
  retryTime: number;

  /** 是否输出日志，默认 true */
  isLog: boolean;
  /** 是否禁用，默认 false */
  disable: boolean;

  /** 是否开启麦克风，默认 true */
  enableMicrophone: boolean;
  /** 是否开启摄像头，默认 true */
  enableCamera: boolean;

  /** Armcloud SDK 接口请求域名 */
  baseUrl: string;
  /** 是否走 WS 代理，默认 false */
  isWsProxy: boolean;

  /** 管理端 token（群控用） */
  manageToken: string;
  /** 群控主控 ID 前缀 */
  masterIdPrefix: string;

  /** 视频流信息 */
  videoStream: ArmcloudVideoStream;

  /** 是否禁用本地输入法，默认 false */
  disableLocalIME: boolean;
  /** 云机键盘时能否使用本地输入法，默认 false */
  allowLocalIMEInCloud: boolean;
  /** 自动回收时间，默认 300 秒 */
  autoRecoveryTime: number;
  /** 拉流媒体类型，默认 2 */
  mediaType: number;
  /** 横竖屏旋转类型（0 竖屏 1 横屏） */
  rotateType?: RotateDirection;
  /** 键盘模式，默认 "pad" */
  keyboard: KeyboardMode;
  /** 是否禁用右键菜单，默认 false */
  disableContextMenu: boolean;
  /** 云机剪切板回调开关，默认 true */
  saveCloudClipboard: boolean;

  /** 摄像头设备 ID */
  videoDeviceId?: string;
  /** 麦克风设备 ID */
  audioDeviceId?: string;

  /** 连接信息 */
  accessInfo?: string;
}

// 获取应用和属性信息
export const enum EquipmentInfoType {
  APP = "app",
  ATTR = "attr",
}

// 获取注入推流状态
export const enum InjectStreamStatusType {
  VIDEO = "video",
  CAMERA = "camera",
  AUDIO = "audio",
}
// 媒体设备类型
export const enum MediaDeviceType {
  MEDIA = "media",
  CAMERA = "camera",
  MICROPHONE = "microphone",
}

/**
 * Android 常用按键 KeyCode 枚举
 * 参考：https://developer.android.com/reference/android/view/KeyEvent
 */
export const enum AndroidKeyCode {
  /** 未知键 */
  KEYCODE_UNKNOWN = 0,

  /** Home 键（主页） */
  KEYCODE_HOME = 172,

  /** 返回键 */
  KEYCODE_BACK = 158,

  /** 通话键（拨号） */
  KEYCODE_CALL = 5,

  /** 挂断键 */
  KEYCODE_ENDCALL = 6,

  /** 数字键 0 */
  KEYCODE_0 = 7,
  /** 数字键 1 */
  KEYCODE_1 = 8,
  /** 数字键 2 */
  KEYCODE_2 = 9,
  /** 数字键 3 */
  KEYCODE_3 = 10,
  /** 数字键 4 */
  KEYCODE_4 = 11,
  /** 数字键 5 */
  KEYCODE_5 = 12,
  /** 数字键 6 */
  KEYCODE_6 = 13,
  /** 数字键 7 */
  KEYCODE_7 = 14,
  /** 数字键 8 */
  KEYCODE_8 = 15,
  /** 数字键 9 */
  KEYCODE_9 = 16,

  /** 星号 * */
  KEYCODE_STAR = 17,
  /** 井号 # */
  KEYCODE_POUND = 18,

  /** 上方向键 */
  KEYCODE_DPAD_UP = 19,
  /** 下方向键 */
  KEYCODE_DPAD_DOWN = 20,
  /** 左方向键 */
  KEYCODE_DPAD_LEFT = 21,
  /** 右方向键 */
  KEYCODE_DPAD_RIGHT = 22,
  /** 确认/OK */
  KEYCODE_DPAD_CENTER = 23,

  /** 音量加 */
  KEYCODE_VOLUME_UP = 0x3a,
  /** 音量减 */
  KEYCODE_VOLUME_DOWN = 0x3b,
  /** 电源键 */
  KEYCODE_POWER = 26,

  /** 相机键 */
  KEYCODE_CAMERA = 27,
  /** 清除键 */
  KEYCODE_CLEAR = 28,

  /** 菜单键 */
  KEYCODE_MENU = 139,
  /** 通知键 */
  KEYCODE_NOTIFICATION = 83,
  /** 搜索键 */
  KEYCODE_SEARCH = 84,

  /** 媒体播放/暂停 */
  KEYCODE_MEDIA_PLAY_PAUSE = 85,
  /** 媒体停止 */
  KEYCODE_MEDIA_STOP = 86,
  /** 上一首 */
  KEYCODE_MEDIA_PREVIOUS = 87,
  /** 下一首 */
  KEYCODE_MEDIA_NEXT = 88,
  /** 快进 */
  KEYCODE_MEDIA_REWIND = 89,
  /** 快退 */
  KEYCODE_MEDIA_FAST_FORWARD = 90,

  /** 相机快门 */
  KEYCODE_FOCUS = 80,

  /** 回车键 */
  KEYCODE_ENTER = 66,
  /** 空格键 */
  KEYCODE_SPACE = 62,
  /** 删除键（退格） */
  KEYCODE_DEL = 67,

  /** Tab 键 */
  KEYCODE_TAB = 61,
  /** Esc 键 */
  KEYCODE_ESCAPE = 111,
}

/** 旋转方向 */
export enum RotateDirection {
  PORTRAIT = 0,
  LANDSCAPE = 1,
}
