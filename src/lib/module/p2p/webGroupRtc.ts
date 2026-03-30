import axios from "axios";
import type { ArmcloudCallbacks, ArmcloudRtcOptions } from "../../types/index";

class WebGroupRTC {
  private params: ArmcloudRtcOptions | null = null; // 传入的参数
  private pingTimer: any = null;
  private callbacks: ArmcloudCallbacks | null = null; // 回调函数
  private socket: WebSocket | null = null; // WebSocket 对象
  private reconnectAttempts: number = 0; // 当前重连尝试次数
  private maxReconnectAttempts: number = 3; // 最大重连次数
  private reconnectDelay: number = 1500; // 每次重连的间隔时间（毫秒）
  private sourceArr: any = [];
  constructor(
    params: ArmcloudRtcOptions | null,
    pads: Array<string>,
    callbacks: ArmcloudCallbacks | null
  ) {
    this.params = params;
    this.callbacks = callbacks;
    pads.length && this.joinRoom(pads); // 如果有房间需要加入，调用加入房间方法
  }

  // 关闭 WebSocket 连接
  close() {
    clearInterval(this.pingTimer);
    this.sourceArr?.forEach((v: any) => {
      v.cancel();
    });
    this.sourceArr = [];
    this.socket?.close();
    this.socket = null;
  }

  // 发送消息给 WebSocket 服务端
  sendMessage(message: string) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(message);
    }
  }
  startHeartbeat() {
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(
          JSON.stringify({
            event: "ping",
          })
        );
        return;
      }
      clearInterval(this.pingTimer);
    }, 5000);
  }
  // 初始化 WebSocket 连接
  initSocket(signalServer: string, roomToken: string) {
    const { isWsProxy } = this.params || {};

    let url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host
      }/sdk-ws/${roomToken}`;

    if (!isWsProxy) {
      url = `${signalServer}/${roomToken}`;
    }

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0; // 重置重连次数
      this.startHeartbeat();
    };

    this.socket.onerror = (error: any) => {
      this.callbacks?.onGroupControlError?.({
        code: error?.code || "WS_ERROR",
        msg: error.message || "WebSocket 连接出错",
      });
      this.handleReconnect(signalServer, roomToken); // 出错时尝试重连
    };
  }

  // 处理 WebSocket 重连
  handleReconnect(signalServer: string, roomToken: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        console.log(`正在尝试第 ${this.reconnectAttempts} 次重连...`);
        this.initSocket(signalServer, roomToken);
      }, this.reconnectDelay);
    } else {
      console.log("达到最大重连次数，停止重连。");
      this.callbacks?.onGroupControlError?.({
        code: "MAX_RECONNECT_ATTEMPTS" as string,
        msg: "达到最大重连次数，无法连接到服务器。" as string,
      });
    }
  }

  // 加入房间
  joinRoom(pads: any) {
    const source = axios.CancelToken.source(); // 创建一个取消令牌
    this.sourceArr.push(source);
    const { userId, videoStream, uuid, token, manageToken } = this.params || {} as ArmcloudRtcOptions;

    const url = manageToken
      ? "/manage/rtc/room/share/applyToken"
      : `/sdk/rtc/open/room/sdk/share/applyToken`;
    const tok = manageToken || token;
    axios
      .post(
        url,
        {
          userId: userId || "",
          uuid: uuid || "",
          terminal: "h5",
          pushPublicStream: false,
          pads: pads.map((padCode: string) => ({
            padCode,
            videoStream: {
              resolution: 7, // 分辨率
              frameRate: 5, // 帧率
              bitrate: 13, // 码率
            },
            userId,
          })),
        },
        {
          headers: manageToken ? { Authorization: tok } : { token: tok },
          cancelToken: source.token,
        }
      )
      .then((res) => {
        const { signalServer, roomToken } = res?.data?.data;
        if (!this.socket) {
          this.initSocket(signalServer, roomToken); // 初始化 WebSocket 连接
        }
      })
      .catch((err) => {
        if (axios.isCancel(err)) {
          return;
        }
        const error: any = new Error("加入房间出错");
        error.code = "JOIN_ROOM_ERR";
        this.callbacks?.onGroupControlError?.({
          code: error?.code,
          msg: error?.message,
        });
      });
  }
}

export default WebGroupRTC;
