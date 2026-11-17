import TryIt from "@/studio/tryit";

// The generated app full screen, with Mark up one click away.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TryIt id={id} />;
}
