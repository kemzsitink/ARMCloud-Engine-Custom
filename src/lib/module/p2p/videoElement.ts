export class VideoElement {
  private videoDomId: string; // 视频 DOM 元素的 ID
  private remoteVideoId: string; // 远程视频元素的 ID
  private containerId: string; // 容器元素的 ID
  private remoteVideo: HTMLVideoElement; // 远程视频元素
  private eventListeners: Array<{
    type: string;
    listener: EventListener;
    element: HTMLElement;
  }> = []; // 存储事件类型和对应的监听器

  constructor(private masterIdPrefix: string, private remoteUserId: string) {
    // 初始化 ID
    this.videoDomId = `${this.masterIdPrefix}_${this.remoteUserId}_armcloudVideo`;
    this.remoteVideoId = `${this.masterIdPrefix}_${this.remoteUserId}_remoteVideo`;
    this.containerId = `${this.masterIdPrefix}_${this.remoteUserId}_remoteVideoContainer`;

    // 创建远程视频元素
    this.remoteVideo = this.createRemoteVideoElement();
  }

  public getVideoDomId(): string {
    // 获取视频 DOM 元素的 ID
    return this.videoDomId;
  }

  public getRemoteVideoId(): string {
    // 获取远程视频元素的 ID
    return this.remoteVideoId;
  }

  public getContainerId(): string {
    // 获取容器元素的 ID
    return this.containerId;
  }

  public getRemoteVideo(): HTMLVideoElement {
    // 获取远程视频元素
    return this.remoteVideo;
  }

  public createElements(): HTMLElement {
    // 创建包含视频的 DOM 元素结构
    const newDiv = this.createDivElement(this.videoDomId); // 创建主 div
    const newDiv2 = this.createDiv("100%", "100%", "relative", "hidden"); // 创建相对定位的 div
    const newDiv3 = this.createDiv(
      "100%",
      "100%",
      "absolute",
      "hidden",
      this.containerId
    ); // 创建绝对定位的 div

    // 将远程视频添加到新创建的 div 中
    newDiv3.appendChild(this.remoteVideo);
    newDiv2.appendChild(newDiv3);
    newDiv.appendChild(newDiv2);

    return newDiv; // 返回最外层的 div
  }

  private createRemoteVideoElement(): HTMLVideoElement {
    // 创建远程视频元素
    const video = document.createElement("video");
    video.setAttribute("id", this.remoteVideoId);
    video.setAttribute("playsinline", ""); // 设置 inline 播放属性
    video.setAttribute("webkit-playsinline", ""); // WebKit 浏览器支持
    video.setAttribute("x5-playsinline", ""); // X5 浏览器支持
    video.setAttribute("x5-video-player-type", "h5"); // X5 视频播放器类型

    // 设置视频属性
    video.controls = false; // 禁用控制条
    video.muted = true; // 静音
    video.style.width = "100%"; // 设置宽度为 100%
    video.style.height = "100%"; // 设置高度为 100%
    video.style.objectFit = "contain"; // 填充视频
    video.style.transform = "scale(1)"; // 缩放比例

    return video; // 返回创建的远程视频元素
  }
  // 允许绑定事件到 videoDomId 对应的元素，并阻止事件冒泡
  public bindDomEvent(type: string, listener: EventListener): void {
    const domElement = document.getElementById(this.videoDomId);
    if (domElement) {
      const wrappedListener = (event: Event) => {
        type !== "wheel" && event.preventDefault(); // 阻止默认行为
        listener(event); // 执行传入的监听器函数
      };
      domElement.addEventListener(type, wrappedListener);
      // 保存事件类型、监听器和元素
      this.eventListeners.push({
        type,
        listener: wrappedListener,
        element: domElement,
      });
    }
  }
  // 卸载所有绑定到视频和 videoDomId 元素上的事件
  public removeAllEvents(): void {
    // 遍历所有存储的事件监听器，并卸载它们
    this.eventListeners.forEach(({ type, listener, element }) => {
      element.removeEventListener(type, listener);
    });
    // 清空事件列表
    this.eventListeners = [];
  }

  private createDivElement(id: string): HTMLDivElement {
    // 创建一个带 ID 的 div 元素
    const div = document.createElement("div");
    div.setAttribute("id", id);
    return div; // 返回创建的 div
  }

  private createDiv(
    width: string,
    height: string,
    position: string,
    overflow: string,
    id?: string
  ): HTMLDivElement {
    // 创建一个指定样式的 div 元素
    const div = document.createElement("div");
    div.style.width = width; // 设置宽度
    div.style.height = height; // 设置高度
    div.style.position = position; // 设置定位
    div.style.overflow = overflow; // 设置溢出样式

    // 如果提供了 ID，则设置 ID
    if (id) {
      div.setAttribute("id", id);
    }

    return div; // 返回创建的 div
  }

  // 销毁方法，移除事件，清理 DOM，并释放类实例
  public destroy(): void {
    // 1. 移除所有事件监听器
    this.removeAllEvents();

    // 2. 从 DOM 中删除 videoDomId 对应的元素
    const videoDomElement = document.getElementById(this.videoDomId);
    if (videoDomElement && videoDomElement.parentNode) {
      videoDomElement.parentNode.removeChild(videoDomElement);
    }

    // 3. 释放类的属性
    this.remoteVideo = null!;
    this.eventListeners = [];
  }
}
