import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login as apiLogin, signInWithGoogle } from "@/services/authApi";
import { useAuth } from "@/contexts/AuthContext";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.806.54-1.8368.8595-3.0477.8595-2.344 0-4.3282-1.5832-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1731 0 7.5477 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" fill="#FBBC05"/>
    <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" fill="#EA4335"/>
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};
    if (!email.trim()) newErrors.email = "El email es requerido";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "Email inválido";
    if (!password) newErrors.password = "La contraseña es requerida";
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      try {
        const res = await apiLogin({ email, password });
        login(res.token, res.user);
        if (remember) localStorage.setItem("safetruck_last_email", email);
        else localStorage.removeItem("safetruck_last_email");
        navigate("/dashboard");
      } catch (err) {
        setErrors({ email: err instanceof Error ? err.message : "Error al iniciar sesión." });
      }
    }
  };

  const handleGoogle = async () => {
    try {
      await signInWithGoogle(`${window.location.origin}/auth/callback`);
    } catch (err) {
      setErrors({ email: err instanceof Error ? err.message : "Error con Google." });
    }
  };

  return (
    <div className="tw-page font-sans min-h-screen bg-[#1C2B3A]">
      <main className="px-4 pt-10 pb-16 flex flex-col items-center">
        <Link to="/" className="text-2xl font-bold text-white mb-8">
          Safe Truck
        </Link>
        <div className="w-full max-w-[440px]">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h1 className="text-2xl font-semibold text-[#1C2B3A]">Iniciá sesión</h1>
            <p className="text-gray-500 mb-6">Bienvenido de vuelta.</p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="block text-sm font-medium text-[#1C2B3A] mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="empresa@mail.com"
                  maxLength={255}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-[#1C2B3A] text-[#1C2B3A]"
                />
                {errors.email && <p className="text-[#E8202A] text-sm mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1C2B3A] mb-1">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  maxLength={128}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-[#1C2B3A] text-[#1C2B3A]"
                />
                {errors.password && <p className="text-[#E8202A] text-sm mt-1">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 accent-[#E8202A]"
                  />
                  Recordarme
                </label>
                <a href="#" className="text-sm text-[#E8202A] hover:underline">¿Olvidaste tu contraseña?</a>
              </div>

              <button
                type="submit"
                className="w-full bg-[#E8202A] text-white rounded-full py-3 font-semibold hover:bg-red-700 transition-colors"
              >
                Iniciar sesión
              </button>
            </form>

            <div className="text-center text-gray-400 text-sm my-4">— o —</div>

            <button
              type="button"
              onClick={handleGoogle}
              className="w-full bg-white border border-gray-200 rounded-full py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <GoogleIcon />
              Continuar con Google
            </button>
          </div>

          <p className="text-center text-gray-400 text-sm mt-6">
            ¿No tenés cuenta?{" "}
            <Link to="/register" className="text-[#E8202A] hover:underline font-medium">
              Registrá tu empresa
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
