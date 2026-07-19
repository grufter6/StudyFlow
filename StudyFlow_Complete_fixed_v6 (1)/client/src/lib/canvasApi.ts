export async function canvasFetch(canvasUrl: string, token: string, path: string) {
  const res = await fetch('/api/canvas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canvasUrl, token, path }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Canvas returned ${res.status}`);
  return data;
}

// Returns the user's display name from Canvas, or null if the call fails
// (bad token, wrong domain, not reachable, etc.) — callers should treat a
// null result as "can't confirm yet" rather than showing a hard error,
// since this typically runs automatically while someone is still typing.
export async function canvasGetName(canvasUrl: string, token: string): Promise<string | null> {
  try {
    const data = await canvasFetch(canvasUrl, token, '/api/v1/users/self');
    return data?.short_name || data?.name || null;
  } catch {
    return null;
  }
}
