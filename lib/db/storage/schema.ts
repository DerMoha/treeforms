import { type DatabaseClient } from "@/lib/db/storage/client";

export async function ensureStorageSchema(client: DatabaseClient): Promise<void> {
  if (client.dialect === "sqlite") {
    await ensureSqliteSchema(client);
    return;
  }

  await ensureMysqlSchema(client);
}

async function ensureSqliteSchema(client: DatabaseClient) {
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS forms (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `
  );
  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_workspace_slug ON forms (workspace_id, slug)`
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_forms_workspace_updated ON forms (workspace_id, updated_at DESC)`
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS drafts (
        form_id TEXT PRIMARY KEY,
        schema_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
      )
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS form_versions (
        id TEXT PRIMARY KEY,
        form_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        schema_json TEXT NOT NULL,
        published_at TEXT NOT NULL,
        FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
      )
    `
  );
  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_form_versions_form_version ON form_versions (form_id, version_number)`
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS respondent_sessions (
        session_token TEXT PRIMARY KEY,
        resume_token TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        form_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        current_question_id TEXT,
        answers_json TEXT NOT NULL,
        history_json TEXT NOT NULL,
        branch_trace_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
      )
    `
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_sessions_resume_token ON respondent_sessions (resume_token)`
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS submissions (
        submission_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        form_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        branch_trace_json TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
      )
    `
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_submissions_form_started ON submissions (workspace_id, form_id, started_at DESC)`
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS answers_raw (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        answer_json TEXT NOT NULL,
        flow_path TEXT NOT NULL,
        answered_at TEXT NOT NULL,
        FOREIGN KEY (submission_id) REFERENCES submissions(submission_id) ON DELETE CASCADE
      )
    `
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_answers_raw_submission ON answers_raw (submission_id)`
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS answer_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        question_type TEXT NOT NULL,
        option_id TEXT,
        text_value TEXT,
        number_value REAL,
        flow_path TEXT NOT NULL,
        answered_at TEXT NOT NULL,
        FOREIGN KEY (submission_id) REFERENCES submissions(submission_id) ON DELETE CASCADE
      )
    `
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_answer_facts_submission ON answer_facts (submission_id)`
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_created ON audit_events (workspace_id, created_at DESC)`
  );
}

async function ensureMysqlSchema(client: DatabaseClient) {
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS workspaces (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS forms (
        id VARCHAR(64) PRIMARY KEY,
        workspace_id VARCHAR(64) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_forms_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        UNIQUE KEY uq_forms_workspace_slug (workspace_id, slug),
        KEY idx_forms_workspace_updated (workspace_id, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS drafts (
        form_id VARCHAR(64) PRIMARY KEY,
        schema_json LONGTEXT NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_drafts_form FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS form_versions (
        id VARCHAR(64) PRIMARY KEY,
        form_id VARCHAR(64) NOT NULL,
        version_number INT NOT NULL,
        schema_json LONGTEXT NOT NULL,
        published_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_form_versions_form FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
        UNIQUE KEY uq_form_versions_form_version (form_id, version_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS respondent_sessions (
        session_token VARCHAR(128) PRIMARY KEY,
        resume_token VARCHAR(128) NOT NULL UNIQUE,
        workspace_id VARCHAR(64) NOT NULL,
        form_id VARCHAR(64) NOT NULL,
        version_number INT NOT NULL,
        status VARCHAR(32) NOT NULL,
        current_question_id VARCHAR(128) NULL,
        answers_json LONGTEXT NOT NULL,
        history_json LONGTEXT NOT NULL,
        branch_trace_json LONGTEXT NOT NULL,
        expires_at VARCHAR(40) NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        updated_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_sessions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        CONSTRAINT fk_sessions_form FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
        KEY idx_sessions_resume_token (resume_token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS submissions (
        submission_id VARCHAR(128) PRIMARY KEY,
        workspace_id VARCHAR(64) NOT NULL,
        form_id VARCHAR(64) NOT NULL,
        version_number INT NOT NULL,
        status VARCHAR(32) NOT NULL,
        started_at VARCHAR(40) NOT NULL,
        completed_at VARCHAR(40) NULL,
        branch_trace_json LONGTEXT NOT NULL,
        CONSTRAINT fk_submissions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        CONSTRAINT fk_submissions_form FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
        KEY idx_submissions_form_started (workspace_id, form_id, started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS answers_raw (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        submission_id VARCHAR(128) NOT NULL,
        question_id VARCHAR(128) NOT NULL,
        answer_json LONGTEXT NOT NULL,
        flow_path VARCHAR(512) NOT NULL,
        answered_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_answers_raw_submission FOREIGN KEY (submission_id) REFERENCES submissions(submission_id) ON DELETE CASCADE,
        KEY idx_answers_raw_submission (submission_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS answer_facts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        submission_id VARCHAR(128) NOT NULL,
        question_id VARCHAR(128) NOT NULL,
        question_type VARCHAR(32) NOT NULL,
        option_id VARCHAR(128) NULL,
        text_value TEXT NULL,
        number_value DOUBLE NULL,
        flow_path VARCHAR(512) NOT NULL,
        answered_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_answer_facts_submission FOREIGN KEY (submission_id) REFERENCES submissions(submission_id) ON DELETE CASCADE,
        KEY idx_answer_facts_submission (submission_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS audit_events (
        id VARCHAR(64) PRIMARY KEY,
        workspace_id VARCHAR(64) NOT NULL,
        actor VARCHAR(128) NOT NULL,
        event_type VARCHAR(128) NOT NULL,
        payload_json LONGTEXT NOT NULL,
        created_at VARCHAR(40) NOT NULL,
        CONSTRAINT fk_audit_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        KEY idx_audit_events_workspace_created (workspace_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `
  );
}
