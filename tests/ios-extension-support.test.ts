import { afterEach, describe, expect, test } from "bun:test";
import { Capacitor } from "@capacitor/core";
import {
  requestIosExtensionHttp,
  type IosExtensionHttpBridge,
} from "../src/core/extensions/mobile/iosExtensionHttp";
import {
  localScriptRuntimeState,
  localScriptConcurrency,
  recordLocalScriptRuntimeResult,
} from "../src/core/extensions/sora/runtime";
import { hasCompatibilityRuntime } from "../src/core/extensions/compatibility/client";
import { extensionRequestId } from "../src/core/extensions/compatibility/request-id";
import { extensionDeadline } from "../src/core/extensions/remote/deadline";

const original = {
  window: globalThis.window,
  Worker: globalThis.Worker,
  platform: Capacitor.getPlatform,
  native: Capacitor.isNativePlatform,
  plugin: Capacitor.isPluginAvailable,
};
afterEach(() => {
  Object.assign(Capacitor, {
    getPlatform: original.platform,
    isNativePlatform: original.native,
    isPluginAvailable: original.plugin,
  });
  if (original.window === undefined) delete (globalThis as any).window;
  else (globalThis as any).window = original.window;
  if (original.Worker === undefined) delete (globalThis as any).Worker;
  else (globalThis as any).Worker = original.Worker;
  recordLocalScriptRuntimeResult("Not verified");
});
const reply = {
  status: 200,
  url: "https://source.test/final",
  headers: { "content-type": "text/html" },
  cookies: { session: "fixture" },
  body: "Original source response",
};

