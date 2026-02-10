import { createPool, type Pool } from "mysql2/promise";

import { APP_DB_URL, PLATFORM_SUBMISSION_DB_URL } from "@/lib/server/constants";

let appPool: Pool | null = null;
let appTablesEnsured = false;
let submissionTablesEnsured = false;
const externalPools = new Map<string, Pool>();

export function isAppDbConfigured() {
  return Boolean(APP_DB_URL);
}

export function isSubmissionDbConfigured() {
  return Boolean(PLATFORM_SUBMISSION_DB_URL || APP_DB_URL);
}

export function getAppPool() {
  if (!APP_DB_URL) {
    throw new Error("APP_DATABASE_URL (or DATABASE_URL) is required.");
  }

  if (!appPool) {
    appPool = createPool(APP_DB_URL);
  }

  return appPool;
}

export function getPlatformSubmissionPool() {
  const url = PLATFORM_SUBMISSION_DB_URL || APP_DB_URL;

  if (!url) {
    throw new Error("SUBMISSION_DATABASE_URL (or APP_DATABASE_URL) is required.");
  }

  return getExternalPool(url);
}

export function getExternalPool(url: string) {
  const existing = externalPools.get(url);
  if (existing) {
    return existing;
  }

  const pool = createPool(url);
  externalPools.set(url, pool);
  return pool;
}

export async function ensureAppTables() {
  if (appTablesEnsured) {
    return;
  }

  const pool = getAppPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      role VARCHAR(32) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id),
      INDEX idx_workspace_members_user_id (user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS forms (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_forms_workspace_slug (workspace_id, slug),
      INDEX idx_forms_workspace_id (workspace_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS drafts (
      form_id VARCHAR(64) PRIMARY KEY,
      schema_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_versions (
      id VARCHAR(64) PRIMARY KEY,
      form_id VARCHAR(64) NOT NULL,
      version_number INT NOT NULL,
      schema_json LONGTEXT NOT NULL,
      published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_form_versions (form_id, version_number),
      INDEX idx_form_versions_form_id (form_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS db_targets (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INT NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      password_encrypted LONGTEXT NOT NULL,
      database_name VARCHAR(255) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(32) NOT NULL DEFAULT 'unknown',
      last_error TEXT NULL,
      last_tested_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_db_targets_workspace_id (workspace_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS respondent_sessions (
      session_token VARCHAR(128) PRIMARY KEY,
      resume_token VARCHAR(128) NOT NULL UNIQUE,
      workspace_id VARCHAR(64) NOT NULL,
      form_id VARCHAR(64) NOT NULL,
      version_number INT NOT NULL,
      status VARCHAR(32) NOT NULL,
      current_question_id VARCHAR(64) NULL,
      answers_json LONGTEXT NOT NULL,
      history_json LONGTEXT NOT NULL,
      branch_trace_json LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_respondent_sessions_form_id (form_id),
      INDEX idx_respondent_sessions_workspace_id (workspace_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      actor VARCHAR(128) NOT NULL,
      event_type VARCHAR(128) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_events_workspace_id (workspace_id)
    )
  `);

  appTablesEnsured = true;
}

export async function ensureSubmissionTables(pool: Pool) {
  if (submissionTablesEnsured && pool === getPlatformSubmissionPool()) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      submission_id VARCHAR(64) PRIMARY KEY,
      workspace_id VARCHAR(64) NOT NULL,
      form_id VARCHAR(64) NOT NULL,
      version_number INT NOT NULL,
      status VARCHAR(32) NOT NULL,
      started_at DATETIME NOT NULL,
      completed_at DATETIME NULL,
      branch_trace_json LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_submissions_form_id (form_id),
      INDEX idx_submissions_workspace_id (workspace_id),
      INDEX idx_submissions_completed_at (completed_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers_raw (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      submission_id VARCHAR(64) NOT NULL,
      question_id VARCHAR(64) NOT NULL,
      answer_json LONGTEXT NOT NULL,
      flow_path VARCHAR(512) NOT NULL,
      answered_at DATETIME NOT NULL,
      INDEX idx_answers_raw_submission_id (submission_id),
      INDEX idx_answers_raw_question_id (question_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS answer_facts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      submission_id VARCHAR(64) NOT NULL,
      question_id VARCHAR(64) NOT NULL,
      question_type VARCHAR(32) NOT NULL,
      option_id VARCHAR(64) NULL,
      text_value TEXT NULL,
      number_value DOUBLE NULL,
      flow_path VARCHAR(512) NOT NULL,
      answered_at DATETIME NOT NULL,
      INDEX idx_answer_facts_submission_id (submission_id),
      INDEX idx_answer_facts_question_id (question_id),
      INDEX idx_answer_facts_option_id (option_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS submission_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      submission_id VARCHAR(64) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_submission_events_submission_id (submission_id)
    )
  `);

  if (pool === getPlatformSubmissionPool()) {
    submissionTablesEnsured = true;
  }
}

export async function pingPool(pool: Pool) {
  await pool.query("SELECT 1");
}

export function buildMysqlUrl(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  databaseName: string;
}) {
  const user = encodeURIComponent(config.user);
  const password = encodeURIComponent(config.password);
  const host = config.host.trim();
  const database = config.databaseName.trim();

  return `mysql://${user}:${password}@${host}:${config.port}/${database}`;
}
