import App from "@/studio/App";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <App id={id} />;
}
