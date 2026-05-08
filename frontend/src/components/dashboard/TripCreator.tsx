import { useEffect, useState } from "react";
import type { RouteResponse } from "@/types/route";
import type { Truck, Driver } from "@/types/auth";

const FLASH_DURATION_MS = 4000;
const MUTED = "#6b7280";
const PLACEHOLDER = "#9ca3af";

interface Props {
  routeResult: RouteResponse | null;
  availableDrivers: Driver[];
  selectedTruck: Truck | null;
}

interface DraftTrip {
  driverId: number | null;
  date: string;
  time: string;
}

function emptyDraft(driverId: number | null): DraftTrip {
  return { driverId, date: "", time: "" };
}

export default function TripCreator({
  routeResult,
  availableDrivers,
  selectedTruck,
}: Props) {
  const [draft, setDraft] = useState<DraftTrip>(() =>
    emptyDraft(availableDrivers[0]?.id ?? null),
  );
  const [flash, setFlash] = useState<string>("");

  // Si los drivers cambian (otro se libera), aseguramos selección válida.
  useEffect(() => {
    if (
      draft.driverId !== null &&
      availableDrivers.some((d) => d.id === draft.driverId)
    ) {
      return;
    }
    setDraft((d) => ({ ...d, driverId: availableDrivers[0]?.id ?? null }));
  }, [availableDrivers, draft.driverId]);

  // Auto-clear del flash de éxito.
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(""), FLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const hasRoute = Boolean(routeResult?.found);
  const hasDrivers = availableDrivers.length > 0;
  const formDisabled = !hasRoute || !hasDrivers;

  return (
    <Section title="Crear viaje">
      {!hasRoute && <Hint>Calculá una ruta primero para asignar el viaje.</Hint>}

      {hasRoute && !hasDrivers && (
        <Hint tone="warning">
          Sin conductores disponibles. Activá uno para poder asignar el viaje.
        </Hint>
      )}

      {hasRoute && selectedTruck && (
        <RouteSummary route={routeResult!} truckName={selectedTruck.name} />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginTop: 12,
          opacity: formDisabled ? 0.55 : 1,
          pointerEvents: formDisabled ? "none" : "auto",
        }}
        aria-disabled={formDisabled}
      >
        <div>
          <label className="st-label">Conductor</label>
          <select
            className="st-select"
            value={draft.driverId ?? ""}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                driverId: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
            disabled={formDisabled}
            required
          >
            {availableDrivers.length === 0 && (
              <option value="">Sin conductores disponibles</option>
            )}
            {availableDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
                {d.licencia ? ` · ${d.licencia}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="st-label">Fecha</label>
            <input
              type="date"
              className="st-input"
              value={draft.date}
              onChange={(e) =>
                setDraft((d) => ({ ...d, date: e.target.value }))
              }
              disabled={formDisabled}
              required
            />
          </div>
          <div>
            <label className="st-label">Hora</label>
            <input
              type="time"
              className="st-input"
              value={draft.time}
              onChange={(e) =>
                setDraft((d) => ({ ...d, time: e.target.value }))
              }
              disabled={formDisabled}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="st-btn-primary"
          style={{ width: "100%" }}
          disabled={formDisabled}
        >
          Crear viaje
        </button>

        {flash && <p className="st-flash-ok">{flash}</p>}
      </form>
    </Section>
  );

  function handleSubmit() {
    if (formDisabled) return;
    if (!routeResult || !selectedTruck) return;
    if (draft.driverId === null) return;

    const driver = availableDrivers.find((d) => d.id === draft.driverId);
    if (!driver) return;

    // No hay endpoint de creación todavía: persistimos solo en estado local
    // mediante el flash de feedback.
    setFlash(
      `Viaje creado para ${driver.nombre} · ${routeResult.originLabel} → ${routeResult.destinationLabel}`,
    );
    setDraft(emptyDraft(availableDrivers[0]?.id ?? null));
  }
}

// ── Subcomponentes ───────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2
        style={{
          fontSize: "0.95rem",
          fontWeight: 800,
          color: "#0d0d0d",
          margin: "0 0 16px",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Hint({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  const color = tone === "warning" ? "#c62828" : PLACEHOLDER;
  return (
    <p style={{ color, fontSize: "0.85rem", margin: "0 0 8px" }}>{children}</p>
  );
}

function RouteSummary({
  route,
  truckName,
}: {
  route: RouteResponse;
  truckName: string;
}) {
  return (
    <div
      style={{
        background: "#fafafa",
        border: "1px solid #f0f0f0",
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: "0.82rem",
        color: MUTED,
        lineHeight: 1.45,
      }}
    >
      <div>
        <strong style={{ color: "#0d0d0d" }}>{truckName}</strong>
      </div>
      <div>
        {route.originLabel} → {route.destinationLabel}
      </div>
      <div>
        {(route.distanceM / 1000).toFixed(1)} km · ~
        {route.estimatedDurationMin} min
      </div>
    </div>
  );
}
