import { externalApiGet } from "@/lib/api/api-client";
import { CharacterApiResponse, CharacterBase, CharacterDetail } from "@/types/anime";

const CHAR_API_URL = "https://anime-api.canelacho.com/api/v1";

export async function fetchCharacters(page: number = 1, limit: number = 20): Promise<CharacterApiResponse<CharacterBase[]>> {
  return externalApiGet<CharacterApiResponse<CharacterBase[]>>(CHAR_API_URL, `/characters?page=${page}&limit=${limit}`);
}

export async function fetchCharacterById(id: string): Promise<CharacterApiResponse<CharacterDetail>> {
  return externalApiGet<CharacterApiResponse<CharacterDetail>>(CHAR_API_URL, `/characters/${id}`);
}

export async function searchCharacters(query: string, page: number = 1, limit: number = 20): Promise<CharacterApiResponse<CharacterBase[]>> {
  return externalApiGet<CharacterApiResponse<CharacterBase[]>>(CHAR_API_URL, `/characters/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
}
