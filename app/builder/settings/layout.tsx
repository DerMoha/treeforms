import Link from "next/link";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { readAdminSession } from "@/lib/server/auth";

export default async function SettingsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = readAdminSession({ cookies: cookieStore as unknown as NextRequest["cookies"] });
  if (!session) {
    redirect("/login?next=/builder/settings");
  }

  return (
    <main className="container page-stack">
      <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
        {/* Sidebar Navigation */}
        <nav style={{ width: "200px", flexShrink: 0 }}>
          <div
            style={{
              padding: "1rem",
              backgroundColor: "#f5f5f5",
              borderRadius: "4px"
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Settings</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li style={{ marginBottom: "0.5rem" }}>
                <Link
                  href="/builder/settings/database"
                  style={{
                    display: "block",
                    padding: "0.5rem",
                    textDecoration: "none",
                    color: "inherit",
                    borderRadius: "4px"
                  }}
                >
                  Database
                </Link>
              </li>
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </main>
  );
}
