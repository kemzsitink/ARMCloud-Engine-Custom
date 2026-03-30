import copy from 'clipboard-copy'

export const blobToText = (blob: Blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result); // 读取结果为文本
    };
    reader.onerror = () => {
      reject(new Error("Failed to read blob as text"));
    };
    reader.readAsText(blob); // 读取 Blob 为文本
  });
};

export const arrayBufferToText = (buffer: ArrayBuffer) => {
  if (typeof TextDecoder !== "undefined") {
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(buffer);
  } else {
    return String.fromCharCode.apply(null, new Uint8Array(buffer) as any);
  }
};

export const checkType = (input: Blob | ArrayBuffer | String) => {
  if (input instanceof ArrayBuffer) {
    return "ArrayBuffer";
  } else if (input instanceof Blob) {
    return "Blob";
  } else {
    return "String";
  }
};
/** 判断是否是手机 */

export const isMobile = () => {
  const flag =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile\//i.test(
      // eslint-disable-next-line comma-dangle
      navigator.userAgent
    );
  return flag;
};

export const isTouchDevice = () =>
  !!("ontouchstart" in document.documentElement);

export const waitStyleApplied = async (el: HTMLElement): Promise<void> => {
  void el.offsetWidth;
  await nextFrame();
};

export const nextFrame = (): Promise<void> => {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
};

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
) {
  let timer: ReturnType<typeof setTimeout> | null = null

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (timer) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

export const copyText = (text: string) => {
  return copy(text)
}