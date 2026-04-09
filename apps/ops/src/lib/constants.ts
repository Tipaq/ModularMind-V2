import { Shield, UserCheck, User } from "lucide-react";
import { ROLE_COLORS } from "@modularmind/ui";

export const DEFAULT_PAGE_SIZE = 20;

export const roleConfig = {
  owner: { icon: Shield, color: ROLE_COLORS.owner },
  admin: { icon: UserCheck, color: ROLE_COLORS.admin },
  user: { icon: User, color: ROLE_COLORS.member },
};
