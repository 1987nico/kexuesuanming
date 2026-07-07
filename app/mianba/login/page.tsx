import { redirect } from "next/navigation";
import { getCurrentMianbaAuth, sanitizeNextPath } from "@/lib/auth/mianba";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function MianbaLoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = sanitizeNextPath(searchParams?.next);
  const auth = await getCurrentMianbaAuth();
  if (auth) redirect(nextPath);
  return <LoginClient nextPath={nextPath} />;
}
