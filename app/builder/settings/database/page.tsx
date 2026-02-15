import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { type NextRequest } from "next/server";

import { readAdminSession } from "@/lib/server/auth";
import DatabaseConfig from "@/components/settings/DatabaseConfig";
import { getPlatformDbConfig } from "@/lib/db/app-store";
import { PLATFORM_SUBMISSION_DB_URL, APP_DB_URL } from "@/lib/server/constants";

export default async function SettingsDatabasePage() {
  const cookieStore = await cookies();
  const session = readAdminSession({ cookies: cookieStore as unknown as NextRequest["cookies"] });
  if (!session) {
    redirect("/login?next=/builder/settings/database");
  }

  const config = await getPlatformDbConfig();
  const hasEnvVar = Boolean(PLATFORM_SUBMISSION_DB_URL || APP_DB_URL);
  
  let currentSource: "environment-variable" | "stored-configuration" | "none";
  if (config) {
    currentSource = "stored-configuration";
  } else if (hasEnvVar) {
    currentSource = "environment-variable";
  } else {
    currentSource = "none";
  }

  return (
    <main className="container page-stack">
      <section className="card page-card">
        <header style={{ marginBottom: "1.5rem" }}>
          <h1>Database Settings</h1>
          <p className="subtitle">
            Configure where form submissions are stored
          </p>
        </header>

        <DatabaseConfig
          initialConfig={config}
          currentSource={currentSource}
          hasEnvVar={hasEnvVar}
        />
      </section>
    </main>
  );
}