describe("iOS on-device extension support", () => {
  test("request deadlines work when the WebView has no AbortSignal.throwIfAborted", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      AbortSignal.prototype,
      "throwIfAborted"
    );
    try {
      Object.defineProperty(AbortSignal.prototype, "throwIfAborted", {
        value: undefined,
        configurable: true,
      });
      expect(await extensionDeadline(async () => 42, 100)).toBe(42);
      const parent = new AbortController();
      parent.abort();
      let dispatched = false;
      await expect(
        extensionDeadline(
          async () => {
            dispatched = true;
          },
          100,
          parent.signal
        )
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(dispatched).toBe(false);
      await expect(
        extensionDeadline(() => new Promise(() => {}), 10)
      ).rejects.toMatchObject({ name: "TimeoutError" });
    } finally {
      if (descriptor)
        Object.defineProperty(
          AbortSignal.prototype,
          "throwIfAborted",
          descriptor
        );
      else delete (AbortSignal.prototype as any).throwIfAborted;
    }
  });
  test("works without newer iOS AbortSignal and UUID convenience methods", async () => {
    const controller = new AbortController();
    Object.defineProperty(controller.signal, "throwIfAborted", {
      value: undefined,
      configurable: true,
    });
    const api = { request: async () => reply, cancel: async () => {} };
    expect(
      (
        await requestIosExtensionHttp(
          "https://source.test",
          { signal: controller.signal },
          api
        )
      ).status
    ).toBe(200);
    controller.abort();
    await expect(
      requestIosExtensionHttp(
        "https://source.test",
        { signal: controller.signal },
        api
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    const descriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
    try {
      Object.defineProperty(crypto, "randomUUID", {
        value: undefined,
        configurable: true,
      });
      const ids = new Set(
        Array.from({ length: 10 }, () => extensionRequestId())
      );
      expect(ids.size).toBe(10);
      for (const id of ids)
        expect(id).toMatch(
          /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
        );
    } finally {
      if (descriptor) Object.defineProperty(crypto, "randomUUID", descriptor);
      else delete (crypto as any).randomUUID;
    }
  });
  test("forwards original headers and text bodies, including final URL and native cookie metadata", async () => {
    const calls: any[] = [];
    const api: IosExtensionHttpBridge = {
      request: async (options) => {
        calls.push(options);
        return reply;
      },
      cancel: async () => {
        throw Error("Unexpected cancellation");
      },
    };
    expect(
      await requestIosExtensionHttp(
        "https://source.test/search",
        {
          method: "POST",
          headers: {
            Referer: "https://source.test/",
            Cookie: "session=fixture",
          },
          body: "query=rain",
        },
        api
      )
    ).toEqual(reply);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://source.test/search",
      method: "POST",
      body: "query=rain",
      headers: { referer: "https://source.test/", cookie: "session=fixture" },
    });
    expect(calls[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
  });
  test("does not dispatch a pre-canceled request", async () => {
    const controller = new AbortController();
    controller.abort();
    let sent = false;
    await expect(
      requestIosExtensionHttp(
        "https://source.test",
        { signal: controller.signal },
        {
          request: async () => {
            sent = true;
            return reply;
          },
          cancel: async () => {},
        }
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sent).toBe(false);
  });
  test("cancels the exact native request and settles without waiting for URLSession", async () => {
    const controller = new AbortController();
    let started = "",
      canceled = "";
    const pending = requestIosExtensionHttp(
      "https://source.test",
      { signal: controller.signal },
      {
        request: (options) => {
          started = options.requestId;
          return new Promise(() => {});
        },
        cancel: async (options) => {
          canceled = options.requestId;
        },
      }
    );
    controller.abort(new Error("Source disabled"));
    await expect(pending).rejects.toThrow("Source disabled");
    expect(canceled).toBe(started);
    expect(canceled).not.toBe("");
  });
  test("releases the cancellation listener after success and rejects non-text / oversized responses", async () => {
    const controller = new AbortController();
    let cancellations = 0;
    const api = {
      request: async () => reply,
      cancel: async () => {
        cancellations++;
      },
    };
    await requestIosExtensionHttp(
      "https://source.test",
      { signal: controller.signal },
      api
    );
    controller.abort();
    expect(cancellations).toBe(0);
    await expect(
      requestIosExtensionHttp(
        "https://source.test",
        { body: new Uint8Array([1]) },
        api
      )
    ).rejects.toThrow("text request body");
    await expect(
      requestIosExtensionHttp(
        "https://source.test",
        {},
        {
          ...api,
          request: async () => ({
            ...reply,
            body: "x".repeat(10 * 1024 * 1024 + 1),
          }),
        }
      )
    ).rejects.toThrow("too large");
  });
  test("iOS requires its native bridge plus worker/WASM and reports ready only after a real runtime result", () => {
    (globalThis as any).window = {};
    (globalThis as any).Worker = class {};
    Object.assign(Capacitor, {
      getPlatform: () => "ios",
      isNativePlatform: () => true,
      isPluginAvailable: (name: string) => name === "TatakaiExtensionHttp",
    });
    recordLocalScriptRuntimeResult("Not verified");
    expect(localScriptRuntimeState()).toMatchObject({
      available: true,
      ready: false,
      downloadBytes: 0,
    });
    expect(localScriptConcurrency()).toBe(2);
    expect(hasCompatibilityRuntime("sora")).toBe(true);
    expect(hasCompatibilityRuntime("mangayomi")).toBe(true);
    for (const kind of ["mihon", "aniyomi", "cloudstream"] as const)
      expect(hasCompatibilityRuntime(kind)).toBe(false);
    recordLocalScriptRuntimeResult();
    expect(localScriptRuntimeState().ready).toBe(true);
    Object.assign(Capacitor, { isPluginAvailable: () => false });
    expect(localScriptRuntimeState().available).toBe(false);
  });
  test("the website never gains local extension execution from a worker/WASM feature check", () => {
    (globalThis as any).window = {};
    (globalThis as any).Worker = class {};
    Object.assign(Capacitor, {
      getPlatform: () => "web",
      isNativePlatform: () => false,
      isPluginAvailable: () => false,
    });
    recordLocalScriptRuntimeResult();
    expect(localScriptRuntimeState()).toMatchObject({
      available: false,
      ready: false,
    });
    expect(localScriptConcurrency()).toBe(4);
  });
});
