import { useEffect, useRef, useState } from "react";
import { calculateRoute } from "@/services/api";
import {
  searchLocations,
  geocodeLocation,
  type GeoSuggestion,
} from "@/services/geocoding";
import type { RouteResponse } from "@/types/route";
import type { Truck } from "@/types/auth";

const MIN_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 350;
const MAX_SUGGESTIONS = 6;
const BLUR_CLOSE_DELAY_MS = 150;
const PLACEHOLDER = "#9ca3af";

const ROUTING_OPTIONS = {
  avoidTolls: true,
  preferHighways: true,
} as const;

interface Field {
  value: string;
  selected: GeoSuggestion | null;
  suggestions: GeoSuggestion[];
  open: boolean;
}

function emptyField(): Field {
  return { value: "", selected: null, suggestions: [], open: false };
}

interface Props {
  availableTrucks: Truck[];
  onRouteCalculated: (result: RouteResponse, truck: Truck) => void;
}

export default function RouteCalculator({
  availableTrucks,
  onRouteCalculated,
}: Props) {
  const [origin, setOrigin] = useState<Field>(emptyField());
  const [destination, setDestination] = useState<Field>(emptyField());
  const [truckId, setTruckId] = useState<number | null>(
    availableTrucks[0]?.id ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const originTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si la lista de camiones cambia (p.ej. uno se libera o se agrega),
  // mantenemos seleccionado el actual o caemos al primero disponible.
  useEffect(() => {
    if (truckId && availableTrucks.some((t) => t.id === truckId)) return;
    setTruckId(availableTrucks[0]?.id ?? null);
  }, [availableTrucks, truckId]);

  const selectedTruck = availableTrucks.find((t) => t.id === truckId) ?? null;

  if (availableTrucks.length === 0) {
    return (
      <Section title="Calcular ruta">
        <p style={{ color: PLACEHOLDER, fontSize: "0.88rem", margin: 0 }}>
          No hay camiones disponibles para calcular rutas.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Calcular ruta">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <AutocompleteField
          label="Origen"
          placeholder="Dirección de salida"
          field={origin}
          setField={setOrigin}
          timerRef={originTimerRef}
        />

        <AutocompleteField
          label="Destino"
          placeholder="Dirección de llegada"
          field={destination}
          setField={setDestination}
          timerRef={destTimerRef}
        />

        <div>
          <label className="st-label">Camión</label>
          <select
            className="st-select"
            value={truckId ?? ""}
            onChange={(e) => setTruckId(Number(e.target.value))}
            required
          >
            {availableTrucks.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTruckOption(t)}
              </option>
            ))}
          </select>
        </div>

        {error && <ErrorMessage message={error} />}

        <button
          type="submit"
          className="st-btn-primary"
          style={{ width: "100%" }}
          disabled={loading || !selectedTruck}
        >
          {loading ? "Calculando…" : "Calcular ruta"}
        </button>
      </form>
    </Section>
  );

  async function handleSubmit() {
    if (!selectedTruck) {
      setError("Seleccioná un camión.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const [resolvedOrigin, resolvedDestination] = await Promise.all([
        resolveField(origin, setOrigin),
        resolveField(destination, setDestination),
      ]);

      const response = await calculateRoute({
        originLabel: resolvedOrigin.label,
        destinationLabel: resolvedDestination.label,
        origin: { lat: resolvedOrigin.lat, lon: resolvedOrigin.lon },
        destination: {
          lat: resolvedDestination.lat,
          lon: resolvedDestination.lon,
        },
        vehicle: {
          maxWeightKg: selectedTruck.max_weight_kg,
          maxHeightM: selectedTruck.max_height_m,
          maxWidthM: selectedTruck.max_width_m,
          maxLengthM: selectedTruck.max_length_m,
        },
        routingOptions: { ...ROUTING_OPTIONS },
      });

      if (!response.found) {
        setError(response.routeSummary || "No se encontró una ruta compatible.");
        return;
      }

      onRouteCalculated(response, selectedTruck);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al calcular la ruta.",
      );
    } finally {
      setLoading(false);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatTruckOption(t: Truck): string {
  const tons = (t.max_weight_kg / 1000).toFixed(1).replace(/\.0$/, "");
  return `${t.name} · ${tons} t · ${t.max_height_m} m alt`;
}

async function resolveField(
  field: Field,
  setter: React.Dispatch<React.SetStateAction<Field>>,
): Promise<GeoSuggestion> {
  if (field.selected) return field.selected;
  const trimmed = field.value.trim();
  if (!trimmed) {
    throw new Error("Completá el origen y el destino.");
  }
  const resolved = await geocodeLocation(trimmed);
  setter({
    value: resolved.label,
    selected: resolved,
    suggestions: [],
    open: false,
  });
  return resolved;
}

// ── Subcomponentes ───────────────────────────────────────────────────────

interface AutocompleteFieldProps {
  label: string;
  placeholder: string;
  field: Field;
  setField: React.Dispatch<React.SetStateAction<Field>>;
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

function AutocompleteField({
  label,
  placeholder,
  field,
  setField,
  timerRef,
}: AutocompleteFieldProps) {
  return (
    <div style={{ position: "relative" }}>
      <label className="st-label">{label}</label>
      <input
        className="st-input"
        placeholder={placeholder}
        value={field.value}
        onChange={(e) => handleInput(setField, timerRef, e.target.value)}
        onBlur={() => handleBlur(setField)}
        autoComplete="off"
        required
      />
      {field.open && field.suggestions.length > 0 && (
        <ul style={dropdownStyle}>
          {field.suggestions.slice(0, MAX_SUGGESTIONS).map((s, i) => (
            <li
              key={`${s.label}-${i}`}
              style={dropdownItemStyle}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#fafafa")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              onMouseDown={(ev) => {
                ev.preventDefault();
                handleSelect(setField, s);
              }}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function handleInput(
  setter: React.Dispatch<React.SetStateAction<Field>>,
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  value: string,
) {
  setter((f) => ({ ...f, value, selected: null, open: false }));
  if (timerRef.current) clearTimeout(timerRef.current);
  if (value.trim().length < MIN_QUERY_LENGTH) {
    setter((f) => ({ ...f, suggestions: [], open: false }));
    return;
  }
  timerRef.current = setTimeout(async () => {
    const suggestions = await searchLocations(value.trim()).catch(() => []);
    setter((f) => ({
      ...f,
      suggestions,
      open: suggestions.length > 0,
    }));
  }, SEARCH_DEBOUNCE_MS);
}

function handleSelect(
  setter: React.Dispatch<React.SetStateAction<Field>>,
  s: GeoSuggestion,
) {
  setter({ value: s.label, selected: s, suggestions: [], open: false });
}

function handleBlur(setter: React.Dispatch<React.SetStateAction<Field>>) {
  // Pequeño delay para que el onMouseDown del item alcance a registrarse.
  setTimeout(
    () => setter((f) => ({ ...f, open: false })),
    BLUR_CLOSE_DELAY_MS,
  );
}

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

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      style={{
        background: "rgba(229,57,53,0.06)",
        border: "1px solid rgba(229,57,53,0.2)",
        borderRadius: 10,
        padding: 12,
      }}
    >
      <p
        style={{
          color: "#c62828",
          fontWeight: 700,
          fontSize: "0.85rem",
          margin: 0,
        }}
      >
        {message}
      </p>
    </div>
  );
}

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
  zIndex: 600,
  margin: 0,
  padding: "4px 0",
  listStyle: "none",
  maxHeight: 200,
  overflowY: "auto",
};

const dropdownItemStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "0.88rem",
  color: "#0d0d0d",
  cursor: "pointer",
};

