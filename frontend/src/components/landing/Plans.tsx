import { CheckCircle2 } from "lucide-react";

type Plan = {
  name: string;
  price: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
};

const plans: Plan[] = [
  {
    name: "Starter",
    price: "$29",
    features: [
      "Hasta 5 camiones",
      "Tracking en tiempo real",
      "App mobile para choferes",
      "Historial 7 días",
      "Soporte por email",
    ],
    cta: "Empezar gratis",
  },
  {
    name: "Pro",
    price: "$79",
    features: [
      "Hasta 20 camiones",
      "Todo lo de Starter",
      "Historial 30 días",
      "Alertas personalizadas",
      "Panel multi-usuario (3 admins)",
      "Soporte prioritario",
    ],
    cta: "Elegir Pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$199",
    features: [
      "Camiones ilimitados",
      "Todo lo de Pro",
      "Historial 1 año",
      "API de integración",
      "Reportes avanzados",
      "Manager de cuenta dedicado",
      "SLA garantizado",
    ],
    cta: "Contactar ventas",
  },
];

const Plans = () => (
  <section id="planes" className="min-h-[calc(100dvh-88px)] bg-white py-16 px-6 flex items-center justify-center scroll-mt-[88px]">
    <div className="max-w-5xl mx-auto">
      <h2 className="text-4xl font-semibold text-brand-dark text-center mb-4">
        Planes para cada flota
      </h2>
      <p className="text-gray-500 text-center mb-16">
        Sin contratos anuales. Cancelás cuando quieras.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`relative rounded-2xl p-8 bg-white flex flex-col ${
              p.highlighted
                ? "border-2 border-brand-red shadow-xl md:scale-105"
                : "border border-gray-100 shadow-sm"
            }`}
          >
            {p.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-red text-white text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
                Más elegido
              </span>
            )}
            <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-2">
              {p.name}
            </h3>
            <div className="mb-6">
              <span className="text-5xl font-bold text-brand-dark">{p.price}</span>
              <span className="text-gray-500 ml-1">USD/mes</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-gray-700">
                  <CheckCircle2 size={20} className="text-brand-red flex-shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              className={`w-full rounded-full px-6 py-3 font-semibold transition-colors ${
                p.highlighted
                  ? "bg-brand-red text-white hover:bg-red-700"
                  : "border border-brand-dark text-brand-dark hover:bg-gray-50"
              }`}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Plans;
