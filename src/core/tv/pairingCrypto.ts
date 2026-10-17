import { z } from "zod";
export type SealedTransfer = { key: string; iv: string; ciphertext: string };
export type TransferPayload = {
  version: 1;
  credentials?: Record<string, string>;
  playlists?: Array<{
    name: string;
    source: import("@/core/iptv/iptvStorage").PlaylistSource;
  }>;
  extensions?: Array<{ id: string; url: string }>;
};
const credentialKeys = ["anilist", "mal", "real-debrid", "torbox"] as const;
export const payloadSchema = z
  .object({
    version: z.literal(1),
    credentials: z
      .record(z.enum(credentialKeys), z.string().max(20000))
      .optional(),
    playlists: z
      .array(
        z.object({
          name: z.string().max(150),
          source: z.discriminatedUnion("kind", [
            z.object({
              kind: z.literal("m3u"),
              url: z.string().url(),
              epgUrl: z.string().url().optional(),
            }),
            z.object({
              kind: z.literal("xtream"),
              server: z.string().url(),
              username: z.string().max(200),
              password: z.string().max(200),
            }),
          ]),
        })
      )
      .max(30)
      .optional(),
    extensions: z
      .array(
        z.object({
          id: z.string().max(128),
          url: z
            .string()
            .url()
            .refine((url) => url.startsWith("https://")),
        })
      )
      .max(100)
      .optional(),
  })
  .strict();
function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}
export function unbase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export async function sealTransfer(
  publicKey: JsonWebKey,
  value: TransferPayload
): Promise<SealedTransfer> {
  const recipient = await crypto.subtle.importKey(
    "jwk",
    publicKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(payloadSchema.parse(value)))
  );
  return {
    key: base64(
      await crypto.subtle.encrypt(
        "RSA-OAEP",
        recipient,
        await crypto.subtle.exportKey("raw", key)
      )
    ),
    iv: base64(iv.buffer),
    ciphertext: base64(ciphertext),
  };
}
export async function openTransfer(
  privateKey: CryptoKey,
  payload: SealedTransfer
): Promise<TransferPayload> {
  const rawKey = await crypto.subtle.decrypt(
    "RSA-OAEP",
    privateKey,
    unbase64(payload.key)
  );
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "decrypt",
  ]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unbase64(payload.iv) },
    key,
    unbase64(payload.ciphertext)
  );
  return payloadSchema.parse(
    JSON.parse(new TextDecoder().decode(plaintext))
  ) as TransferPayload;
}
