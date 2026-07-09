import { describe, expect, it, vi, beforeEach } from "vitest";

// No real network calls — the artifact loader and the deliveries table are
// both mocked so this test exercises only the Delivery Engine's own pipeline
// logic (validate -> insert pending -> call adapter -> update sent/failed).
const { mockGetFileBackedArtifact } = vi.hoisted(() => ({ mockGetFileBackedArtifact: vi.fn() }));
vi.mock("../lib/artifactEngine", () => ({
  getFileBackedArtifact: mockGetFileBackedArtifact,
}));

type FakeRow = {
  id: number;
  projectId: number;
  artifactId: number;
  provider: string;
  target: Record<string, unknown>;
  status: string;
  externalRef: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

let nextId = 1;
let lastInsertedRow: FakeRow | null = null;

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          lastInsertedRow = {
            id: nextId++,
            projectId: values.projectId as number,
            artifactId: values.artifactId as number,
            provider: values.provider as string,
            target: values.target as Record<string, unknown>,
            status: values.status as string,
            externalRef: null,
            error: null,
            createdAt: new Date("2026-07-09T00:00:00.000Z"),
            sentAt: null,
          };
          return [lastInsertedRow];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            const updated = { ...(lastInsertedRow as FakeRow), ...patch };
            lastInsertedRow = updated;
            return [updated];
          }),
        })),
      })),
    })),
  },
  deliveriesTable: { id: "id" },
}));

import {
  deliverArtifact,
  registerDeliveryAdapter,
  getDeliveryAdapter,
  listDeliveryProviders,
  type DeliveryAdapter,
} from "../lib/deliveryEngine";

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 1;
  lastInsertedRow = null;
});

function fakeArtifact(preview: Record<string, unknown> = { title: "Draft", body: "Hello" }) {
  return {
    row: {
      id: 42,
      projectId: 7,
      title: "Draft",
      payload: { preview },
    },
    objectPath: "/fake/path",
    mimeType: "text/plain",
    extension: "txt",
  } as never;
}

describe("delivery engine — adapter registry", () => {
  it("registers and looks up adapters by provider", () => {
    const adapter: DeliveryAdapter = {
      provider: "email",
      label: "Send Email",
      validateTarget: (t) => t,
      send: vi.fn(async () => ({ externalRef: {} })),
    };
    registerDeliveryAdapter(adapter);
    expect(getDeliveryAdapter("email")).toBe(adapter);
    expect(listDeliveryProviders()).toContain("email");
  });

  it("returns undefined for an unregistered provider", () => {
    expect(getDeliveryAdapter("discord" as never)).toBeUndefined();
  });
});

describe("delivery engine — deliverArtifact pipeline", () => {
  it("records a sent delivery when the adapter succeeds", async () => {
    mockGetFileBackedArtifact.mockResolvedValueOnce(fakeArtifact());
    const send = vi.fn(async () => ({ externalRef: { messageId: "abc123" } }));
    registerDeliveryAdapter({
      provider: "email",
      label: "Send Email",
      validateTarget: (t) => t,
      send,
    });

    const result = await deliverArtifact({
      projectId: 7,
      artifactId: 42,
      provider: "email",
      target: { to: "person@example.com" },
    });

    expect(send).toHaveBeenCalledOnce();
    expect(result.status).toBe("sent");
    expect(result.externalRef).toEqual({ messageId: "abc123" });
    expect(result.error).toBeNull();
  });

  it("records a failed delivery — never throws — when the adapter fails", async () => {
    mockGetFileBackedArtifact.mockResolvedValueOnce(fakeArtifact());
    registerDeliveryAdapter({
      provider: "slack",
      label: "Post to Slack",
      validateTarget: (t) => t,
      send: vi.fn(async () => {
        throw new Error("Slack API error: channel_not_found");
      }),
    });

    const result = await deliverArtifact({
      projectId: 7,
      artifactId: 42,
      provider: "slack",
      target: { channel: "#nonexistent" },
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("channel_not_found");
    expect(result.externalRef).toBeNull();
  });

  it("throws before writing any row when the target fails validation", async () => {
    mockGetFileBackedArtifact.mockResolvedValueOnce(fakeArtifact());
    registerDeliveryAdapter({
      provider: "email",
      label: "Send Email",
      validateTarget: () => {
        throw new Error("A valid recipient email address is required");
      },
      send: vi.fn(async () => ({ externalRef: {} })),
    });

    await expect(
      deliverArtifact({ projectId: 7, artifactId: 42, provider: "email", target: {} }),
    ).rejects.toThrow("A valid recipient email address is required");
  });

  it("throws when no adapter is registered for the provider", async () => {
    await expect(
      deliverArtifact({ projectId: 7, artifactId: 42, provider: "teams", target: {} }),
    ).rejects.toThrow('no adapter registered for provider "teams"');
  });

  it("throws when the artifact does not exist", async () => {
    mockGetFileBackedArtifact.mockResolvedValueOnce(null);
    registerDeliveryAdapter({
      provider: "email",
      label: "Send Email",
      validateTarget: (t) => t,
      send: vi.fn(async () => ({ externalRef: {} })),
    });

    await expect(
      deliverArtifact({ projectId: 7, artifactId: 999, provider: "email", target: { to: "a@b.com" } }),
    ).rejects.toThrow("artifact not found");
  });
});
