import { ProfilePage, useAuthStore } from "@modularmind/ui";

export default function Profile() {
  const { user } = useAuthStore();

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <ProfilePage email={user.email} role={user.role} />
    </div>
  );
}
