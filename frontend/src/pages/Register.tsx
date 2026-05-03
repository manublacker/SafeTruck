import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import safeTruckLogo from "@/assets/safe-truck-logo.png";
import {
  signUpStart,
  resendSignupConfirmation,
  fetchUserProfile,
} from "@/services/authApi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

type FormData = {
  email: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
  companyName: string;
  cuit: string;
  legalName: string;
  industry: string;
  fleetSize: string;
  country: string;
  province: string;
  code: string[];
  plan: string;
};

const initialData: FormData = {
  email: "",
  password: "",
  confirmPassword: "",
  terms: false,
  companyName: "",
  cuit: "",
  legalName: "",
  industry: "",
  fleetSize: "",
  country: "Argentina",
  province: "",
  code: ["", "", "", "", "", ""],
  plan: "",
};

const provinces = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
  "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "Tucumán",
];

const stepLabels = ["Acceso", "Tu empresa", "Verificación", "Plan"];

const ProgressIndicator = ({ step }: { step: number }) => (
  <div className="mb-8">
    <div className="flex items-center justify-between">
      {stepLabels.map((_, i) => {
        const idx = i + 1;
        const completed = idx < step;
        const active = idx === step;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                completed
                  ? "bg-[#1C2B3A] border-[#1C2B3A] text-white"
                  : active
                  ? "bg-[#E8202A] border-[#E8202A] text-white"
                  : "bg-white border-gray-300 text-gray-400"
              }`}
            >
              {completed ? <Check size={18} /> : idx}
            </div>
            {i < stepLabels.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  completed ? "bg-[#1C2B3A]" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
    <div className="flex justify-between mt-2">
      {stepLabels.map((label, i) => (
        <span
          key={label}
          className={`text-xs flex-1 ${i === 0 ? "text-left" : i === stepLabels.length - 1 ? "text-right" : "text-center"} ${
            i + 1 === step ? "text-[#E8202A] font-semibold" : "text-gray-500"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  </div>
);

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-[#1C2B3A] placeholder:text-gray-400 focus:outline-none focus:border-[#E8202A] focus:ring-1 focus:ring-[#E8202A] transition";

const primaryBtn =
  "w-full rounded-full bg-[#E8202A] text-white py-3 font-semibold hover:bg-red-700 transition-colors";

const formatCuit = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
};

const Register = () => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resendIn, setResendIn] = useState(0);
  const navigate = useNavigate();
  const { user, login } = useAuth();

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Si la sesión se activa (verificación por link de Supabase) avanzamos solos
  useEffect(() => {
    if (user && step <= 3) setStep(4);
  }, [user, step]);

  const update = <K extends keyof FormData>(k: K, v: FormData[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k as string]: "" }));
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      e.email = "Email inválido";
    if (data.password.length < 8)
      e.password = "Mínimo 8 caracteres";
    if (data.password !== data.confirmPassword)
      e.confirmPassword = "Las contraseñas no coinciden";
    if (!data.terms) e.terms = "Debés aceptar los términos";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!data.companyName.trim()) e.companyName = "Requerido";
    if (!/^\d{2}-\d{8}-\d{1}$/.test(data.cuit))
      e.cuit = "Formato XX-XXXXXXXX-X";
    if (!data.legalName.trim()) e.legalName = "Requerido";
    if (!data.industry) e.industry = "Requerido";
    if (!data.fleetSize) e.fleetSize = "Requerido";
    if (!data.province) e.province = "Requerido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e: Record<string, string> = {};
    if (data.code.some((c) => !c)) e.code = "Ingresá los 6 dígitos";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = async () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2) {
      if (!validateStep2()) return;
      try {
        await signUpStart({
          email: data.email,
          password: data.password,
          emailRedirectTo: `${window.location.origin}/register?verified=1`,
          metadata: {
            full_name: data.legalName,
            company: data.companyName,
            cuit: data.cuit,
            industry: data.industry,
            fleet_size: data.fleetSize,
            country: data.country,
            province: data.province,
          },
        });
      } catch (err) {
        setErrors({ email: err instanceof Error ? err.message : "Error al crear la cuenta." });
        return;
      }
      setResendIn(60);
    }
    if (step === 3) {
      if (!validateStep3()) return;
      try {
        const code = data.code.join("");
        const { data: otpData, error } = await supabase.auth.verifyOtp({
          email: data.email,
          token: code,
          type: "signup",
        });
        if (error) throw new Error(error.message);
        if (!otpData.session) throw new Error("No se pudo verificar el código.");
        const res = await fetchUserProfile(otpData.session.access_token, {
          full_name: data.legalName,
          company: data.companyName,
          cuit: data.cuit,
          industry: data.industry,
          fleet_size: data.fleetSize,
          country: data.country,
          province: data.province,
        });
        login(res.token, res.user);
      } catch (err) {
        setErrors({ code: err instanceof Error ? err.message : "Código inválido." });
        return;
      }
      setResendIn(0);
    }
    setStep(step + 1);
  };

  const handleCodeChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, "").slice(-1);
    const code = [...data.code];
    code[i] = digit;
    update("code", code);
    if (digit && i < 5) {
      const nextEl = document.getElementById(`code-${i + 1}`) as HTMLInputElement | null;
      nextEl?.focus();
    }
  };

  const handleCodeKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !data.code[i] && i > 0) {
      const prev = document.getElementById(`code-${i - 1}`) as HTMLInputElement | null;
      prev?.focus();
    }
  };

  const handleResend = async () => {
    try {
      await resendSignupConfirmation(data.email, `${window.location.origin}/register?verified=1`);
      setResendIn(60);
    } catch (err) {
      setErrors({ code: err instanceof Error ? err.message : "No se pudo reenviar." });
    }
  };

  const allCodeFilled = data.code.every((c) => c);

  const choosePlan = (plan: string) => {
    update("plan", plan);
    // Final step, navigate home for now
    setTimeout(() => navigate("/"), 200);
  };

  return (
    <div className="tw-page font-sans min-h-screen bg-[#1C2B3A]">
      <main className="px-4 pt-10 pb-16 flex flex-col items-center">
        <Link to="/" className="text-2xl font-bold text-white mb-8">
          Safe Truck
        </Link>
        <div className="w-full max-w-[520px]">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <ProgressIndicator step={step} />

            {step > 1 && step < 4 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
              >
                <ArrowLeft size={16} /> Volver
              </button>
            )}

            <div key={step} className="animate-in fade-in duration-300">
              {step === 1 && (
                <div>
                  <h1 className="text-2xl font-semibold text-[#1C2B3A] mb-2">
                    Creá tu cuenta
                  </h1>
                  <p className="text-gray-500 mb-6">
                    Ingresá los datos para acceder a Safe Truck.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <input
                        type="email"
                        placeholder="empresa@mail.com"
                        value={data.email}
                        onChange={(e) => update("email", e.target.value)}
                        className={inputClass}
                      />
                      {errors.email && <p className="text-[#E8202A] text-sm mt-1">{errors.email}</p>}
                    </div>
                    <div>
                      <input
                        type="password"
                        placeholder="Mínimo 8 caracteres"
                        value={data.password}
                        onChange={(e) => update("password", e.target.value)}
                        className={inputClass}
                      />
                      {errors.password && <p className="text-[#E8202A] text-sm mt-1">{errors.password}</p>}
                    </div>
                    <div>
                      <input
                        type="password"
                        placeholder="Repetí tu contraseña"
                        value={data.confirmPassword}
                        onChange={(e) => update("confirmPassword", e.target.value)}
                        className={inputClass}
                      />
                      {errors.confirmPassword && <p className="text-[#E8202A] text-sm mt-1">{errors.confirmPassword}</p>}
                    </div>
                    <div>
                      <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={data.terms}
                          onChange={(e) => update("terms", e.target.checked)}
                          className="mt-1 accent-[#E8202A]"
                        />
                        <span>
                          Acepto los{" "}
                          <a href="#" className="text-[#E8202A] hover:underline">Términos y condiciones</a>{" "}
                          y la{" "}
                          <a href="#" className="text-[#E8202A] hover:underline">Política de privacidad</a>
                        </span>
                      </label>
                      {errors.terms && <p className="text-[#E8202A] text-sm mt-1">{errors.terms}</p>}
                    </div>
                  </div>

                  <button onClick={next} className={`${primaryBtn} mt-6`}>
                    Continuar
                  </button>
                  <p className="text-center text-sm text-gray-500 mt-4">
                    ¿Ya tenés cuenta?{" "}
                    <Link to="/login" className="text-[#E8202A] font-medium hover:underline">
                      Iniciá sesión
                    </Link>
                  </p>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h1 className="text-2xl font-semibold text-[#1C2B3A] mb-2">
                    Tu empresa
                  </h1>
                  <p className="text-gray-500 mb-6">Contanos sobre tu flota.</p>

                  <div className="space-y-4">
                    <div>
                      <input
                        type="text"
                        placeholder="Transportes S.A."
                        value={data.companyName}
                        onChange={(e) => update("companyName", e.target.value)}
                        className={inputClass}
                      />
                      {errors.companyName && <p className="text-[#E8202A] text-sm mt-1">{errors.companyName}</p>}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="XX-XXXXXXXX-X"
                        value={data.cuit}
                        onChange={(e) => update("cuit", formatCuit(e.target.value))}
                        className={inputClass}
                      />
                      {errors.cuit && <p className="text-[#E8202A] text-sm mt-1">{errors.cuit}</p>}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Razón social oficial"
                        value={data.legalName}
                        onChange={(e) => update("legalName", e.target.value)}
                        className={inputClass}
                      />
                      {errors.legalName && <p className="text-[#E8202A] text-sm mt-1">{errors.legalName}</p>}
                    </div>
                    <div>
                      <select
                        value={data.industry}
                        onChange={(e) => update("industry", e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Rubro / tipo de carga</option>
                        <option>Carga general</option>
                        <option>Granos / Agro</option>
                        <option>Materiales de construcción</option>
                        <option>Refrigerados</option>
                        <option>Combustibles</option>
                        <option>Otros</option>
                      </select>
                      {errors.industry && <p className="text-[#E8202A] text-sm mt-1">{errors.industry}</p>}
                    </div>
                    <div>
                      <select
                        value={data.fleetSize}
                        onChange={(e) => update("fleetSize", e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Cantidad de camiones</option>
                        <option>1 a 5</option>
                        <option>6 a 20</option>
                        <option>21 a 50</option>
                        <option>Más de 50</option>
                      </select>
                      {errors.fleetSize && <p className="text-[#E8202A] text-sm mt-1">{errors.fleetSize}</p>}
                    </div>
                    <div>
                      <select
                        value={data.country}
                        onChange={(e) => update("country", e.target.value)}
                        className={inputClass}
                      >
                        <option>Argentina</option>
                        <option>Uruguay</option>
                        <option>Chile</option>
                        <option>Paraguay</option>
                        <option>Brasil</option>
                      </select>
                    </div>
                    <div>
                      <select
                        value={data.province}
                        onChange={(e) => update("province", e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Provincia</option>
                        {provinces.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                      {errors.province && <p className="text-[#E8202A] text-sm mt-1">{errors.province}</p>}
                    </div>
                  </div>

                  <button onClick={next} className={`${primaryBtn} mt-6`}>
                    Continuar
                  </button>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h1 className="text-2xl font-semibold text-[#1C2B3A] mb-2">
                    Verificá tu email
                  </h1>
                  <p className="text-gray-500 mb-8">
                    Te enviamos un código de 6 dígitos a{" "}
                    <span className="text-[#1C2B3A] font-medium">{data.email || "tu email"}</span>.
                  </p>

                  <div className="flex justify-center mb-8">
                    <Mail size={56} className="text-[#E8202A]" />
                  </div>

                  <div className="flex justify-center gap-2 mb-2">
                    {data.code.map((c, i) => (
                      <input
                        key={i}
                        id={`code-${i}`}
                        inputMode="numeric"
                        maxLength={1}
                        value={c}
                        onChange={(e) => handleCodeChange(i, e.target.value)}
                        onKeyDown={(e) => handleCodeKey(i, e)}
                        className={`w-[52px] h-14 text-center text-2xl font-semibold rounded-lg border-2 focus:outline-none transition-colors ${
                          allCodeFilled
                            ? "border-[#1C2B3A]"
                            : c
                            ? "border-[#E8202A]"
                            : "border-gray-300 focus:border-[#E8202A]"
                        }`}
                      />
                    ))}
                  </div>
                  {errors.code && (
                    <p className="text-[#E8202A] text-sm text-center mb-2">{errors.code}</p>
                  )}

                  <button onClick={next} className={`${primaryBtn} mt-6`}>
                    Verificar código
                  </button>
                  <p className="text-center text-sm text-gray-500 mt-4">
                    ¿No recibiste el código?{" "}
                    {resendIn > 0 ? (
                      <span className="text-gray-400">Reenviar en {resendIn}s</span>
                    ) : (
                      <button
                        onClick={handleResend}
                        className="text-[#E8202A] font-medium hover:underline"
                      >
                        Reenviar
                      </button>
                    )}
                  </p>
                </div>
              )}

              {step === 4 && (
                <div>
                  <h1 className="text-2xl font-semibold text-[#1C2B3A] text-center">
                    Elegí tu plan
                  </h1>
                  <p className="text-gray-500 text-center mb-8">
                    Comenzá a trackear tu flota hoy.
                  </p>

                  <div className="space-y-6">
                    <PlanCard
                      name="Starter"
                      price="$29"
                      features={[
                        "Hasta 5 camiones",
                        "Tracking en tiempo real",
                        "App mobile para choferes",
                        "Historial 7 días",
                        "Soporte por email",
                      ]}
                      cta="Elegir Starter"
                      onClick={() => choosePlan("starter")}
                    />
                    <PlanCard
                      name="Pro"
                      price="$79"
                      features={[
                        "Hasta 20 camiones",
                        "Todo lo de Starter",
                        "Historial 30 días",
                        "Alertas personalizadas",
                        "Panel multi-usuario (3 admins)",
                        "Soporte prioritario",
                      ]}
                      cta="Elegir Pro"
                      highlighted
                      onClick={() => choosePlan("pro")}
                    />
                    <PlanCard
                      name="Enterprise"
                      price="$199"
                      features={[
                        "Camiones ilimitados",
                        "Todo lo de Pro",
                        "Historial 1 año",
                        "API de integración",
                        "Reportes avanzados",
                        "Manager dedicado",
                        "SLA garantizado",
                      ]}
                      cta="Contactar ventas"
                      onClick={() => choosePlan("enterprise")}
                    />
                  </div>

                  <button
                    onClick={() => setStep(3)}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mt-6 mx-auto"
                  >
                    <ArrowLeft size={16} /> Volver
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

const PlanCard = ({
  name,
  price,
  features,
  cta,
  highlighted,
  onClick,
}: {
  name: string;
  price: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  onClick: () => void;
}) => (
  <div
    className={`relative rounded-2xl p-6 bg-white ${
      highlighted ? "border-2 border-[#E8202A]" : "border border-gray-200"
    }`}
  >
    {highlighted && (
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#E8202A] text-white text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
        Más elegido
      </span>
    )}
    <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-2">
      {name}
    </h3>
    <div className="mb-4">
      <span className="text-4xl font-bold text-[#1C2B3A]">{price}</span>
      <span className="text-gray-500 ml-1 text-sm">USD/mes</span>
    </div>
    <ul className="space-y-2 mb-6">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
          <CheckCircle2 size={18} className="text-[#E8202A] flex-shrink-0 mt-0.5" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
    <button
      onClick={onClick}
      className={`w-full rounded-full px-6 py-3 font-semibold transition-colors ${
        highlighted
          ? "bg-[#E8202A] text-white hover:bg-red-700"
          : "border border-[#1C2B3A] text-[#1C2B3A] hover:bg-gray-50"
      }`}
    >
      {cta}
    </button>
  </div>
);

export default Register;
