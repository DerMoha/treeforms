import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container page-stack">
      <section className="card page-card">
        <span className="badge">Treeforms MVP</span>
        <h1 className="page-card-title">Build branch-aware forms without the graph chaos</h1>
        <p className="page-card-subtitle" style={{ maxWidth: 760 }}>
          Treeforms lets you author conditional follow-up question trees in a linear editor.
          Publish immutable versions, collect responses via hosted links, and analyze branch paths in SQL-ready outputs.
        </p>
        <div className="inline-stack">
          <Link href="/builder" className="button-primary">
            Open Form Builder
          </Link>
        </div>
      </section>
    </main>
  );
}
