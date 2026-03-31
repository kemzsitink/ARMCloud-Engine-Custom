import type {
    CustomDefinition,
    ArmcloudRtcOptions,
    ArmcloudCallbacks,
    EquipmentInfoEvent,
    AdbOutputEvent,
    ConnectionStateCode,
} from "../../types/index";
import { KeyboardMode } from "../../types/index";
import {
    EquipmentInfoType,
    InjectStreamStatusType,
    MediaDeviceType,
    AndroidKeyCode,
    RotateDirection,
} from "../../types/index";
import { CloudGamingWebSDK, type AndroidInstance } from "./core/index";
import CreateDataChannel, { EventType } from "./module/createDataChannel";
import { isMobile, isTouchDevice, waitStyleApplied } from "../../utils/index";
import axios from "axios";
import {
    TouchType,
    MediaType,
    MessageKey,
    SdkEventType,
} from "../../types/webrtcType";
import {
    getResolution,
    getFps,
    getKbps,
    type ResolutionId,
    type BitrateId,
    type FramerateId,
} from "./config/streamProfiles";

interface PromiseResolver<T = unknown> {
    resolve: ((result: T) => void) | null;
}

interface PromiseMap {
    streamStatus: PromiseResolver;
    injectStatus: PromiseResolver;
}

interface RemoteInputState {
    isOpen: boolean;
    imeOptions: string;
}

interface ConnectFailResponse {
    code: number;
    msg?: string;
}

interface ConfigurationChangeResponse {
    screen_config: {
        orientation: "landscape" | "portrait";
        deg: 0 | 90 | 180 | 270;
        width: number;
        height: number;
    };
}

interface VideoStreamConfigResponse {
    width: number;
    height: number;
}

interface AndroidInstanceEventResponse {
    type: string;
    data?: { event_type?: string };
}

interface MediaStats {
    audioStats: {
        packet_lost: number;
        packet_received: number;
        bit_rate: number;
        rtt: number;
        jitter_buffer: number;
        channels: number;
        sample_rate: number;
        concealed_samples: number;
        concealment_events: number;
        codec: string;
    };
    videoStats: {
        width: number;
        height: number;
        packet_lost: number;
        packet_received: number;
        bit_rate: number;
        fps: number;
        edge_rtt: number;
        rtt: number;
        codec: string;
        raw_rtt: number;
    };
}

interface SdkEventResponse {
    type: string;
    data?: {
        code?: number;
        mediaType?: "video" | "audio";
        audioStats?: MediaStats["audioStats"];
        videoStats?: MediaStats["videoStats"];
    };
}

interface InjectVideoOptions {
    fileUrl?: string;
    isLoop?: boolean;
    fileName?: string;
}

interface InjectResult {
    type: string;
    status: string;
    result: unknown;
}

interface StreamStatusResult {
    path?: string;
    status: string;
    type: string;
}

class tcgRtc {
    // 引擎实例
    private TCGSDK: CloudGamingWebSDK;

    // 云机实例
    private androidInstance: AndroidInstance;

    // 视频dom id
    private videoDomId: string = "";

    // 远程用户 ID
    private remoteUserId: string = "";

    // 取消请求
    private abortController: AbortController | null = null;

    // 数据通道
    private dataChannel: CreateDataChannel | null = null;

    // 群控数据通道
    private groupDataChannel: CreateDataChannel | null = null;

    // 注入推流状态
    private isGroupControl: boolean = false;
    private groupPads: Array<string> = [];

    private promiseMap: PromiseMap = {
        streamStatus: { resolve: null },
        injectStatus: { resolve: null },
    };

    // 是否注入摄像头
    private isCameraInject: boolean = false;
    // 是否注入麦克风
    private isMicrophoneInject: boolean = false;

    // 是否注入摄像头
    private enableCamera: boolean = false;
    // 是否注入麦克风
    private enableMicrophone: boolean = false;

    // 摄像头设备 ID
    private videoDeviceId: string = "";
    // 麦克风设备 ID
    private audioDeviceId: string = "";

    // 埋点定时器
    private metricsTimer: ReturnType<typeof setTimeout> | null = null;

    // 输入框元素
    private inputElement: HTMLInputElement | null = null;

    // 旋转方向
    private rotateType: RotateDirection | undefined = undefined;

    // 远端输入框状态
    private remoteInputState: RemoteInputState = {
        isOpen: false,
        imeOptions: "",
    };

    // 上一次推流分辨率大小
    private lastStreamResolution: {
        width: number;
        height: number;
    } = {
            width: 0,
            height: 0,
        };

    // 云机真实分辨率
    private remoteDesktopResolution: {
        width: number;
        height: number;
        orientation: "landscape" | "portrait";
        degree?: 0 | 90 | 180 | 270;
    } = {
            width: 0,
            height: 0,
            orientation: "portrait",
            degree: 0,
        };

    /**
     * 安卓对应回车值
     * go：前往 2
     * search：搜索 3
     * send：发送 4
     * next：下一个 5
     * done：完成 6
     * previous：上一个 7
     */
    private enterkeyhintObj: Record<number, string> = {
        2: "go",
        3: "search",
        4: "send",
        5: "next",
        6: "done",
        7: "previous",
    };

    constructor(
        private initDomId: string,
        private options: ArmcloudRtcOptions,
        private callbacks: ArmcloudCallbacks
    ) {
        this.TCGSDK = new CloudGamingWebSDK();
        this.androidInstance = this.TCGSDK.getAndroidInstance();
        this.enableMicrophone = this.options.enableMicrophone;
        this.enableCamera = this.options.enableCamera;
        this.videoDeviceId = this.options.videoDeviceId || "";
        this.audioDeviceId = this.options.audioDeviceId || "";
        this.remoteUserId = this.options.clientId;
        // 禁用输入法 和 鼠标
        this.TCGSDK.setKMStatus({ keyboard: false, mouse: true });
        // 禁用粘贴
        this.TCGSDK.setPaste(false);
        // 设置视频dom
        this.setupVideoDom();
    }
    private setupVideoDom() {
        const { masterIdPrefix, padCode } = this.options;

        // 生成视频容器ID
        const videoDomId = `${masterIdPrefix}_${padCode}_armcloudVideo`;
        this.videoDomId = videoDomId;

        // 创建视频容器元素
        const videoContainer = document.createElement("div");
        videoContainer.id = videoDomId;
        videoContainer.style.position = "relative";

        // 获取父容器并添加视频容器
        const parentContainer = document.getElementById(this.initDomId);
        if (parentContainer) {
            parentContainer.appendChild(videoContainer);
        } else {
            console.warn(`Parent container with id "${this.initDomId}" not found`);
        }
    }
    /** 获取消息模板 */
    private getMsgTemplate(touchType: TouchType, content: Object) {
        return JSON.stringify({
            touchType,
            content: JSON.stringify(content),
        });
    }
    setMicrophone(val: boolean) {
        this.enableMicrophone = val;
    }
    setCamera(val: boolean) {
        this.enableCamera = val;
    }

    /** 设置摄像头设备 */
    async setVideoDeviceId(val: string) {
        this.videoDeviceId = val;
        if (this.isCameraInject) {
            return this.cameraInject();
        }
    }

