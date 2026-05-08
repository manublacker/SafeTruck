import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { TRIPS } from "./mockData";
import { useAvailability } from "./useAvailability";
import MapDisplay from "./MapDisplay";
import EmptyStateManager from "./EmptyStateManager";
import RouteCalculator from "./RouteCalculator";
import TripCreator from "./TripCreator";
import type { AdminPage } from "./AdminSidebar";
import type { RouteResponse } from "@/types/route";
import type { Truck } from "@/types/auth";

const MAP_PANEL_FLEX_BASIS = "55%";
const FORM_PANEL_FLEX_BASIS = "45%";
const PANEL_PADDING = 20;
const PANEL_GAP = 16;

interface Props {
  onNavigate: (page: AdminPage) => void;
}

export default function LiveMapContainer({ onNavigate }: Props) {
  const { user, drivers } = useAuth();
  const trucks = user?.trucks ?? [];

  const { availableTrucks, availableDrivers } = useAvailability(
    trucks,
    drivers,
    TRIPS,
  );

  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null);
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);

  const hasTrucks = trucks.length > 0;
  const hasAvailableTrucks = availableTrucks.length > 0;
  const hasAvailableDrivers = availableDrivers.length > 0;

  const blocking = !hasTrucks; // Sin camiones registrados, no hay nada que mostrar.

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#fff",
      }}
    >
      <div
        style={{
          flex: `0 0 ${MAP_PANEL_FLEX_BASIS}`,
          padding: PANEL_PADDING,
          minHeight: 0,
        }}
      >
        <MapDisplay routeResponse={routeResult} />
      </div>

      <div
        style={{
          flex: `1 1 ${FORM_PANEL_FLEX_BASIS}`,
          borderTop: "1px solid #f0f0f0",
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        {blocking ? (
          <EmptyStateManager
            hasTrucks={hasTrucks}
            hasAvailableDrivers={hasAvailableDrivers}
            hasAvailableTrucks={hasAvailableTrucks}
            onNavigate={onNavigate}
          />
        ) : (
          <NormalFlow
            availableTrucks={availableTrucks}
            availableDrivers={availableDrivers}
            hasTrucks={hasTrucks}
            hasAvailableDrivers={hasAvailableDrivers}
            hasAvailableTrucks={hasAvailableTrucks}
            routeResult={routeResult}
            selectedTruck={selectedTruck}
            onRouteCalculated={(res, truck) => {
              setRouteResult(res);
              setSelectedTruck(truck);
            }}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  );
}

interface NormalFlowProps {
  availableTrucks: Truck[];
  availableDrivers: ReturnType<typeof useAvailability>["availableDrivers"];
  hasTrucks: boolean;
  hasAvailableDrivers: boolean;
  hasAvailableTrucks: boolean;
  routeResult: RouteResponse | null;
  selectedTruck: Truck | null;
  onRouteCalculated: (res: RouteResponse, truck: Truck) => void;
  onNavigate: (page: AdminPage) => void;
}

function NormalFlow({
  availableTrucks,
  availableDrivers,
  hasTrucks,
  hasAvailableDrivers,
  hasAvailableTrucks,
  routeResult,
  selectedTruck,
  onRouteCalculated,
  onNavigate,
}: NormalFlowProps) {
  const showNotice = !hasAvailableDrivers || !hasAvailableTrucks;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: PANEL_PADDING,
        gap: PANEL_GAP,
      }}
    >
      {showNotice && (
        <EmptyStateManager
          hasTrucks={hasTrucks}
          hasAvailableDrivers={hasAvailableDrivers}
          hasAvailableTrucks={hasAvailableTrucks}
          onNavigate={onNavigate}
        />
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        <RouteCalculator
          availableTrucks={availableTrucks}
          onRouteCalculated={onRouteCalculated}
        />
        <TripCreator
          routeResult={routeResult}
          availableDrivers={availableDrivers}
          selectedTruck={selectedTruck}
        />
      </div>
    </div>
  );
}
