import { useCallback } from "react";
import { fetchViaChain } from "./index";

export function useProxyChain() {
  return useCallback((input: string, init?: RequestInit) => fetchViaChain(input, init), []);
}