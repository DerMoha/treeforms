import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container page-stack">
      <section className="card page-card hero-section stagger-children">
        <span className="badge">Treeforms MVP</span>
        <h1 className="page-card-title">
          Build branch-aware forms without the graph chaos
        </h1>
        <p className="page-card-subtitle" style={{ maxWidth: 640 }}>
          Treeforms lets you author conditional follow-up question trees in a linear
          editor. Publish immutable versions, collect responses via hosted links, and
          analyze branch paths in SQL-ready outputs.
        </p>
        <div className="hero-actions">
          <Link href="/builder" className="button-primary">
            Open Form Builder
          </Link>
          <Link href="/f/demo/v/1" className="button-secondary">
            See a Live Demo
          </Link>
        </div>
      </section>

      <section className="features-grid">
        <div className="feature-card fade-in">
          <div className="feature-icon">🌳</div>
          <p className="feature-title">Branch-first authoring</p>
          <p className="feature-desc">
            Define conditional paths upfront. Every question can lead to a different
            follow-up tree — no duplicate forms needed.
          </p>
        </div>
        <div className="feature-card fade-in">
          <div className="feature-icon">📋</div>
          <p className="feature-title">Linear editor, visual flow</p>
          <p className="feature-desc">
            Work in a familiar list-based editor while seeing the branch structure
            emerge in the minimap sidebar.
          </p>
        </div>
        <div className="feature-card fade-in">
          <div className="feature-icon">🔗</div>
          <p className="feature-title">Immutable versions</p>
          <p className="feature-desc">
            Publish a version, get a stable URL. Edit the form without breaking
            in-flight respondent sessions.
          </p>
        </div>
        <div className="feature-card fade-in">
          <div className="feature-icon">📊</div>
          <p className="feature-title">Branch-path analytics</p>
          <p className="feature-desc">
            See which paths respondents took, answer distribution per branch, and
            export everything as CSV.
          </p>
        </div>
      </section>
    </main>
  );
}
