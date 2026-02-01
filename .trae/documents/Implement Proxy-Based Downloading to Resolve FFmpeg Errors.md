Based on the logs and your instructions, the "Invalid argument" error persists because passing complex headers (like `Referer`) to FFmpeg via the command line on Windows is fragile. The correct architectural solution, as indicated by your diagram and the codebase conventions, is to use the **Video Proxy** system.

By routing the download through the internal proxy (`getProxiedVideoUrl`), we offload the header and referrer handling to the backend. FFmpeg will receive a clean, simple URL, completely bypassing the command-line argument parsing issues.

### **Plan: Implement Proxy-Based Downloading**

1.  **Update `src/contexts/DownloadContext.tsx`**:
    *   Import `getProxiedVideoUrl` from `@/lib/api`.
    *   In the `startDownload` function, transform the source URL using `getProxiedVideoUrl(url, referer, userAgent)`.
    *   **Conditional Logic**:
        *   If a proxy URL is generated, pass the **proxy URL** to Electron and **remove** the `headers` object (since the proxy handles them).
        *   If the proxy is not configured (fallback), pass the original URL and keep the headers (utilizing the previous quoting fix).

2.  **Verify `desktop/downloader.cjs`**:
    *   Ensure the downloader accepts requests with empty headers (which it already does).
    *   The previous fix for header quoting remains as a safety fallback.

This approach aligns with the "Tatakai" system architecture shown in your diagram, ensuring consistent behavior between streaming and downloading.