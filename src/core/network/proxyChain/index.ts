export async function fetchViaChain(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}