import { CloudGamingWebSDK } from "../core/index";
import { TouchType } from "../../../types/webrtcType";
import type { Listener } from "../../../types/internal";

// 支持的事件类型
export const enum EventType {
  MESSAGE = "message",
  INITIALIZED = "initialized",
  CALLBACK = "callBack",
}

export default class CreateDataChannel {
  // 发送消息
  private sendMessage: ((message: string | Object) => void) | null = null;
  // 通道代码
  private code: number | null = null;

  // 事件监听
  private events: Map<EventType, Listener[]> = new Map();

  constructor(private TCGSDK: CloudGamingWebSDK, private destPort: number) {
    this.TCGSDK = TCGSDK;
  }

  async init(type?: 'android_broadcast' | 'android') {
    const { sendMessage: send, code } =
      await this.TCGSDK.createCustomDataChannel({
        destPort: this.destPort || 10005,
        type: type,
        onMessage: (res: any) => {
          try {
            const message = JSON.parse(res);
            const { key, data } = message;

            console.log("onMessage", message);

            switch (key) {
              case EventType.CALLBACK:
                this.emit(EventType.CALLBACK, JSON.parse(data));
                break;
              case EventType.INITIALIZED:
                this.emit(EventType.INITIALIZED);
                break;
              default:
                this.emit(EventType.MESSAGE, message);
                break;
            }
          } catch (error) {
            // 解析失败
            console.error("CustomDataChannel onMessage error", error);
          }
        },
      });

    this.sendMessage = send as (message: string | Object) => void;
    this.code = code;

    // 如果创建成功，则发送初始化事件
    if (code == 0) {
      const initMessage = JSON.stringify({
        touchType: TouchType.EVENT_SDK,
        content: JSON.stringify({ type: "PullStreamConnected" }),
      });
      send(initMessage);
    }
  }

  // 发送消息
  send(message: string | Object) {
    this.sendMessage?.(message);
  }

  // 订阅事件
  on(event: EventType, listener: Listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(listener);
    return this as any;
  }

  // 只监听一次
  once(event: EventType, listener: Listener) {
    const onceWrapper: Listener = (payload) => {
      this.off(event, onceWrapper);
      listener(payload);
    };
    this.on(event, onceWrapper);
    return this;
  }

  // 取消订阅
  off(event: EventType, listener: Listener) {
    if (!this.events.has(event)) return this;
    this.events.set(
      event,
      this.events.get(event)?.filter((l) => l !== listener) || []
    );
    return this;
  }

  // 内部触发事件
  private emit(event: EventType, payload?: any) {
    this.events.get(event)?.forEach((listener) => listener(payload));
  }

  // 获取 code
  getCode() {
    return this.code;
  }
}