    /** 设置麦克风设备 */
    async setAudioDeviceId(val: string) {
        this.audioDeviceId = val;
        if (this.isMicrophoneInject) {
            return this.microphoneInject();
        }
    }

    /** 打开或关闭监控操作 */
    setMonitorOperation(isMonitor: boolean, forwardOff: boolean = true) {
        this.sendUserMessage(
            this.getMsgTemplate(TouchType.EVENT_SDK, {
                type: "operateSwitch",
                isOpen: isMonitor,
            }),
            forwardOff
        );
    }

    /** 触发无操作回收回调函数 */
    triggerRecoveryTimeCallback() { }

    setVideoEncoder(width: number, height: number) {
        this.TCGSDK.setRemoteDesktopResolution({ width, height });
    }

    /**
     * 静音
     */
    muted() {
        this.unsubscribeStream(MediaType.AUDIO);
    }

    getRequestId() {
        return this.TCGSDK.getRequestId();
    }
    /**
     * 取消静音
     */
    unmuted() {
        this.subscribeStream(MediaType.AUDIO);
    }

    /** 手动开启音视频流播放 */
    startPlay() {
        this.TCGSDK?.playVideo("play");
    }
    /** 群控房间信息 */
    async sendGroupRoomMessage(message: string) { }

    /** 获取应用信息 */
    getEquipmentInfo(type: EquipmentInfoType) {
        const message = this.getMsgTemplate(TouchType.EQUIPMENT_INFO, {
            type,
        });
        this.sendUserMessage(message, true);
    }

    /** 获取注入推流状态 */
    getInjectStreamStatus(type: InjectStreamStatusType, timeout: number = 0) {
        return new Promise<StreamStatusResult>((resolve) => {
            // 创建超时处理器
            let timeoutHandler: ReturnType<typeof setTimeout> | null = null;

            if (timeout !== 0) {
                timeoutHandler = setTimeout(() => {
                    resolve({
                        status: "unknown",
                        type,
                    });
                }, timeout);
            }

            // 根据类型处理不同的流状态
            const handleStreamStatus = () => {
                switch (type) {
                    case InjectStreamStatusType.VIDEO:
                        try {
                            // 保存resolve函数以便在收到响应时调用
                            Object.assign(this.promiseMap.streamStatus, {
                                resolve: (result: StreamStatusResult) => {
                                    if (timeoutHandler) clearTimeout(timeoutHandler);
                                    resolve(result);
                                },
                            });

                            this.sendUserMessage(
                                this.getMsgTemplate(TouchType.EVENT_SDK, {
                                    type: MessageKey.INJECTION_VIDEO_STATS,
                                }),
                                true
                            );
                        } catch (error) {
                            if (timeoutHandler) clearTimeout(timeoutHandler);
                            resolve({
                                status: "unknown",
                                type,
                            });
                        }
                        break;

                    case InjectStreamStatusType.CAMERA:
                        if (timeoutHandler) clearTimeout(timeoutHandler);
                        resolve({
                            status: this.isCameraInject ? "live" : "offline",
                            type,
                        });
                        break;

                    case InjectStreamStatusType.AUDIO:
                        if (timeoutHandler) clearTimeout(timeoutHandler);
                        resolve({
                            status: this.isMicrophoneInject ? "live" : "offline",
                            type,
                        });
                        break;
                }
            };

            handleStreamStatus();
        });
    }

    /** 应用卸载 */
    appUnInstall(pkgNames: Array<string>) {
        const message = this.getMsgTemplate(TouchType.APP_UNINSTALL, pkgNames);
        this.sendUserMessage(message);
    }

