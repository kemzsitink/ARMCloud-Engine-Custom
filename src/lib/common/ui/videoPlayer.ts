const cleanups = new Map<string, () => void>();

export function createVideoContainer(parentId: string, containerId: string): HTMLDivElement | null {
  const parent = document.getElementById(parentId);
  if (!parent) return null;

  const div = document.createElement("div");
  div.id = containerId;
  Object.assign(div.style, {
    width: "100%",
    height: "100%",
    position: "relative",
    background: "#000",
    overflow: "hidden",
  });
  parent.appendChild(div);
  return div;
}

/**
 * Size the container to match the stream's aspect ratio, centered in parent.
 * SDK renderMode=0 (HIDDEN/fill) will fill the container we give it.
 * ResizeObserver keeps the sizing correct on every browser resize.
 */
export function fitVideoToContainer(
  containerId: string,
  streamWidth: number,
  streamHeight: number
): void {
  const container = document.getElementById(containerId);
  if (!container || streamWidth <= 0 || streamHeight <= 0) return;

  const parent = container.parentElement;
  if (!parent) return;

  // Store on element so ResizeObserver can access updated values
  (container as HTMLDivElement & { _sw: number; _sh: number })._sw = streamWidth;
  (container as HTMLDivElement & { _sw: number; _sh: number })._sh = streamHeight;

  const resize = () => {
    const el = container as HTMLDivElement & { _sw: number; _sh: number };
    const sw = el._sw;
    const sh = el._sh;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    if (!pw || !ph) return;

    const sr = sw / sh;
    const pr = pw / ph;
    const w = sr > pr ? pw       : ph * sr;
    const h = sr > pr ? pw / sr  : ph;

    container.style.width  = `${Math.round(w)}px`;
    container.style.height = `${Math.round(h)}px`;
  };

  resize();

  cleanups.get(containerId)?.();
  const ro = new ResizeObserver(resize);
  ro.observe(parent);
  cleanups.set(containerId, () => ro.disconnect());
}

export function getRenderDom(containerId: string): HTMLDivElement | null {
  return document.getElementById(containerId) as HTMLDivElement | null;
}

export function removeVideoContainer(containerId: string): void {
  cleanups.get(containerId)?.();
  cleanups.delete(containerId);
  document.getElementById(containerId)?.remove();
}
