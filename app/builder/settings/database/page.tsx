import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { type NextRequest } from "next/server";

import { readAdminSession } from "@/lib/server/auth";
import DatabaseConfig from "@/components/settings/DatabaseConfig";
import { getPlatformDbSettings } from "@/lib/db/app-store";

export default async function SettingsDatabasePage() {
  const cookieStore = await cookies();
  const session = readAdminSession({ cookies: cookieStore as unknown as NextRequest["cookies"] });
  if (!session) {
    redirect("/login?next=/builder/settings/database");
  }

  const settings = await getPlatformDbSettings();

  return (
    <main className="container page-stack">
      <section className="card page-card">
        <header style={{ marginBottom: "1.5rem" }}>
          <h1>Database Settings</h1>
          <p className="subtitle">
            Choose the single database backend used by TreeForms
          </p>
        </header>

        <DatabaseConfig initialSettings={settings} />
      </section>
    </main>
  );
}
