import { isTauri } from "@/lib/platform";

export async function httpFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isTauri()) {
    return fetch(input, init);
  }

  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  return (tauriFetch as typeof fetch)(input, init);
}
