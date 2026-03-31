import { TouchType, SdkEventType, MessageKey, MediaOperationType } from "../../types/webrtcType";
import type { CustomDefinition } from "../../types/index";
import { getMsgTemplate, getSdkMsg } from "./messageTemplate";

type SendFn = (userId: string, msg: string, notSendInGroups?: boolean) => any;

/** 获取应用/属性信息 */
export function buildGetEquipmentInfo(type: "app" | "attr"): string {
  return getMsgTemplate(TouchType.EQUIPMENT_INFO, { type });
}

/** 应用卸载 */
export function buildAppUnInstall(pkgNames: string[]): string {
  return getMsgTemplate(TouchType.APP_UNINSTALL, pkgNames);
}

/** 执行ADB命令 */
export function buildExecuteAdbCommand(command: string): string {
  return getMsgTemplate(TouchType.EVENT_SDK, { type: SdkEventType.INPUT_ADB, content: command });
}

/** 打开或关闭监控操作 */
export function buildSetMonitorOperation(isOpen: boolean): string {
  return getMsgTemplate(TouchType.EVENT_SDK, { type: MessageKey.OPERATE_SWITCH, isOpen });
}

/** 修改屏幕分辨率和dpi */
export function buildSetScreenResolution(options: {
  width: number;
  height: number;
  dpi: number;
  type: MessageKey.RESET_DENSITY | MessageKey.UPDATE_DENSITY;
}): string {
  const contentObj = options.type === MessageKey.UPDATE_DENSITY
    ? { type: options.type, width: options.width, height: options.height, density: options.dpi }
    : { type: options.type };
  return getMsgTemplate(TouchType.EVENT_SDK, contentObj);
}

/** 清晰度切换 */
export function buildSetStreamConfig(config: CustomDefinition): string | null {
  const regExp = /^[1-9]\d*$/;
  if (!config.definitionId || !config.framerateId || !config.bitrateId) return null;
  if (!Object.values(config).every((v) => regExp.test(String(v)))) return null;
  return getMsgTemplate(TouchType.EVENT_SDK, {
    type: SdkEventType.DEFINITION_UPDATE,
    definitionId: config.definitionId,
    framerateId: config.framerateId,
    bitrateId: config.bitrateId,
  });
}

/** 手动定位 */
export function buildSetGPS(longitude: number, latitude: number): string {
  return getMsgTemplate(TouchType.EVENT_SDK, {
    type: SdkEventType.SDK_LOCATION,
    content: JSON.stringify({ latitude, longitude, time: Date.now() }),
  });
}

/** 底部栏操作按键 */
export function buildSendCommand(command: string): string {
  const keyCodeMap: Record<string, number> = { back: 4, home: 3, menu: 187 };
  const keyCode = keyCodeMap[command] ?? command;
  return JSON.stringify({ action: 1, touchType: "keystroke", keyCode, text: "" });
}

/** 音量增加/减少 */
export function buildVolumeKey(keyCode: 24 | 25): string {
  return JSON.stringify({ action: 1, touchType: TouchType.KEYSTROKE, keyCode, text: "" });
}

/** 暂停/恢复音视频 */
export function buildMediaControl(isOpen: boolean): string {
  return getMsgTemplate(TouchType.EVENT_SDK, {
    type: MediaOperationType.OPEN_AUDIO_AND_VIDEO,
    isOpen,
  });
}

/** 截图保存到云机 */
export function buildSaveScreenShotToRemote(): string {
  return getMsgTemplate(TouchType.EVENT_SDK, { type: SdkEventType.LOCAL_SCREENSHOT });
}

/** 查询输入状态 */
export function buildCheckInputState(): string {
  return JSON.stringify({ touchType: TouchType.INPUT_STATE });
}

/** 云机/本地键盘切换 */
export function buildSetKeyboardStyle(isLocalKeyBoard: boolean): string {
  return getMsgTemplate(TouchType.EVENT_SDK, { type: SdkEventType.KEYBOARD_TYPE, isLocalKeyBoard });
}

/** 触发快捷键 */
export function buildTriggerKeyboardShortcut(metaState: number | string, keyCode: number | string): string {
  return JSON.stringify({
    touchType: MessageKey.SHORTCUT_KEY,
    metaState: metaState + "",
    keyCode: keyCode + "",
  });
}

/** 剪切板 */
export function buildSendInputClipper(text: string): string {
  return JSON.stringify({ text, touchType: TouchType.CLIPBOARD });
}

/** 输入框文本 */
export function buildSendInputString(text: string): string {
  return JSON.stringify({ text, touchType: TouchType.INPUT_BOX });
}

/** 打开或关闭监控操作 (operateSwitch) */
export function buildOperateSwitch(isOpen: boolean): string {
  return getMsgTemplate(TouchType.EVENT_SDK, { type: "operateSwitch", isOpen });
}
