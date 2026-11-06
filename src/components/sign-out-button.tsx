"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }} data-testid="wrong-role-signout">{label}</Button>
  );
}
