import axios from "axios";

export interface FetchRoomTokenParams {
  baseUrl?: string;
  userId: string;
  uuid: string;
  token?: string;
  manageToken?: string;
  padCode?: string;
  pads?: string[];
}

export interface RoomTokenResult {
  appId: string;
  roomCode: string;
  roomToken: string;
  streamType?: number;
  accessInfo?: string | null;
}

export async function fetchRoomToken(params: FetchRoomTokenParams): Promise<RoomTokenResult> {
  const { baseUrl, userId, uuid, token, manageToken, padCode, pads } = params;

  const base = baseUrl
    ? `${baseUrl}/rtc/open/room/sdk/share/applyToken`
    : `https://openapi.armcloud.net/rtc/open/room/sdk/share/applyToken`;

  const url = manageToken ? "/manage/rtc/room/share/applyToken" : base;
  const tok = manageToken || token;

  const padList = pads
    ? pads.map((p) => ({ padCode: p, userId }))
    : padCode ? [{ padCode, userId }] : [];

  const res = await axios.post(
    url,
    { userId, uuid, terminal: "h5", expire: 360000, pushPublicStream: false, pads: padList },
    { headers: manageToken ? { Authorization: tok } : { token: tok } }
  );

  const data = res?.data?.data;
  if (!data?.appId || !data?.roomCode || !data?.roomToken) {
    throw new Error("Invalid token response");
  }

  return {
    appId: data.appId,
    roomCode: data.roomCode,
    roomToken: data.roomToken,
    streamType: data.streamType,
    accessInfo: data.accessInfo,
  };
}
