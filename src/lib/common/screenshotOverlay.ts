export default class ScreenshotOverlay {
  private videoContainer: HTMLDivElement;
  private video: HTMLVideoElement;
  private rotateType: number;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  constructor(videoContainer: HTMLDivElement, rotateType: number = 0) {
    this.videoContainer = videoContainer;

    this.video = this.videoContainer?.querySelector(
      "video"
    ) as HTMLVideoElement;
    this.rotateType = rotateType;
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    this.initCanvas();
  }

  // 初始化 Canvas 并插入到 video 上
  private initCanvas() {
    if (this.videoContainer && this.canvas) {
      // 设置 canvas 尺寸与 video 元素的显示尺寸一致
      this.videoContainer.style.position = "relative";
      Object.assign(this.canvas.style, {
        top: 0,
        left: 0,
        position: "absolute",
        display: "none",
        pointerEvents: "none",
        zIndex: "10",
        // border: '5px solid red'
      });

      // 将 canvas 插入到 video 的父元素中，覆盖在 video 上
      this.videoContainer?.appendChild(this.canvas);
    }
  }

  private configureCanvas(
    rotateType: number,
    width: number,
    height: number
  ): void {
    // 交换宽高并清空画布
    if (rotateType === 1) {
      this.canvas.width = height;
      this.canvas.height = width;
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.context.translate(0, this.canvas.height);
      this.context.rotate(-Math.PI / 2); // 270度旋转
    } else {
      // 恢复到正常状态
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // 如果旋转类型已设置，交换宽高
      if (this.rotateType) {
        [this.canvas.width, this.canvas.height] = [height, width];
      }

      this.context.setTransform(1, 0, 0, 1, 0, 0); // 恢复坐标系
    }

    this.rotateType = rotateType;
  }

  /**
   * 旋转截图
   * @param rotateType 0:竖屏 1:横屏
   */
  public setScreenshotrotateType(rotateType: 0 | 1 = 0) {
    // 创建一个临时画布
    const tempCanvas = document.createElement("canvas");
    const tempContext = tempCanvas.getContext("2d") as CanvasRenderingContext2D;

    // 设置临时画布的尺寸为当前画布尺寸
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;

    // 将当前画布内容绘制到临时画布
    tempContext.drawImage(this.canvas, 0, 0);

    // 配置画布的旋转和尺寸
    this.configureCanvas(rotateType, tempCanvas.width, tempCanvas.height);

    // 将临时画布的内容绘制到旋转后的画布
    this.context.drawImage(tempCanvas, 0, 0);

    // 释放临时画布
    tempCanvas.width = 0;
    tempCanvas.height = 0;
  }

  /**
   * 截图并绘制在 canvas 上
   * @param rotateType 0:竖屏 1:横屏
   */
  public takeScreenshot(rotateType: number = 0) {
    this.rotateType = rotateType;

    this.video = this.videoContainer?.querySelector(
      "video"
    ) as HTMLVideoElement;
    if (this.context && this.video) {
      const { offsetTop, offsetLeft, offsetWidth, offsetHeight } = this.video;

      Object.assign(this.canvas, {
        top: `${offsetTop}px`,
        left: `${offsetLeft}px`,
        width: offsetWidth,
        height: offsetHeight,
      });
      // 清空 canvas
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // 保存当前状态
      this.context.save();

      // 配置画布的旋转和尺寸
      this.configureCanvas(rotateType, offsetWidth, offsetHeight);

      // 使用 video 的显示尺寸绘制截图
      this.context.drawImage(this.video, 0, 0, offsetWidth, offsetHeight);

      // 恢复画布状态
      this.context.restore();
    } else {
      console.log("视频未准备好或加载失败");
    }
  }

  public resizeScreenshot(width: number, height: number) {
    if (this.canvas && this.context) {
      // 保存旧的截图
      const imageData = this.context.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

      // 创建一个临时 canvas
      const tempCanvas = document.createElement("canvas");
      const tempContext = tempCanvas.getContext("2d");

      // 计算保持宽高比
      const aspectRatio = imageData.width / imageData.height;
      let newWidth, newHeight;

      if (width / height > aspectRatio) {
        newWidth = height * aspectRatio;
        newHeight = height;
      } else {
        newWidth = width;
        newHeight = width / aspectRatio;
      }

      // 设置临时 canvas 尺寸
      tempCanvas.width = newWidth;
      tempCanvas.height = newHeight;

      // 将旧截图绘制到临时 canvas
      tempContext?.drawImage(
        this.canvas,
        0,
        0,
        imageData.width,
        imageData.height,
        0,
        0,
        newWidth,
        newHeight
      );

      // 清空当前 canvas 并调整尺寸
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.clearRect(0, 0, width, height);

      // 将调整后的图像绘制到当前 canvas 中
      this.context.drawImage(
        tempCanvas,
        0,
        0,
        newWidth,
        newHeight,
        0,
        0,
        width,
        height
      );
    } else {
      console.log("Canvas or context is not initialized.");
    }
  }

  // 清除 canvas 覆盖
  public clearScreenShot() {
    if (this.context) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  public showScreenShot() {
    if (this.canvas) {
      this.canvas.style.display = "block";
    }
  }
  public hideScreenShot() {
    if (this.canvas) {
      this.canvas.style.display = "none";
    }
  }
  // 销毁类的实例
  public destroy() {
    // 清除 canvas
    this.clearScreenShot();

    // 从 videoContainer 中移除 canvas
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.videoContainer.style.position = "";
    // 释放引用
    this.videoContainer = null as any;
    this.video = null as any;
    this.canvas = null as any;
    this.context = null as any;
  }
}
