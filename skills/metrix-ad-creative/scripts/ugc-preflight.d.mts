export interface UgcVerdict {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
export function inspectUgcPacket(packetPath: string, options?: { observedDurationSeconds?: number; now?: number }): Promise<UgcVerdict>;
export function canonicalJson(value: unknown): string;
export function sha256(value: string | Uint8Array): string;
export function submitUgcPacket(packetPath: string, submit: (request: { model: string; input: Record<string, unknown> }) => Promise<string>): Promise<{ taskId: string; model: string; receiptPath: string; warning?: string }>;
