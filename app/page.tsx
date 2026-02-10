import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <section
        className="card"
        style={{ padding: "2rem", display: "grid", gap: "1rem", textAlign: "left" }}
      >
        <span className="badge">Treeforms MVP</span>
        <h1 style={{ margin: 0, fontSize: "2rem" }}>Build branch-aware forms without the graph chaos</h1>
        <p style={{ margin: 0, color: "var(--text-muted)", maxWidth: 760 }}>
          Treeforms lets you author conditional follow-up question trees in a linear editor.
          Publish immutable versions, collect responses via hosted links, and analyze branch paths in SQL-ready outputs.
        </p>
        <div className="inline-stack">
          <Link href="/builder" className="button-primary" style={{ textDecoration: "none" }}>
            Open Form Builder
          </Link>
        </div>
      </section>
    </main>
  );
}
