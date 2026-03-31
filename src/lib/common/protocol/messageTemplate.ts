import { TouchType, SdkEventType, MessageKey } from "../../types/webrtcType";

/** Serialize một message theo format ArmCloud cloud phone protocol */
export function getMsgTemplate(touchType: string, content: object): string {
  return JSON.stringify({ touchType, content: JSON.stringify(content) });
}

/** Shorthand cho eventSdk messages */
export function getSdkMsg(type: string, extra?: object): string {
  return getMsgTemplate(TouchType.EVENT_SDK, { type, ...extra });
}
