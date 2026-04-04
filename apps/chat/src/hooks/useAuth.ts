import { useAuth as useAuthShared } from "@modularmind/ui";
import { api } from "@modularmind/api-client";

export function useAuth({ requireAuth = true } = {}) {
  return useAuthShared({ requireAuth, api });
}
