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
 * Called when stream dimensions are known. Does two things:
 * 1. Stores dimensions so ResizeObserver can keep container sized correctly
 * 2. Sizes the container to match stream AR, centered in parent
 *
 * We do NOT touch the <video> element — SDK owns it.
 * SDK renderMode=0 (HIDDEN/fill) will fill the container we give it.
 */
export function fitVideoToContainer(
  containerId: string,
  streamWidth: number,
  streamHeight: number
) {
  const container = document.getElementById(containerId);
  if (!container || !streamWidth || !streamHeight) return;

  (container as any)._sw = streamWidth;
  (container as any)._sh = streamHeight;

  const parent = container.parentElement;
  if (!parent) return;

  const resize = () => {
    const sw: number = (container as any)._sw || streamWidth;
    const sh: number = (container as any)._sh || streamHeight;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    if (!pw || !ph) return;

    const sr = sw / sh;
    const pr = pw / ph;
    let w: number, h: number;
    if (sr > pr) { w = pw; h = pw / sr; }
    else         { h = ph; w = ph * sr; }

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

export function removeVideoContainer(containerId: string) {
  cleanups.get(containerId)?.();
  cleanups.delete(containerId);
  document.getElementById(containerId)?.remove();
}
