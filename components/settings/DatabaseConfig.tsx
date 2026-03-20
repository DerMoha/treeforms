"use client";

import React, { useMemo, useState } from "react";

import { readCsrfToken } from "@/lib/client/csrf";
import { type DatabaseConfig, type DatabaseSecretState } from "@/lib/db/database-config";

interface DatabaseSettingsSnapshot {
  config: DatabaseConfig;
  secrets: DatabaseSecretState;
  isDefault: boolean;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  updatedAt: string;
}

interface DatabaseConfigProps {
  initialSettings: DatabaseSettingsSnapshot;
}

export default function DatabaseConfig({ initialSettings }: DatabaseConfigProps) {
  const initialConfig = initialSettings.config;

  const [mode, setMode] = useState<DatabaseConfig["mode"]>(initialConfig.mode);
  const [sqlitePath, setSqlitePath] = useState(
    initialConfig.mode === "sqlite" ? initialConfig.sqlitePath : ".data/treeforms.sqlite"
  );
  const [host, setHost] = useState(initialConfig.mode === "mysql" ? initialConfig.host : "");
  const [port, setPort] = useState(
    initialConfig.mode === "mysql" ? String(initialConfig.port) : "3306"
  );
  const [database, setDatabase] = useState(
    initialConfig.mode === "mysql" ? initialConfig.database : ""
  );
  const [username, setUsername] = useState(
    initialConfig.mode === "mysql" ? initialConfig.username : ""
  );
  const [password, setPassword] = useState("");
  const [sslMode, setSslMode] = useState<"disabled" | "preferred" | "required">(
    initialConfig.mode === "mysql" ? initialConfig.sslMode : "disabled"
  );
  const [sslCaCert, setSslCaCert] = useState("");
  const [sslClientCert, setSslClientCert] = useState("");
  const [sslClientKey, setSslClientKey] = useState("");

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmValue, setConfirmValue] = useState("");

  const currentSummary = useMemo(() => {
    if (initialConfig.mode === "sqlite") {
      return `SQLite at ${initialConfig.sqlitePath}`;
    }

    return `MySQL ${initialConfig.username}@${initialConfig.host}:${initialConfig.port}/${initialConfig.database}`;
  }, [initialConfig]);

  function buildConfig(): DatabaseConfig {
    if (mode === "sqlite") {
      return {
        mode: "sqlite",
        sqlitePath: sqlitePath.trim() || ".data/treeforms.sqlite"
      };
    }

    return {
      mode: "mysql",
      host: host.trim(),
      port: Number(port) || 3306,
      database: database.trim(),
      username: username.trim(),
      password: password === "" ? undefined : password,
      sslMode,
      sslCaCert: sslCaCert === "" ? undefined : sslCaCert,
      sslClientCert: sslClientCert === "" ? undefined : sslClientCert,
      sslClientKey: sslClientKey === "" ? undefined : sslClientKey
    };
  }

  async function handleTest() {
    setTesting(true);
    setStatusMessage(null);
    setSaveError(null);

    try {
      const response = await fetch("/api/settings/database/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": readCsrfToken()
        },
        body: JSON.stringify({ config: buildConfig() })
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setStatusMessage({ ok: false, message: data.error || "Connection test failed" });
        return;
      }

      setStatusMessage({ ok: true, message: data.message || "Connection successful" });
    } catch (error) {
      setStatusMessage({
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed"
      });
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    setSaveError(null);
    setShowConfirm(true);
  }

  async function doSave() {
    setSaving(true);
    setSaveError(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/settings/database", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": readCsrfToken()
        },
        body: JSON.stringify({ config: buildConfig() })
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setSaveError(data.error || "Failed to save database configuration");
        return;
      }

      window.location.reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save database configuration");
    } finally {
      setSaving(false);
      setShowConfirm(false);
      setConfirmValue("");
    }
  }

  function handleFileUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setter(String(reader.result ?? ""));
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="muted-card">
        <div><strong>Active backend:</strong> {currentSummary}</div>
        <div><strong>Config source:</strong> {initialSettings.isDefault ? "Default local SQLite" : "Saved in system settings"}</div>
        <div><strong>Last validated:</strong> {initialSettings.lastValidatedAt ?? "Never"}</div>
        {initialSettings.lastValidationError && (
          <div style={{ color: "#cf1322", marginTop: "0.5rem" }}>
            <strong>Last error:</strong> {initialSettings.lastValidationError}
          </div>
        )}
      </div>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Backend</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label className="choice-option">
              <input
                type="radio"
                name="dbMode"
                value="sqlite"
                checked={mode === "sqlite"}
                onChange={() => setMode("sqlite")}
              />
              SQLite
            </label>
            <label className="choice-option">
              <input
                type="radio"
                name="dbMode"
                value="mysql"
                checked={mode === "mysql"}
                onChange={() => setMode("mysql")}
              />
              MySQL / MariaDB
            </label>
          </div>
        </label>
      </div>

      {mode === "sqlite" && (
        <div className="form-grid">
          <label className="field">
            <span className="field-label">SQLite File Path</span>
            <input
              type="text"
              value={sqlitePath}
              onChange={(event) => setSqlitePath(event.target.value)}
              placeholder=".data/treeforms.sqlite"
              style={{ width: "100%" }}
            />
          </label>
          <p className="helper-text">
            Relative paths stay inside the workspace. The app will create the file if needed.
          </p>
        </div>
      )}

      {mode === "mysql" && (
        <>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label className="field">
              <span className="field-label">Host</span>
              <input
                type="text"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                style={{ width: "100%" }}
              />
            </label>
            <label className="field">
              <span className="field-label">Port</span>
              <input
                type="number"
                value={port}
                onChange={(event) => setPort(event.target.value)}
                style={{ width: "100%" }}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Database Name</span>
            <input
              type="text"
              value={database}
              onChange={(event) => setDatabase(event.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label className="field">
              <span className="field-label">Username</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                style={{ width: "100%" }}
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={initialSettings.secrets.hasPassword ? "Stored password will be reused" : "Optional"}
                style={{ width: "100%" }}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">SSL Mode</span>
            <select
              value={sslMode}
              onChange={(event) =>
                setSslMode(event.target.value as "disabled" | "preferred" | "required")
              }
              style={{ width: "100%" }}
            >
              <option value="disabled">Disabled</option>
              <option value="preferred">Preferred</option>
              <option value="required">Required</option>
            </select>
          </label>

          {sslMode !== "disabled" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                padding: "1rem",
                backgroundColor: "var(--surface-strong)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)"
              }}
            >
              <label className="field">
                <span className="field-label">CA Certificate</span>
                <input type="file" accept=".pem,.crt,.ca-bundle" onChange={(event) => handleFileUpload(event, setSslCaCert)} />
                {initialSettings.secrets.hasSslCaCert && !sslCaCert && (
                  <span className="helper-text">Stored CA certificate will be reused.</span>
                )}
              </label>
              <label className="field">
                <span className="field-label">Client Certificate</span>
                <input type="file" accept=".pem,.crt" onChange={(event) => handleFileUpload(event, setSslClientCert)} />
                {initialSettings.secrets.hasSslClientCert && !sslClientCert && (
                  <span className="helper-text">Stored client certificate will be reused.</span>
                )}
              </label>
              <label className="field">
                <span className="field-label">Client Key</span>
                <input type="file" accept=".pem,.key" onChange={(event) => handleFileUpload(event, setSslClientKey)} />
                {initialSettings.secrets.hasSslClientKey && !sslClientKey && (
                  <span className="helper-text">Stored client key will be reused.</span>
                )}
              </label>
            </div>
          )}
        </>
      )}

      {statusMessage && (
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "var(--radius)",
            border: `1px solid ${statusMessage.ok ? "#52c41a" : "#ff4d4f"}`,
            backgroundColor: statusMessage.ok ? "#f6ffed" : "#fff2f0",
            color: statusMessage.ok ? "#52c41a" : "#cf1322"
          }}
        >
          {statusMessage.message}
        </div>
      )}

      {saveError && (
        <div className="notice-error">
          <strong>Save failed</strong>
          {saveError}
        </div>
      )}

      <div className="inline-stack">
        <button type="button" onClick={handleTest} disabled={testing} className="button-secondary">
          {testing ? (
            <>
              <span className="spinner spinner-dark" />
              Testing...
            </>
          ) : (
            "Test Connection"
          )}
        </button>
        <button type="button" onClick={handleSave} disabled={saving} className="button-primary">
          {saving ? (
            <>
              <span className="spinner" />
              Saving...
            </>
          ) : (
            "Save Configuration"
          )}
        </button>
      </div>

      {showConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(12, 24, 22, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
        >
          <div className="card scale-in" style={{ padding: "2rem", maxWidth: 520, width: "90%" }}>
            <h3 style={{ marginTop: 0 }}>Confirm Database Switch</h3>
            <div className="notice-error" style={{ marginBottom: "1rem" }}>
              <strong>Warning:</strong> TreeForms does not migrate existing data when you switch backends.
            </div>
            <p>
              Type <strong>CONFIRM</strong> to save this backend change.
            </p>
            <label className="field">
              <input
                type="text"
                value={confirmValue}
                onChange={(event) => setConfirmValue(event.target.value)}
                placeholder="Type CONFIRM"
                style={{ width: "100%", marginBottom: "1rem" }}
              />
            </label>
            <div className="inline-stack">
              <button type="button" onClick={() => setShowConfirm(false)} className="button-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={doSave}
                className="button-primary"
                disabled={confirmValue !== "CONFIRM" || saving}
                style={{ backgroundColor: "#cf1322" }}
              >
                {saving ? (
                  <>
                    <span className="spinner" />
                    Saving...
                  </>
                ) : (
                  "Confirm Change"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
