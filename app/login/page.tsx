import { LoginForm } from "@/components/auth/LoginForm";
import { normalizeSafeRedirect } from "@/lib/server/http";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  const nextPath = normalizeSafeRedirect(query.next, "/builder");

  return (
    <main className="container page-stack">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
