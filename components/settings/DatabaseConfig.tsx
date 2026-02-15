"use client";

import React, { useState, useCallback } from "react";

import { readCsrfToken } from "@/lib/client/csrf";

type DbMode = "env-var" | "mysql" | "sqlite";

interface DbConfig {
  mode: DbMode;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  sslMode?: "disabled" | "preferred" | "required";
  sslCaCert?: string;
  sslClientCert?: string;
  sslClientKey?: string;
  sqlitePath?: string;
}

interface DatabaseConfigProps {
  initialConfig: DbConfig | null;
  currentSource: "environment-variable" | "stored-configuration" | "none";
  hasEnvVar: boolean;
}

export default function DatabaseConfig({
  initialConfig,
  currentSource,
  hasEnvVar
}: DatabaseConfigProps) {
  const [mode, setMode] = useState<DbMode>(initialConfig?.mode ?? "env-var");
  const [host, setHost] = useState(initialConfig?.host ?? "");
  const [port, setPort] = useState(initialConfig?.port?.toString() ?? "3306");
  const [database, setDatabase] = useState(initialConfig?.database ?? "");
  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState("");
  const [sslMode, setSslMode] = useState<"disabled" | "preferred" | "required">(
    initialConfig?.sslMode ?? "disabled"
  );
  const [sslCaCert, setSslCaCert] = useState(initialConfig?.sslCaCert ?? "");
  const [sslClientCert, setSslClientCert] = useState(
    initialConfig?.sslClientCert ?? ""
  );
  const [sslClientKey, setSslClientKey] = useState(
    initialConfig?.sslClientKey ?? ""
  );
  const [sqlitePath, setSqlitePath] = useState(
    initialConfig?.sqlitePath ?? ".data/treeforms-local.sqlite"
  );

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const getConfig = useCallback((): DbConfig => {
    if (mode === "env-var") {
      return { mode };
    }
    if (mode === "sqlite") {
      return {
        mode,
        sqlitePath: sqlitePath || ".data/treeforms-local.sqlite"
      };
    }
    return {
      mode,
      host,
      port: parseInt(port, 10) || 3306,
      database,
      username,
      password: password || initialConfig?.password || "",
      sslMode,
      sslCaCert: sslMode === "disabled" ? undefined : sslCaCert,
      sslClientCert: sslMode === "disabled" ? undefined : sslClientCert,
      sslClientKey: sslMode === "disabled" ? undefined : sslClientKey
    };
  }, [
    mode,
    host,
    port,
    database,
    username,
    password,
    sslMode,
    sslCaCert,
    sslClientCert,
    sslClientKey,
    sqlitePath,
    initialConfig?.password
  ]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setSaveError(null);

    try {
      const config = getConfig();

      const res = await fetch("/api/settings/database/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": readCsrfToken()
        },
        body: JSON.stringify({ config })
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setTestResult({ success: true, message: "Connection successful!" });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Connection failed"
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!testResult?.success && mode !== "sqlite") {
      setSaveError("Please test the connection before saving.");
      return;
    }

    setShowConfirm(true);
  };

  const doSave = async () => {
    setShowConfirm(false);
    setSaving(true);
    setSaveError(null);

    try {
      const config = getConfig();

      const res = await fetch("/api/settings/database", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": readCsrfToken()
        },
        body: JSON.stringify({ config })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setSaveError(data.error || "Failed to save configuration");
      } else {
        setSaveError(null);
        setTestResult(null);
        // Reload to get updated state
        window.location.reload();
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setter(e.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Current Status */}
      <div
        style={{
          padding: "1rem",
          backgroundColor:
            currentSource === "environment-variable"
              ? "#e6f3ff"
              : currentSource === "stored-configuration"
                ? "#e6ffe6"
                : "#fff3e6",
          borderRadius: "4px",
          border: `1px solid ${
            currentSource === "environment-variable"
              ? "#1890ff"
              : currentSource === "stored-configuration"
                ? "#52c41a"
                : "#faad14"
          }`
        }}
      >
        <strong>Current Source:</strong>{" "}
        {currentSource === "environment-variable" &&
          "Using SUBMISSION_DATABASE_URL environment variable"}
        {currentSource === "stored-configuration" &&
          "Using configuration stored in database"}
        {currentSource === "none" && "No database configured"}
      </div>

      {/* Mode Selection */}
      <div>
        <label style={{ display: "block", marginBottom: "0.5rem" }}>
          Database Mode
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="radio"
              name="dbMode"
              value="env-var"
              checked={mode === "env-var"}
              onChange={() => setMode("env-var")}
              disabled={!hasEnvVar}
            />
            <span>Use Environment Variable</span>
            {!hasEnvVar && (
              <span style={{ color: "#999", fontSize: "0.875rem" }}>
                (not configured)
              </span>
            )}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="radio"
              name="dbMode"
              value="mysql"
              checked={mode === "mysql"}
              onChange={() => setMode("mysql")}
            />
            <span>MySQL / MariaDB</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="radio"
              name="dbMode"
              value="sqlite"
              checked={mode === "sqlite"}
              onChange={() => setMode("sqlite")}
            />
            <span>SQLite (Local Development)</span>
          </label>
        </div>
      </div>

      {/* MySQL Configuration */}
      {mode === "mysql" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>
                Host <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="localhost"
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>
                Port <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="3306"
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>
              Database Name <span style={{ color: "red" }}>*</span>
            </label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="treeforms_submissions"
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>
                Username <span style={{ color: "red" }}>*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="treeforms_user"
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={initialConfig?.password ? "•••••••• (unchanged)" : ""}
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
          </div>

          {/* SSL Configuration */}
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              SSL Mode
            </label>
            <select
              value={sslMode}
              onChange={(e) =>
                setSslMode(e.target.value as "disabled" | "preferred" | "required")
              }
              style={{ width: "100%", padding: "0.5rem" }}
            >
              <option value="disabled">Disabled</option>
              <option value="preferred">Preferred (use if available)</option>
              <option value="required">Required (must use SSL)</option>
            </select>
          </div>

          {sslMode !== "disabled" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                padding: "1rem",
                backgroundColor: "#f5f5f5",
                borderRadius: "4px"
              }}
            >
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem" }}>
                  CA Certificate (optional)
                </label>
                <input
                  type="file"
                  accept=".pem,.crt,.ca-bundle"
                  onChange={(e) => handleFileUpload(e, setSslCaCert)}
                />
                {sslCaCert && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                    {sslCaCert.length} bytes loaded
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem" }}>
                    Client Certificate (optional)
                  </label>
                  <input
                    type="file"
                    accept=".pem,.crt"
                    onChange={(e) => handleFileUpload(e, setSslClientCert)}
                  />
                  {sslClientCert && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                      {sslClientCert.length} bytes loaded
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem" }}>
                    Client Key (optional)
                  </label>
                  <input
                    type="file"
                    accept=".pem,.key"
                    onChange={(e) => handleFileUpload(e, setSslClientKey)}
                  />
                  {sslClientKey && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                      {sslClientKey.length} bytes loaded
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* SQLite Configuration */}
      {mode === "sqlite" && (
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>
            Database File Path
          </label>
          <input
            type="text"
            value={sqlitePath}
            onChange={(e) => setSqlitePath(e.target.value)}
            placeholder=".data/treeforms-local.sqlite"
            style={{ width: "100%", padding: "0.5rem" }}
          />
          <p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
            Relative to the application root. Default: .data/treeforms-local.sqlite
          </p>
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: testResult.success ? "#f6ffed" : "#fff2f0",
            borderRadius: "4px",
            border: `1px solid ${testResult.success ? "#52c41a" : "#ff4d4f"}`
          }}
        >
          {testResult.message}
        </div>
      )}

      {/* Save Error */}
      {saveError && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "#fff2f0",
            borderRadius: "4px",
            border: "1px solid #ff4d4f",
            color: "#cf1322"
          }}
        >
          {saveError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "1rem" }}>
        {mode !== "sqlite" && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || mode === "env-var"}
            className="button-secondary"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="button-primary"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "8px",
              maxWidth: "500px",
              width: "90%"
            }}
          >
            <h3 style={{ marginTop: 0 }}>Confirm Database Change</h3>
            <p style={{ color: "#cf1322", fontWeight: 500 }}>
              Warning: Changing the submission database will affect where new
              form submissions are stored. Existing submissions in the current
              database will not be automatically migrated.
            </p>
            <p>
              Are you sure you want to proceed? Type <strong>CONFIRM</strong> to
              continue:
            </p>
            <input
              type="text"
              placeholder="Type CONFIRM"
              style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem" }}
              onChange={(e) => {
                if (e.target.value === "CONFIRM") {
                  e.target.dataset.confirmed = "true";
                } else {
                  delete e.target.dataset.confirmed;
                }
              }}
            />
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="button-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  const input = e.currentTarget.parentElement?.previousElementSibling as HTMLInputElement;
                  if (input?.dataset.confirmed === "true") {
                    doSave();
                  }
                }}
                className="button-primary"
                style={{ backgroundColor: "#cf1322" }}
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
