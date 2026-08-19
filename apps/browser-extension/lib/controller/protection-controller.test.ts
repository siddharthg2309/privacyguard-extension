import { createEnvelope } from "@privacy-guard/testing-fixtures";
import { privacyEngine } from "@privacy-guard/privacy-engine";
import { describe, expect, it, vi } from "vitest";

import type {
  CapturedPageSubmission,
  PageAttachment,
  PageCaptureMessage,
} from "../contracts/messages.js";
import type { ProtectionState } from "../state/protection-machine.js";
import { ProtectionController, type ScannerPort } from "./protection-controller.js";

function capture(content: string, attachments: PageAttachment[] = []): PageCaptureMessage {
  return {
    schemaVersion: 1,
    type: "PAGE_CAPTURE",
    requestId: crypto.randomUUID(),
    content,
    sourceLabel: "controlled-harness",
    attachments,
  };
}

function setup(scanner: ScannerPort) {
  const resumes: { requestId: string; content: string }[] = [];
  const cancellations: string[] = [];
  const states: ProtectionState[] = [];
  const controller = new ProtectionController({
    locale: "en-US",
    scanTimeoutMs: 100,
    scanner,
    submission: {
      resume: (requestId, content) => {
        resumes.push({ requestId, content });
        return Promise.resolve();
      },
      cancel: (requestId) => {
        cancellations.push(requestId);
        return Promise.resolve();
      },
    },
    view: { render: (state) => states.push(state) },
  });
  return { controller, resumes, cancellations, states };
}

function capturedAttachment(name = "notes.txt"): CapturedPageSubmission {
  const base = capture("Review this file", [
    { id: "file-1", name, mediaType: "text/plain", sizeBytes: 32 },
  ]);
  return {
    ...base,
    attachments: base.attachments.map((item) => ({
      ...item,
      file: new File(["Contact person@example.com"], name, { type: "text/plain" }),
    })),
  };
}

