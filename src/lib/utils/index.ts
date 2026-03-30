import copy from "clipboard-copy";

/** Read a Blob as UTF-8 text. */
export const blobToText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read blob as text"));
    reader.readAsText(blob);
  });

/** Decode an ArrayBuffer to a UTF-8 string. */
export const arrayBufferToText = (buffer: ArrayBuffer): string =>
  new TextDecoder("utf-8").decode(buffer);

export type BinaryKind = "ArrayBuffer" | "Blob" | "String";

/** Return the runtime kind of a binary input. */
export const checkType = (input: ArrayBuffer | Blob | string): BinaryKind => {
  if (input instanceof ArrayBuffer) return "ArrayBuffer";
  if (input instanceof Blob) return "Blob";
  return "String";
};

/** Returns `true` when running on a mobile user-agent. */
export const isMobile = (): boolean =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile\//i.test(
    navigator.userAgent
  );

/** Returns `true` when the device supports touch events. */
export const isTouchDevice = (): boolean =>
  "ontouchstart" in document.documentElement;

/** Resolves on the next animation frame. */
export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Wait for a style mutation to be applied to an element.
 * Forces a reflow then waits one frame.
 */
export const waitStyleApplied = async (el: HTMLElement): Promise<void> => {
  void el.offsetWidth;
  await nextFrame();
};

/**
 * Returns a debounced version of `fn`.
 * Resets the timer on every call within the `delay` window.
 */
export const debounce = <T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

/** Copy `text` to the system clipboard. */
export const copyText = (text: string): Promise<void> => copy(text);
