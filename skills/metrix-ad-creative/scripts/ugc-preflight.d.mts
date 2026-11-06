export interface UgcVerdict {
  ok: boolean;
  errors: string[];
  warnings: string[];
  schema_version?: unknown;
  operation?: unknown;
}
export type UgcRouteOperation = "lip_sync" | "motion";
export const V1_ALLOWED_RUN_IDS: readonly string[];
export const ACCEPTANCE_CRITERIA: readonly ("mood" | "look" | "eyes_open_on_lens" | "expression")[];
export const ROUTE_OPERATIONS: readonly UgcRouteOperation[];
export function inspectUgcPacket(packetPath: string, options?: { observedDurationSeconds?: number; now?: number; operation?: UgcRouteOperation }): Promise<UgcVerdict>;
export function canonicalJson(value: unknown): string;
export function sha256(value: string | Uint8Array): string;
export function submitUgcPacket(packetPath: string, submit: (request: { model: string; input: Record<string, unknown> }) => Promise<string>, options?: { operation?: UgcRouteOperation }): Promise<{ taskId: string; model: string; receiptPath: string; warning?: string }>;
