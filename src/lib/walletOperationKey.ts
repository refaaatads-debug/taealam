// Store only a digest and an opaque key; never persist the note or financial payload.
export async function walletOperationKey(actorId: string, input: {
  action: "credit" | "debit"; userId: string; amount: number; note: string;
}): Promise<{ operationId: string; acknowledge: () => void }> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  const storageKey = `admin-wallet-pending:${actorId}`;
  let pending: { digest: string; operationId: string } | null = null;
  const raw = sessionStorage.getItem(storageKey);
  if (raw) {
    try { pending = JSON.parse(raw); } catch { /* Discard only an unreadable key. */ }
  }
  if (!pending || pending.digest !== digest || typeof pending.operationId !== "string") {
    pending = { digest, operationId: crypto.randomUUID() };
    // Fail before sending money if a retry key cannot be saved.
    sessionStorage.setItem(storageKey, JSON.stringify(pending));
  }
  const operationId = pending.operationId;
  return { operationId, acknowledge: () => sessionStorage.removeItem(storageKey) };
}
