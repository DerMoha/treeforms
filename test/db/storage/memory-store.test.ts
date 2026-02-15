import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { getStorage, resetStorage, memoryState } from "@/lib/db/storage";
import { type FormSchema } from "@/lib/types";

vi.mock("@/lib/db/platform", () => ({
  isAppDbConfigured: vi.fn().mockReturnValue(false),
  ensureAppTables: vi.fn().mockResolvedValue(undefined),
  getAppPool: vi.fn().mockReturnValue({}),
  createEphemeralExternalPool: vi.fn().mockReturnValue({
    end: vi.fn().mockResolvedValue(undefined)
  }),
  pingPool: vi.fn().mockResolvedValue(undefined),
  ensureSubmissionTables: vi.fn().mockResolvedValue(undefined),
  getExternalPool: vi.fn().mockReturnValue({}),
  getPlatformSubmissionPool: vi.fn().mockReturnValue({}),
  isSubmissionDbConfigured: vi.fn().mockReturnValue(false),
  buildMysqlUrl: vi.fn().mockReturnValue("mysql://user:pass@localhost:3306/db")
}));

function clearMemoryState() {
  memoryState.workspaces.clear();
  memoryState.forms.clear();
  memoryState.drafts.clear();
  memoryState.versions.clear();
  memoryState.sessions.clear();
  memoryState.sessionByResumeToken.clear();
  memoryState.dbTargets.clear();
  memoryState.auditEvents.length = 0;
}

describe("Storage Factory", () => {
  beforeEach(() => {
    resetStorage();
    clearMemoryState();
  });

  afterEach(() => {
    resetStorage();
    clearMemoryState();
  });

  describe("getStorage", () => {
    it("creates storage instance on first call", () => {
      const storage = getStorage();
      expect(storage).toBeDefined();
      expect(storage.forms).toBeDefined();
      expect(storage.sessions).toBeDefined();
      expect(storage.dbTargets).toBeDefined();
      expect(storage.audit).toBeDefined();
      expect(storage.platformSettings).toBeDefined();
      expect(storage.workspaces).toBeDefined();
    });

    it("returns same instance on subsequent calls", () => {
      const storage1 = getStorage();
      const storage2 = getStorage();
      expect(storage1).toBe(storage2);
    });

    it("returns new instance after reset", () => {
      const storage1 = getStorage();
      resetStorage();
      const storage2 = getStorage();
      expect(storage1).not.toBe(storage2);
    });
  });
});

