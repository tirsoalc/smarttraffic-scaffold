import type {
  CreateTrafficRecordRequest,
  MapPoint,
  SimulationRequest,
  TrafficInsightResponse,
  TrafficRecord,
  TrafficStatsResponse
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(text || `Request failed with status ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export async function getTrafficRecords(): Promise<TrafficRecord[]> {
  return request<TrafficRecord[]>("/traffic-records");
}

export async function createTrafficRecord(
  payload: CreateTrafficRecordRequest
): Promise<TrafficRecord> {
  return request<TrafficRecord>("/traffic-records", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getTrafficStats(groupBy: string): Promise<TrafficStatsResponse> {
  return request<TrafficStatsResponse>(`/traffic-stats?groupBy=${encodeURIComponent(groupBy)}`);
}

export async function getTrafficInsights(): Promise<TrafficInsightResponse> {
  return request<TrafficInsightResponse>("/traffic-insights");
}

export async function generateSimulation(
  payload: SimulationRequest
): Promise<TrafficRecord[]> {
  return request<TrafficRecord[]>("/simulations/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getTrafficMap(): Promise<MapPoint[]> {
  return request<MapPoint[]>("/traffic-map");
}

export async function getExport(format: "csv" | "json"): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/exports?format=${format}`);
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(text || `Export failed with status ${response.status}`, response.status);
  }
  return response.blob();
}

export { API_BASE_URL, ApiError };
