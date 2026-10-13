/** Persist before fetch so retries, refreshes and lost responses reuse the same key. */
export function prepareSubmission(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  body: Record<string, unknown>,
) {
  const serialized = JSON.stringify(body);
  const raw = storage.getItem(key);
  const previous = raw ? JSON.parse(raw) as { id: string; body: string } : null;
  const id = previous?.body === serialized ? previous.id : crypto.randomUUID();
  storage.setItem(key, JSON.stringify({ id, body: serialized }));
  return { ...body, submission_id: id };
}