describe("protection controller", () => {
  it("automatically resumes exactly one safe submission", async () => {
    const scanner: ScannerPort = {
      scan: async (envelope, signal) => privacyEngine.scan(envelope, signal),
    };
    const { controller, resumes, cancellations } = setup(scanner);
    await controller.handleCapture(capture("Explain binary search."));
    expect(resumes).toHaveLength(1);
    expect(cancellations).toHaveLength(0);
    expect(controller.getState().status).toBe("COMPLETE");
  });

  it("starts a fresh transaction after a completed or cancelled submission", async () => {
    const scanner: ScannerPort = {
      scan: async (envelope, signal) => privacyEngine.scan(envelope, signal),
    };
    const { controller, resumes } = setup(scanner);
    await controller.handleCapture(capture("First safe prompt"));
    await controller.handleCapture(capture("Second safe prompt"));
    expect(resumes.map(({ content }) => content)).toEqual([
      "First safe prompt",
      "Second safe prompt",
    ]);

    await controller.handleCapture(capture("person@example.com"));
    await controller.cancel();
    await controller.handleCapture(capture("Third safe prompt"));
    expect(resumes.at(-1)?.content).toBe("Third safe prompt");
  });

  it("sends nothing until explicit redaction approval", async () => {
    const scanner: ScannerPort = {
      scan: async (envelope, signal) => privacyEngine.scan(envelope, signal),
    };
    const { controller, resumes } = setup(scanner);
    await controller.handleCapture(capture("Contact person@example.com"));
    expect(controller.getState().status).toBe("REVIEW_REQUIRED");
    expect(resumes).toHaveLength(0);
    await controller.redactAndContinue();
    expect(resumes).toHaveLength(1);
    expect(resumes[0]?.content).toBe("Contact [EMAIL]");
  });

  it("cancels and never resumes after a worker failure", async () => {
    const scanner: ScannerPort = { scan: vi.fn().mockRejectedValue(new Error("synthetic")) };
    const { controller, resumes, cancellations } = setup(scanner);
    await controller.handleCapture(capture("sensitive"));
    expect(controller.getState().status).toBe("PROTECTION_UNAVAILABLE");
    expect(resumes).toHaveLength(0);
    expect(cancellations).toHaveLength(1);
  });

  it("reports worker failure as protection unavailable", async () => {
    const onProtectionUnavailable = vi.fn().mockResolvedValue(undefined);
    const controller = new ProtectionController({
      locale: "en-US",
      scanTimeoutMs: 100,
      scanner: { scan: vi.fn().mockRejectedValue(new Error("synthetic")) },
      submission: { resume: vi.fn(), cancel: vi.fn().mockResolvedValue(undefined) },
      view: { render: vi.fn() },
      onProtectionUnavailable,
    });
    await controller.handleCapture(capture("sensitive"));
    expect(onProtectionUnavailable).toHaveBeenCalledWith("DETECTOR_EXECUTION_FAILED");
  });

  it("fails closed when an attachment cannot yet be inspected", async () => {
    const scanner = { scan: vi.fn() };
    const onProtectionUnavailable = vi.fn().mockResolvedValue(undefined);
    const cancel = vi.fn().mockResolvedValue(undefined);
    const controller = new ProtectionController({
      locale: "en-US",
      scanTimeoutMs: 100,
      scanner,
      submission: { resume: vi.fn(), cancel },
      view: { render: vi.fn() },
      onProtectionUnavailable,
    });
    await controller.handleCapture(
      capture("Review this file", [{ id: "file-1", name: "private.pdf", sizeBytes: 128 }]),
    );
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(onProtectionUnavailable).toHaveBeenCalledWith("ATTACHMENT_INSPECTION_UNAVAILABLE");
    expect(controller.getState().status).toBe("PROTECTION_UNAVAILABLE");
  });

  it("blocks a sensitive attachment without offering prompt-only redaction", async () => {
    const resume = vi.fn();
    const controller = new ProtectionController({
      locale: "en-US",
      scanTimeoutMs: 100,
      scanner: { scan: async (envelope, signal) => privacyEngine.scan(envelope, signal) },
      attachmentExtractor: {
        extract: vi.fn().mockResolvedValue([
          {
            id: "attachment:file-1",
            kind: "file",
            content: "Contact person@example.com",
            label: "notes.txt",
          },
        ]),
      },
      submission: { resume, cancel: vi.fn() },
      view: { render: vi.fn() },
    });
    await controller.handleCapture(capturedAttachment());
    expect(controller.getState()).toMatchObject({ status: "BLOCKED" });
    expect(controller.getState().decision?.sanitizedContent).toBeUndefined();
    expect(controller.getState().decision?.explanationCodes).toContain(
      "ATTACHMENT_REQUIRES_REMOVAL",
    );
    expect(resume).not.toHaveBeenCalled();
  });

  it("resumes a safe prompt with a locally inspected safe attachment", async () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    const controller = new ProtectionController({
      locale: "en-US",
      scanTimeoutMs: 100,
      scanner: { scan: async (envelope, signal) => privacyEngine.scan(envelope, signal) },
      attachmentExtractor: {
        extract: vi
          .fn()
          .mockResolvedValue([
            { id: "attachment:file-1", kind: "file", content: "Public release notes" },
          ]),
      },
      submission: { resume, cancel: vi.fn() },
      view: { render: vi.fn() },
    });
    const input = capturedAttachment("notes.txt");
    await controller.handleCapture(input);
    expect(controller.getState().status).toBe("COMPLETE");
    expect(resume).toHaveBeenCalledWith(input.requestId, "Review this file");
  });

  it("fails closed with the extraction error code when a document is malformed", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const unavailable = vi.fn().mockResolvedValue(undefined);
    const controller = new ProtectionController({
      locale: "en-US",
      scanTimeoutMs: 100,
      scanner: { scan: vi.fn() },
      attachmentExtractor: {
        extract: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error("malformed"), { code: "INPUT_DOCUMENT_MALFORMED" }),
          ),
      },
      submission: { resume: vi.fn(), cancel },
      view: { render: vi.fn() },
      onProtectionUnavailable: unavailable,
    });
    await controller.handleCapture(capturedAttachment("broken.docx"));
    expect(controller.getState()).toMatchObject({
      status: "PROTECTION_UNAVAILABLE",
      errorCode: "INPUT_DOCUMENT_MALFORMED",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(unavailable).toHaveBeenCalledWith("INPUT_DOCUMENT_MALFORMED");
  });

  it("does not complete when the page adapter fails to resume", async () => {
    const onProtectionUnavailable = vi.fn().mockResolvedValue(undefined);
    const controller = new ProtectionController({
      locale: "en-US",
      scanTimeoutMs: 100,
      scanner: { scan: async (envelope, signal) => privacyEngine.scan(envelope, signal) },
      submission: {
        resume: vi.fn().mockRejectedValue(new Error("adapter changed")),
        cancel: vi.fn().mockResolvedValue(undefined),
      },
      view: { render: vi.fn() },
      onProtectionUnavailable,
    });
    await controller.handleCapture(capture("Safe prompt"));
    expect(controller.getState().status).toBe("PROTECTION_UNAVAILABLE");
    expect(onProtectionUnavailable).toHaveBeenCalledWith("ADAPTER_RESUME_FAILED");
  });

  it("rejects a duplicate concurrent capture", async () => {
    let release: (() => void) | undefined;
    const scanner: ScannerPort = {
      scan: async (envelope) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return privacyEngine.scan(createEnvelope("safe", { requestId: envelope.requestId }));
      },
    };
    const { controller, cancellations } = setup(scanner);
    const first = controller.handleCapture(capture("safe"));
    await Promise.resolve();
    const duplicate = capture("second");
    await controller.handleCapture(duplicate);
    expect(cancellations).toContain(duplicate.requestId);
    release?.();
    await first;
  });
});
