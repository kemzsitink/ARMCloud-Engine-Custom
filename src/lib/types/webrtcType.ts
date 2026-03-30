export enum MediaType {
  AUDIO = 1,
  VIDEO = 2,
  AUDIO_AND_VIDEO = 3,
}

// 触摸类型枚举
export enum TouchType {
  GESTURE = "gesture",
  GESTURE_SWIPE = "gestureSwipe",
  EVENT_SDK = "eventSdk",
  KEYSTROKE = "keystroke",
  CLIPBOARD = "clipboard",
  INPUT_BOX = "inputBox",
  INPUT_STATE = "inputState",
  RTC_STATS = "rtcStats",
  KICK_OUT_USER = "kickOutUser",
  EQUIPMENT_INFO = "equipmentInfo",
  APP_UNINSTALL = "appUnInstall",
}

// WebSocket事件类型枚举
export const enum WebSocketEventType {
  PING = "ping",
  BROADCAST_MSG = "broadcastMsg",
  SPECIFIED_MSG = "specifiedMsg",
  OWN_JOIN_ROOM = "ownJoinRoom",
}

// 消息键枚举
export const enum MessageKey {
  VIDEO_AND_AUDIO_CONTROL = "videoAndAudioControl",
  AUDIO_CONTROL = "audioControl",
  MESSAGE = "message",
  INPUT_ADB = "inputAdb",
  EQUIPMENT_INFO = "equipmentInfo",
  REFRESH_UI_TYPE = "refreshUiType",
  INPUT_STATE = "inputState",
  CLIPBOARD = "clipboard",
  ICE_CANDIDATE = "ice_candidate",
  RE_ANSWER = "re_answer",
  OFFER = "offer",
  RE_OFFER = "re_offer",
  ANSWER = "answer",
  START_INJECTION_VIDEO = "startVideoInjection",
  STOP_INJECTION_VIDEO = "stopVideoInjection",
  INJECTION_VIDEO_STATS = "injectionVideoStats",
  CALL_BACK_EVENT = "callBack",
  RESET_DENSITY = "resetDensity",
  UPDATE_DENSITY = "updateDensity",
  DEFINITION = "definition",
  GET_CAMERA_STATE = "cameraState",
  SHORTCUT_KEY = "shortcutKey",
  OPERATE_SWITCH = "operateSwitch",
  VIDEO_CONTROL = "videoControl",
}

// SDK事件类型枚举
export const enum SdkEventType {
  UPDATE_UI_H5 = "updateUiH5",
  INPUT_ADB = "inputAdb",
  INJECTION_CAMERA = "injectionCamera",
  INJECTION_AUDIO = "injectionAudio",
  DEFINITION_UPDATE = "definitionUpdata",
  KEYBOARD_TYPE = "keyBoardType",
  LOCAL_SCREENSHOT = "localScreenshot",
  SDK_LOCATION = "sdkLocation",
  SDK_SENSOR = "sdkSensor",
  // 获取相机状态
  GET_CAMERA_STATE = "cameraState",
}

// 传感器类型枚举
export const enum SensorType {
  GYROSCOPE = "gyroscope",
  GRAVITY = "gravity",
  ACCELERATION = "acceleration",
}

// 媒体操作类型枚举
export const enum MediaOperationType {
  OPEN_AUDIO = "openAudio",
  OPEN_VIDEO = "openVideo",
  OPEN_AUDIO_AND_VIDEO = "openAudioAndVideo",
}

export const enum MediaStreamType {
  VIDEO = "video",
  AUDIO = "audio",
}
