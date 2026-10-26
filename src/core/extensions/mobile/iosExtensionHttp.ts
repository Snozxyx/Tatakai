import { Capacitor, registerPlugin } from "@capacitor/core";
import { throwCompatibilityAbort } from "../compatibility/abort";
import { extensionRequestId } from "../compatibility/request-id";

export interface IosExtensionHttpReply {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: string;
  cookies?: Record<string, string>;
}
export interface IosExtensionHttpBridge {
  request(options: {
    requestId: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<IosExtensionHttpReply>;
  cancel(options: { requestId: string }): Promise<void>;
}
const bridge = registerPlugin<IosExtensionHttpBridge>("TatakaiExtensionHttp");
export const hasIosExtensionHttp = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios" &&
  Capacitor.isPluginAvailable("TatakaiExtensionHttp");

/** Abort the URLSession task as well as the JavaScript waiter. Injectable for contract tests. */
export async function requestIosExtensionHttp(
  url: string,
  init: RequestInit = {},
  api: IosExtensionHttpBridge = bridge
): Promise<IosExtensionHttpReply> {
  throwCompatibilityAbort(init.signal || undefined);
  if (init.body != null && typeof init.body !== "string")
    throw Error("iOS extension HTTP expects a text request body");
  const requestId = extensionRequestId();
  let abort: (() => void) | undefined;
  const canceled = new Promise<never>((_, reject) => {
    abort = () => {
      void api.cancel({ requestId }).catch(() => {});
      reject(init.signal?.reason || new DOMException("Aborted", "AbortError"));
    };
    init.signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    // A listener cannot miss an abort between the first check and native dispatch.
    throwCompatibilityAbort(init.signal || undefined);
    const response = await Promise.race([
      api.request({
        requestId,
        url,
        method: init.method || "GET",
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        ...(typeof init.body === "string" ? { body: init.body } : {}),
      }),
      canceled,
    ]);
    throwCompatibilityAbort(init.signal || undefined);
    if (
      typeof response.body !== "string" ||
      response.body.length > 10 * 1024 * 1024
    )
      throw Error("Extension response is too large");
    return response;
  } finally {
    if (abort) init.signal?.removeEventListener("abort", abort);
  }
}
