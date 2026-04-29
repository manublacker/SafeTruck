export interface Coordinates {
  lat: number;
  lon: number;
}
export interface VehicleProfile {
  maxWeightKg: number;
  maxHeightM: number;
  maxWidthM: number;
  maxLengthM: number;
}
export interface RoutingOptions {
  avoidTolls: boolean;
  preferHighways: boolean;
}
export interface RouteRequest {
  originLabel: string;
  destinationLabel: string;
  origin: Coordinates;
  destination: Coordinates;
  vehicle: VehicleProfile;
  routingOptions: RoutingOptions;
}
export interface RouteNode {
  nodeId: string;
  lat: number;
  lon: number;
  label: string;
  geometry: Coordinates[];
}
export interface RouteResponse {
  found: boolean;
  routeId: string | null;
  tripId: number | null;
  originLabel: string;
  destinationLabel: string;
  distanceM: number;
  estimatedDurationMin: number;
  routeSummary: string;
  path: RouteNode[];
  snappedPoints: Coordinates[];
  warnings: string[];
}
export interface HealthResponse {
  status: string;
  service: string;
}
export interface SearchResult {
  nombre: string;
  nombreOriginal: string;
  lat: number;
  lon: number;
  score: string;
}