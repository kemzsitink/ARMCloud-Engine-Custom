import type { IRTCEngine } from "@volcengine/rtc";
import { MediaType, SdkEventType, TouchType } from "../../../types/webrtcType";

export interface MediaStreamState {
  isCameraInject: boolean;
  isMicrophoneInject: boolean;
  videoDeviceId: string;
  audioDeviceId: string;
  enableCamera: boolean;
  enableMicrophone: boolean;
  options: any;
  callbacks: any;
  engine: IRTCEngine | null;
}

export async function notifyInject(
  state: MediaStreamState,
  sendMessage: (userId: string, msg: string, notSendInGroups?: boolean) => any,
  type: SdkEventType.INJECTION_CAMERA | SdkEventType.INJECTION_AUDIO,
  isOpen: boolean
) {
  sendMessage(
    state.options.clientId,
    JSON.stringify({ touchType: TouchType.EVENT_SDK, content: JSON.stringify({ type, isOpen }) }),
    true
  );
}

export async function startMediaStream(
  state: MediaStreamState,
  sendMessage: (userId: string, msg: string, notSendInGroups?: boolean) => any,
  mediaType: MediaType,
  msgData?: any
): Promise<{ audio: any; video: any }> {
  const res: { audio: any; video: any } = { audio: null, video: null };

  if ([MediaType.VIDEO, MediaType.AUDIO_AND_VIDEO].includes(mediaType)) {
    await notifyInject(state, sendMessage, SdkEventType.INJECTION_CAMERA, true);
    const videoDeviceId = state.videoDeviceId || (msgData?.isFront ? "user" : "environment");
    await state.engine?.setVideoCaptureDevice(videoDeviceId);
    res.video = await state.engine?.startVideoCapture();
    await state.engine?.publishStream(MediaType.VIDEO);
    state.isCameraInject = true;
  }

  if ([MediaType.AUDIO, MediaType.AUDIO_AND_VIDEO].includes(mediaType)) {
    await notifyInject(state, sendMessage, SdkEventType.INJECTION_AUDIO, true);
    if (state.audioDeviceId) {
      await state.engine?.setAudioCaptureDevice(state.audioDeviceId);
    }
    res.audio = await state.engine?.startAudioCapture();
    await state.engine?.publishStream(MediaType.AUDIO);
    state.isMicrophoneInject = true;
  }

  return res;
}

export async function stopMediaStream(
  state: MediaStreamState,
  sendMessage: (userId: string, msg: string, notSendInGroups?: boolean) => any,
  mediaType: MediaType
): Promise<void> {
  const stopOps: Promise<any>[] = [];

  if (mediaType === MediaType.VIDEO || mediaType === MediaType.AUDIO_AND_VIDEO) {
    await notifyInject(state, sendMessage, SdkEventType.INJECTION_CAMERA, false);
    stopOps.push(
      state.engine?.stopVideoCapture() as Promise<any>,
      state.engine?.unpublishStream(MediaType.VIDEO) as Promise<any>
    );
  }
  if (mediaType === MediaType.AUDIO || mediaType === MediaType.AUDIO_AND_VIDEO) {
    await notifyInject(state, sendMessage, SdkEventType.INJECTION_AUDIO, false);
    stopOps.push(
      state.engine?.stopAudioCapture() as Promise<any>,
      state.engine?.unpublishStream(MediaType.AUDIO) as Promise<any>
    );
  }

  await Promise.all(stopOps);

  if (mediaType === MediaType.VIDEO || mediaType === MediaType.AUDIO_AND_VIDEO) {
    state.isCameraInject = false;
  }
  if (mediaType === MediaType.AUDIO || mediaType === MediaType.AUDIO_AND_VIDEO) {
    state.isMicrophoneInject = false;
  }
}

export async function cameraInject(
  state: MediaStreamState,
  sendMessage: (userId: string, msg: string, notSendInGroups?: boolean) => any,
  msgData?: any
) {
  await stopMediaStream(state, sendMessage, MediaType.VIDEO);
  const res = await startMediaStream(state, sendMessage, MediaType.VIDEO, msgData);
  state.callbacks.onVideoInit(res.video);
}

export async function microphoneInject(
  state: MediaStreamState,
  sendMessage: (userId: string, msg: string, notSendInGroups?: boolean) => any
) {
  await stopMediaStream(state, sendMessage, MediaType.AUDIO);
  const res = await startMediaStream(state, sendMessage, MediaType.AUDIO);
  state.callbacks.onAudioInit(res.audio);
  state.isMicrophoneInject = true;
  return res.audio;
}
