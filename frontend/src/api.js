const base = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1"
).replace(/\/$/, "");
export async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The API returned an unreadable response.");
  }
  if (!response.ok) {
    const error = new Error(
      payload.error?.message ?? `Request failed (${response.status}).`,
    );
    error.fields = payload.error?.fields;
    throw error;
  }
  return payload;
}
export function query(values) {
  return new URLSearchParams(
    Object.entries(values).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
    ),
  ).toString();
}
