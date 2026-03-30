/** Overlay a canvas on top of a video element for screenshot capture. */
export default class ScreenshotOverlay {
  private readonly container: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  private rotateType: 0 | 1;

  constructor(container: HTMLDivElement, rotateType: number = 0) {
    this.container = container;
    this.rotateType = (rotateType === 1 ? 1 : 0) as 0 | 1;
    this.video = this.queryVideo();
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    this.mountCanvas();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private queryVideo(): HTMLVideoElement {
    return this.container.querySelector("video") as HTMLVideoElement;
  }

  private mountCanvas(): void {
    this.container.style.position = "relative";
    Object.assign(this.canvas.style, {
      position: "absolute",
      top: "0",
      left: "0",
      display: "none",
      pointerEvents: "none",
      zIndex: "10",
    });
    this.container.appendChild(this.canvas);
  }

  /**
   * Resize the canvas and apply a rotation transform when needed.
   * Landscape (rotateType=1) rotates the canvas 90° counter-clockwise.
   */
  private applyRotation(rotateType: 0 | 1, w: number, h: number): void {
    if (rotateType === 1) {
      this.canvas.width = h;
      this.canvas.height = w;
      this.ctx.clearRect(0, 0, h, w);
      this.ctx.translate(0, this.canvas.height);
      this.ctx.rotate(-Math.PI / 2);
    } else {
      this.canvas.width = this.rotateType === 1 ? h : w;
      this.canvas.height = this.rotateType === 1 ? w : h;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.rotateType = rotateType;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Rotate an already-captured screenshot without re-capturing. */
  setScreenshotrotateType(rotateType: number = 0): void {
    const rt = (rotateType === 1 ? 1 : 0) as 0 | 1;
    const temp = document.createElement("canvas");
    const tempCtx = temp.getContext("2d") as CanvasRenderingContext2D;
    temp.width = this.canvas.width;
    temp.height = this.canvas.height;
    tempCtx.drawImage(this.canvas, 0, 0);

    this.applyRotation(rt, temp.width, temp.height);
    this.ctx.drawImage(temp, 0, 0);

    temp.width = 0;
    temp.height = 0;
  }

  /** Capture the current video frame onto the canvas. */
  takeScreenshot(rotateType: number = 0): void {
    const rt = (rotateType === 1 ? 1 : 0) as 0 | 1;
    this.video = this.queryVideo();
    if (!this.ctx || !this.video) return;

    const { offsetWidth: w, offsetHeight: h } = this.video;
    this.ctx.save();
    this.applyRotation(rt, w, h);
    this.ctx.drawImage(this.video, 0, 0, w, h);
    this.ctx.restore();
  }

  /** Resize the captured screenshot to fit within `width × height`. */
  resizeScreenshot(width: number, height: number): void {
    if (!this.ctx) return;

    const srcW = this.canvas.width;
    const srcH = this.canvas.height;
    const ratio = srcW / srcH;

    const [dstW, dstH] =
      width / height > ratio
        ? [height * ratio, height]
        : [width, width / ratio];

    const temp = document.createElement("canvas");
    const tempCtx = temp.getContext("2d") as CanvasRenderingContext2D;
    temp.width = dstW;
    temp.height = dstH;
    tempCtx.drawImage(this.canvas, 0, 0, srcW, srcH, 0, 0, dstW, dstH);

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(temp, 0, 0, dstW, dstH, 0, 0, width, height);
  }

  clearScreenShot(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  showScreenShot(): void {
    this.canvas.style.display = "block";
  }

  hideScreenShot(): void {
    this.canvas.style.display = "none";
  }

  /** Save the current canvas content as a local PNG download. */
  saveToLocal(filename = "screenshot"): Promise<ImageData> {
    return new Promise((resolve) => {
      const imageData = this.ctx.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
      const link = document.createElement("a");
      link.download = `${filename}.png`;
      this.canvas.toBlob((blob) => {
        if (!blob) return;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      });
      resolve(imageData);
    });
  }

  /** Remove the canvas from the DOM and release all references. */
  destroy(): void {
    this.clearScreenShot();
    this.canvas.parentNode?.removeChild(this.canvas);
    this.container.style.position = "";
  }
}
