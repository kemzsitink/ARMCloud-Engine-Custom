export function setViewSize(
  initDomId: string,
  videoDomId: string,
  width: number,
  height: number,
  rotateType: 0 | 1 = 0
) {
  const h5Dom = document.getElementById(initDomId) as HTMLDivElement | null;
  const videoDom = document.getElementById(videoDomId) as HTMLDivElement | null;
  if (!h5Dom || !videoDom) return;

  h5Dom.style.width  = width  + "px";
  h5Dom.style.height = height + "px";

  if (rotateType === 1) {
    videoDom.style.width  = height + "px";
    videoDom.style.height = width  + "px";
  } else {
    videoDom.style.width  = width  + "px";
    videoDom.style.height = height + "px";
  }
}
