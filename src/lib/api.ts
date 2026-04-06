type RequestOptions = {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
};

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status = 500, data: any = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  const params = options.params || {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => ({})) : await response.text().catch(() => "");

  if (!response.ok || (data && typeof data === "object" && "ok" in data && data.ok === false)) {
    const message =
      typeof data === "string"
        ? data
        : data?.error || data?.message || `${response.status} ${response.statusText}`.trim();
    throw new ApiError(message || "Request failed", response.status, data);
  }

  return data as T;
}
