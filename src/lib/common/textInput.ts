/** JS KeyboardEvent.key → Android KeyCode */
const KEY_TO_ANDROID: Record<string, number> = {
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Enter: 66,
  Backspace: 67,
};

interface InputPayload {
  action: number;
  touchType: "input" | "inputBox";
  keyCode: number;
  text: string;
}

interface RtcContext {
  readonly initDomId: string;
  readonly remoteUserId: string;
  readonly masterIdPrefix?: string;
  inputElement: HTMLTextAreaElement | null;
  readonly options?: { clientId?: string };
  sendUserMessage: (...args: unknown[]) => void;
}

/**
 * Attach a hidden textarea to the RTC container that forwards keyboard
 * and IME input to the remote device.
 *
 * @param rtc    - RTC instance that owns the container and send method.
 * @param isP2p  - When `true`, omits the userId argument from sendUserMessage.
 */
export const addInputElement = (rtc: unknown, isP2p = false): void => {
  const ctx = rtc as RtcContext;
  const container = document.getElementById(ctx.initDomId);
  if (!container) return;

  const el = document.createElement("textarea") as HTMLTextAreaElement;
  el.autocomplete = "off";
  el.id = `${ctx.masterIdPrefix ?? ""}_${ctx.remoteUserId}_inputEle`;
  el.className = "play-text-input";
  el.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    opacity: 0.01;
    width: 100%;
    max-width: 95%;
    height: 40px;
    resize: none;
    overflow: hidden;
  `;

  ctx.inputElement = el;

  const userId = ctx.options?.clientId;
  const send = (payload: InputPayload): void => {
    const json = JSON.stringify(payload);
    isP2p
      ? ctx.sendUserMessage(json)
      : ctx.sendUserMessage(userId, json);
  };

  let isComposing = false;

  el.addEventListener("compositionstart", () => { isComposing = true; });

  el.addEventListener("compositionend", (e: Event) => {
    isComposing = false;
    send({ action: 1, touchType: "inputBox", keyCode: 1, text: (e.target as HTMLInputElement).value });
    el.value = "";
  });

  el.addEventListener("input", (e: Event) => {
    if (isComposing) return;
    send({ action: 1, touchType: "inputBox", keyCode: 1, text: (e.target as HTMLInputElement).value });
    el.value = "";
  });

  el.addEventListener("keydown", (e: KeyboardEvent) => {
    const code = KEY_TO_ANDROID[e.key];
    if (code === undefined) return;
    if (e.key === "Enter") el.blur();
    send({ action: 1, touchType: "input", keyCode: code, text: "" });
    send({ action: 0, touchType: "input", keyCode: code, text: "" });
  });

  container.style.position = "relative";
  container.appendChild(el);
};
