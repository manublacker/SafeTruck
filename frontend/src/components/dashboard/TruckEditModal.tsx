import { useState } from "react";
import type { Truck } from "@/types/auth";
import { createTruck, updateTruck } from "@/services/api";
import { Icons } from "./DashboardIcons";

const TRUCK_ESTADOS = ["Activo", "En ruta", "Mantenimiento", "Inactivo"] as const;
type TruckEstado = (typeof TRUCK_ESTADOS)[number];

interface Props {
  truck: Truck | null;
  onSave: () => void;
  onClose: () => void;
}

interface DraftTruck {
  name: string;
  patente: string;
  modelo: string;
  anio: string;
  km_actual: string;
  max_weight_kg: string;
  max_height_m: string;
  max_width_m: string;
  max_length_m: string;
  estado: TruckEstado;
  fecha_service: string;
  proximo_service: string;
}

const EMPTY_DRAFT: DraftTruck = {
  name:           "",
  patente:        "",
  modelo:         "",
  anio:           "",
  km_actual:      "",
  max_weight_kg:  "",
  max_height_m:   "",
  max_width_m:    "",
  max_length_m:   "",
  estado:         "Activo",
  fecha_service:  "",
  proximo_service:"",
};

function fromTruck(t: Truck): DraftTruck {
  return {
    name:           t.name,
    patente:        t.patente ?? "",
    modelo:         t.modelo ?? "",
    anio:           t.anio != null ? String(t.anio) : "",
    km_actual:      t.km_actual != null ? String(t.km_actual) : "",
    max_weight_kg:  String(t.max_weight_kg),
    max_height_m:   String(t.max_height_m),
    max_width_m:    String(t.max_width_m),
    max_length_m:   String(t.max_length_m),
    estado:         (TRUCK_ESTADOS as readonly string[]).includes(t.estado)
                      ? (t.estado as TruckEstado)
                      : "Activo",
    fecha_service:  t.fecha_service ?? "",
    proximo_service:t.proximo_service ?? "",
  };
}

function parseNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type BuildResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

function buildPayload(draft: DraftTruck): BuildResult {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: "El nombre es requerido." };

  const max_weight_kg = parseNumberOrNull(draft.max_weight_kg);
  const max_height_m  = parseNumberOrNull(draft.max_height_m);
  const max_width_m   = parseNumberOrNull(draft.max_width_m);
  const max_length_m  = parseNumberOrNull(draft.max_length_m);

  if (
    max_weight_kg === null ||
    max_height_m === null ||
    max_width_m === null ||
    max_length_m === null
  ) {
    return { ok: false, error: "Las dimensiones (peso, alto, ancho, largo) son requeridas." };
  }

  return {
    ok: true,
    data: {
      name,
      patente:         draft.patente.trim() || null,
      modelo:          draft.modelo.trim() || null,
      anio:            parseNumberOrNull(draft.anio),
      km_actual:       parseNumberOrNull(draft.km_actual),
      max_weight_kg,
      max_height_m,
      max_width_m,
      max_length_m,
      estado:          draft.estado,
      fecha_service:   draft.fecha_service || null,
      proximo_service: draft.proximo_service || null,
    },
  };
}

export default function TruckEditModal({ truck, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<DraftTruck>(() =>
    truck ? fromTruck(truck) : EMPTY_DRAFT,
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = truck !== null;
  const title = isEdit ? "Editar camión" : "Nuevo camión";

  const update =
    (k: keyof DraftTruck) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const result = buildPayload(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError("");
    setSaving(true);
    try {
      if (isEdit && truck) {
        await updateTruck(truck.id, result.data as Partial<Truck>);
      } else {
        await createTruck(result.data as Partial<Truck>);
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el camión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="st-modal-backdrop" onClick={onClose}>
      <form
        className="st-modal"
        style={{ maxWidth: 720 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <ModalHeader title={title} onClose={onClose} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Nombre*" required>
              <input
                className="st-input"
                value={draft.name}
                onChange={update("name")}
                placeholder="Ej. Camión 01"
                autoFocus
              />
            </Field>
            <Field label="Patente">
              <input
                className="st-input"
                value={draft.patente}
                onChange={update("patente")}
                placeholder="AC-742-PT"
              />
            </Field>
            <Field label="Modelo">
              <input
                className="st-input"
                value={draft.modelo}
                onChange={update("modelo")}
                placeholder="Iveco Tector"
              />
            </Field>
            <Field label="Año">
              <input
                className="st-input"
                type="number"
                value={draft.anio}
                onChange={update("anio")}
                placeholder="2022"
              />
            </Field>
            <Field label="Km actuales">
              <input
                className="st-input"
                type="number"
                value={draft.km_actual}
                onChange={update("km_actual")}
                placeholder="125000"
              />
            </Field>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Peso máx (kg)*" required>
              <input
                className="st-input"
                type="number"
                step="any"
                value={draft.max_weight_kg}
                onChange={update("max_weight_kg")}
                placeholder="15000"
              />
            </Field>
            <Field label="Alto máx (m)*" required>
              <input
                className="st-input"
                type="number"
                step="any"
                value={draft.max_height_m}
                onChange={update("max_height_m")}
                placeholder="3.5"
              />
            </Field>
            <Field label="Ancho máx (m)*" required>
              <input
                className="st-input"
                type="number"
                step="any"
                value={draft.max_width_m}
                onChange={update("max_width_m")}
                placeholder="2.5"
              />
            </Field>
            <Field label="Largo máx (m)*" required>
              <input
                className="st-input"
                type="number"
                step="any"
                value={draft.max_length_m}
                onChange={update("max_length_m")}
                placeholder="8.0"
              />
            </Field>
            <Field label="Estado">
              <select
                className="st-select"
                value={draft.estado}
                onChange={update("estado")}
              >
                {TRUCK_ESTADOS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Último service">
                <input
                  className="st-input"
                  type="date"
                  value={draft.fecha_service}
                  onChange={update("fecha_service")}
                />
              </Field>
              <Field label="Próximo service">
                <input
                  className="st-input"
                  type="date"
                  value={draft.proximo_service}
                  onChange={update("proximo_service")}
                />
              </Field>
            </div>
          </div>
        </div>

        {error && (
          <p style={{ color: "#c62828", fontWeight: 600, fontSize: "0.85rem", margin: "14px 0 0" }}>
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 22,
          }}
        >
          <button type="button" className="st-btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="submit"
            className="st-btn-primary"
            style={{ padding: "12px 20px" }}
            disabled={saving}
          >
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear camión"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 18,
      }}
    >
      <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0d0d0d", margin: 0 }}>
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#6b7280",
          width: 32,
          height: 32,
          borderRadius: 8,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icons.Close />
      </button>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="st-label">
        {label}
        {required && <span style={{ color: "#e53935" }}> </span>}
      </label>
      {children}
    </div>
  );
}