    /** 通知手机需要注入 */
    private async notifyInject(
        type: SdkEventType.INJECTION_CAMERA | SdkEventType.INJECTION_AUDIO,
        isOpen: boolean
    ) {
        this.sendUserMessage(
            this.getMsgTemplate(TouchType.EVENT_SDK, {
                type,
                isOpen,
            })
        );
    }
    /** 开启摄像头 或 麦克风注入 返回一个promise */
    async startMediaStream(mediaType: MediaType, msgData?: { isFront?: boolean }): Promise<void> {
        try {
            // 处理视频设备
            if ([MediaType.VIDEO, MediaType.AUDIO_AND_VIDEO].includes(mediaType)) {
                await this.notifyInject(SdkEventType.INJECTION_CAMERA, true);

                const videoDeviceId =
                    this.videoDeviceId ||
                    (msgData?.isFront
                        ? "user"
                        : msgData?.isFront === false
                            ? "environment"
                            : undefined);
                const profile = videoDeviceId ? { deviceId: videoDeviceId } : undefined;

                const res = await this.TCGSDK.switchCamera({
                    status: "open",
                    profile,
                });

                this.isCameraInject = true;
            }

            // 处理音频设备
            if ([MediaType.AUDIO, MediaType.AUDIO_AND_VIDEO].includes(mediaType)) {
                await this.notifyInject(SdkEventType.INJECTION_AUDIO, true);

                const profile = this.audioDeviceId
                    ? { deviceId: this.audioDeviceId }
                    : undefined;
                const res = await this.TCGSDK.switchMic({
                    status: "open",
                    profile,
                });

                this.isMicrophoneInject = true;
            }
        } catch (error) {
            return Promise.reject(error);
        }
    }
    /** 关闭摄像头 或 麦克风注入 返回一个promise */
    async stopMediaStream(mediaType: MediaType): Promise<void> {
        try {
            const stopOperations = [];

            // 根据媒体类型添加对应操作
            if (
                mediaType === MediaType.VIDEO ||
                mediaType === MediaType.AUDIO_AND_VIDEO
            ) {
                await this.notifyInject(SdkEventType.INJECTION_CAMERA, false);
                stopOperations.push(this.TCGSDK.switchCamera({ status: "close" }));
            }

            if (
                mediaType === MediaType.AUDIO ||
                mediaType === MediaType.AUDIO_AND_VIDEO
            ) {
                await this.notifyInject(SdkEventType.INJECTION_AUDIO, false);
                stopOperations.push(this.TCGSDK.switchMic({ status: "close" }));
            }

            // 并行执行所有停止操作
            await Promise.allSettled(stopOperations);

            switch (mediaType) {
                case MediaType.VIDEO:
                    this.isCameraInject = false;
                    break;
                case MediaType.AUDIO:
                    this.isMicrophoneInject = false;
                    break;
                case MediaType.AUDIO_AND_VIDEO:
                    this.isCameraInject = false;
                    this.isMicrophoneInject = false;
                    break;
            }
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /** 摄像头注入 */
    private async cameraInject(msgData?: { isFront?: boolean }) {
        try {
            await this.stopMediaStream(MediaType.VIDEO);

            await this.startMediaStream(MediaType.VIDEO, msgData);
            this.callbacks?.onVideoInit?.();
        } catch (error: unknown) {
            this.callbacks?.onVideoError?.({ code: -1, msg: String(error) });
            return Promise.reject(error);
        }
    }

    /** 麦克风注入 */
    private async microphoneInject() {
        try {
            await this.stopMediaStream(MediaType.AUDIO);

            await this.startMediaStream(MediaType.AUDIO);
            this.callbacks?.onAudioInit?.();
        } catch (error) {
            this.callbacks?.onAudioError?.(error as any);
            return Promise.reject(error);
        }
    }

    /** 群控退出房间 */
    kickItOutRoom(pads: Array<string>) {
        if (!this.isGroupControl) return;
        // 排除主控
        pads = pads.filter((pad) => pad !== this.options.clientId);
        if (!pads.length) return;
        this.groupPads = this.groupPads.filter((pad) => !pads.includes(pad));

        this.androidInstance.leaveGroupControl({
            instanceIds: pads,
        });
    }
    // 获取云机令牌
    private async getAndroidInstanceToken(pads: Array<string>) {
        return new Promise<{ accessInfo?: string; roomToken?: string }>((resolve, reject) => {
            const { baseUrl } = this.options;

            const base = baseUrl
                ? `${baseUrl}/rtc/open/room/sdk/share/applyToken`
                : `https://openapi.armcloud.net/rtc/open/room/sdk/share/applyToken`;
            const { userId, uuid, token, manageToken } = this.options;

            const url = manageToken ? "/manage/rtc/room/share/applyToken" : base;
            const tok = manageToken || token;
            // 取消请求
            this.abortController = new AbortController();
            axios
                .post(
                    url,
                    {
                        userId,
                        uuid,
                        terminal: "h5",
                        expire: 360000,
                        pushPublicStream: false,
                        pads: pads?.map((v: string) => {
                            return {
                                padCode: v,
                                userId,
                            };
                        }),
                    },
                    {
                        headers: manageToken ? { Authorization: tok } : { token: tok },
                        signal: this.abortController.signal,
                    }
                )
                .then((res: { data?: { data?: { accessInfo?: string; roomToken?: string } } }) => {
                    resolve(res?.data?.data || {});
                })
                .catch((error) => {
                    if (axios.isCancel(error)) {
                        return;
                    }
                    reject(error);
                });
        });
    }

    /** 群控加入房间 */
    joinGroupRoom(pads: Array<string>) {
        if (!this.isGroupControl) return;

        // 排除主控
        pads = pads.filter((pad) => pad !== this.options.clientId);
        if (!pads.length) return;

        this.groupPads = Array.from(new Set([...this.groupPads, ...pads]));

        this.getAndroidInstanceToken(pads).then((res) => {
            const { accessInfo, roomToken } = res || {};
            this.TCGSDK.setAccessToken({ accessInfo: accessInfo, token: roomToken });
            // 加入群控
            this.androidInstance.joinGroupControl({
                instanceIds: pads,
            });
        });
    }

    /** 浏览器是否支持 */
    isSupported() {
        const support = {
            RTCPeerConnection: typeof RTCPeerConnection !== "undefined",
            RTCDataChannel: typeof RTCDataChannel !== "undefined",
            RTCIceCandidate: typeof RTCIceCandidate !== "undefined",
            RTCSessionDescription: typeof RTCSessionDescription !== "undefined",
        };
        return support.RTCPeerConnection && support.RTCDataChannel;
    }

    /**
     * 设置无操作回收时间
     * @param second 秒 默认300s,最大7200s
     */
    setAutoRecycleTime(second: number) {
        // 设置过期时间，单位为毫秒
        this.options.autoRecoveryTime = second;
    }

    /** 获取无操作回收时间 */
    getAutoRecycleTime() {
        return this.options.autoRecoveryTime;
    }

    /** 停止或开启群控同步 */
    public toggleGroupControlSync(flag: boolean = true) {
        if (!this.isGroupControl) return;
        flag ? this.androidInstance.startSync({}) : this.androidInstance.stopSync();
    }

    /** 远端视频首帧渲染 */
    private onRemoteVideoFirstFrame() {
        let { width, height } = this.TCGSDK.getRemoteStreamResolution();

        this.callbacks?.onRenderedFirstFrame?.({
            userId: this.options.clientId,
            width,
            height,
            isScreen: false,
        });
    }

    /** 初始化输入框 */
    private setupInputElement() {
        const { disable, disableLocalIME } = this.options;

        // addInputElement removed (module deleted)
    }

    /** 获取远端输入框状态 */
    private getRemoteInputState() {
        this.sendUserMessage(
            JSON.stringify({
                touchType: TouchType.INPUT_STATE,
            })
        );
    }

    /** 同步远端输入状态到本地输入框 */
    private syncInputFocusState(data: { isOpen?: boolean; imeOptions?: string }) {
        if (!this.inputElement) return;
        const { allowLocalIMEInCloud, keyboard } = this.options;
        const { isOpen, imeOptions } = data;

        // 更新 enterkeyhint
        const hint = this.enterkeyhintObj[imeOptions as any];
        if (hint) {
            this.inputElement.enterKeyHint = hint;
        }

        // 是否需要本地焦点控制
        const allowLocalFocus =
            (allowLocalIMEInCloud && keyboard === "pad") || keyboard === "local";

        if (allowLocalFocus && typeof isOpen === "boolean") {
            setTimeout(() => {
                isOpen ? this.inputElement?.focus() : this.inputElement?.blur();
            }, 150);
        }

        // 记录输入框状态
        this.remoteInputState = {
            isOpen: isOpen ?? false,
            imeOptions: imeOptions ?? "",
        };
    }

    /** 根据云端分辨率比例修正目标分辨率 */
    private matchResolution(width: number, height: number) {
        let { width: remoteWidth, height: remoteHeight } =
            this.remoteDesktopResolution;

        // 没有云端信息就直接返回目标分辨率
        if (!remoteWidth || !remoteHeight) {
            return { width, height };
        }

        // 云端比例
        const remoteRatio = remoteWidth / remoteHeight;
        // 目标比例
        const targetRatio = width / height;

        let finalWidth = width;
        let finalHeight = height;

        // 如果目标比例和云端比例差异较大，做比例修正
        if (Math.abs(targetRatio - remoteRatio) > 0.01) {
            if (targetRatio > remoteRatio) {
                // 目标比云端更宽 -> 按高度修正宽度
                finalWidth = Math.round(height * remoteRatio);
            } else {
                // 目标比云端更窄 -> 按宽度修正高度
                finalHeight = Math.round(width / remoteRatio);
            }
        }

        // 确保宽高为偶数（部分视频流要求）
        finalWidth = finalWidth % 2 === 0 ? finalWidth : finalWidth + 1;
        finalHeight = finalHeight % 2 === 0 ? finalHeight : finalHeight + 1;

        return { width: finalWidth, height: finalHeight };
    }

    // 根据分辨率设置DOM宽高
    private setDomResolution(newWidth: number, newHeight: number) {
        const container = document.getElementById(this.initDomId);
        if (!container) return;

        // 清空样式，强制浏览器回到原始宽高
        container.style.width = "";
        container.style.height = "";

        const rect = container.getBoundingClientRect();
        const domWidth = rect.width;
        const domHeight = rect.height;

        // 计算目标比例
        const targetRatio = newWidth / newHeight;
        const domRatio = domWidth / domHeight;

        let finalWidth = domWidth;
        let finalHeight = domHeight;

        if (domRatio > targetRatio) {
            // DOM 太宽，以高度为基准
            finalHeight = domHeight;
            finalWidth = domHeight * targetRatio;
        } else {
            // DOM 太高，以宽度为基准
            finalWidth = domWidth;
            finalHeight = domWidth / targetRatio;
        }

        container.style.width = `${finalWidth}px`;
        container.style.height = `${finalHeight}px`;
    }

    /** 初始化推流分辨率 */
    private setupStreamResolution(
        width: number,
        height: number,
        orientation: "landscape" | "portrait"
    ) {
        // 如果云端是横屏，且本地配置是竖屏（宽 < 高），则对调宽高
        if (orientation === "landscape" && width < height) {
            [width, height] = [height, width];
        }
        // 如果云端是竖屏，且本地配置是横屏（宽 > 高），则对调宽高
        else if (orientation === "portrait" && width > height) {
            [width, height] = [height, width];
        }

        // 根据云端分辨率比例修正目标分辨率
        let { width: newWidth, height: newHeight } = this.matchResolution(
            width,
            height
        );

        console.log(`sdk setupStreamResolution: newWidth=${newWidth} newHeight=${newHeight}`);

        // 设置推流分辨率
        this.TCGSDK.setStreamProfile({
            video_width: newWidth,
            video_height: newHeight,
        });
    }

    /** 控制音视频流渲染模式 */
    private setMediaStreamRender(mediaType: MediaType) {
        if (mediaType === MediaType.VIDEO) {
            this.unsubscribeStream(MediaType.AUDIO);
        } else if (mediaType === MediaType.AUDIO) {
            this.unsubscribeStream(MediaType.VIDEO);
        }
    }

    /** 隐藏a标签 */
    private hideATags() {
        let sheet = document.styleSheets[0];
        sheet.insertRule(
            `.cloud-gaming-container .restart { display: none !important; }`,
            sheet.cssRules.length
        );
    }

    private async setupSDK(isGroupControl = false, pads = []) {
        const {
            roomToken,
            padCode,
            accessInfo,
            videoStream,
            mediaType,
            autoRecoveryTime,
        } = this.options;
        const { resolution, frameRate, bitrate } = videoStream;
        const fps = getFps(frameRate as FramerateId);
        const kbps = getKbps(bitrate as BitrateId);

        this.isGroupControl = isGroupControl;
        this.groupPads = pads;

        const that = this;
        try {
            await this.TCGSDK.createShadowSocket({ token: roomToken });
        } catch (error) {
            console.error("createShadowSocket error:", error);
        }

        this.TCGSDK.init({
            mount: this.videoDomId,
            mobileGame: true,
            showLoading: false,
            restartText: "",
            idleThreshold: autoRecoveryTime || 300,
            clickBodyToPlay: false,
            debugSetting: {
                //showStats: true,
                // showLog: true,
            },
            streaming: {
                mode: "webrtc",
            },
            accessToken: {
                token: roomToken,
                accessInfo: accessInfo || "",
            },
            androidInstance: {
                autoRotateOnPC: false,
            },
            autoRotateMountPoint: false,
            streamProfile: {
                fps: fps,
                max_bitrate: kbps,
                min_bitrate: kbps,
                unit: "Kbps",
            },
            onConnectFail: (response: ConnectFailResponse) => {
                const code = response.code;

                // * | ------ | ----------------------------------------- |
                // * | -3     | 超出重连次数                                |
                // * | -2     | 自动重连中                                  |
                // * | -1     | 连接失败，触发了限频操作 5s，可稍后再连接        |
                // * | 大于0(code > 0) | Proxy 返回的重连错误，通常连不上，需重新init + createSession     |
                // code 映射到 ConnectionStateCode
                // 判断code 是否大于0

                const isGreaterThan0 = code > 0;
                if (isGreaterThan0) {
                    this.callbacks?.onConnectionStateChanged?.({
                        state: 1,
                        code: code,
                        msg: response.msg,
                    });
                    return;
                }
                const codeMap: Record<string, ConnectionStateCode> = {
                    "-3": 1,
                    "-2": 4,
                    "-1": 6,
                };
                const state = codeMap[code];
                this.callbacks?.onConnectionStateChanged?.({
                    state,
                    code: code,
                    msg: response.msg,
                });
            },
            // 首帧回调
            onConnectSuccess: () => {
                // 初始化输入法
                this.setupInputElement();

                // 初始化消息通道
                this.setupDataChannel();
                // 控制音视频流渲染模式
                this.setMediaStreamRender(mediaType);

                // 隐藏a标签
                this.hideATags();

                this.joinGroupRoom(pads);
            },

            onConfigurationChange: (response: ConfigurationChangeResponse) => {
                let {
                    orientation,
                    deg,
                    width: remoteWidth,
                    height: remoteHeight,
                } = response.screen_config;
                console.log(`sdk onConfigurationChange: screen_config=${JSON.stringify(response.screen_config)}`);

                this.remoteDesktopResolution = {
                    width: remoteWidth,
                    height: remoteHeight,
                    orientation: orientation,
                    degree: deg,
                };

                // 获取期望拉流分辨率
                const { resolution } = this.options.videoStream;
                const { width, height } = getResolution(resolution as ResolutionId);

                // 初始化拉流分辨率

                const type = this.remoteDesktopResolution.width > this.remoteDesktopResolution.height ? RotateDirection.LANDSCAPE : RotateDirection.PORTRAIT;

                this.setupStreamResolution(width, height, type == RotateDirection.LANDSCAPE ? "landscape" : "portrait");

                // const type =
                //   !orientation || orientation === "portrait"
                //     ? RotateDirection.PORTRAIT
                //     : RotateDirection.LANDSCAPE;
                this.screenRotation(type, deg ?? 0);
            },
            // 初始化成功回调
            onInitSuccess: () => {
                this.callbacks?.onConnectSuccess?.();

                isGroupControl
                    ? this.TCGSDK.access({
                        groupControl: isGroupControl,
                        instanceIds: [padCode],
                    })
                    : this.TCGSDK.access({
                        instanceId: padCode,
                    });
            },

            // 推流分辨率发生变化
            onVideoStreamConfigChange: (response: VideoStreamConfigResponse) => {
                let { width, height } = this.lastStreamResolution;

                this.callbacks?.onChangeResolution?.({
                    from: {
                        width,
                        height,
                    },
                    to: response,
                });

                // 记录上一次推流分辨率大小
                Object.assign(this.lastStreamResolution, response);
            },
            onAndroidInstanceEvent(response: AndroidInstanceEventResponse) {
                const { data } = response;
                if (!data?.event_type) {
                    that.syncInputFocusState(that.remoteInputState);
                }
            },
            onEvent: (response: SdkEventResponse) => {
                const { type, data } = response;
                switch (type) {
                    case "video_state":
                        data?.code === -1 &&
                            this.callbacks?.onAutoplayFailed?.({
                                kind: "video",
                                userId: padCode,
                            });
                        break;
                    case "audio_state":
                        data?.code === -1 &&
                            this.callbacks?.onAutoplayFailed?.({
                                kind: "audio",
                                userId: padCode,
                            });
                        break;
                    case "media_stats":
                        if (data?.audioStats && data?.videoStats) {
                        this.callbacks?.onRunInformation?.({
                            userId: this.options.clientId,
                            audioStats: {
                                audioLossRate:
                                    data.audioStats.packet_lost / data.audioStats.packet_received,
                                receivedKBitrate: data.audioStats.bit_rate,
                                rtt: data.videoStats.rtt,
                                jitterBufferDelay: data.audioStats.jitter_buffer,
                                numChannels: data.audioStats.channels,
                                receivedSampleRate: data.audioStats.sample_rate,
                                concealedSamples: data.audioStats.concealed_samples,
                                concealmentEvent: data.audioStats.concealment_events,
                                codecType: data.audioStats.codec,
                            },
                            videoStats: {
                                width: data.videoStats.width,
                                height: data.videoStats.height,
                                videoLossRate:
                                    data.videoStats.packet_lost / data.videoStats.packet_received,
                                receivedKBitrate: data.videoStats.bit_rate,
                                decoderOutputFrameRate: data.videoStats.fps,
                                rtt: data.videoStats.edge_rtt,
                                codecType: data.videoStats.codec,
                                totalRtt: data.videoStats.raw_rtt,
                            },
                        });
                        }
                        break;
                    case "autoplay":
                        // 首帧渲染
                        data?.code === 0 &&
                            data?.mediaType === "video" &&
                            this.onRemoteVideoFirstFrame?.();
                        data?.code === -1 &&
                            this.callbacks?.onAutoplayFailed?.({
                                kind: data?.mediaType!,
                                userId: padCode,
                            });
                        break;
                    case "first_frame_received":
                        break;
                    case "idle":
                        // 触发自动回收回调
                        if (autoRecoveryTime) {
                            this.stop();
                            this.callbacks?.onAutoRecoveryTime?.();
                        }
                        break;
                }
            },
        });
    }

    /**
     * 设置手机旋转
     * @param type 1: 横屏，0: 竖屏
     */
    setPhoneRotation(type: RotateDirection) {
        // 远端流方向
        const remoteIsLandscape = this.remoteDesktopResolution.width > this.remoteDesktopResolution.height;
        let degree = type == RotateDirection.LANDSCAPE ? 270 : 0;
        if (remoteIsLandscape) {
            const orientationIsLandscape = this.remoteDesktopResolution.orientation === "landscape";
            if (type == RotateDirection.LANDSCAPE) {
                degree = orientationIsLandscape ? 270 : 0;
            } else {
                degree = orientationIsLandscape ? 0 : 270;
            }
        }
        console.log(`setPhoneRotation:  sdk type=${type} remoteIsLandscape=${remoteIsLandscape} degree=${degree} remoteDesktopResolution=${JSON.stringify(this.remoteDesktopResolution)}`);
        this.screenRotation(type, degree);
    }

    /** 触发 change rotate 事件 */
    private async triggerChangeRotateEvent(type: RotateDirection) {
        const observeElementSizeOnce = (
            el: HTMLElement,
            callback: (w: number, h: number) => void
        ) => {
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.target.getBoundingClientRect();

                    if (width && height) {
                        callback(width, height);

                        observer.unobserve(el);
                        observer.disconnect();
                    }
                }
            });
            observer.observe(el);
        };

