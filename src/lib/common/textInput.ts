const keyCodeMap: Record<string, number> = {
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Enter: 66,
  Backspace: 67,
};

const jsToAndroidKeyCodeMap: Record<number, number> = {
  8: 67, // Backspace
  9: 61, // Tab
  13: 66, // Enter
  16: 59, // Shift (Left Shift Key)
  17: 57, // Control (Left Control Key)
  18: 56, // Alt (Left Alt Key)
  19: 121, // Pause/Break
  20: 115, // Caps Lock
  27: 111, // Escape
  32: 62, // Space
  37: 21, // Left Arrow
  38: 19, // Up Arrow
  39: 22, // Right Arrow
  40: 20, // Down Arrow
  45: 124, // Insert
  46: 112, // Delete
  48: 7, // 0
  49: 8, // 1
  50: 9, // 2
  51: 10, // 3
  52: 11, // 4
  53: 12, // 5
  54: 13, // 6
  55: 14, // 7
  56: 15, // 8
  57: 16, // 9
  65: 29, // A
  66: 30, // B
  67: 31, // C
  68: 32, // D
  69: 33, // E
  70: 34, // F
  71: 35, // G
  72: 36, // H
  73: 37, // I
  74: 38, // J
  75: 39, // K
  76: 40, // L
  77: 41, // M
  78: 42, // N
  79: 43, // O
  80: 44, // P
  81: 45, // Q
  82: 46, // R
  83: 47, // S
  84: 48, // T
  85: 49, // U
  86: 50, // V
  87: 51, // W
  88: 52, // X
  89: 53, // Y
  90: 54, // Z
  91: 117, // Windows/Meta
  93: 82, // Context Menu
  96: 144, // Numpad 0
  97: 145, // Numpad 1
  98: 146, // Numpad 2
  99: 147, // Numpad 3
  100: 148, // Numpad 4
  101: 149, // Numpad 5
  102: 150, // Numpad 6
  103: 151, // Numpad 7
  104: 152, // Numpad 8
  105: 153, // Numpad 9
  106: 155, // Multiply
  107: 157, // Add
  109: 156, // Subtract
  110: 158, // Decimal
  111: 154, // Divide
  112: 131, // F1
  113: 132, // F2
  114: 133, // F3
  115: 134, // F4
  116: 135, // F5
  117: 136, // F6
  118: 137, // F7
  119: 138, // F8
  120: 139, // F9
  121: 140, // F10
  122: 141, // F11
  123: 142, // F12
  144: 143, // Num Lock
  145: 116, // Scroll Lock
};

export const addInputElement = (rtc: any, isP2p?: boolean) => {
  const container = document.getElementById(rtc.initDomId);
  if (!container) return; // 容器不存在直接返回（保持最小影响）

  // 创建并配置 input
  const el = (rtc.inputElement = document.createElement(
    "textarea"
  ) as HTMLTextAreaElement);
  el.autocomplete = "off";
  el.id = `${rtc.masterIdPrefix || ""}_${rtc.remoteUserId}_inputEle`;
  el.className = "play-text-input";
  el.style.cssText = `
      position:absolute;
      top:0;
      left:0;
      pointer-events:none;
      opacity:0.01;
      width:100%;
      max-width:95%;
      height: 40px;
      resize: none;
      overflow: hidden;
  `;


  const userId = rtc?.options?.clientId;
  const sendRaw = (json: string) =>
    isP2p ? rtc.sendUserMessage(json) : rtc.sendUserMessage(userId, json);

  const send = (payload: {
    action: number;
    touchType: "input" | "inputBox";
    keyCode: number;
    text: string;
  }) => sendRaw(JSON.stringify(payload));

  // IME 组合输入标记
  let isComposing = false;

  // ---- 事件绑定 ----
  el.addEventListener("compositionstart", () => {
    isComposing = true;
  });

  el.addEventListener("compositionend", (e: Event) => {
    isComposing = false;
    const target = e.target as HTMLInputElement;
    send({
      action: 1,
      touchType: "inputBox",
      keyCode: 1,
      text: target.value,
    });
    el.value = "";
  });

  el.addEventListener("input", (e: Event) => {
    if (isComposing) return;
    const target = e.target as HTMLInputElement;
    send({
      action: 1,
      touchType: "inputBox",
      keyCode: 1,
      text: target.value,
    });
    el.value = "";
  });

  el.addEventListener("keydown", (e: KeyboardEvent) => {
    const code = keyCodeMap?.[e.key];
    if (code === undefined) return;

    // 与原顺序一致：如果按下 Enter，先失焦
    if (e.key === "Enter") el.blur();

    console.log("code", code);
    // 按下
    send({
      action: 1,
      touchType: "input",
      keyCode: code,
      text: "",
    });

    // 抬起
    send({
      action: 0,
      touchType: "input",
      keyCode: code,
      text: "",
    });
  });

  // 添加到容器
  container.appendChild(el);
  container.style.position = "relative";

};
