import { roleLabel } from "@/lib/auth/constants";
import { requireMianbaPageAuth } from "@/lib/auth/mianba";
import MianbaAdminClient from "./MianbaAdminClient";

export const dynamic = "force-dynamic";

export default async function MianbaAdminPage() {
  const auth = await requireMianbaPageAuth("/mianba/admin", ["admin"]);
  return <MianbaAdminClient currentUserName={auth.user.display_name} currentRoleLabel={roleLabel(auth.role)} />;
}
