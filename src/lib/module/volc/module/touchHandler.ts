import type { TouchInfo } from "../../../types/index";
import { generateTouchCoord } from "../../../common/mixins";
import { isMobile, isTouchDevice } from "../../../utils/index";

export interface TouchState {
  hasPushDown: boolean;
  touchConfig: any;
  touchInfo: TouchInfo;
  rotateType: number;
  remoteResolution: { width: number; height: number };
  options: any;
  inputElement: HTMLInputElement | null;
  roomMessage: any;
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

  // Cache rect — chỉ update khi resize, không gọi trong mỗi event
  let cachedRect = videoDom.getBoundingClientRect();
  const updateRect = () => { cachedRect = videoDom.getBoundingClientRect(); };
  const resizeObserver = new ResizeObserver(updateRect);
  resizeObserver.observe(videoDom);
  window.addEventListener("scroll", updateRect, { passive: true });

  // Throttle mousemove bằng requestAnimationFrame — tối đa 1 msg/frame (~16ms)
  let rafPending = false;
  let pendingMoveMsg: string | null = null;

  const flushMove = () => {
    rafPending = false;
    if (pendingMoveMsg) {
      sendMessage(userId, pendingMoveMsg);
      pendingMoveMsg = null;
    }
  };

  if (state.options.disableContextMenu) {
    videoDom.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  videoDom.addEventListener("wheel", (e: WheelEvent) => {
    if (state.options.disable) return;
    const { offsetX, offsetY, deltaY } = e;
    sendMessage(userId, JSON.stringify({
      coords: [{ pressure: 1.0, size: 1.0, x: offsetX, y: offsetY }],
      widthPixels: videoDom.clientWidth,
      heightPixels: videoDom.clientHeight,
      pointCount: 1,
      properties: [{ id: 0, toolType: 1 }],
      touchType: "gestureSwipe",
      swipe: deltaY > 0 ? -1 : 1,
    }));
  }, { passive: true });

  videoDom.addEventListener("mouseleave", (e: any) => {
    e.preventDefault();
    if (state.options.disable || !state.hasPushDown) return;
    state.touchConfig.action = 1;
    sendMessage(userId, JSON.stringify(state.touchConfig));
  });

  videoDom.addEventListener(eventTypeStart, (e: any) => {
    e.preventDefault();
    if (state.options.disable) return;
    state.hasPushDown = true;
    updateRect(); // refresh rect khi bắt đầu touch

    const { allowLocalIMEInCloud, keyboard } = state.options;
    const { inputStateIsOpen } = state.roomMessage;
    const shouldHandleFocus =
      (allowLocalIMEInCloud && keyboard === "pad") || keyboard === "local";
    if (state.inputElement && shouldHandleFocus && typeof inputStateIsOpen === "boolean") {
      inputStateIsOpen ? state.inputElement.focus() : state.inputElement.blur();
    }

    state.touchInfo = generateTouchCoord();
    const rect = cachedRect;
    state.touchConfig.properties = [];
    state.touchConfig.coords = [];

    const touchCount = isMobileFlag ? e?.touches?.length : 1;
    state.touchConfig.action = 0;
    state.touchConfig.pointCount = touchCount;

    const bigSide   = Math.max(videoDom.clientWidth, videoDom.clientHeight);
    const smallSide = Math.min(videoDom.clientWidth, videoDom.clientHeight);

    state.touchConfig.widthPixels  = state.rotateType == 1 ? bigSide : smallSide;
    state.touchConfig.heightPixels = state.rotateType == 1 ? smallSide : bigSide;

    if (state.rotateType == 1 && state.remoteResolution.height > state.remoteResolution.width) {
      state.touchConfig.widthPixels  = smallSide;
      state.touchConfig.heightPixels = bigSide;
    } else if (state.rotateType == 0 && state.remoteResolution.width > state.remoteResolution.height) {
      state.touchConfig.widthPixels  = bigSide;
      state.touchConfig.heightPixels = smallSide;
    }

    for (let i = 0; i < touchCount; i++) {
      const touch = isMobileFlag ? e.touches[i] : e;
      state.touchConfig.properties[i] = { id: i, toolType: 1 };
      let x = touch.offsetX;
      let y = touch.offsetY;
      if (x == undefined) {
        x = touch.clientX - rect.left;
        y = touch.clientY - rect.top;
        if (state.rotateType == 1 && state.remoteResolution.height > state.remoteResolution.width) {
          x = rect.bottom - touch.clientY;
          y = touch.clientX - rect.left;
        } else if (state.rotateType == 0 && state.remoteResolution.width > state.remoteResolution.height) {
          x = touch.clientY - rect.top;
          y = rect.right - touch.clientX;
        }
      }
      state.touchConfig.coords.push({ ...state.touchInfo, orientation: 0.01 * Math.random(), x, y });
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

  videoDom.addEventListener(eventTypeMove, (e: any) => {
    e.preventDefault();
    if (state.options.disable || !state.hasPushDown) return;

    const rect = cachedRect; // dùng cached, không gọi getBoundingClientRect()
    const touchCount = isMobileFlag ? e?.touches?.length : 1;
    state.touchConfig.action = 2;
    state.touchConfig.pointCount = touchCount;
    const coords: any[] = [];

    for (let i = 0; i < touchCount; i++) {
      const touch = isMobileFlag ? e.touches[i] : e;
      state.touchConfig.properties[i] = { id: i, toolType: 1 };
      let x = touch.offsetX;
      let y = touch.offsetY;
      if (x == undefined) {
        x = touch.clientX - rect.left;
        y = touch.clientY - rect.top;
        if (state.rotateType == 1 && state.remoteResolution.height > state.remoteResolution.width) {
          x = rect.bottom - touch.clientY;
          y = touch.clientX - rect.left;
        } else if (state.rotateType == 0 && state.remoteResolution.width > state.remoteResolution.height) {
          x = touch.clientY - rect.top;
          y = rect.right - touch.clientX;
        }
      }
      coords.push({ ...state.touchInfo, orientation: 0.01 * Math.random(), x, y });
    }
    state.touchConfig.coords = coords;

    // Throttle bằng rAF — chỉ gửi 1 msg/frame, bỏ các frame trung gian
    pendingMoveMsg = JSON.stringify({
      action: 2,
      widthPixels: state.touchConfig.widthPixels,
      heightPixels: state.touchConfig.heightPixels,
      pointCount: touchCount,
      touchType: "gesture",
      properties: state.touchConfig.properties,
      coords,
    });
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(flushMove);
    }
  });

  videoDom.addEventListener(eventTypeEnd, (e: any) => {
    e.preventDefault();
    if (state.options.disable) return;
    state.hasPushDown = false;
    // Flush bất kỳ move pending nào trước khi gửi end
    if (pendingMoveMsg) {
      sendMessage(userId, pendingMoveMsg);
      pendingMoveMsg = null;
      rafPending = false;
    }
    if (isMobileFlag) {
      if (e.touches.length === 0) {
        state.touchConfig.action = 1;
        sendMessage(userId, JSON.stringify(state.touchConfig));
      }
    } else {
      state.touchConfig.action = 1;
      sendMessage(userId, JSON.stringify(state.touchConfig));
    }
  });
}
