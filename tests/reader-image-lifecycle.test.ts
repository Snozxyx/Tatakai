import { describe, expect, test } from "bun:test";
import {
  readerPageRenderKey,
  shouldUseReaderHeaderBlob,
} from "../src/lib/reader/imageLifecycle";

describe("reader image lifecycle", () => {
  test("does not reuse page state across chapter transitions", () => {
    const page = {
      pageNumber: 1,
      imageUrl: "https://cdn.example/page-1.jpg",
      proxiedImageUrl: null,
    };

    expect(readerPageRenderKey("chapter-1", page)).not.toBe(
      readerPageRenderKey("chapter-2", page),
    );
  });

  test("remounts when a refreshed proxy token changes", () => {
    const first = {
      pageNumber: 1,
      imageUrl: "https://cdn.example/page-1.jpg",
      proxiedImageUrl: "mobile-proxy://stream/first",
    };
    const refreshed = {
      ...first,
      proxiedImageUrl: "mobile-proxy://stream/second",
    };

    expect(readerPageRenderKey("chapter-1", first)).not.toBe(
      readerPageRenderKey("chapter-1", refreshed),
    );
  });

  test("native loopback images never take the headered blob path", () => {
    expect(
      shouldUseReaderHeaderBlob({
        src: "http://127.0.0.1:43127/stream/0123456789abcdef0123456789abcdef",
        headerCount: 2,
        isMobileProxy: false,
        isNativeLoopback: true,
      }),
    ).toBe(false);
  });

  test("header-gated upstream images still use the blob path", () => {
    expect(
      shouldUseReaderHeaderBlob({
        src: "https://cdn.example/page.jpg",
        headerCount: 2,
        isMobileProxy: false,
        isNativeLoopback: false,
      }),
    ).toBe(true);
  });
});
