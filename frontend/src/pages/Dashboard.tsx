import { useState, useRef, useEffect, useCallback } from "react";
import { calculateRoute } from "@/services/api";
import type { RouteRequest, RouteResponse } from "@/types/route";
import SearchPanel from "@/components/SearchPanel";
import RouteMap, { type RouteMapHandle } from "@/components/RouteMap";
import RouteSheet from "@/components/RouteSheet";
import UserButton from "@/components/UserButton";

import "@/styles/main.css";
import "@/styles/mobile.css";

type SearchStatus = "idle" | "loading" | "found" | "not-found" | "error";

function statusToLabel(s: SearchStatus): string {
  switch (s) {
    case "idle":      return "Lista";
    case "loading":   return "Calculando…";
    case "found":     return "Ruta encontrada";
    case "not-found": return "Sin ruta compatible";
    case "error":     return "Error al calcular";
  }
}

export default function Dashboard() {
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null);
  const [searchStatus, setSearchStatus]   = useState<SearchStatus>("idle");
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const mapRef = useRef<RouteMapHandle>(null);

  const isLoading   = searchStatus === "loading";
  const statusLabel = statusToLabel(searchStatus);

  useEffect(() => {
    if (routeResponse) setDrawerOpen(false);
  }, [routeResponse]);

  const handleSearch = useCallback(async (payload: RouteRequest) => {
    setSearchStatus("loading");
    setRouteResponse(null);
    try {
      const response = await calculateRoute(payload);
      setRouteResponse(response);
      setSearchStatus(response.found ? "found" : "not-found");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido.";
      setRouteResponse({
        found: false, routeId: null, distanceM: 0, estimatedDurationMin: 0,
        path: [], originLabel: payload.originLabel, destinationLabel: payload.destinationLabel,
        routeSummary: "Lo siento, ocurrió un error al calcular la ruta.", warnings: [msg],
      });
      setSearchStatus("error");
    }
  }, []);

  const handleFocusStart = useCallback(() => {
    mapRef.current?.focusRouteStart();
  }, []);

  return (
    <div className="app-shell">
      <div className="top-bar">
        <button className="top-bar-menu" onClick={() => setDrawerOpen(o => !o)} aria-label="Menú">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="6"  x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <img src="/safetruck-logo.png" className="top-bar-logo" alt="SafeTruck" />

        <button className="top-bar-search-btn" onClick={() => setDrawerOpen(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Planificá tu ruta…</span>
        </button>

        <div className="top-bar-chips">
          <button type="button" className="chip" onClick={() => setDrawerOpen(true)}>
            🚛 Calcular ruta
          </button>
          {routeResponse?.found && (
            <button type="button" className="chip chip--result" onClick={() => mapRef.current?.focusRouteStart()}>
              📍 Ver en mapa
            </button>
          )}
        </div>
      </div>

      <div className={`drawer${drawerOpen ? " drawer--open" : ""}`}>
        <div className="drawer-header">
          <div className="drawer-brand">
            <img src="/safetruck-logo.png" className="drawer-logo" alt="SafeTruck" />
            <div>
              <p className="drawer-eyebrow">Logística AMBA</p>
              <p className="drawer-name">SafeTruck</p>
            </div>
          </div>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <SearchPanel onSearch={handleSearch} isLoading={isLoading} statusLabel={statusLabel} />
      </div>

      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}

      <UserButton />
      <RouteMap ref={mapRef} routeResponse={routeResponse} />
      <RouteSheet routeResponse={routeResponse} onFocusStart={handleFocusStart} />
    </div>
  );
}
