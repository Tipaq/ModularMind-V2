import { ProfilePage, useAuthStore } from "@modularmind/ui";

export function Profile() {
  const { user } = useAuthStore();

  if (!user) return null;

  return <ProfilePage email={user.email} role={user.role} />;
}
