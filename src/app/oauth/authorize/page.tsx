import { prisma } from "@/lib/db";
import { clientFor } from "@/lib/connect/oauth";
import { ConsentPage } from "@/studio/connect";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | string[] | undefined>>;

// An assistant asks to connect: the person says who they are, which customer it may see, and whether it
// may only look or also make changes, and types the connect code from Settings > Connect.
export default async function Page({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k]![0] : q[k]) ?? "";
  const clientId = one("client_id");
  const redirectUri = one("redirect_uri");
  const client = await clientFor(clientId, redirectUri);
  const problem =
    !client ? "This assistant isn't registered with the Studio, or its return address doesn't match." :
    one("response_type") !== "code" ? "Only the authorization code flow is supported." :
    one("code_challenge_method") !== "S256" || !one("code_challenge") ? "The assistant must use PKCE (S256)." : "";
  const customers = (await prisma.useCase.findMany({ select: { customer: true }, distinct: ["customer"] })).map((c) => c.customer).filter(Boolean).sort();
  return (
    <ConsentPage
      problem={problem}
      clientName={client?.name ?? ""}
      params={{ client_id: clientId, redirect_uri: redirectUri, state: one("state"), code_challenge: one("code_challenge") }}
      wantsWrite={/\bwrite\b/.test(one("scope")) || !one("scope")}
      customers={customers}
    />
  );
}
