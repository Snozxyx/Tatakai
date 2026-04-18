import { useQuery } from "@tanstack/react-query";
import {
  fetchCuratedHomeSections,
  type CuratedHomeSection,
  type CuratedScope,
} from "@/services/curation.service";

export function useCuratedHomeSections(
  scope: CuratedScope,
  options?: { includeInactive?: boolean; enabled?: boolean }
) {
  const includeInactive = Boolean(options?.includeInactive);
  const enabled = typeof options?.enabled === "boolean" ? options.enabled : true;

  return useQuery<CuratedHomeSection[]>({
    queryKey: ["curated-home-sections", scope, includeInactive],
    queryFn: () => fetchCuratedHomeSections(scope, { includeInactive }),
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}
