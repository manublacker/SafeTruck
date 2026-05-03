import { Map, Smartphone, Bell, BarChart2, Users, Shield, type LucideIcon } from "lucide-react";

const features: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Map, title: "Tracking en tiempo real", desc: "Seguí cada camión en el mapa con actualización constante." },
  { icon: Smartphone, title: "App mobile para choferes", desc: "Tus choferes solo necesitan el celular. Simple, rápida y sin complicaciones." },
  { icon: Bell, title: "Alertas inteligentes", desc: "Recibí notificaciones por desvíos, paradas no programadas o exceso de velocidad." },
  { icon: BarChart2, title: "Reportes exportables", desc: "Descargá el historial de rutas y generá reportes para tu operación." },
  { icon: Users, title: "Multi-usuario", desc: "Agregá administradores y operadores con distintos niveles de acceso." },
  { icon: Shield, title: "Datos seguros", desc: "Tu información y la de tu flota protegidas con encriptación de extremo a extremo." },
];

const Features = () => (
  <section className="min-h-[calc(100dvh-88px)] bg-brand-light py-16 px-6 flex items-center justify-center scroll-mt-[88px]">
    <div className="max-w-6xl mx-auto">
      <h2 className="text-4xl font-semibold text-brand-dark text-center mb-16">
        Todo lo que necesitás en un solo lugar
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
          >
            <Icon size={36} className="text-brand-red mb-4" />
            <h3 className="font-semibold text-brand-dark mb-2 text-lg">{title}</h3>
            <p className="text-gray-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Features;
