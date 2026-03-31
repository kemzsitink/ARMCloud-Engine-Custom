import VERTC from "@volcengine/rtc";
import { getMsgTemplate } from "../../common/protocol/messageTemplate";
import { fetchRoomToken } from "../../common/api/fetchRoomToken";

class GroupRtc {
  private engine: any = null;
  private params: any = null;
  private pads: Array<string> = [];
  private callbacks: any = null;

  constructor(params: any, pads: Array<string>, callbacks: any) {
    this.params = params;
    this.pads = pads;
    this.callbacks = callbacks;
  }

  close() {
    if (this.engine) {
      this.engine.leaveRoom();
      this.engine = null;
    }
  }

  kickItOutRoom(pads: Array<string>) {
    this.pads = this.pads?.filter((v: string) => !pads?.includes(v)) || [];
    this.sendRoomMessage(
      JSON.stringify({ touchType: "kickOutUser", content: JSON.stringify(pads) })
    );
  }

  async joinRoom(pads: any) {
    this.pads = [...new Set([...(this.pads || []), ...(pads || [])])];
    const { baseUrl, userId, uuid, token, manageToken } = this.params;
    return fetchRoomToken({ baseUrl, userId, uuid, token, manageToken, pads: this.pads });
  }

  async getEngine() {
    return new Promise<void>((resolve, reject) => {
      this.joinRoom(this.pads)
        .then((res: any) => {
          const { userId } = this.params;
          const { appId, roomCode, roomToken } = res;
          this.engine = VERTC.createEngine(appId);
          this.createEngine({ roomCode, roomToken, userId, resolve, reject });
        })
        .catch(() => {
          const error: any = new Error("Get Token Error");
          error.code = "TOKEN_ERR";
          reject(error);
        });
    });
  }

  async sendUserMessage(userId: string, message?: string) {
    return await this?.engine?.sendUserMessage(userId, message);
  }

  async sendRoomMessage(message: string) {
    return await this?.engine?.sendRoomMessage(message);
  }

  onUserJoined() {
    this?.engine?.on(VERTC.events.onUserJoined, (user: any) => {
      this.callbacks.onUserLeaveOrJoin({ type: "join", userInfo: user?.userInfo });
    });
  }

  onUserMessageReceived() {
    this.engine.on(VERTC.events.onUserMessageReceived, (e: { userId: string; message: string }) => {
      if (!e.message) return;
      const msg = JSON.parse(e.message);
      if (msg.key === "userjoin") {
        this.sendRoomMessage(getMsgTemplate("openGroupControl", { pads: this.pads }));
        this.sendUserMessage(e.userId, getMsgTemplate("openGroupControl", { isOpen: true }));
      }
    });
  }

  onUserLeave() {
    this?.engine?.on(VERTC.events.onUserLeave, (user: any) => {
      this.callbacks.onUserLeaveOrJoin({ type: "leave", userInfo: user?.userInfo });
    });
  }

  async createEngine(options: any) {
    const { roomToken, roomCode, userId, resolve, reject } = options;
    try {
      const res = await this.engine.joinRoom(
        roomToken, roomCode,
        { userId },
        { isAutoPublish: false, isAutoSubscribeAudio: false, isAutoSubscribeVideo: false }
      );
      this.onUserJoined();
      this.onUserLeave();
      this.onUserMessageReceived();
      this.sendRoomMessage(getMsgTemplate("openGroupControl", { pads: this.pads }));
      resolve({ engine: this.engine, result: res });
    } catch (error) {
      reject(error);
    }
  }
}

export default GroupRtc;
