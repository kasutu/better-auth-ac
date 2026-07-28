import { API_ORIGIN } from "./auth-client";

export async function api<T>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const { body, ...init } = options;
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}
