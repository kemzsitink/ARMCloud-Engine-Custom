import axios from "axios";
import VERTC from "@volcengine/rtc";
class CustomGroupRtc {
  private engine: any = null;
  private params: any = null;
  private pads: Array<string> = [];
  private callbacks: any = null;
  private sourceArr: any = [];
  constructor(params: any, pads: Array<string>, callbacks: any) {
    this.params = params;
    this.pads = pads;
    this.callbacks = callbacks;
  }
  // 关闭 WebSocket 连接
  close() {
    this.sourceArr?.forEach((v: any) => {
      v.cancel();
    });
    this.sourceArr = [];
  }
  kickItOutRoom(pads: Array<string>) {
    this.pads = this.pads?.filter((v: string) => !pads?.includes(v)) || [];
    this.sendRoomMessage(
      JSON.stringify({
        touchType: "kickOutUser",
        content: JSON.stringify(pads),
      })
    );
  }
  joinRoom(pads: any) {
    this.pads = [...new Set([...(this.pads || []), ...(pads || [])])];
    const source = axios.CancelToken.source(); // 创建一个取消令牌
    this.sourceArr.push(source);
    return new Promise<void>((resolve, reject) => {
      const { baseUrl } = this.params;

      const base = baseUrl
        ? `${baseUrl}/rtc/open/room/sdk/share/applyToken`
        : `https://openapi.armcloud.net/rtc/open/room/sdk/share/applyToken`;
      const { userId, uuid, token, manageToken } = this.params;

      const url = manageToken ? "/manage/rtc/room/share/applyToken" : base;
      const tok = manageToken || token;
      axios
        .post(
          url,
          {
            userId,
            uuid,
            terminal: "h5",
            expire: 360000,
            pushPublicStream: false,
            pads: pads?.map((v: string) => {
              return {
                padCode: v,
                // videoStream: {
                //   resolution: 7, // 分辨率
                //   frameRate: 5, // 帧率
                //   bitrate: 13, // 码率
                // },
                userId,
              };
            }),
          },
          {
            headers: manageToken ? { Authorization: tok } : { token: tok },
            cancelToken: source.token,
          }
        )
        .then((res: any) => {
          resolve(res);
        })
        .catch((error) => {
          if (axios.isCancel(error)) {
            return;
          }
          reject(error);
        });
    });
  }
  async getEngine() {
    return new Promise<void>((resolve, reject) => {
      this.joinRoom(this.pads)
        .then((res: any) => {
          const { userId } = this.params;
          const { appId, roomCode, roomToken } = res?.data?.data || {};
          this.engine = VERTC.createEngine(appId);

          this.createEngine({
            roomCode,
            roomToken,
            userId,
            resolve,
            reject,
          });
        })
        .catch((err: any) => {
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

  getMsgTemplate(touchType: string, content: object) {
    return JSON.stringify({
      touchType,
      content: JSON.stringify(content),
    });
  }

  /** 远端可见用户加入房间 */
  onUserJoined() {
    this?.engine?.on(VERTC.events.onUserJoined, (user: any) => {
      this.callbacks.onUserLeaveOrJoin({
        type: "join",
        userInfo: user?.userInfo,
      });
    });
  }

  /** 监听 onUserMessageReceived 事件 */
  onUserMessageReceived() {
    const onUserMessageReceived = (e: { userId: string; message: string }) => {
      if (e.message) {
        const msg = JSON.parse(e.message);
        if (msg.key === "userjoin") {
          this.sendRoomMessage(
            this.getMsgTemplate("openGroupControl", {
              pads: this.pads,
            })
          );
          this.sendUserMessage(
            e.userId,
            this.getMsgTemplate("openGroupControl", { isOpen: true })
          );
        }
      }
    };
    this.engine.on(VERTC.events.onUserMessageReceived, onUserMessageReceived);
  }

  /** 远端可见用户加离开房间 */
  onUserLeave() {
    this?.engine?.on(VERTC.events.onUserLeave, (user: any) => {
      this.callbacks.onUserLeaveOrJoin({
        type: "leave",
        userInfo: user?.userInfo,
      });
    });
  }

  async createEngine(options: any) {
    const { roomToken, roomCode, userId, resolve, reject } = options;
    try {
      const res = await this.engine.joinRoom(
        roomToken,
        roomCode,
        {
          userId,
        },
        {
          isAutoPublish: false,
          isAutoSubscribeAudio: false,
          isAutoSubscribeVideo: false,
        }
      );
      this.onUserJoined();
      this.onUserLeave();
      this.onUserMessageReceived();
      this.sendRoomMessage(
        this.getMsgTemplate("openGroupControl", {
          pads: this.pads,
        })
      );

      resolve({
        engine: this.engine,
        result: res,
      });
    } catch (error) {
      reject(error);
    }
  }
}
export default CustomGroupRtc;
