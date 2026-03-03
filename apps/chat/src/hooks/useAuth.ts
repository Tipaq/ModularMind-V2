import { useAuth as useAuthShared } from "@modularmind/ui";
import { api } from "../lib/api";

export function useAuth({ requireAuth = true } = {}) {
  return useAuthShared({ requireAuth, api });
}
