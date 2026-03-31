import type { TouchInfo } from "../../types/index";
import { generateTouchCoord } from "../utils/mixins";
import { isMobile, isTouchDevice } from "../../utils/index";

interface TouchCoord {
  id: number;
  toolType: number;
}

interface TouchPoint {
  x: number;
  y: number;
  orientation: number;
  pressure?: number;
  size?: number;
  touchMajor?: number;
  touchMinor?: number;
  toolMajor?: number;
  toolMinor?: number;
}

interface TouchMessage {
  action: number;
  widthPixels: number;
  heightPixels: number;
  pointCount: number;
  touchType: string;
  properties: TouchCoord[];
  coords: TouchPoint[];
}

export interface TouchState {
  hasPushDown: boolean;
  touchConfig: TouchMessage;
  touchInfo: TouchInfo;
  rotateType: number;
  remoteResolution: { width: number; height: number };
  options: Record<string, unknown> | null;
  inputElement: HTMLInputElement | null;
  roomMessage: { inputStateIsOpen?: boolean };
}

export function bindTouchEvents(
  videoDom: HTMLElement,
  userId: string,
  state: TouchState,
  sendMessage: (userId: string, msg: string) => void
) {
  const isMobileFlag = isTouchDevice() || isMobile();
  const eventTypeStart = isMobileFlag ? "touchstart" : "mousedown";
  const eventTypeMove  = isMobileFlag ? "touchmove"  : "mousemove";
  const eventTypeEnd   = isMobileFlag ? "touchend"   : "mouseup";

  let cachedRect = videoDom.getBoundingClientRect();
  const updateRect = () => { cachedRect = videoDom.getBoundingClientRect(); };
  new ResizeObserver(updateRect).observe(videoDom);
  window.addEventListener("scroll", updateRect, { passive: true });

  const ORIENTATION = 0.005;

  const moveMsg: TouchMessage = {
    action: 2,
    widthPixels: 0,
    heightPixels: 0,
    pointCount: 1,
    touchType: "gesture",
    properties: [],
    coords: [],
  };

  if (state.options?.disableContextMenu) {
    videoDom.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  const getCoords = (touch: Touch | MouseEvent, rect: DOMRect): { x: number; y: number } => {
    let x: number;
    let y: number;
    if ("offsetX" in touch) {
      x = (touch as MouseEvent).offsetX;
      y = (touch as MouseEvent).offsetY;
    } else {
      x = (touch as Touch).clientX - rect.left;
      y = (touch as Touch).clientY - rect.top;
    }
    return {
      x: Math.max(0, Math.min(x, rect.width)),
      y: Math.max(0, Math.min(y, rect.height)),
    };
  };

  videoDom.addEventListener("wheel", (e: WheelEvent) => {
    if (state.options?.disable) return;
    sendMessage(userId, JSON.stringify({
      coords: [{ pressure: 1.0, size: 1.0, x: e.offsetX, y: e.offsetY }],
      widthPixels: videoDom.clientWidth,
      heightPixels: videoDom.clientHeight,
      pointCount: 1,
      properties: [{ id: 0, toolType: 1 }],
      touchType: "gestureSwipe",
      swipe: e.deltaY > 0 ? -1 : 1,
    }));
  }, { passive: true });

  videoDom.addEventListener("mouseleave", (e: MouseEvent) => {
    e.preventDefault();
    if (state.options?.disable || !state.hasPushDown) return;
    state.touchConfig.action = 1;
    sendMessage(userId, JSON.stringify(state.touchConfig));
  });

  videoDom.addEventListener(eventTypeStart, (e: Event) => {
    e.preventDefault();
    if (state.options?.disable) return;
    state.hasPushDown = true;
    updateRect();

    const { allowLocalIMEInCloud, keyboard } = state.options as Record<string, unknown>;
    const { inputStateIsOpen } = state.roomMessage;
    const shouldHandleFocus =
      (allowLocalIMEInCloud && keyboard === "pad") || keyboard === "local";
    if (state.inputElement && shouldHandleFocus && typeof inputStateIsOpen === "boolean") {
      inputStateIsOpen ? state.inputElement.focus() : state.inputElement.blur();
    }

    state.touchInfo = generateTouchCoord();
    const rect = cachedRect;
    const touchEvent = e as TouchEvent | MouseEvent;
    const touchCount = isMobileFlag ? (touchEvent as TouchEvent).touches?.length ?? 1 : 1;

    state.touchConfig.action = 0;
    state.touchConfig.pointCount = touchCount;
    state.touchConfig.widthPixels  = videoDom.clientWidth;
    state.touchConfig.heightPixels = videoDom.clientHeight;
    state.touchConfig.properties = [];
    state.touchConfig.coords = [];

    for (let i = 0; i < touchCount; i++) {
      const touch = isMobileFlag
        ? (touchEvent as TouchEvent).touches[i]
        : (touchEvent as MouseEvent);
      state.touchConfig.properties[i] = { id: i, toolType: 1 };
      const { x, y } = getCoords(touch, rect);
      state.touchConfig.coords.push({ ...state.touchInfo, orientation: ORIENTATION, x, y });
    }

    sendMessage(userId, JSON.stringify({
      action: touchCount > 1 ? 261 : 0,
      widthPixels: state.touchConfig.widthPixels,
      heightPixels: state.touchConfig.heightPixels,
      pointCount: touchCount,
      touchType: "gesture",
      properties: state.touchConfig.properties,
      coords: state.touchConfig.coords,
    }));
  });

  videoDom.addEventListener(eventTypeMove, (e: Event) => {
    e.preventDefault();
    if (state.options?.disable || !state.hasPushDown) return;

    const rect = cachedRect;
    const touchEvent = e as TouchEvent | MouseEvent;
    const touchCount = isMobileFlag ? (touchEvent as TouchEvent).touches?.length ?? 1 : 1;

    if (moveMsg.properties.length !== touchCount) {
      moveMsg.properties = Array.from({ length: touchCount }, (_, i) => ({ id: i, toolType: 1 }));
      moveMsg.coords = Array.from({ length: touchCount }, () => ({
        x: 0, y: 0, orientation: ORIENTATION,
      }));
    }

    moveMsg.widthPixels  = state.touchConfig.widthPixels;
    moveMsg.heightPixels = state.touchConfig.heightPixels;
    moveMsg.pointCount   = touchCount;

    for (let i = 0; i < touchCount; i++) {
      const touch = isMobileFlag
        ? (touchEvent as TouchEvent).touches[i]
        : (touchEvent as MouseEvent);
      moveMsg.properties[i].id = i;
      const { x, y } = getCoords(touch, rect);
      moveMsg.coords[i].x = x;
      moveMsg.coords[i].y = y;
      moveMsg.coords[i].orientation = ORIENTATION;
    }

    state.touchConfig.coords = moveMsg.coords.map((c) => ({ ...c }));
    sendMessage(userId, JSON.stringify(moveMsg));
  });

  videoDom.addEventListener(eventTypeEnd, (e: Event) => {
    e.preventDefault();
    if (state.options?.disable) return;
    state.hasPushDown = false;
    const touchEvent = e as TouchEvent;
    if (isMobileFlag) {
      if (touchEvent.touches.length === 0) {
        state.touchConfig.action = 1;
        sendMessage(userId, JSON.stringify(state.touchConfig));
      }
    } else {
      state.touchConfig.action = 1;
      sendMessage(userId, JSON.stringify(state.touchConfig));
    }
  });
}
