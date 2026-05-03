const stats = [
  { num: "500+", label: "Camiones trackeados" },
  { num: "80+", label: "Empresas activas" },
  { num: "99.9%", label: "Uptime garantizado" },
];

const About = () => (
  <section id="nosotros" className="min-h-[calc(100dvh-88px)] bg-brand-dark flex items-center justify-center scroll-mt-[88px]">
    <div className="max-w-6xl mx-auto px-8 py-24 grid md:grid-cols-2 gap-16 items-center">
      <div>
        <p className="text-sm font-semibold text-brand-red tracking-widest uppercase mb-4">
          Nuestra historia
        </p>
        <h2 className="text-4xl font-semibold text-white mb-6 leading-tight">
          Construido por gente del transporte
        </h2>
        <p className="text-gray-300 text-lg leading-relaxed">
          Safe Truck nació de la necesidad real de las empresas de logística
          argentinas: saber dónde está cada camión, en todo momento, sin depender
          de llamadas ni mensajes. Somos un equipo apasionado por la tecnología y
          el transporte, comprometidos con hacer la gestión de flotas simple y
          accesible para empresas de todos los tamaños.
        </p>
      </div>
      <div className="grid gap-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white/5 border border-white/10 rounded-2xl p-8"
          >
            <div className="text-5xl font-bold text-brand-red mb-1">{s.num}</div>
            <div className="text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default About;