        // 获取video元素大小
        const videoElement = document.querySelector(`#${this.initDomId} video`);

        observeElementSizeOnce(videoElement as HTMLElement, (width, height) => {
            this.callbacks?.onChangeRotate?.(type, {
                width,
                height,
            });
        });
    }

    /**
     * 屏幕旋转
     * @param type @param type 1: 横屏，0: 竖屏
     * @param degree 
     * @returns 
     */
    private async screenRotation(type: RotateDirection, degree: number) {
        const optionsRotateType = this.options.rotateType;
        // console.log(`sdk screenRotation: optionsRotateType=${optionsRotateType} type=${type} degree=${degree}`);
        if (optionsRotateType !== undefined) {
            type = optionsRotateType;
            degree = optionsRotateType === RotateDirection.LANDSCAPE ? 270 : 0;
            // console.log(`sdk screenRotation: new-> type=${type} degree=${degree}`);
        }


        const remoteIsLandscape = this.remoteDesktopResolution.width > this.remoteDesktopResolution.height;
        if (isTouchDevice() || isMobile()) {
            type = RotateDirection.PORTRAIT;
            degree = 0;
            if (remoteIsLandscape && this.remoteDesktopResolution.degree == 0) {
                degree = 90;
            } else if (this.remoteDesktopResolution.degree == 90 && this.remoteDesktopResolution.orientation == "landscape") {
                degree = 90;
            }

            // console.log(`sdk screenRotation: mobile-> type=${type} degree=${degree}`);
        }

        if (!remoteIsLandscape && this.remoteDesktopResolution.degree == 90 && this.remoteDesktopResolution.orientation == "landscape") {
            degree = type == RotateDirection.LANDSCAPE ? 0 : 90;
        }

        console.log(`sdk screenRotation: type=${type} degree=${degree}`);

        try {
            await this.callbacks?.onBeforeRotate?.(type);
        } catch (error) {
            //
        }

        // 获取父元素（调用方）的原始宽度和高度，这里要重新获取，因为外层的div可能宽高发生变化
        const h5Dom = document.getElementById(this.initDomId)!;
        if (!h5Dom) return;

        let parentWidth =
            h5Dom.clientWidth > window.innerWidth
                ? window.innerWidth
                : h5Dom.clientWidth;
        let parentHeight =
            h5Dom.clientHeight > window.innerHeight
                ? window.innerHeight
                : h5Dom.clientHeight;

        let bigSide = parentHeight;
        let smallSide = parentWidth;
        if (parentWidth > parentHeight) {
            bigSide = parentWidth;
            smallSide = parentHeight;
        }

        const wrapperBox = h5Dom.parentElement!;
        const wrapperBoxWidth = wrapperBox.clientWidth;
        const toolsWidth = this.options.toolsWidth ?? 0;
        if (type == RotateDirection.LANDSCAPE) {
            // 因为右侧可能有操作栏，所以预留
            if (toolsWidth) {
                parentWidth =
                    bigSide > wrapperBoxWidth ? wrapperBoxWidth - toolsWidth : bigSide;
            } else {
                parentWidth = bigSide;
            }
            parentHeight = smallSide;
        } else {
            parentWidth = smallSide;
            parentHeight = bigSide;
        }
        h5Dom.style.width = parentWidth + "px";
        h5Dom.style.height = parentHeight + "px";

        const { width: remoteWidth, height: remoteHeight } =
            this.remoteDesktopResolution;

        const videoIsLandscape = remoteWidth > remoteHeight;

        // 外层 div
        let armcloudVideoWidth = 0;
        let armcloudVideoHeight = 0;
        const videoDom = document.getElementById(this.videoDomId) as HTMLDivElement;

        if (type == RotateDirection.LANDSCAPE) {
            const w = videoIsLandscape ? remoteWidth : remoteHeight;
            const h = videoIsLandscape ? remoteHeight : remoteWidth;

            const scale = Math.min(parentWidth / w, parentHeight / h);
            armcloudVideoWidth = w * scale;
            armcloudVideoHeight = h * scale;
        } else {
            // 竖屏处理
            const w = videoIsLandscape ? remoteHeight : remoteWidth;
            const h = videoIsLandscape ? remoteWidth : remoteHeight;

            const scale = Math.min(parentWidth / w, parentHeight / h);
            armcloudVideoWidth = w * scale;
            armcloudVideoHeight = h * scale;
        }

        videoDom.style.width = `${armcloudVideoWidth}px`;
        videoDom.style.height = `${armcloudVideoHeight}px`;

        await waitStyleApplied(videoDom);

        this.TCGSDK.setVideoOrientation({
            deg: degree ?? 0,
            rotateMountPoint: true,
        });

        this.triggerChangeRotateEvent(type);

        this.rotateType = type;
    }

    // 初始化数据通道
    private async setupDataChannel() {
        // 单控模式
        this.dataChannel = new CreateDataChannel(this.TCGSDK, 23332);

        await this.dataChannel.init("android");

        if (this.isGroupControl) {
            const dispatchGroupInitialized = () => {
                /** 远端可见用户加入房间 */
                this.callbacks?.onUserJoined?.({
                    userInfo: {
                        userId: this.options.clientId,
                    },
                });
            };

            // 群控模式
            this.groupDataChannel = new CreateDataChannel(this.TCGSDK, 23331);
            await this.groupDataChannel.init("android_broadcast");

            this.groupDataChannel.on(EventType.INITIALIZED, dispatchGroupInitialized);
        }

        const parseResolution = (resolution: string) => {
            const [width, height] = resolution?.split("*").map(Number);
            return { width, height };
        };

        const safeParse = <T>(raw: unknown, fallback: T): T => {
            try {
                return JSON.parse(raw as string) as T;
            } catch {
                return fallback;
            }
        };

        // 创建尾触发节流函数，确保窗口期内仅处理最后一次调用
        const createTrailingThrottle = <T extends (...args: string[]) => void>(
            handler: T,
            delay: number
        ) => {
            let timer: ReturnType<typeof setTimeout> | null = null;
            let latestArgs: Parameters<T> | null = null;

            return (...args: Parameters<T>) => {
                latestArgs = args;
                if (timer) {
                    clearTimeout(timer);
                }

                timer = setTimeout(() => {
                    if (latestArgs) {
                        handler(...latestArgs);
                        latestArgs = null;
                    }
                    timer = null;
                }, delay);
            };
        };

        // 消息和回调 handlers
        const handlers: Partial<Record<MessageKey, (raw: string) => void>> = {
            [MessageKey.CLIPBOARD]: (raw) => {
                const data = safeParse<{ content: string }>(raw, {
                    content: "",
                });
                this.callbacks?.onOutputClipper?.(data);
            },
            [MessageKey.INPUT_STATE]: (raw) => {
                const data = safeParse<{ isOpen?: boolean; imeOptions?: string }>(raw, {
                    isOpen: false,
                    imeOptions: "",
                });
                this.syncInputFocusState(data);
            },

            [MessageKey.EQUIPMENT_INFO]: (raw) => {
                const info = safeParse<EquipmentInfoEvent>(raw, { info: "" });
                this.callbacks?.onEquipmentInfo?.(info);
            },

            [MessageKey.INPUT_ADB]: (raw) => {
                const adb = safeParse<AdbOutputEvent>(raw, {
                    isSuccess: false,
                    content: "",
                });
                this.callbacks?.onAdbOutput?.(adb);
            },

            [MessageKey.VIDEO_AND_AUDIO_CONTROL]: (raw) => {
                const mediaData = safeParse<{ isOpen?: boolean; isFront?: boolean }>(
                    raw,
                    {}
                );

                const isOpen = !!mediaData.isOpen;

                this.callbacks?.onMediaDevicesToggle?.({
                    type: MediaDeviceType.MEDIA,
                    enabled: isOpen,
                    isFront: mediaData.isFront,
                });

                if (!this.enableMicrophone && !this.enableCamera) return;

                const pushType =
                    this.enableMicrophone && this.enableCamera
                        ? MediaType.AUDIO_AND_VIDEO
                        : this.enableCamera
                            ? MediaType.VIDEO
                            : MediaType.AUDIO;

                if (isOpen) {
                    if (this.enableCamera) this.cameraInject(mediaData);
                    if (this.enableMicrophone) this.microphoneInject();
                } else {
                    this.stopMediaStream(pushType);
                }
            },

            [MessageKey.AUDIO_CONTROL]: (raw) => {
                const { isOpen: isOpenAudio = false } = safeParse<{ isOpen?: boolean }>(
                    raw,
                    {}
                );
                this.callbacks?.onMediaDevicesToggle?.({
                    type: MediaDeviceType.MICROPHONE,
                    enabled: isOpenAudio,
                });

                if (!this.enableMicrophone) return;

                if (isOpenAudio) {
                    this.microphoneInject();
                } else {
                    this.stopMediaStream(MediaType.AUDIO);
                }
            },

            [MessageKey.DEFINITION]: (raw) => {
                const result = safeParse<{ from?: string; to?: string }>(raw, {});
                this.callbacks?.onChangeResolution?.({
                    from: parseResolution(result.from as string),
                    to: parseResolution(result.to as string),
                });
            },

            [MessageKey.START_INJECTION_VIDEO]: (raw) => {
                const result = safeParse<any>(raw, {});
                const resolve = this?.promiseMap?.injectStatus?.resolve;
                if (typeof resolve === "function") {
                    resolve({
                        type: MessageKey.START_INJECTION_VIDEO,
                        status: result?.isSuccess ? "success" : "error",
                        result,
                    });
                    if (this.promiseMap?.injectStatus) {
                        this.promiseMap.injectStatus.resolve = null;
                    }
                }
                this.callbacks?.onInjectVideoResult?.(
                    MessageKey.START_INJECTION_VIDEO,
                    result
                );
            },

            [MessageKey.STOP_INJECTION_VIDEO]: (raw) => {
                const result = safeParse<any>(raw, {});
                const resolve = this?.promiseMap?.injectStatus?.resolve;
                if (typeof resolve === "function") {
                    resolve({
                        type: MessageKey.STOP_INJECTION_VIDEO,
                        status: result?.isSuccess ? "success" : "error",
                        result,
                    });
                    this.promiseMap.injectStatus.resolve = null;
                }
                this.callbacks?.onInjectVideoResult?.(
                    MessageKey.STOP_INJECTION_VIDEO,
                    result
                );
            },

            [MessageKey.INJECTION_VIDEO_STATS]: (raw) => {
                const result = safeParse<{ path?: string; status?: string }>(raw, {});
                const resolve = this?.promiseMap?.streamStatus?.resolve;
                if (typeof resolve === "function") {
                    resolve({
                        path: result.path,
                        status: result.status || (result.path ? "live" : "offline"),
                        type: "video",
                    });
                }
            },
        };

        const throttleConfig: Partial<Record<MessageKey, number>> = {
            [MessageKey.VIDEO_AND_AUDIO_CONTROL]: 500,
            [MessageKey.AUDIO_CONTROL]: 500,
        };

        Object.entries(throttleConfig).forEach(([key, delay]) => {
            const originHandler = handlers[key as MessageKey];
            if (!originHandler || !delay) return;
            handlers[key as MessageKey] = createTrailingThrottle(
                originHandler,
                delay
            );
        });

        const dispatchInitialized = () => {
            /** 远端可见用户加入房间 */
            this.callbacks?.onUserJoined?.({
                userInfo: {
                    userId: this.options.clientId,
                },
            });
            // 获取远端输入框状态
            this.getRemoteInputState();
            // 获取相机状态
            this.getCameraState();
        };

        const dispatch = (res: { key: MessageKey | string; data: string }) => {
            const { key, data } = res;
            const handler = handlers[key as MessageKey];
            if (handler) {
                handler(data);
            } else {
                console.debug(
                    `[dataChannel] Unknown key: ${this.options.clientId}`,
                    key,
                    "raw:",
                    data
                );
            }
        };

        const callbackDispatch = (res: {
            type: MessageKey | string;
            data: string;
        }) => {
            const { type, data } = res;
            const handler = handlers[type as MessageKey];
            if (handler) {
                handler(data);
            } else {
                console.debug(
                    `[dataChannel] Unknown type: ${this.options.clientId}`,
                    type,
                    "raw:",
                    data
                );
            }
        };

        this.dataChannel
            .on(EventType.INITIALIZED, dispatchInitialized)
            .on(EventType.MESSAGE, dispatch)
            .on(EventType.CALLBACK, callbackDispatch);
    }

    // 发送数据通道消息
    private sendUserMessage(
        message: string,
        forwardOff: boolean = false,
        directForward: boolean = false
    ) {
        if (this.isGroupControl && !forwardOff) {
            this.groupDataChannel?.send(message);
        }

        if (!directForward) {
            this.dataChannel?.send(message);
        }
    }

    /** 按顺序发送文本框 */
    public sendGroupInputString(pads: string[], strs: string[]) {
        if (this.isGroupControl) {
            strs?.map((v: string, index: number) => {
                if (pads[index]) {
                    const message = JSON.stringify({
                        text: v,
                        pads: [pads[index]],
                        touchType: TouchType.INPUT_BOX,
                    });
                    this.sendUserMessage(message, false, true);
                }
            });
        }
    }

    /**  群控剪切板  */
    public sendGroupInputClipper(pads: string[], strs: string[]) {
        if (this.isGroupControl) {
            strs?.map((v: string, index: number) => {
                if (pads[index]) {
                    const message = JSON.stringify({
                        text: v,
                        pads: [pads[index]],
                        touchType: TouchType.CLIPBOARD,
                    });
                    this.sendUserMessage(message, false, true);
                }
            });
        }
    }

    /** 执行adb命令 */
    executeAdbCommand(command: string, forwardOff: boolean = true) {
        this.sendUserMessage(
            this.getMsgTemplate(TouchType.EVENT_SDK, {
                type: MessageKey.INPUT_ADB,
                content: command,
            }),
            forwardOff
        );
    }

    /** 进入 RTC 房间 */
    start(isGroupControl = false, pads = []) {
        // 初始化连接
        this.setupSDK(isGroupControl, pads);
    }

    /** 远端用户离开房间 */
    onUserLeave() { }
    setViewSize(width: number, height: number, rotateType: 0 | 1 = 0) { }
    private getCameraState() {
        this.sendUserMessage(
            this.getMsgTemplate(TouchType.EVENT_SDK, {
                type: SdkEventType.GET_CAMERA_STATE,
            }),
            true
        );
    }
    // 模拟点击事件
    triggerClickEvent(
        options: {
            x: number;
            y: number;
            width: number;
            height: number;
        },
        forwardOff: boolean = false
    ) { }

    // 模拟触摸事件 0 按下 1 抬起 2 触摸中
    triggerPointerEvent(
        action: 0 | 1 | 2,
        options: { x: number; y: number; width: number; height: number },
        forwardOff: boolean = false
    ) { }

    /** 离开 RTC 房间 */
    async stop() {
        clearTimeout(this.metricsTimer ?? undefined);
        this.metricsTimer = null;
        this.TCGSDK.destroy();
        this.abortController?.abort();
        this.abortController = null;

        const videoDomElement = document.getElementById(this.initDomId);
        if (videoDomElement) {
            videoDomElement.innerHTML = "";
        }

        this.inputElement = null;
    }

    /**
     * 发送摇一摇信息
     */
    sendShakeInfo(time: number) { }

    /**
     * 将字符串发送到云手机的粘贴板中
     * @param inputStr 需要发送的字符串
     */
    async sendInputClipper(inputStr: string, forwardOff: boolean = false) {
        const message = JSON.stringify({
            text: inputStr,
            touchType: TouchType.CLIPBOARD,
        });
        this.sendUserMessage(message, forwardOff);
    }

    /**
     * 当云手机处于输入状态时，将字符串直接发送到云手机，完成输入
     * @param inputStr 需要发送的字符串
     */
    async sendInputString(inputStr: string, forwardOff: boolean = false) {
        const message = JSON.stringify({
            text: inputStr,
            touchType: TouchType.INPUT_BOX,
        });

        this.sendUserMessage(message, forwardOff);
    }

    /** 清晰度切换 */
    setStreamConfig(config: CustomDefinition) {
        const { definitionId, framerateId, bitrateId } = config;
        let { width, height } = getResolution(definitionId as ResolutionId);
        const fps = getFps(framerateId as FramerateId);
        const kbps = getKbps(bitrateId as BitrateId);

        const { width: remoteWidth, height: remoteHeight } =
            this.remoteDesktopResolution;

        // 如果云端是横屏，且本地配置是竖屏（宽 < 高），则对调宽高
        if (remoteWidth > remoteHeight && width < height) {
            [width, height] = [height, width];
        }
        // 如果云端是竖屏，且本地配置是横屏（宽 > 高），则对调宽高
        else if (remoteWidth < remoteHeight && width > height) {
            [width, height] = [height, width];
        }

        const { width: newWidth, height: newHeight } = this.matchResolution(
            width,
            height
        );

        this.TCGSDK.setStreamProfile({
            video_width: newWidth,
            video_height: newHeight,
            fps: fps,
            max_bitrate: kbps,
            unit: "Kbps",
        });

        const { resolution, frameRate, bitrate } = this.options.videoStream;

        // 覆盖 videoStream 配置
        Object.assign(this.options.videoStream, {
            resolution: definitionId ?? resolution,
            frameRate: framerateId ?? frameRate,
            bitrate: bitrateId ?? bitrate,
        });
    }

    // 修改屏幕分辨率和dpi
    async setScreenResolution(
        options: {
            width: number;
            height: number;
            dpi: number;
            type: MessageKey.RESET_DENSITY | MessageKey.UPDATE_DENSITY;
        },
        forwardOff: boolean = true
    ) {
        const content =
            options.type === MessageKey.UPDATE_DENSITY
                ? {
                    type: options.type,
                    width: options.width,
                    height: options.height,
                    density: options.dpi,
                }
                : {
                    type: options.type,
                };
        const message = this.getMsgTemplate(TouchType.EVENT_SDK, content);

        this.sendUserMessage(message, forwardOff);
    }

    /**
     * 订阅房间内指定的通过摄像头/麦克风采集的媒体流。
     */
    async subscribeStream(mediaType: MediaType) {
        const mediaConfig: Record<
            MediaType,
            { media: "audio" | "video" } | undefined
        > = {
            1: { media: "audio" as const },
            2: { media: "video" as const },
            3: undefined,
        };
        const config = mediaConfig[mediaType];
        await this.TCGSDK.gameResume(config);
    }

    /** 旋转截图 */
    setScreenshotRotation(rotation: number = 0) {
        // this.screenShotInstance?.setScreenshotRotation(rotation);
    }
    /** 生成封面图 */
    takeScreenshot(rotation: number = 0) { }
    /** 重新设置大小 */
    resizeScreenshot(width: number, height: number) { }
    /** 显示封面图 */
    showScreenShot() { }
    /** 显示封面图 */
    hideScreenShot() { }

    /** 清空封面图 */
    clearScreenShot() { }
    /**
     * 取消订阅房间内指定的通过摄像头/麦克风采集的媒体流。
     */
    async unsubscribeStream(mediaType: MediaType) {
        const mediaConfig: Record<
            MediaType,
            { media: "audio" | "video" } | undefined
        > = {
            1: { media: "audio" as const },
            2: { media: "video" as const },
            3: undefined,
        };
        const config = mediaConfig[mediaType];
        await this.TCGSDK.gamePause(config);
    }
    /** 截图-保存到本地 */
    async saveScreenShotToLocal() {
        return this.TCGSDK.screenShot({
            name: this.options.clientId,
        });
    }

    /** 截图-保存到云机 */
    saveScreenShotToRemote() {
        this.sendUserMessage(
            this.getMsgTemplate(TouchType.EVENT_SDK, {
                type: SdkEventType.LOCAL_SCREENSHOT,
            }),
            true
        );
    }

    getRotateType() {
        return this.rotateType;
    }

    /** 手动定位 */
    setGPS(longitude: number, latitude: number) {
        this.sendUserMessage(
            this.getMsgTemplate(TouchType.EVENT_SDK, {
                type: SdkEventType.SDK_LOCATION,
                content: JSON.stringify({
                    latitude,
                    longitude,
                    time: new Date().getTime(),
                }),
            }),
            true
        );
    }
    /** 调整坐标 */
    reshapeWindow() {
        this.TCGSDK.reshapeWindow();
    }
    /** 云机/本地键盘切换(false-云机键盘，true-本地键盘) */
    setKeyboardStyle(keyBoardType: KeyboardMode) {
        this.options.keyboard = keyBoardType;
        this.sendUserMessage(
            this.getMsgTemplate(TouchType.EVENT_SDK, {
                type: SdkEventType.KEYBOARD_TYPE,
                isLocalKeyBoard: keyBoardType === KeyboardMode.LOCAL,
            })
        );
    }

    /** 底部栏操作按键 */
    sendCommand(command: string) {
        // const keyCodeMap: Record<string, number> = {
        //   back: AndroidKeyCode.KEYCODE_BACK,
        //   home: AndroidKeyCode.KEYCODE_HOME,
        //   menu: AndroidKeyCode.KEYCODE_MENU,
        // };
        // const keyCode = keyCodeMap[command] ?? Number(command);

        // this.TCGSDK.sendKeyboardEvent({ key: keyCode, down: true });
        // this.TCGSDK.sendKeyboardEvent({ key: keyCode, down: false });

        // 定义按键映射表 兼容老版本
        const keyCodeMap: Record<string, number> = {
            back: 4,
            home: 3,
            menu: 187,
        };
        // 获取keyCode,如果command不在映射表中则使用command本身
        const keyCode = keyCodeMap[command] ?? command;

        const messageObj = {
            action: 1,
            touchType: TouchType.KEYSTROKE,
            keyCode,
            text: "",
        };

        this.sendUserMessage(JSON.stringify(messageObj));
    }

    /** 触发快捷键 */
    triggerKeyboardShortcut(
        metaState: number | string,
        keyCode: number | string,
        forwardOff: boolean = true
    ) {
        const content = JSON.stringify({
            touchType: MessageKey.SHORTCUT_KEY,
            metaState: metaState + "",
            keyCode: keyCode + "",
        });
        const userId = this.options.clientId;

        this.sendUserMessage(content, forwardOff);
    }
    /** 注入视频到相机 */
    injectVideoStream(
        type: MessageKey.START_INJECTION_VIDEO | MessageKey.STOP_INJECTION_VIDEO,
        options: InjectVideoOptions,
        timeout: number = 0
    ) {
        return new Promise<InjectResult>(async (resolve) => {
            let timeoutHandler: ReturnType<typeof setTimeout> | null = null;
            if (timeout) {
                timeoutHandler = setTimeout(() => {
                    resolve({
                        type,
                        status: "timeout",
                        result: null,
                    });
                }, timeout);
            }
            try {
                // 保存resolve函数以便在收到响应时调用
                Object.assign(this.promiseMap.injectStatus, {
                    resolve: (result: InjectResult) => {
                        if (timeoutHandler) clearTimeout(timeoutHandler);
                        resolve(result);
                    },
                });

                const message = this.getMsgTemplate(
                    TouchType.EVENT_SDK,

                    type === MessageKey.START_INJECTION_VIDEO
                        ? {
                            type,
                            fileUrl: options?.fileUrl,
                            isLoop: options?.isLoop ?? true,
                            fileName: options?.fileName,
                        }
                        : {
                            type,
                        }
                );
                this.sendUserMessage(message, true);
            } catch {
                resolve({
                    type,
                    status: "unknown",
                    result: null,
                });
            }
        });
    }

    /** 音量增加按键事件 */
    public increaseVolume() {
        this.TCGSDK.sendKeyboardEvent({
            key: AndroidKeyCode.KEYCODE_VOLUME_UP,
            down: true,
        });
        this.TCGSDK.sendKeyboardEvent({
            key: AndroidKeyCode.KEYCODE_VOLUME_UP,
            down: false,
        });
    }

    /** 音量减少按键事件 */
    public decreaseVolume() {
        this.TCGSDK.sendKeyboardEvent({
            key: AndroidKeyCode.KEYCODE_VOLUME_DOWN,
            down: true,
        });
        this.TCGSDK.sendKeyboardEvent({
            key: AndroidKeyCode.KEYCODE_VOLUME_DOWN,
            down: false,
        });
    }

    /**
     * 是否接收粘贴板内容回调
     * @param flag true:接收 false:不接收
     */
    saveCloudClipboard(flag: boolean) {
        this.options.saveCloudClipboard = flag;
    }
}

export default tcgRtc;
