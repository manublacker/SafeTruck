const FinalCta = () => (
  <section id="registro" className="min-h-[calc(100dvh-88px)] bg-brand-cta py-16 px-6 flex items-center justify-center scroll-mt-[88px]">
    <div className="max-w-4xl mx-auto text-center">
      <h2 className="text-5xl font-bold text-white mb-4 leading-tight">
        Tu flota bajo control, desde hoy.
      </h2>
      <p className="text-white/80 text-xl mb-10">
        Registrá tu empresa en minutos y empezá el período de prueba gratis.
      </p>
      <a href="/register" className="inline-block bg-white text-brand-cta font-bold rounded-full px-8 py-4 text-lg hover:bg-gray-100 transition-colors shadow-lg">
        Registrá tu empresa
      </a>
    </div>
  </section>
);

export default FinalCta;