describe("Memory Form Storage", () => {
  let storage: ReturnType<typeof getStorage>;

  beforeEach(() => {
    resetStorage();
    clearMemoryState();
    storage = getStorage();
  });

  describe("createForm", () => {
    it("creates a new form with auto-generated id and slug", async () => {
      const result = await storage.forms.createForm("ws-slug-1", "Test Form");
      
      expect(result.formId).toMatch(/^form_/);
      expect(result.title).toBe("Test Form");
      expect(result.slug).toBe("test-form");
    });

    it("generates unique slugs for duplicate titles", async () => {
      await storage.forms.createForm("ws-slug-2", "Test Form");
      await storage.forms.createForm("ws-slug-2", "Test Form");
      await storage.forms.createForm("ws-slug-2", "Test Form");

      const forms = await storage.forms.listForms("ws-slug-2");
      const slugs = forms.map((f) => f.slug);

      expect(new Set(slugs).size).toBe(3);
      expect(slugs).toContain("test-form");
      expect(slugs).toContain("test-form-2");
      expect(slugs).toContain("test-form-3");
    });
  });

  describe("getFormById", () => {
    it("returns form by id", async () => {
      const { formId } = await storage.forms.createForm("workspace-1", "Test Form");
      
      const form = await storage.forms.getFormById(formId);
      
      expect(form).not.toBeNull();
      expect(form?.formId).toBe(formId);
      expect(form?.title).toBe("Test Form");
    });

    it("returns null for non-existent form", async () => {
      const form = await storage.forms.getFormById("non-existent");
      expect(form).toBeNull();
    });
  });

  describe("getDraft", () => {
    it("returns draft with empty schema for new form", async () => {
      const { formId } = await storage.forms.createForm("workspace-1", "Test Form");
      
      const draft = await storage.forms.getDraft(formId);
      
      expect(draft).not.toBeNull();
      expect(draft?.formId).toBe(formId);
      
      const schema = JSON.parse(draft?.schemaJson ?? "{}");
      expect(schema.schemaVersion).toBe(1);
      expect(schema.title).toBe("Test Form");
      expect(schema.mainFlow.questions).toHaveLength(0);
      expect(schema.mainFlow.flowId).toMatch(/form_.*_main/);
    });
  });

  describe("updateDraft", () => {
    it("updates draft with valid schema", async () => {
      const { formId } = await storage.forms.createForm("workspace-1", "Test Form");
      const validSchema: FormSchema = {
        schemaVersion: 1,
        formId,
        title: "Updated Form",
        mainFlow: {
          flowId: `${formId}_main`,
          questions: [
            {
              questionId: "q1",
              type: "text",
              label: "Test question",
              required: true
            }
          ]
        }
      };

      const result = await storage.forms.updateDraft(formId, validSchema, "test-user");

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);

      const draft = await storage.forms.getDraft(formId);
      const schema = JSON.parse(draft?.schemaJson ?? "{}") as FormSchema;
      expect(schema.title).toBe("Updated Form");
    });

    it("returns validation errors for invalid schema", async () => {
      const { formId } = await storage.forms.createForm("workspace-1", "Test Form");
      const invalidSchema = {
        schemaVersion: 1,
        formId,
        title: "Invalid",
        mainFlow: {
          flowId: `${formId}_main`,
          questions: [
            {
              questionId: "q1",
              type: "unknown" as any,
              label: "Test",
              required: true
            }
          ]
        }
      } as FormSchema;

      const result = await storage.forms.updateDraft(formId, invalidSchema, "test-user");

      expect(result.ok).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });

  describe("publishDraft", () => {
    it("publishes valid draft as version", async () => {
      const { formId } = await storage.forms.createForm("workspace-1", "Test Form");
      const validSchema: FormSchema = {
        schemaVersion: 1,
        formId,
        title: "Publish Test",
        mainFlow: {
          flowId: `${formId}_main`,
          questions: [
            {
              questionId: "q1",
              type: "text",
              label: "Question",
              required: true
            }
          ]
        }
      };
      await storage.forms.updateDraft(formId, validSchema, "test-user");

      const result = await storage.forms.publishDraft(formId, "test-user");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.versionNumber).toBe(1);
        expect(result.versionId).toMatch(/^ver_/);
      }
    });

    it("returns error for non-existent form", async () => {
      const result = await storage.forms.publishDraft("non-existent", "test-user");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.error).toBe("Form not found");
      }
    });

    it("increments version number on subsequent publishes", async () => {
      const { formId } = await storage.forms.createForm("workspace-1", "Test Form");
      const schema: FormSchema = {
        schemaVersion: 1,
        formId,
        title: "Version Test",
        mainFlow: {
          flowId: `${formId}_main`,
          questions: [
            {
              questionId: "q1",
              type: "text",
              label: "Q1",
              required: true
            }
          ]
        }
      };
      
      await storage.forms.updateDraft(formId, schema, "test-user");
      await storage.forms.publishDraft(formId, "test-user");
      
      const result = await storage.forms.publishDraft(formId, "test-user");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.versionNumber).toBe(2);
      }
    });
  });

  describe("listVersions", () => {
    it("lists versions in descending order", async () => {
      const { formId } = await storage.forms.createForm("workspace-1", "Test Form");
      const schema: FormSchema = {
        schemaVersion: 1,
        formId,
        title: "Version Test",
        mainFlow: {
          flowId: `${formId}_main`,
          questions: [
            {
              questionId: "q1",
              type: "text",
              label: "Q",
              required: true
            }
          ]
        }
      };
      
      await storage.forms.updateDraft(formId, schema, "test-user");
      await storage.forms.publishDraft(formId, "test-user");
      await storage.forms.publishDraft(formId, "test-user");

      const versions = await storage.forms.listVersions(formId);

      expect(versions).toHaveLength(2);
      expect(versions[0].versionNumber).toBe(2);
      expect(versions[1].versionNumber).toBe(1);
    });
  });

  describe("getPublishedBySlug", () => {
    it("returns published version by slug and version number", async () => {
      const { formId, slug } = await storage.forms.createForm("workspace-1", "Test Form");
      const schema: FormSchema = {
        schemaVersion: 1,
        formId,
        title: "Slug Test",
        mainFlow: {
          flowId: `${formId}_main`,
          questions: [
            {
              questionId: "q1",
              type: "text",
              label: "Q",
              required: true
            }
          ]
        }
      };
      
      await storage.forms.updateDraft(formId, schema, "test-user");
      await storage.forms.publishDraft(formId, "test-user");

      const result = await storage.forms.getPublishedBySlug(slug, 1);

      expect(result).not.toBeNull();
      expect(result?.slug).toBe(slug);
      expect(result?.versionNumber).toBe(1);
    });

    it("returns null for non-existent slug", async () => {
      const result = await storage.forms.getPublishedBySlug("non-existent", 1);
      expect(result).toBeNull();
    });
  });
});

