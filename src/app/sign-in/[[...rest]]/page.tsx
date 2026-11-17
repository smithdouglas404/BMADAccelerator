import { ClerkProvider, SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

// The public address's sign-in page. Keys are read when the page is asked for, not when it is built.
export default function SignInPage() {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY || "";
  if (!publishableKey) return <main style={{ padding: 40, fontFamily: "sans-serif" }}><h1>Sign-in is not set up yet</h1><p>Add the Clerk keys in Settings on the computer that runs the Studio.</p></main>;
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0e0f0c" }}>
        <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/" />
      </main>
    </ClerkProvider>
  );
}
