const cols = [
  {
    title: "Producto",
    links: ["Cómo funciona", "Planes", "App mobile", "API"],
  },
  {
    title: "Empresa",
    links: ["Nosotros", "Blog", "Prensa", "Contacto"],
  },
  {
    title: "Legal",
    links: ["Términos", "Privacidad", "Cookies"],
  },
];

const Footer = () => (
  <footer id="contacto" className="min-h-[calc(100dvh-88px)] bg-brand-black flex items-center justify-center scroll-mt-[88px]">
    <div className="max-w-7xl mx-auto px-8 py-16">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="text-xl font-semibold text-white">Safe Truck</div>
          <p className="text-gray-400 text-sm mt-2">
            Gestión de flotas simple y poderosa.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-white font-semibold mb-4">{c.title}</h4>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l}>
                  <a
                    href="#"
                    className="text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-600 text-sm">
        © 2025 Safe Truck. Todos los derechos reservados.
      </div>
    </div>
  </footer>
);

export default Footer;