describe("Memory Session Storage", () => {
  let storage: ReturnType<typeof getStorage>;

  beforeEach(() => {
    resetStorage();
    clearMemoryState();
    storage = getStorage();
  });

  describe("createSession", () => {
    it("creates session with tokens", async () => {
      const result = await storage.sessions.createSession({
        workspaceId: "workspace-1",
        formId: "form_123",
        versionNumber: 1,
        currentQuestionId: "q1"
      });

      expect(result.sessionToken).toBeDefined();
      expect(result.resumeToken).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.sessionToken).toMatch(/^[a-f0-9]{32}$/);
      expect(result.resumeToken).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe("getSession", () => {
    it("returns session by token", async () => {
      const created = await storage.sessions.createSession({
        workspaceId: "workspace-1",
        formId: "form_123",
        versionNumber: 1,
        currentQuestionId: "q1"
      });

      const session = await storage.sessions.getSession(created.sessionToken);

      expect(session).not.toBeNull();
      expect(session?.sessionToken).toBe(created.sessionToken);
      expect(session?.resumeToken).toBe(created.resumeToken);
      expect(session?.formId).toBe("form_123");
      expect(session?.status).toBe("in_progress");
    });

    it("returns null for non-existent token", async () => {
      const session = await storage.sessions.getSession("non-existent");
      expect(session).toBeNull();
    });
  });

  describe("getSessionByResumeToken", () => {
    it("returns session by resume token", async () => {
      const created = await storage.sessions.createSession({
        workspaceId: "workspace-1",
        formId: "form_123",
        versionNumber: 1,
        currentQuestionId: "q1"
      });

      const session = await storage.sessions.getSessionByResumeToken(created.resumeToken);

      expect(session).not.toBeNull();
      expect(session?.sessionToken).toBe(created.sessionToken);
    });

    it("returns null for non-existent resume token", async () => {
      const session = await storage.sessions.getSessionByResumeToken("non-existent");
      expect(session).toBeNull();
    });
  });

  describe("updateSessionState", () => {
    it("updates session state", async () => {
      const created = await storage.sessions.createSession({
        workspaceId: "workspace-1",
        formId: "form_123",
        versionNumber: 1,
        currentQuestionId: "q1"
      });

      await storage.sessions.updateSessionState({
        sessionToken: created.sessionToken,
        currentQuestionId: "q2",
        answersJson: JSON.stringify({ q1: "answer1" }),
        historyJson: JSON.stringify(["q1", "q2"]),
        branchTraceJson: JSON.stringify(["branch1"])
      });

      const session = await storage.sessions.getSession(created.sessionToken);

      expect(session?.currentQuestionId).toBe("q2");
      expect(session?.answers).toEqual({ q1: "answer1" });
      expect(session?.history).toEqual(["q1", "q2"]);
      expect(session?.branchTrace).toEqual(["branch1"]);
    });

    it("does nothing for non-existent session", async () => {
      await expect(
        storage.sessions.updateSessionState({
          sessionToken: "non-existent",
          currentQuestionId: "q1",
          answersJson: "{}",
          historyJson: "[]",
          branchTraceJson: "[]"
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("markSessionCompleted", () => {
    it("marks session as completed", async () => {
      const created = await storage.sessions.createSession({
        workspaceId: "workspace-1",
        formId: "form_123",
        versionNumber: 1,
        currentQuestionId: "q1"
      });

      await storage.sessions.markSessionCompleted(created.sessionToken);

      const session = await storage.sessions.getSession(created.sessionToken);

      expect(session?.status).toBe("completed");
      expect(session?.currentQuestionId).toBeNull();
    });
  });

  describe("isSessionExpired", () => {
    it("returns true for expired session", () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const expired = storage.sessions.isSessionExpired({ expiresAt: pastDate });
      expect(expired).toBe(true);
    });

    it("returns false for non-expired session", () => {
      const futureDate = new Date(Date.now() + 10000).toISOString();
      const expired = storage.sessions.isSessionExpired({ expiresAt: futureDate });
      expect(expired).toBe(false);
    });
  });
});

describe("Memory Audit Storage", () => {
  let storage: ReturnType<typeof getStorage>;

  beforeEach(() => {
    resetStorage();
    clearMemoryState();
    storage = getStorage();
  });

  describe("writeEvent", () => {
    it("writes audit event", async () => {
      await storage.audit.writeEvent("workspace-1", "test-user", "form.created", {
        formId: "form_123",
        title: "Test Form"
      });
    });

    it("handles empty payload", async () => {
      await expect(
        storage.audit.writeEvent("workspace-1", "test-user", "form.viewed", {})
      ).resolves.toBeUndefined();
    });
  });
});

describe("Memory DB Target Storage", () => {
  let storage: ReturnType<typeof getStorage>;

  beforeEach(() => {
    resetStorage();
    clearMemoryState();
    storage = getStorage();
  });

  describe("testDbTarget", () => {
    it("always returns ok in memory mode", async () => {
      const result = await storage.dbTargets.testDbTarget({
        name: "Test DB",
        host: "localhost",
        port: 3306,
        user: "admin",
        password: "secret",
        databaseName: "test"
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("setActiveDbTarget", () => {
    it("sets active target with generated id", async () => {
      const result = await storage.dbTargets.setActiveDbTarget("workspace-1", {
        name: "Production DB",
        host: "localhost",
        port: 3306,
        user: "admin",
        password: "secret",
        databaseName: "production"
      });

      expect(result.targetId).toMatch(/^target_/);
    });

    it("deactivates previous active targets", async () => {
      await storage.dbTargets.setActiveDbTarget("workspace-1", {
        name: "First DB",
        host: "localhost",
        port: 3306,
        user: "admin",
        password: "secret",
        databaseName: "first"
      });

      await storage.dbTargets.setActiveDbTarget("workspace-1", {
        name: "Second DB",
        host: "localhost",
        port: 3306,
        user: "admin",
        password: "secret",
        databaseName: "second"
      });

      const active = await storage.dbTargets.getActiveDbTarget("workspace-1");
      expect(active?.name).toBe("Second DB");
    });
  });

  describe("getActiveDbTarget", () => {
    it("returns null when no active target", async () => {
      const target = await storage.dbTargets.getActiveDbTarget("workspace-1");
      expect(target).toBeNull();
    });

    it("returns active target", async () => {
      await storage.dbTargets.setActiveDbTarget("workspace-1", {
        name: "Test DB",
        host: "localhost",
        port: 3306,
        user: "admin",
        password: "secret",
        databaseName: "test"
      });

      const target = await storage.dbTargets.getActiveDbTarget("workspace-1");

      expect(target).not.toBeNull();
      expect(target?.name).toBe("Test DB");
      expect(target?.host).toBe("localhost");
      expect(target?.isActive).toBe(true);
    });
  });
});