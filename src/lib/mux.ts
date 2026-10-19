import "server-only";
import Mux from "@mux/mux-node";

export const MAX_VIDEO_SECONDS = 5 * 60;

let client: Mux | null | undefined;

// Video features are optional: without Mux credentials the app still works,
// it just doesn't offer video uploads.
export function getMux(): Mux | null {
  if (client !== undefined) return client;
  const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;
  client =
    MUX_TOKEN_ID && MUX_TOKEN_SECRET
      ? new Mux({
          tokenId: MUX_TOKEN_ID,
          tokenSecret: MUX_TOKEN_SECRET,
          webhookSecret: process.env.MUX_WEBHOOK_SECRET,
          jwtSigningKey: process.env.MUX_SIGNING_KEY_ID,
          jwtPrivateKey: process.env.MUX_SIGNING_KEY_PRIVATE,
        })
      : null;
  return client;
}

export function isVideoEnabled() {
  return getMux() !== null && Boolean(process.env.MUX_SIGNING_KEY_ID && process.env.MUX_WEBHOOK_SECRET);
}

export type PlaybackTokens = { playback?: string; thumbnail?: string; storyboard?: string };

// Children's videos use signed playback: a token is required to watch.
export async function signPlayback(playbackId: string): Promise<PlaybackTokens> {
  const mux = getMux();
  if (!mux) return {};
  const tokens = await mux.jwt.signPlaybackId(playbackId, {
    type: ["video", "thumbnail", "storyboard"],
    expiration: "6h",
  });
  return {
    playback: tokens["playback-token"],
    thumbnail: tokens["thumbnail-token"],
    storyboard: tokens["storyboard-token"],
  };
}
