import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Building2, CreditCard, ShieldCheck, ScrollText, UserCog,
  Car, Users, CalendarDays, FileText, BarChart3, Settings, LogOut, Search,
  Plus, Pencil, Trash2, X, Check, ChevronLeft, ChevronRight, Printer,
  Download, AlertTriangle, Lock, Eye, EyeOff, Filter, ClipboardList,
  KeyRound, Building, Phone, Mail, MapPin, User as UserIcon,
  Wallet, Tag, Star, Upload, Bell, TrendingUp, Ban, Sparkles, Award, Wrench,
  MessageSquare, Send, Gift, Zap, Menu
} from "lucide-react";

/* ============================== helpers ============================== */

const uid = (p = "id") => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => { if (!d) return "-"; const dt = new Date(d); return dt.toLocaleDateString("sq-AL", { day: "2-digit", month: "2-digit", year: "numeric" }); };
const fmtMoney = (n) => `€${(Number(n) || 0).toFixed(2)}`;
const daysBetween = (a, b) => { const d = Math.round((new Date(b) - new Date(a)) / 86400000); return Math.max(d, 1); };
const addDays = (dateStr, n) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const genReferralCode = (first = "", last = "") => `${(first[0] || "X").toUpperCase()}${(last[0] || "X").toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// Nivelet e besnikërisë (VIP) sipas numrit të qirave të përfunduara
const LOYALTY_TIERS = [
  { key: "platinum", label: "Platinum", min: 15, discount: 15, cls: "bg-neutral-900 text-white", dot: "bg-neutral-900" },
  { key: "gold", label: "Gold", min: 8, discount: 10, cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  { key: "silver", label: "Silver", min: 4, discount: 5, cls: "bg-slate-200 text-slate-700", dot: "bg-slate-400" },
  { key: "bronze", label: "Bronze", min: 1, discount: 0, cls: "bg-orange-100 text-orange-700", dot: "bg-orange-400" },
];
function loyaltyTier(completedCount) {
  return LOYALTY_TIERS.find((t) => completedCount >= t.min) || null;
}

// Sugjerim i çmimit dinamik: baza + sezoni + kërkesa (shfrytëzimi i flotës)
function suggestPrice(basePrice, pickupDate, utilizationPct) {
  const base = Number(basePrice) || 0;
  if (!base) return { price: 0, seasonPct: 0, demandPct: 0 };
  const month = pickupDate ? new Date(pickupDate).getMonth() + 1 : new Date().getMonth() + 1;
  let seasonPct = 0;
  if ([6, 7, 8, 9].includes(month)) seasonPct = 20; // sezoni i lartë veror
  else if ([12, 1].includes(month)) seasonPct = 10; // festat e dimrit
  let demandPct = 0;
  if (utilizationPct >= 80) demandPct = 15;
  else if (utilizationPct >= 50) demandPct = 8;
  const price = Math.round(base * (1 + (seasonPct + demandPct) / 100));
  return { price, seasonPct, demandPct };
}

// NumËrues i animuar
function useCountUp(target, duration = 850) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf; const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}
function AnimatedValue({ value }) {
  const str = String(value);
  const match = str.match(/-?[\d.,]+/);
  const numStr = match ? match[0].replace(/,/g, "") : "";
  const num = parseFloat(numStr);
  const target = isNaN(num) ? 0 : num;
  const animated = useCountUp(target);
  if (!match || isNaN(num)) return <>{str}</>;
  const hasDecimals = numStr.includes(".");
  const prefix = str.slice(0, match.index);
  const suffix = str.slice(match.index + match[0].length);
  const display = hasDecimals ? animated.toFixed(2) : Math.round(animated).toLocaleString("en-US");
  return <>{prefix}{display}{suffix}</>;
}

function subStatus(company) {
  if (!company.subEnd) return "none";
  const end = new Date(company.subEnd);
  const now = new Date();
  const diffDays = Math.ceil((end - now) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "expiring";
  return "active";
}

function reservationOverlap(a, b) {
  return a.pickupDate < b.returnDate && b.pickupDate < a.returnDate;
}

function vehicleIsFree(vehicleId, pickupDate, returnDate, reservations, excludeId) {
  const blocking = ["pending", "confirmed", "active"];
  return !reservations.some(
    (r) =>
      r.vehicleId === vehicleId &&
      r.id !== excludeId &&
      blocking.includes(r.status) &&
      reservationOverlap({ pickupDate, returnDate }, r)
  );
}

const STATUS_META = {
  pending: { label: "Në pritje", cls: "bg-neutral-200 text-neutral-700" },
  confirmed: { label: "E konfirmuar", cls: "bg-slate-800 text-white" },
  active: { label: "Aktive", cls: "bg-red-600 text-white" },
  completed: { label: "E përfunduar", cls: "bg-emerald-600 text-white" },
  cancelled: { label: "E anuluar", cls: "bg-neutral-400 text-white" },
  late: { label: "E vonuar", cls: "bg-orange-500 text-white" },
};
const VEHICLE_STATUS_META = {
  free: { label: "E lirë", cls: "bg-emerald-100 text-emerald-700" },
  reserved: { label: "E rezervuar", cls: "bg-slate-200 text-slate-700" },
  in_use: { label: "Në përdorim", cls: "bg-red-100 text-red-700" },
  service: { label: "Në servis", cls: "bg-amber-100 text-amber-700" },
  out: { label: "Jashtë funksionit", cls: "bg-neutral-300 text-neutral-700" },
};
const PAY_STATUS_META = {
  unpaid: { label: "Pa paguar", cls: "bg-red-100 text-red-700" },
  partial: { label: "Pjësërisht", cls: "bg-amber-100 text-amber-700" },
  paid: { label: "Paguar", cls: "bg-emerald-100 text-emerald-700" },
};

/* ============================== seed data ============================== */

function seedDB() {
  const companies = [
    { id: "co_1", name: "AutoRent Prishtina", owner: "Fatmir Krasniqi", phone: "+383 44 111 222", email: "info@autorent-pr.com", address: "Rr. Nëna Terezë 12", city: "Prishtinë", taxNo: "810234567", status: "active", plan: "Vjetor", subStart: "2026-01-01", subEnd: "2026-12-31", createdAt: "2026-01-01" },
    { id: "co_2", name: "GjilanCars", owner: "Blerta Hoxha", phone: "+383 44 333 444", email: "contact@gjilancars.com", address: "Rr. Bulevardi 5", city: "Gjilan", taxNo: "810987654", status: "active", plan: "3-mujor", subStart: "2026-05-15", subEnd: "2026-08-15", createdAt: "2026-05-15" },
    { id: "co_3", name: "PejaDrive Rent a Car", owner: "Arben Gashi", phone: "+383 44 555 666", email: "hello@pejadrive.com", address: "Rr. Kryesore 20", city: "Pejë", taxNo: "810112233", status: "inactive", plan: "Mujor", subStart: "2026-06-01", subEnd: "2026-07-01", createdAt: "2026-06-01" },
  ];

  const users = [
    { id: "u_super", username: "urimi1806", password: "1806", role: "superadmin", name: "Urim Administrator", companyId: null, active: true, mustChangePassword: false },
    { id: "u_admin1", username: "admin.autorent", password: "admin123", role: "admin", name: "Fatmir Krasniqi", companyId: "co_1", active: true, mustChangePassword: false },
    { id: "u_emp1", username: "punetor1", password: "puna123", role: "employee", name: "Elira Berisha", companyId: "co_1", active: true, mustChangePassword: false },
    { id: "u_emp2", username: "punetor2", password: "puna123", role: "employee", name: "Dren Morina", companyId: "co_1", active: true, mustChangePassword: false },
    { id: "u_admin2", username: "admin.gjilancars", password: "admin123", role: "admin", name: "Blerta Hoxha", companyId: "co_2", active: true, mustChangePassword: false },
    { id: "u_emp3", username: "punetor3", password: "puna123", role: "employee", name: "Gent Krasniqi", companyId: "co_2", active: true, mustChangePassword: false },
  ];

  const vehicles = [
    { id: "v_1", companyId: "co_1", brand: "Volkswagen", model: "Golf 7", year: 2019, plate: "01-123-AB", vin: "WVWZZZ1KZ9W123456", type: "Hatchback", transmission: "Manual", fuel: "Naftë", color: "Gri", km: 98000, dailyPrice: 35, status: "free", photo: "", notes: "" },
    { id: "v_2", companyId: "co_1", brand: "Škoda", model: "Octavia", year: 2021, plate: "02-456-CD", vin: "TMBJJ7NE0M0123456", type: "Sedan", transmission: "Automatik", fuel: "Naftë", color: "Zezë", km: 41000, dailyPrice: 42, status: "reserved", photo: "", notes: "" },
    { id: "v_3", companyId: "co_1", brand: "BMW", model: "X5", year: 2020, plate: "03-789-EF", vin: "WBAJA7C50LC123456", type: "SUV", transmission: "Automatik", fuel: "Naftë", color: "Bardhë", km: 65000, dailyPrice: 89, status: "in_use", photo: "", notes: "Gomë e pasme pak e konsumuar" },
    { id: "v_4", companyId: "co_1", brand: "Fiat", model: "500", year: 2018, plate: "04-321-GH", vin: "", type: "Ekonomik", transmission: "Manual", fuel: "Benzinë", color: "E kuqe", km: 120000, dailyPrice: 25, status: "service", photo: "", notes: "Ndërrim vaji" },
    { id: "v_5", companyId: "co_1", brand: "Mercedes-Benz", model: "E-Class", year: 2022, plate: "05-654-IJ", vin: "", type: "Luksoz", transmission: "Automatik", fuel: "Hybrid", color: "Argjend", km: 22000, dailyPrice: 110, status: "free", photo: "", notes: "" },
    { id: "v_6", companyId: "co_2", brand: "Opel", model: "Astra", year: 2020, plate: "51-111-KL", vin: "", type: "Hatchback", transmission: "Manual", fuel: "Naftë", color: "Blu", km: 55000, dailyPrice: 30, status: "free", photo: "", notes: "" },
    { id: "v_7", companyId: "co_2", brand: "Renault", model: "Clio", year: 2019, plate: "51-222-MN", vin: "", type: "Ekonomik", transmission: "Manual", fuel: "Benzinë", color: "Bardhë", km: 77000, dailyPrice: 26, status: "free", photo: "", notes: "" },
  ];

  const clients = [
    { id: "c_1", companyId: "co_1", firstName: "Ardit", lastName: "Muriqi", personalNo: "1001234567", licenseNo: "L1234567", licenseExpiry: "2028-05-10", phone: "+383 45 111 111", email: "ardit.m@example.com", address: "Rr. Agim Ramadani 3", city: "Prishtinë", country: "Kosovë", notes: "" },
    { id: "c_2", companyId: "co_1", firstName: "Vesa", lastName: "Zeqiri", personalNo: "1009876543", licenseNo: "L9988776", licenseExpiry: "2027-02-20", phone: "+383 45 222 222", email: "vesa.z@example.com", address: "Rr. Ilaz Agushi 8", city: "Fushë Kosovë", country: "Kosovë", notes: "Klient i rregullt" },
    { id: "c_3", companyId: "co_1", firstName: "Blend", lastName: "Krasniqi", personalNo: "1004567890", licenseNo: "L5566778", licenseExpiry: "2026-11-30", phone: "+383 45 333 333", email: "blend.k@example.com", address: "Rr. Zenel Salihu 1", city: "Prishtinë", country: "Kosovë", notes: "" },
    { id: "c_4", companyId: "co_2", firstName: "Diellza", lastName: "Rexhepi", personalNo: "1002233445", licenseNo: "L3344556", licenseExpiry: "2029-01-15", phone: "+383 45 444 444", email: "diellza.r@example.com", address: "Rr. Idriz Seferi 2", city: "Gjilan", country: "Kosovë", notes: "" },
  ];

  const today = todayISO();
  const reservations = [
    { id: "r_1", companyId: "co_1", num: 1001, clientId: "c_1", vehicleId: "v_3", pickupDate: today, pickupTime: "09:00", returnDate: addDays(today, 3), returnTime: "09:00", pickupLocation: "Zyra kryesore Prishtinë", returnLocation: "Zyra kryesore Prishtinë", dailyPrice: 89, deposit: 100, paid: 150, paymentMethod: "Kartelë", paymentStatus: "partial", status: "active", notes: "", createdBy: "u_emp1", conditionPickup: "E mirë, pa dëmtime", conditionReturn: "", kmPickup: 65000, kmReturn: "", fuelPickup: "Plot", fuelReturn: "" },
    { id: "r_2", companyId: "co_1", num: 1002, clientId: "c_2", vehicleId: "v_2", pickupDate: addDays(today, 1), pickupTime: "10:00", returnDate: addDays(today, 5), returnTime: "10:00", pickupLocation: "Aeroporti i Prishtinës", returnLocation: "Zyra kryesore Prishtinë", dailyPrice: 42, deposit: 80, paid: 0, paymentMethod: "Cash", paymentStatus: "unpaid", status: "confirmed", notes: "", createdBy: "u_emp1", conditionPickup: "", conditionReturn: "", kmPickup: "", kmReturn: "", fuelPickup: "", fuelReturn: "" },
    { id: "r_3", companyId: "co_1", num: 1003, clientId: "c_3", vehicleId: "v_1", pickupDate: addDays(today, -5), pickupTime: "09:00", returnDate: addDays(today, -2), returnTime: "09:00", pickupLocation: "Zyra kryesore Prishtinë", returnLocation: "Zyra kryesore Prishtinë", dailyPrice: 35, deposit: 50, paid: 105, paymentMethod: "Cash", paymentStatus: "paid", status: "completed", notes: "", createdBy: "u_emp2", conditionPickup: "E mirë", conditionReturn: "E mirë, pa dëmtime", kmPickup: 97500, kmReturn: 98000, fuelPickup: "Plot", fuelReturn: "Plot" },
    { id: "r_4", companyId: "co_1", num: 1004, clientId: "c_1", vehicleId: "v_4", pickupDate: addDays(today, -10), pickupTime: "09:00", returnDate: addDays(today, -8), returnTime: "09:00", pickupLocation: "Zyra kryesore Prishtinë", returnLocation: "Zyra kryesore Prishtinë", dailyPrice: 25, deposit: 30, paid: 50, paymentMethod: "Transfer bankar", paymentStatus: "paid", status: "cancelled", notes: "Anuluar nga klienti", createdBy: "u_emp2", conditionPickup: "", conditionReturn: "", kmPickup: "", kmReturn: "", fuelPickup: "", fuelReturn: "" },
    { id: "r_5", companyId: "co_2", num: 2001, clientId: "c_4", vehicleId: "v_6", pickupDate: addDays(today, -1), pickupTime: "09:00", returnDate: today, returnTime: "09:00", pickupLocation: "Zyra Gjilan", returnLocation: "Zyra Gjilan", dailyPrice: 30, deposit: 40, paid: 30, paymentMethod: "Cash", paymentStatus: "partial", status: "late", notes: "", createdBy: "u_emp3", conditionPickup: "E mirë", conditionReturn: "", kmPickup: 55000, kmReturn: "", fuelPickup: "Plot", fuelReturn: "" },
  ];

  const auditLog = [
    { id: uid("log"), ts: new Date().toISOString(), userId: "u_super", userName: "Urim Administrator", role: "superadmin", companyId: null, action: "Sistemi u inicializua", details: "Të dhëna demo u ngarkuan" },
  ];

  const expenses = [
    { id: uid("e"), companyId: "co_1", date: addDays(today, -3), category: "Karburant", amount: 45, vehicleId: "v_3", notes: "Mbushje BMW X5" },
    { id: uid("e"), companyId: "co_1", date: addDays(today, -7), category: "Servisim", amount: 120, vehicleId: "v_4", notes: "Ndërrim vaji + filtera" },
    { id: uid("e"), companyId: "co_1", date: addDays(today, -15), category: "Sigurim", amount: 380, vehicleId: null, notes: "Sigurim vjetor 2 automjete" },
  ];
  const coupons = [
    { id: uid("cp"), companyId: "co_1", code: "VERE2026", type: "percent", value: 10, active: true, expiresAt: addDays(today, 60), usageLimit: 100, usedCount: 3, notes: "Fushatë vere" },
    { id: uid("cp"), companyId: "co_1", code: "WELCOME50", type: "flat", value: 50, active: true, expiresAt: "", usageLimit: 50, usedCount: 1, notes: "Klientë të ri" },
  ];
  return { companies, users, vehicles, clients, reservations, auditLog, expenses, coupons };
}

/* ============================== storage (localStorage) ============================== */

const DB_KEY = "cardata-db-v1";

// Siguron që baza e të dhënave e ruajtur (edhe nga versione të vjetra) të ketë të gjitha
// fushat/tabelat që pret kodi i ri — parandalon crash-et gjatë shtimit të firmave/rezervimeve.
function normalizeDB(db) {
  const base = db && typeof db === "object" ? db : {};
  const arrays = ["companies", "users", "vehicles", "clients", "reservations", "auditLog", "expenses", "coupons", "invoices"];
  const out = { ...base };
  for (const k of arrays) if (!Array.isArray(out[k])) out[k] = [];
  out.companies = out.companies.map((c) => ({ status: "active", plan: "Mujor", logo: "", subStart: todayISO(), subEnd: addDays(todayISO(), 30), owner: "", city: "", ...c }));
  out.vehicles = out.vehicles.map((v) => ({ status: "free", photo: "", dailyPrice: 0, km: 0, ...v }));
  out.clients = out.clients.map((c) => ({ rating: 0, blacklisted: false, referralCode: "", referredBy: "", country: "Kosov\u00eb", ...c }));
  out.reservations = out.reservations.map((r) => ({ status: "pending", paymentStatus: "unpaid", paymentMethod: "Cash", couponCode: "", discountAmount: 0, deposit: 0, paid: 0, ...r }));
  out.coupons = out.coupons.map((c) => ({ active: true, usedCount: 0, ...c }));
  return out;
}
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const normalized = normalizeDB(JSON.parse(raw));
      try { localStorage.setItem(DB_KEY, JSON.stringify(normalized)); } catch (e) { /* ignore */ }
      return normalized;
    }
  } catch (e) { /* fall back to seed */ }
  const seeded = seedDB();
  try { localStorage.setItem(DB_KEY, JSON.stringify(seeded)); } catch (e) { /* ignore */ }
  return seeded;
}
function saveDB(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.error("save failed", e); }
}

// --- Sinkronizim me serverin (Vercel KV via /api/db). Best-effort; localStorage mbetet cache offline. ---
async function fetchRemoteDB() {
  try {
    const r = await fetch("/api/db", { method: "GET", headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok && j.data ? j.data : null;
  } catch (e) {
    return null;
  }
}
let _pushTimer = null;
function pushRemoteDB(db) {
  try {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
      fetch("/api/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(db),
      }).catch(() => {});
    }, 800);
  } catch (e) { /* ignore */ }
}

/* ============================== small UI atoms ============================== */

function Badge({ cls, children }) {
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{children}</span>;
}

function StatCard({ label, value, icon: Icon, accent = "red", sub }) {
  const accents = {
    red: "from-red-500 to-red-700", black: "from-neutral-700 to-neutral-900", green: "from-emerald-500 to-emerald-700", amber: "from-amber-400 to-amber-600", slate: "from-slate-600 to-slate-800",
  };
  return (
    <div className="card card-hover p-4 flex items-start gap-3.5 animate-float-up">
      <div className={`shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${accents[accent] || accents.red} flex items-center justify-center text-white shadow-lg shadow-black/5`}>
        <Icon size={19} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-neutral-900 leading-tight display"><AnimatedValue value={value} /></div>
        <div className="text-xs text-neutral-500 mt-0.5 font-medium">{label}</div>
        {sub ? <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div> : null}
      </div>
    </div>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto animate-pop`}>
        <div className="flex items-center justify-between px-5 py-4 border-b hairline sticky top-0 bg-white/90 backdrop-blur rounded-t-2xl z-10">
          <h3 className="font-bold text-neutral-900 display">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger, requireDoubleForCompany }) {
  const [step, setStep] = useState(1);
  useEffect(() => { if (open) setStep(1); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${danger ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}><AlertTriangle size={18} /></div>
          <h3 className="font-bold text-neutral-900">{title}</h3>
        </div>
        <p className="text-sm text-neutral-600 mb-4">{message}{requireDoubleForCompany && step === 1 ? " Kjo veprim është i pakthyeshëm — klikoni Konfirmo edhe njëherë për të vazhduar." : ""}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300 hover:bg-neutral-50">Anulo</button>
          <button
            onClick={() => {
              if (requireDoubleForCompany && step === 1) { setStep(2); return; }
              onConfirm();
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700"
          >
            {requireDoubleForCompany && step === 1 ? "Vazhdo" : "Konfirmo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-semibold text-neutral-600 mb-1">{label}{required ? <span className="text-red-600"> *</span> : null}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500";

function Toasts({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-[80] space-y-2">
      {toasts.map((t) => (
        <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "error" ? "bg-red-600" : "bg-emerald-600"}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Kërko..."} className="w-full pl-8 pr-3 py-2 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40" />
    </div>
  );
}

function Pagination({ page, setPage, total, perPage }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div className="flex items-center justify-between mt-3 text-sm text-neutral-500">
      <span>{total} rezultate</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1.5 rounded-lg border border-neutral-300 disabled:opacity-30"><ChevronLeft size={15} /></button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="p-1.5 rounded-lg border border-neutral-300 disabled:opacity-30"><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

/* ============================== App shell ============================== */

const NAV = {
  superadmin: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "companies", label: "Firmat", icon: Building2 },
    { id: "subscriptions", label: "Abonimet", icon: CreditCard },
    { id: "companyadmins", label: "Administratorët e firmave", icon: UserCog },
    { id: "audit", label: "Aktivitetet / Audit Log", icon: ScrollText },
    { id: "profile", label: "Profili dhe Siguria", icon: ShieldCheck },
  ],
  admin: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "reservations", label: "Rezervimet", icon: ClipboardList },
    { id: "calendar", label: "Kalendari", icon: CalendarDays },
    { id: "vehicles", label: "Veturat", icon: Car },
    { id: "clients", label: "Klientët", icon: Users },
    { id: "employees", label: "Punëtorët", icon: UserCog },
    { id: "contracts", label: "Kontratat", icon: FileText },
    { id: "invoices", label: "Faturat", icon: FileText },
    { id: "expenses", label: "Shpenzimet", icon: Wallet },
    { id: "coupons", label: "Kupona zbritjeje", icon: Tag },
    { id: "reports", label: "Raportet", icon: BarChart3 },
    { id: "activities", label: "Aktivitetet", icon: ScrollText },
    { id: "settings", label: "Settings", icon: Settings },
  ],
  employee: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "reservations", label: "Rezervimet", icon: ClipboardList },
    { id: "calendar", label: "Kalendari", icon: CalendarDays },
    { id: "clients", label: "Klientët", icon: Users },
    { id: "contracts", label: "Kontratat", icon: FileText },
    { id: "invoices", label: "Faturat", icon: FileText },
  ],
};

// --- Auto branding from subdomain (e.g. rentacarspahija.datapos.pro -> "Rent a Car Spahija") ---
function prettifyBrand(sub) {
  let s = String(sub || "").toLowerCase().replace(/[-_]+/g, " ").trim();
  if (!s) return "";
  const hadRac = /rent\s*a\s*car|rentacar/.test(s);
  s = s.replace(/rent\s*a\s*car|rentacar/g, " ").replace(/\s+/g, " ").trim();
  const rest = s
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return hadRac ? "Rent a Car" + (rest ? " " + rest : "") : rest;
}
function getBrandFromHost() {
  try {
    const host = (window.location.hostname || "").toLowerCase();
    if (!host || host === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return null;
    const parts = host.split(".");
    if (parts.length >= 3) {
      const sub = parts[0];
      if (sub && sub !== "www") return prettifyBrand(sub);
    }
    return null;
  } catch (e) {
    return null;
  }
}
const BRAND = getBrandFromHost();
const APP_NAME = BRAND || "CarData";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("UI error:", error, info); }
  reset = () => this.setState({ error: null });
  render() {
    if (this.state.error) {
      return (
        <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center mx-auto mb-3"><AlertTriangle size={22} /></div>
          <h3 className="font-bold text-lg display text-neutral-900">Ndodhi një gabim në këtë faqe</h3>
          <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">Provo të rifreskosh faqen. Nëse problemi vazhdon, mund të rivendosësh të dhënat lokale.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button onClick={this.reset} className="px-4 py-2 rounded-lg text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800">Provo përsëri</button>
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg text-sm font-semibold border border-neutral-300 hover:bg-white">Rifresko faqen</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CarDataApp() {
  const [db, setDb] = useState(null);
  const [session, setSession] = useState(null);
  const [view, setView] = useState("dashboard");
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    document.title = APP_NAME + " — Menaxhim Rent a Car";
  }, []);

  useEffect(() => {
    // Shfaq menjëherë të dhënat lokale, pastaj hidrato nga serveri (Vercel KV) nëse është i disponueshëm.
    setDb(loadDB());
    let cancelled = false;
    (async () => {
      const remote = await fetchRemoteDB();
      if (!cancelled && remote) {
        const normalized = normalizeDB(remote);
        saveDB(normalized);
        setDb(normalized);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback((updater) => {
    setDb((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveDB(next);
      pushRemoteDB(next);
      return next;
    });
  }, []);

  const notify = useCallback((msg, type = "success") => {
    const id = uid("t");
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const currentUser = useMemo(() => db && session ? db.users.find((u) => u.id === session.userId) : null, [db, session]);
  const currentCompany = useMemo(() => db && currentUser && currentUser.companyId ? db.companies.find((c) => c.id === currentUser.companyId) : null, [db, currentUser]);

  const logAction = useCallback((action, details, companyIdOverride) => {
    persist((prev) => ({
      ...prev,
      auditLog: [
        { id: uid("log"), ts: new Date().toISOString(), userId: currentUser?.id, userName: currentUser?.name, role: currentUser?.role, companyId: companyIdOverride !== undefined ? companyIdOverride : currentUser?.companyId, action, details },
        ...prev.auditLog,
      ].slice(0, 500),
    }));
  }, [persist, currentUser]);

  if (!db) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-3 text-neutral-400 text-sm font-medium">
        <span>Duke ngarkuar {APP_NAME}…</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LoginPage db={db} onLogin={(u) => { setSession({ userId: u.id }); setView("dashboard"); }} notify={notify} />
        <Toasts toasts={toasts} />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-neutral-100 flex text-neutral-900">
        <Sidebar role={currentUser.role} view={view} setView={setView} company={currentCompany} onLogout={() => { setSession(null); }} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar user={currentUser} company={currentCompany} />
          <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
            <ErrorBoundary key={view}>
              <PageRouter
                view={view} setView={setView}
                db={db} persist={persist} logAction={logAction} notify={notify}
                currentUser={currentUser} currentCompany={currentCompany}
                setSession={setSession}
              />
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <Chatbot company={currentCompany} setView={setView} role={currentUser.role} />
      <Toasts toasts={toasts} />
    </>
  );
}

/* ============================== Login ============================== */

function LoginPage({ db, onLogin, notify }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const u = db.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u || u.password !== password) { setErr("Username ose password i pasaktë."); return; }
    if (!u.active) { setErr("Ky përdorues është çaktivizuar."); return; }
    if (u.companyId) {
      const co = db.companies.find((c) => c.id === u.companyId);
      if (co && co.status !== "active") { setErr("Firma juaj është joaktive. Kontaktoni administratorin e sistemit."); return; }
    }
    setErr("");
    notify(`Mirë se erdhe, ${u.name.split(" ")[0]}!`);
    onLogin(u);
  };

  const services = [
    { icon: Car, title: "Menaxhim i flotës", desc: "Regjistro veturat me detaje të plota dhe ndiq statusin në kohë reale." },
    { icon: CalendarDays, title: "Rezervime & Kalendar", desc: "Krijim i shpejtë i rezervimeve dhe pamje mujore me disponueshmëri." },
    { icon: Users, title: "Baza e klientëve", desc: "Historik i plotë, dokumente dhe kontakte të organizuara." },
    { icon: FileText, title: "Kontrata & Fatura", desc: "Gjenerim automatik i kontratës së qirasë dhe faturës me TVSH 18%." },
    { icon: BarChart3, title: "Raporte & Analiza", desc: "Të ardhurat mujore, top veturat dhe top klientët në një vend." },
    { icon: ShieldCheck, title: "Role & Siguri", desc: "Superadmin, admin firme dhe punëtor — secili me qasje të kufizuar." },
  ];
  const [slide, setSlide] = useState(0);
  useEffect(() => { const t = setInterval(() => setSlide((s) => (s + 1) % services.length), 4500); return () => clearInterval(t); }, []); // eslint-disable-line

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden grid md:grid-cols-2">
        {/* Left: form */}
        <div className="p-8 sm:p-10 flex flex-col">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center"><Car size={20} className="text-red-500" /></div>
            <span className="display text-2xl font-bold tracking-tight">{BRAND ? BRAND : (<>Car<span className="text-red-600">Data</span></>)}</span>
          </div>
          <div className="flex-1">
            <h2 className="display text-3xl font-bold mb-1">Hyr në llogari</h2>
            <p className="text-sm text-neutral-500 mb-6">Menaxho firmën tënde të Rent a Car me një platformë të vetme.</p>
            {err ? <div className="mb-4 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div> : null}
            <form onSubmit={submit}>
              <Field label="Username" required>
                <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="Vendos username-in tënd" />
              </Field>
              <Field label="Password" required>
                <div className="relative">
                  <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + " pr-9"} placeholder="Vendos password-in" />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </Field>
              <button type="submit" className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-3 rounded-lg transition">Hyr në llogari</button>
            </form>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-lg py-2.5 px-3">
              <Phone size={13} className="text-red-600 shrink-0" />
              <span>Për t'u regjistruar, kontaktoni <a href="tel:+38345278279" className="font-semibold text-red-600 hover:underline">+383 45 278 279</a></span>
            </div>
          </div>
          <div className="text-[11px] text-neutral-400 mt-8 pt-4 border-t border-neutral-100 text-center">
            © {new Date().getFullYear()} CarData — Platformë për menaxhim Rent a Car
            <div className="mt-1">Powered by <a href="https://datapos.pro" target="_blank" rel="noreferrer" className="font-semibold text-neutral-500 hover:text-red-600">Datapos.pro</a></div>
          </div>
        </div>
        {/* Right: marketing panel */}
        <div className="hidden md:flex bg-gradient-to-br from-neutral-900 via-neutral-900 to-red-900 text-white p-10 flex-col justify-between relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-red-600/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-10 w-72 h-72 bg-red-500/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] font-semibold text-white/80 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Platformë aktive
            </div>
            <h3 className="display text-3xl font-bold leading-tight mb-3">Menaxho gjithçka për Rent a Car në një vend.</h3>
            <p className="text-white/70 text-sm leading-relaxed mb-8">Nga rezervimet dhe kalendari, deri te faturat me TVSH, kontratat dhe raportet financiare — të gjitha në CarData.</p>
          </div>
          <div className="relative z-10 space-y-3">
            {services.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === slide;
              return (
                <div key={i} className={`flex gap-3 p-3 rounded-xl transition-all ${isActive ? "bg-white/10 border border-white/15" : "bg-white/[0.03] border border-transparent"}`}>
                  <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${isActive ? "bg-red-600 text-white" : "bg-white/10 text-white/70"}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{s.title}</div>
                    <div className="text-[11px] text-white/60 leading-relaxed">{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="relative z-10 flex justify-center gap-1.5 mt-6">
            {services.map((_, i) => (
              <button key={i} onClick={() => setSlide(i)} aria-label={`sherbimi ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-red-500" : "w-1.5 bg-white/30"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== Layout ============================== */

function Sidebar({ role, view, setView, company, onLogout }) {
  const items = NAV[role] || [];
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="no-print sm:hidden fixed top-3 left-3 z-40 ink-gradient text-white p-2 rounded-xl shadow-lg" onClick={() => setOpen((o) => !o)}>
        <Menu size={18} />
      </button>
      <aside className={`no-print ink-gradient text-neutral-300 w-64 shrink-0 flex flex-col fixed sm:static inset-y-0 left-0 z-30 transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}`}>
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="w-9 h-9 rounded-xl brand-gradient flex items-center justify-center shadow-lg shadow-red-900/40"><Car size={18} className="text-white" /></div>
          <span className="display font-bold text-white text-lg tracking-tight">{BRAND ? BRAND : (<>Car<span className="text-red-500">Data</span></>)}</span>
        </div>
        {company ? (
          <div className="mx-3 mb-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
            {company.logo ? (
              <img src={company.logo} alt={company.name} className="w-9 h-9 rounded-lg object-cover bg-white shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg brand-gradient flex items-center justify-center text-white font-bold text-sm shrink-0">{company.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
            )}
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">Firma</div>
              <div className="text-sm font-semibold text-white truncate">{company.name}</div>
            </div>
          </div>
        ) : null}
        <nav className="flex-1 py-2 px-3 overflow-y-auto space-y-0.5">
          {items.map((it) => {
            const Icon = it.icon;
            const active = view === it.id;
            return (
              <button
                key={it.id}
                onClick={() => { setView(it.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? "brand-gradient text-white shadow-lg shadow-red-900/30" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
              >
                <Icon size={17} />{it.label}
              </button>
            );
          })}
        </nav>
        <button onClick={onLogout} className="flex items-center gap-3 mx-3 mb-3 px-3 py-2.5 rounded-xl text-sm font-medium text-neutral-400 hover:text-white hover:bg-red-600/20 transition">
          <LogOut size={17} /> Dilni
        </button>
      </aside>
      {open ? <div className="no-print sm:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-20" onClick={() => setOpen(false)} /> : null}
    </>
  );
}

function Topbar({ user, company }) {
  const roleLabel = { superadmin: "Superadministrator", admin: "Administrator Firme", employee: "Punëtor" }[user.role];
  return (
    <header className="no-print glass border-b hairline px-5 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      <div className="pl-9 sm:pl-0">
        <div className="text-sm font-semibold text-neutral-900">{user.name}</div>
        <div className="text-[11px] text-neutral-500">{roleLabel}{company ? ` · ${company.name}` : ""}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full ink-gradient text-white flex items-center justify-center text-xs font-bold shadow-md">
          {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </div>
      </div>
    </header>
  );
}

/* ============================== Router ============================== */

function PageRouter(props) {
  const { view, currentUser } = props;
  if (currentUser.role === "superadmin") {
    switch (view) {
      case "dashboard": return <SADashboard {...props} />;
      case "companies": return <CompaniesPage {...props} />;
      case "subscriptions": return <SubscriptionsPage {...props} />;
      case "companyadmins": return <CompanyAdminsPage {...props} />;
      case "audit": return <AuditLogPage {...props} scopeAll />;
      case "profile": return <ProfileSecurity {...props} />;
      default: return null;
    }
  }
  if (currentUser.role === "admin") {
    switch (view) {
      case "dashboard": return <AdminDashboard {...props} />;
      case "reservations": return <ReservationsPage {...props} full />;
      case "calendar": return <CalendarPage {...props} />;
      case "vehicles": return <VehiclesPage {...props} />;
      case "clients": return <ClientsPage {...props} />;
      case "employees": return <EmployeesPage {...props} />;
      case "contracts": return <ContractsPage {...props} />;
      case "invoices": return <InvoicesPage {...props} />;
      case "expenses": return <ExpensesPage {...props} />;
      case "coupons": return <CouponsPage {...props} />;
      case "reports": return <ReportsPage {...props} />;
      case "activities": return <AuditLogPage {...props} />;
      case "settings": return <ProfileSecurity {...props} />;
      default: return null;
    }
  }
  // employee
  switch (view) {
    case "dashboard": return <EmployeeDashboard {...props} />;
    case "reservations": return <ReservationsPage {...props} full={false} />;
    case "calendar": return <CalendarPage {...props} />;
    case "clients": return <ClientsPage {...props} />;
    case "contracts": return <ContractsPage {...props} />;
    case "invoices": return <InvoicesPage {...props} />;
    default: return null;
  }
}

/* ============================== Superadmin: Dashboard ============================== */

function SADashboard({ db, setView }) {
  const totalCompanies = db.companies.length;
  const active = db.companies.filter((c) => c.status === "active").length;
  const expired = db.companies.filter((c) => subStatus(c) === "expired").length;
  const expiring = db.companies.filter((c) => subStatus(c) === "expiring").length;
  const admins = db.users.filter((u) => u.role === "admin").length;
  const totalReservations = db.reservations.length;

  const byMonth = {};
  db.companies.forEach((c) => { const m = (c.createdAt || "").slice(0, 7); if (m) byMonth[m] = (byMonth[m] || 0) + 1; });
  const months = Object.keys(byMonth).sort();
  const maxV = Math.max(1, ...Object.values(byMonth));

  return (
    <div className="space-y-6">
      <h1 className="display text-xl font-bold">Përmbledhje e sistemit</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Firma gjithsej" value={totalCompanies} icon={Building2} accent="black" />
        <StatCard label="Firma aktive" value={active} icon={ShieldCheck} accent="green" />
        <StatCard label="Abonime të skaduara" value={expired} icon={AlertTriangle} accent="red" />
        <StatCard label="Abonime që skadojnë së shpejti" value={expiring} icon={CreditCard} accent="amber" />
        <StatCard label="Administratorë gjithsej" value={admins} icon={UserCog} accent="slate" />
        <StatCard label="Rezervime në sistem" value={totalReservations} icon={ClipboardList} accent="black" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3">Rritja e firmave (sipas muajit të krijimit)</h3>
          <div className="flex items-end gap-2 h-32">
            {months.map((m) => (
              <div key={m} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-red-500 rounded-t" style={{ height: `${(byMonth[m] / maxV) * 100}%`, minHeight: 6 }} />
                <span className="text-[10px] text-neutral-500">{m}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3">Statuset e abonimeve</h3>
          <div className="space-y-2">
            {["active", "expiring", "expired"].map((s) => {
              const count = db.companies.filter((c) => subStatus(c) === s).length;
              const pct = totalCompanies ? (count / totalCompanies) * 100 : 0;
              const label = { active: "Aktive", expiring: "Skadojnë së shpejti", expired: "Të skaduara" }[s];
              const color = { active: "bg-emerald-500", expiring: "bg-amber-500", expired: "bg-red-500" }[s];
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs mb-1"><span>{label}</span><span className="font-semibold">{count}</span></div>
                  <div className="h-2 rounded-full bg-neutral-100"><div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Firmat e fundit të krijuara</h3>
          <button onClick={() => setView("companies")} className="text-xs font-semibold text-red-600 hover:underline">Shiko të gjitha</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-400 text-xs"><th className="py-1.5">Firma</th><th>Qyteti</th><th>Plani</th><th>Statusi</th><th>Krijuar</th></tr></thead>
          <tbody>
            {[...db.companies].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5).map((c) => (
              <tr key={c.id} className="border-t border-neutral-100">
                <td className="py-2 font-medium">{c.name}</td>
                <td>{c.city}</td>
                <td>{c.plan}</td>
                <td><Badge cls={c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}>{c.status === "active" ? "Aktive" : "Joaktive"}</Badge></td>
                <td>{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================== Superadmin: Companies ============================== */

const emptyCompany = { name: "", owner: "", phone: "", email: "", address: "", city: "", taxNo: "", status: "active", plan: "Mujor", subStart: todayISO(), subEnd: addDays(todayISO(), 30), logo: "", adminName: "", adminUsername: "", adminPassword: "admin123" };

function readFileAsDataURL(file, maxSize = 500000) {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) { reject(new Error("Skedari është më i madh se 2MB")); return; }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Nuk u lexua dëo skedari"));
    reader.readAsDataURL(file);
  });
}

function CompaniesPage({ db, persist, logAction, notify }) {
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const perPage = 8;

  const filtered = db.companies.filter((c) => {
    if (statusF !== "all" && c.status !== statusF) return false;
    const s = q.toLowerCase();
    return !s || c.name.toLowerCase().includes(s) || c.owner.toLowerCase().includes(s) || c.city.toLowerCase().includes(s);
  });
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const save = (data) => {
    if (modal.mode === "new") {
      const { adminName, adminUsername, adminPassword, ...companyData } = data;
      const co = { ...companyData, id: uid("co"), createdAt: todayISO() };
      const newUsers = [];
      if (adminUsername && adminName) {
        const dup = db.users.some((u) => u.username.toLowerCase() === adminUsername.trim().toLowerCase());
        if (dup) { notify("Ky username ekziston tashmë!", "error"); return; }
        newUsers.push({ id: uid("u"), username: adminUsername.trim(), password: adminPassword || "admin123", role: "admin", name: adminName, companyId: co.id, active: true, mustChangePassword: true });
      }
      persist((p) => ({ ...p, companies: [co, ...p.companies], users: [...newUsers, ...p.users] }));
      logAction("Firma u krijua", co.name, co.id);
      if (newUsers.length) logAction("Administrator i firmës u krijua", `${newUsers[0].name} (${newUsers[0].username})`, co.id);
      notify(newUsers.length ? "Firma dhe administratori u shtuan me sukses." : "Firma u shtua me sukses.");
    } else {
      persist((p) => ({ ...p, companies: p.companies.map((c) => (c.id === data.id ? data : c)) }));
      logAction("Firma u editua", data.name, data.id);
      notify("Firma u përditësua.");
    }
    setModal(null);
  };

  const toggleStatus = (c) => {
    persist((p) => ({ ...p, companies: p.companies.map((x) => x.id === c.id ? { ...x, status: x.status === "active" ? "inactive" : "active" } : x) }));
    logAction(c.status === "active" ? "Firma u çaktivizua" : "Firma u aktivizua", c.name, c.id);
    notify(`Firma ${c.status === "active" ? "u çaktivizua" : "u aktivizua"}.`);
  };

  const doDelete = () => {
    persist((p) => ({
      ...p,
      companies: p.companies.filter((c) => c.id !== confirmDel.id),
      users: p.users.filter((u) => u.companyId !== confirmDel.id),
      vehicles: p.vehicles.filter((v) => v.companyId !== confirmDel.id),
      clients: p.clients.filter((c) => c.companyId !== confirmDel.id),
      reservations: p.reservations.filter((r) => r.companyId !== confirmDel.id),
    }));
    logAction("Firma u fshi", confirmDel.name, confirmDel.id);
    notify("Firma dhe të dhënat e saj u fshinë.", "error");
    setConfirmDel(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl font-bold">Firmat</h1>
        <button onClick={() => setModal({ mode: "new", data: emptyCompany })} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"><Plus size={15} />Firmë e re</button>
      </div>
      <div className="flex flex-wrap gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Kërko firmë, pronar, qytet..." />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={inputCls + " w-auto"}>
          <option value="all">Të gjitha</option><option value="active">Aktive</option><option value="inactive">Joaktive</option>
        </select>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Firma</th><th>Pronari</th><th>Qyteti</th><th>Plani</th><th>Abonimi</th><th>Statusi</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {pageRows.map((c) => {
              const ss = subStatus(c);
              return (
                <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2.5 px-4 font-medium">{c.name}</td>
                  <td>{c.owner}</td>
                  <td>{c.city}</td>
                  <td>{c.plan}</td>
                  <td><Badge cls={ss === "active" ? "bg-emerald-100 text-emerald-700" : ss === "expiring" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>{ss === "active" ? "Aktiv" : ss === "expiring" ? "Skadon së shpejti" : "I skaduar"}</Badge></td>
                  <td><Badge cls={c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}>{c.status === "active" ? "Aktive" : "Joaktive"}</Badge></td>
                  <td className="px-4">
                    <div className="flex gap-1.5">
                      <button onClick={() => setModal({ mode: "edit", data: c })} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><Pencil size={14} /></button>
                      <button onClick={() => toggleStatus(c)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><ShieldCheck size={14} /></button>
                      <button onClick={() => setConfirmDel(c)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!pageRows.length ? <tr><td colSpan={7} className="text-center text-neutral-400 py-8">Nuk u gjet asnjë firmë.</td></tr> : null}
          </tbody>
        </table>
        <div className="px-4 pb-3"><Pagination page={page} setPage={setPage} total={filtered.length} perPage={perPage} /></div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "new" ? "Firmë e re" : "Edito firmën"} wide>
        {modal ? <CompanyForm data={modal.data} mode={modal.mode} onSave={save} onCancel={() => setModal(null)} /> : null}
      </Modal>
      <ConfirmDialog open={!!confirmDel} title="Fshi firmën?" message={`Do të fshihen edhe të gjitha veturat, klientët, rezervimet dhe punëtorët e "${confirmDel?.name}".`} danger requireDoubleForCompany onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}

function CompanyForm({ data, mode, onSave, onCancel }) {
  const [f, setF] = useState(data);
  const [logoErr, setLogoErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isNew = mode === "new";
  const handleLogo = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoErr("Të lejohen vetëm imazhet."); return; }
    try {
      const dataUrl = await readFileAsDataURL(file);
      setF((prev) => ({ ...prev, logo: dataUrl }));
      setLogoErr("");
    } catch (er) { setLogoErr(er.message || "Gabim gjatë ngarkimit"); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.name || !f.owner) return; if (isNew && (!f.adminName || !f.adminUsername)) return; onSave(f); }}>
      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-neutral-100">
        {f.logo ? (
          <img src={f.logo} alt="logo" className="w-20 h-20 rounded-xl object-cover border border-neutral-200 bg-white" />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-neutral-100 border-2 border-dashed border-neutral-300 flex items-center justify-center text-neutral-400"><Building2 size={26} /></div>
        )}
        <div className="flex-1">
          <div className="text-xs font-semibold text-neutral-600 mb-1">Logo e firmës</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white flex items-center gap-1.5">
              <Download size={12} /> Ngarko nga PC
              <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
            </label>
            {f.logo ? (
              <button type="button" onClick={() => setF((p) => ({ ...p, logo: "" }))} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 hover:bg-neutral-50">Hiq logon</button>
            ) : null}
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">PNG, JPG ose SVG. Maksimumi 2MB. Rekomandohet 200x200px.</div>
          {logoErr ? <div className="text-[11px] text-red-600 mt-1">{logoErr}</div> : null}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Emri i firmës" required><input value={f.name} onChange={set("name")} className={inputCls} required /></Field>
        <Field label="Pronari / Personi përgjegjës" required><input value={f.owner} onChange={set("owner")} className={inputCls} required /></Field>
        <Field label="Telefoni"><input value={f.phone} onChange={set("phone")} className={inputCls} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set("email")} className={inputCls} /></Field>
        <Field label="Adresa"><input value={f.address} onChange={set("address")} className={inputCls} /></Field>
        <Field label="Qyteti"><input value={f.city} onChange={set("city")} className={inputCls} /></Field>
        <Field label="Numri fiskal/biznesor"><input value={f.taxNo} onChange={set("taxNo")} className={inputCls} /></Field>
        <Field label="Statusi">
          <select value={f.status} onChange={set("status")} className={inputCls}><option value="active">Aktive</option><option value="inactive">Joaktive</option></select>
        </Field>
        <Field label="Plani i abonimit">
          <select value={f.plan} onChange={set("plan")} className={inputCls}>
            <option>Mujor</option><option>3-mujor</option><option>6-mujor</option><option>Vjetor</option><option>Personalizuar</option>
          </select>
        </Field>
        <div />
        <Field label="Fillimi i abonimit"><input type="date" value={f.subStart} onChange={set("subStart")} className={inputCls} /></Field>
        <Field label="Mbarimi i abonimit"><input type="date" value={f.subEnd} onChange={set("subEnd")} className={inputCls} /></Field>
      </div>
      {isNew ? (
        <div className="mt-4 border-t border-neutral-200 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-red-600 text-white flex items-center justify-center"><UserCog size={14} /></div>
            <h4 className="font-semibold text-sm">Administratori i firmës</h4>
            <span className="text-xs text-neutral-400">— krijohet automatikisht me firmën</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Emri i plotë i administratorit" required><input value={f.adminName} onChange={set("adminName")} className={inputCls} required={isNew} /></Field>
            <Field label="Username" required><input value={f.adminUsername} onChange={set("adminUsername")} className={inputCls} required={isNew} placeholder="p.sh. admin.firma" /></Field>
            <Field label="Password fillestar" required><input value={f.adminPassword} onChange={set("adminPassword")} className={inputCls} required={isNew} /></Field>
            <div className="text-xs text-neutral-500 self-end pb-3">Administratori do të detyrohet ta ndryshojë password-in në hyrjen e parë.</div>
          </div>
        </div>
      ) : null}
      <div className="flex justify-end gap-2 pt-4 border-t border-neutral-100 mt-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300 hover:bg-neutral-50">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700">Ruaj</button>
      </div>
    </form>
  );
}

/* ============================== Superadmin: Subscriptions ============================== */

function SubscriptionsPage({ db, persist, logAction, notify }) {
  const [editing, setEditing] = useState(null);
  const rows = db.companies.map((c) => ({ ...c, ss: subStatus(c) }));

  const extend = (c, months) => {
    const base = new Date(c.subEnd) > new Date() ? c.subEnd : todayISO();
    const newEnd = addDays(base, months * 30);
    persist((p) => ({ ...p, companies: p.companies.map((x) => x.id === c.id ? { ...x, subEnd: newEnd } : x) }));
    logAction("Abonimi u zgjat", `${c.name} +${months} muaj → ${newEnd}`, c.id);
    notify("Abonimi u zgjat me sukses.");
  };
  const cancel = (c) => {
    persist((p) => ({ ...p, companies: p.companies.map((x) => x.id === c.id ? { ...x, subEnd: todayISO() } : x) }));
    logAction("Abonimi u anulua", c.name, c.id);
    notify("Abonimi u anulua.", "error");
  };
  const saveCustom = (c, subStart, subEnd, plan) => {
    persist((p) => ({ ...p, companies: p.companies.map((x) => x.id === c.id ? { ...x, subStart, subEnd, plan } : x) }));
    logAction("Abonimi u përditsua", `${c.name} → ${plan}, ${subStart} - ${subEnd}`, c.id);
    notify("Abonimi u përditsua.");
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <h1 className="display text-xl font-bold">Abonimet</h1>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Firma</th><th>Plani</th><th>Fillimi</th><th>Mbarimi</th><th>Statusi</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2.5 px-4 font-medium">{c.name}</td>
                <td>{c.plan}</td>
                <td>{fmtDate(c.subStart)}</td>
                <td>{fmtDate(c.subEnd)}</td>
                <td><Badge cls={c.ss === "active" ? "bg-emerald-100 text-emerald-700" : c.ss === "expiring" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>{c.ss === "active" ? "Aktiv" : c.ss === "expiring" ? "Skadon së shpejti" : "I skaduar"}</Badge></td>
                <td className="px-4">
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => extend(c, 1)} className="px-2 py-1 rounded-md text-xs font-semibold bg-neutral-100 hover:bg-neutral-200">+1 muaj</button>
                    <button onClick={() => extend(c, 12)} className="px-2 py-1 rounded-md text-xs font-semibold bg-neutral-100 hover:bg-neutral-200">+1 vit</button>
                    <button onClick={() => setEditing(c)} className="px-2 py-1 rounded-md text-xs font-semibold bg-neutral-100 hover:bg-neutral-200">Personalizuar</button>
                    <button onClick={() => cancel(c)} className="px-2 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100">Anulo</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Abonim i personalizuar">
        {editing ? <CustomSubForm c={editing} onSave={saveCustom} onCancel={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  );
}
function CustomSubForm({ c, onSave, onCancel }) {
  const [plan, setPlan] = useState(c.plan);
  const [start, setStart] = useState(c.subStart);
  const [end, setEnd] = useState(c.subEnd);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(c, start, end, plan); }}>
      <Field label="Plani"><select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}><option>Mujor</option><option>3-mujor</option><option>6-mujor</option><option>Vjetor</option><option>Personalizuar</option></select></Field>
      <Field label="Fillimi"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
      <Field label="Mbarimi"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white">Ruaj</button>
      </div>
    </form>
  );
}

/* ============================== Superadmin: Company Admins ============================== */

function CompanyAdminsPage({ db, persist, logAction, notify }) {
  const [modal, setModal] = useState(null);
  const admins = db.users.filter((u) => u.role === "admin");

  const save = (f) => {
    if (modal.mode === "new") {
      const u = { id: uid("u"), role: "admin", active: true, mustChangePassword: true, ...f };
      persist((p) => ({ ...p, users: [u, ...p.users] }));
      logAction("Administrator i firmës u krijua", `${u.name} (${u.username})`, u.companyId);
      notify("Administratori u krijua.");
    } else {
      persist((p) => ({ ...p, users: p.users.map((u) => u.id === f.id ? { ...u, ...f } : u) }));
      logAction("Administratori u përditsua", f.username, f.companyId);
      notify("Të dhënat u ruajtën.");
    }
    setModal(null);
  };

  const resetPassword = (u) => {
    const newPass = Math.random().toString(36).slice(2, 8);
    persist((p) => ({ ...p, users: p.users.map((x) => x.id === u.id ? { ...x, password: newPass, mustChangePassword: true } : x) }));
    logAction("Password i administratorit u rivendos", u.username, u.companyId);
    notify(`Password i ri për ${u.username}: ${newPass}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl font-bold">Administratorët e firmave</h1>
        <button onClick={() => setModal({ mode: "new", data: { username: "", name: "", password: "admin123", companyId: db.companies[0]?.id || "" } })} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"><Plus size={15} />Administrator i ri</button>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Emri</th><th>Username</th><th>Firma</th><th>Statusi</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {admins.map((u) => {
              const co = db.companies.find((c) => c.id === u.companyId);
              return (
                <tr key={u.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2.5 px-4 font-medium">{u.name}</td>
                  <td>{u.username}</td>
                  <td>{co?.name || "-"}</td>
                  <td><Badge cls={u.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}>{u.active ? "Aktiv" : "Joaktiv"}</Badge></td>
                  <td className="px-4">
                    <div className="flex gap-1.5">
                      <button onClick={() => setModal({ mode: "edit", data: u })} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><Pencil size={14} /></button>
                      <button onClick={() => resetPassword(u)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500" title="Rivendos password"><KeyRound size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "new" ? "Administrator i ri" : "Edito administrator"}>
        {modal ? <AdminForm data={modal.data} companies={db.companies} onSave={save} onCancel={() => setModal(null)} /> : null}
      </Modal>
    </div>
  );
}
function AdminForm({ data, companies, onSave, onCancel }) {
  const [f, setF] = useState(data);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.username || !f.name || !f.companyId) return; onSave(f); }}>
      <Field label="Emri i plotë" required><input value={f.name} onChange={set("name")} className={inputCls} required /></Field>
      <Field label="Username" required><input value={f.username} onChange={set("username")} className={inputCls} required /></Field>
      <Field label="Password fillestar" required><input value={f.password} onChange={set("password")} className={inputCls} required /></Field>
      <Field label="Firma" required>
        <select value={f.companyId} onChange={set("companyId")} className={inputCls} required>
          <option value="">Zgjedh firmën</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white">Ruaj</button>
      </div>
    </form>
  );
}

/* ============================== Audit Log ============================== */

function AuditLogPage({ db, currentUser, scopeAll }) {
  const [q, setQ] = useState("");
  const logs = db.auditLog.filter((l) => scopeAll || l.companyId === currentUser.companyId);
  const filtered = logs.filter((l) => {
    const s = q.toLowerCase();
    return !s || (l.action || "").toLowerCase().includes(s) || (l.userName || "").toLowerCase().includes(s) || (l.details || "").toLowerCase().includes(s);
  });
  return (
    <div className="space-y-4">
      <h1 className="display text-xl font-bold">{scopeAll ? "Audit Log i sistemit" : "Aktivitetet e punëtorëve"}</h1>
      <SearchBox value={q} onChange={setQ} placeholder="Kërko sipas veprimit, përdoruesit..." />
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Data/Ora</th><th>Përdoruesi</th><th>Roli</th><th>Veprimi</th><th className="px-4">Detaje</th></tr></thead>
          <tbody>
            {filtered.slice(0, 200).map((l) => (
              <tr key={l.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2 px-4 whitespace-nowrap">{new Date(l.ts).toLocaleString("sq-AL")}</td>
                <td>{l.userName || "-"}</td>
                <td className="capitalize">{l.role || "-"}</td>
                <td className="font-medium">{l.action}</td>
                <td className="px-4 text-neutral-500">{l.details}</td>
              </tr>
            ))}
            {!filtered.length ? <tr><td colSpan={5} className="text-center text-neutral-400 py-8">Nuk ka aktivitete.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================== Profile / Security ============================== */

function ProfileSecurity({ currentUser, currentCompany, persist, notify, logAction }) {
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [err, setErr] = useState("");
  const [logoErr, setLogoErr] = useState("");

  const handleLogo = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !currentCompany) return;
    if (!file.type.startsWith("image/")) { setLogoErr("Të lejohen vetëm imazhet."); return; }
    try {
      const dataUrl = await readFileAsDataURL(file);
      persist((p) => ({ ...p, companies: p.companies.map((c) => c.id === currentCompany.id ? { ...c, logo: dataUrl } : c) }));
      logAction("Logo e firmës u përditsua", currentCompany.name);
      notify("Logo u ruajt me sukses.");
      setLogoErr("");
    } catch (er) { setLogoErr(er.message || "Gabim gjatë ngarkimit"); }
  };
  const removeLogo = () => {
    if (!currentCompany) return;
    persist((p) => ({ ...p, companies: p.companies.map((c) => c.id === currentCompany.id ? { ...c, logo: "" } : c) }));
    logAction("Logo e firmës u hoq", currentCompany.name);
    notify("Logo u hoq.");
  };

  const submit = (e) => {
    e.preventDefault();
    if (currentUser.password !== oldPass) { setErr("Password aktual është i pasaktë."); return; }
    if (newPass.length < 4) { setErr("Password i ri duhet të ketë të paktën 4 karaktere."); return; }
    if (newPass !== confirmPass) { setErr("Password-et nuk përputhen."); return; }
    persist((p) => ({ ...p, users: p.users.map((u) => u.id === currentUser.id ? { ...u, password: newPass, mustChangePassword: false } : u) }));
    logAction("Password u ndryshua", currentUser.username);
    notify("Password u ndryshua me sukses.");
    setOldPass(""); setNewPass(""); setConfirmPass(""); setErr("");
  };

  return (
    <div className="space-y-4 max-w-md">
      <h1 className="display text-xl font-bold">Profili dhe Siguria</h1>
      {currentUser.role === "admin" && currentCompany ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2"><Building2 size={14} className="text-red-600" />Logo e firmës</div>
          <div className="flex items-center gap-4">
            {currentCompany.logo ? (
              <img src={currentCompany.logo} alt="logo" className="w-20 h-20 rounded-xl object-cover border border-neutral-200 bg-white" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-neutral-100 border-2 border-dashed border-neutral-300 flex items-center justify-center text-neutral-400"><Building2 size={26} /></div>
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white flex items-center gap-1.5">
                  <Download size={12} /> Ngarko nga PC
                  <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                </label>
                {currentCompany.logo ? (
                  <button type="button" onClick={removeLogo} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 hover:bg-neutral-50">Hiq logon</button>
                ) : null}
              </div>
              <div className="text-[10px] text-neutral-400 mt-1">Do të shfaqet në kontrata, fatura dhe në menú.</div>
              {logoErr ? <div className="text-[11px] text-red-600 mt-1">{logoErr}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold">{currentUser.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
          <div><div className="font-semibold">{currentUser.name}</div><div className="text-xs text-neutral-500">@{currentUser.username}</div></div>
        </div>
        <form onSubmit={submit}>
          {err ? <div className="mb-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div> : null}
          <Field label="Password aktual" required><input type="password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} className={inputCls} /></Field>
          <Field label="Password i ri" required><input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} className={inputCls} /></Field>
          <Field label="Konfirmo password-in" required><input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} className={inputCls} /></Field>
          <button type="submit" className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm py-2.5 rounded-lg"><Lock size={14} />Ndrysho password-in</button>
        </form>
      </div>
    </div>
  );
}

/* ============================== Admin Dashboard ============================== */

function AdminDashboard({ db, currentCompany, setView }) {
  const cid = currentCompany.id;
  const vehicles = db.vehicles.filter((v) => v.companyId === cid);
  const reservations = db.reservations.filter((r) => r.companyId === cid);
  const today = todayISO();

  const free = vehicles.filter((v) => v.status === "free").length;
  const inUse = vehicles.filter((v) => v.status === "in_use").length;
  const todayPickups = reservations.filter((r) => r.pickupDate === today).length;
  const todayReturns = reservations.filter((r) => r.returnDate === today).length;
  const active = reservations.filter((r) => r.status === "active").length;
  const late = reservations.filter((r) => r.status === "late" || (r.status === "active" && r.returnDate < today)).length;
  const revenue = reservations.filter((r) => r.status !== "cancelled").reduce((s, r) => s + Number(r.paid || 0), 0);

  const recentActs = db.auditLog.filter((l) => l.companyId === cid).slice(0, 6);

  return (
    <div className="space-y-6">
      <h1 className="display text-xl font-bold">Dashboard i firmës</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Veturat gjithsej" value={vehicles.length} icon={Car} accent="black" />
        <StatCard label="Veturat e lira" value={free} icon={Check} accent="green" />
        <StatCard label="Veturat në përdorim" value={inUse} icon={Car} accent="red" />
        <StatCard label="Rezervime aktive" value={active} icon={ClipboardList} accent="slate" />
        <StatCard label="Marrje sot" value={todayPickups} icon={CalendarDays} accent="amber" />
        <StatCard label="Kthime sot" value={todayReturns} icon={CalendarDays} accent="amber" />
        <StatCard label="Rezervime të vonuara" value={late} icon={AlertTriangle} accent="red" />
        <StatCard label="Të ardhura (të arkëtuara)" value={fmtMoney(revenue)} icon={BarChart3} accent="green" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-sm">Rezervimet e sotme</h3><button onClick={() => setView("reservations")} className="text-xs font-semibold text-red-600 hover:underline">Shiko të gjitha</button></div>
          <ReservationMiniList rows={reservations.filter((r) => r.pickupDate === today || r.returnDate === today)} db={db} />
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3">Aktivitetet e fundit të punëtorëve</h3>
          <ul className="space-y-2 text-xs">
            {recentActs.map((l) => (
              <li key={l.id} className="flex justify-between border-b border-neutral-50 pb-1.5">
                <span><b>{l.userName}</b> — {l.action}</span>
                <span className="text-neutral-400 whitespace-nowrap">{new Date(l.ts).toLocaleDateString("sq-AL")}</span>
              </li>
            ))}
            {!recentActs.length ? <li className="text-neutral-400">Nuk ka aktivitete akoma.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ReservationMiniList({ rows, db }) {
  if (!rows.length) return <div className="text-xs text-neutral-400">Asnjë rezervim sot.</div>;
  return (
    <ul className="space-y-2 text-xs">
      {rows.map((r) => {
        const client = db.clients.find((c) => c.id === r.clientId);
        const veh = db.vehicles.find((v) => v.id === r.vehicleId);
        return (
          <li key={r.id} className="flex items-center justify-between border-b border-neutral-50 pb-1.5">
            <span>{client?.firstName} {client?.lastName} · {veh?.brand} {veh?.model}</span>
            <Badge cls={STATUS_META[r.status]?.cls}>{STATUS_META[r.status]?.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

function EmployeeDashboard({ db, currentUser, currentCompany, setView }) {
  const cid = currentCompany.id;
  const today = todayISO();
  const mine = db.reservations.filter((r) => r.companyId === cid && r.createdBy === currentUser.id);
  const todaysAll = db.reservations.filter((r) => r.companyId === cid && (r.pickupDate === today || r.returnDate === today));

  return (
    <div className="space-y-6">
      <h1 className="display text-xl font-bold">Mirë se erdhe, {currentUser.name.split(" ")[0]}</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Rezervime sot" value={todaysAll.length} icon={CalendarDays} accent="black" />
        <StatCard label="Marrje sot" value={db.reservations.filter((r) => r.companyId === cid && r.pickupDate === today).length} icon={Car} accent="slate" />
        <StatCard label="Kthime sot" value={db.reservations.filter((r) => r.companyId === cid && r.returnDate === today).length} icon={Car} accent="amber" />
        <StatCard label="Rezervimet e mia" value={mine.length} icon={ClipboardList} accent="red" />
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
        <h3 className="font-semibold text-sm mb-3">Veprime të shpejta</h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setView("clients")} className="px-4 py-2 rounded-lg text-sm font-semibold bg-neutral-900 text-white flex items-center gap-2"><Plus size={14} />Shto klient</button>
          <button onClick={() => setView("reservations")} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white flex items-center gap-2"><Plus size={14} />Krijo rezervim</button>
          <button onClick={() => setView("calendar")} className="px-4 py-2 rounded-lg text-sm font-semibold bg-neutral-100 flex items-center gap-2"><CalendarDays size={14} />Shiko kalendarin</button>
          <button onClick={() => setView("contracts")} className="px-4 py-2 rounded-lg text-sm font-semibold bg-neutral-100 flex items-center gap-2"><Printer size={14} />Printo kontratë</button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
        <h3 className="font-semibold text-sm mb-3">Rezervimet e mia</h3>
        <ReservationMiniList rows={mine.slice(0, 8)} db={db} />
      </div>
    </div>
  );
}

/* ============================== Vehicles ============================== */

const emptyVehicle = { brand: "", model: "", year: new Date().getFullYear(), plate: "", vin: "", type: "Sedan", transmission: "Manual", fuel: "Naftë", color: "", km: 0, dailyPrice: 0, status: "free", photo: "", notes: "", regExpiry: "", insuranceExpiry: "", lastServiceKm: 0, serviceIntervalKm: 10000 };

function VehiclesPage({ db, currentCompany, persist, logAction, notify }) {
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const perPage = 8;

  const all = db.vehicles.filter((v) => v.companyId === currentCompany.id);
  const filtered = all.filter((v) => {
    if (statusF !== "all" && v.status !== statusF) return false;
    const s = q.toLowerCase();
    return !s || `${v.brand} ${v.model} ${v.plate}`.toLowerCase().includes(s);
  });
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const save = (f) => {
    if (modal.mode === "new") {
      const v = { ...f, id: uid("v"), companyId: currentCompany.id };
      persist((p) => ({ ...p, vehicles: [v, ...p.vehicles] }));
      logAction("Veturë u shtua", `${v.brand} ${v.model} (${v.plate})`);
      notify("Vetura u shtua.");
    } else {
      persist((p) => ({ ...p, vehicles: p.vehicles.map((v) => v.id === f.id ? f : v) }));
      logAction("Veturë u editua", `${f.brand} ${f.model} (${f.plate})`);
      notify("Vetura u përditsua.");
    }
    setModal(null);
  };
  const doDelete = () => {
    persist((p) => ({ ...p, vehicles: p.vehicles.filter((v) => v.id !== confirmDel.id) }));
    logAction("Veturë u fshi", `${confirmDel.brand} ${confirmDel.model}`);
    notify("Vetura u fshi.", "error");
    setConfirmDel(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl font-bold">Veturat</h1>
        <button onClick={() => setModal({ mode: "new", data: emptyVehicle })} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"><Plus size={15} />Veturë e re</button>
      </div>
      <div className="flex flex-wrap gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Kërko marka, modeli, targa..." />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={inputCls + " w-auto"}>
          <option value="all">Të gjitha statuset</option>
          {Object.entries(VEHICLE_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Vetura</th><th>Targa</th><th>Lloji</th><th>Transmisioni</th><th>Çmimi/ditë</th><th>Km</th><th>Statusi</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {pageRows.map((v) => (
              <tr key={v.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2.5 px-4 font-medium">{v.brand} {v.model} <span className="text-neutral-400">'{String(v.year).slice(-2)}</span></td>
                <td>{v.plate}</td>
                <td>{v.type}</td>
                <td>{v.transmission}</td>
                <td>{fmtMoney(v.dailyPrice)}</td>
                <td>{Number(v.km).toLocaleString()}</td>
                <td><Badge cls={VEHICLE_STATUS_META[v.status]?.cls}>{VEHICLE_STATUS_META[v.status]?.label}</Badge></td>
                <td className="px-4">
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal({ mode: "edit", data: v })} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(v)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!pageRows.length ? <tr><td colSpan={8} className="text-center text-neutral-400 py-8">Nuk u gjet asnjë veturë.</td></tr> : null}
          </tbody>
        </table>
        <div className="px-4 pb-3"><Pagination page={page} setPage={setPage} total={filtered.length} perPage={perPage} /></div>
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "new" ? "Veturë e re" : "Edito veturën"} wide>
        {modal ? <VehicleForm data={modal.data} onSave={save} onCancel={() => setModal(null)} /> : null}
      </Modal>
      <ConfirmDialog open={!!confirmDel} title="Fshi veturën?" message={`A jeni i sigurt që doni të fshini "${confirmDel?.brand} ${confirmDel?.model}"?`} danger onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
function VehicleForm({ data, onSave, onCancel }) {
  const [f, setF] = useState(data);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.brand || !f.model || !f.plate) return; onSave(f); }}>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Marka" required><input value={f.brand} onChange={set("brand")} className={inputCls} required /></Field>
        <Field label="Modeli" required><input value={f.model} onChange={set("model")} className={inputCls} required /></Field>
        <Field label="Viti"><input type="number" value={f.year} onChange={set("year", true)} className={inputCls} /></Field>
        <Field label="Targa" required><input value={f.plate} onChange={set("plate")} className={inputCls} required /></Field>
        <Field label="VIN / numri i shasisë"><input value={f.vin} onChange={set("vin")} className={inputCls} /></Field>
        <Field label="Lloji">
          <select value={f.type} onChange={set("type")} className={inputCls}>
            {["Sedan", "SUV", "Hatchback", "Van", "Luksoz", "Ekonomik"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Transmisioni"><select value={f.transmission} onChange={set("transmission")} className={inputCls}><option>Manual</option><option>Automatik</option></select></Field>
        <Field label="Karburanti"><select value={f.fuel} onChange={set("fuel")} className={inputCls}><option>Naftë</option><option>Benzinë</option><option>Hybrid</option><option>Elektrike</option></select></Field>
        <Field label="Ngjyra"><input value={f.color} onChange={set("color")} className={inputCls} /></Field>
        <Field label="Kilometrazhi"><input type="number" value={f.km} onChange={set("km", true)} className={inputCls} /></Field>
        <Field label="Çmimi ditor (€)"><input type="number" value={f.dailyPrice} onChange={set("dailyPrice", true)} className={inputCls} /></Field>
        <Field label="Statusi">
          <select value={f.status} onChange={set("status")} className={inputCls}>
            {Object.entries(VEHICLE_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-2 mb-1 pt-3 border-t border-neutral-100">
        <div className="text-xs font-semibold text-neutral-600 mb-2 flex items-center gap-1.5"><ShieldCheck size={12} className="text-red-600" />Dokumentet & Servisimi</div>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Skadon regjistrimi (data)"><input type="date" value={f.regExpiry || ""} onChange={set("regExpiry")} className={inputCls} /></Field>
        <Field label="Skadon sigurimi (data)"><input type="date" value={f.insuranceExpiry || ""} onChange={set("insuranceExpiry")} className={inputCls} /></Field>
        <Field label="Km në servisimin e fundit"><input type="number" value={f.lastServiceKm || 0} onChange={set("lastServiceKm", true)} className={inputCls} /></Field>
        <Field label="Interval servisimi (km)"><input type="number" value={f.serviceIntervalKm || 10000} onChange={set("serviceIntervalKm", true)} className={inputCls} /></Field>
      </div>
      <Field label="Shënime (dëmtime, gjendje teknike)"><textarea value={f.notes} onChange={set("notes")} className={inputCls} rows={2} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white">Ruaj</button>
      </div>
    </form>
  );
}

/* ============================== Clients ============================== */

const emptyClient = { firstName: "", lastName: "", personalNo: "", licenseNo: "", licenseExpiry: "", phone: "", email: "", address: "", city: "", country: "Kosovë", notes: "", rating: 0, blacklisted: false, referralCode: "", referredBy: "" };

function ClientsPage({ db, currentCompany, persist, logAction, notify }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const perPage = 8;

  const all = db.clients.filter((c) => c.companyId === currentCompany.id);
  const filtered = all.filter((c) => {
    const s = q.toLowerCase();
    return !s || `${c.firstName} ${c.lastName} ${c.personalNo} ${c.phone}`.toLowerCase().includes(s);
  });
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const save = (f) => {
    if (modal.mode === "new") {
      const dup = all.some((c) => c.personalNo && c.personalNo === f.personalNo);
      if (dup) { notify("Kujdes: një klient me këtë numër personal ekziston tashmë!", "error"); }
      const c = { ...f, id: uid("c"), companyId: currentCompany.id, referralCode: f.referralCode || genReferralCode(f.firstName, f.lastName) };
      persist((p) => ({ ...p, clients: [c, ...p.clients] }));
      logAction("Klient u shtua", `${c.firstName} ${c.lastName}`);
      notify("Klienti u shtua.");
    } else {
      persist((p) => ({ ...p, clients: p.clients.map((c) => c.id === f.id ? f : c) }));
      logAction("Klient u editua", `${f.firstName} ${f.lastName}`);
      notify("Klienti u përditsua.");
    }
    setModal(null);
  };
  const doDelete = () => {
    persist((p) => ({ ...p, clients: p.clients.filter((c) => c.id !== confirmDel.id) }));
    logAction("Klient u fshi", `${confirmDel.firstName} ${confirmDel.lastName}`);
    notify("Klienti u fshi.", "error");
    setConfirmDel(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl font-bold">Klientët</h1>
        <button onClick={() => setModal({ mode: "new", data: emptyClient })} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"><Plus size={15} />Klient i ri</button>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Kërko emër, numër personal, telefon..." />
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Klienti</th><th>Nr. Personal</th><th>Patentë (skadon)</th><th>Telefoni</th><th>Qyteti</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {pageRows.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2.5 px-4 font-medium">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{c.firstName} {c.lastName}</span>
                    {(() => { const t = loyaltyTier(db.reservations.filter((r) => r.clientId === c.id && r.status === "completed").length); return t ? <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${t.cls}`}><Award size={9} />{t.label}</span> : null; })()}
                    {c.rating ? <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-500"><Star size={11} className="fill-amber-400 text-amber-400" />{c.rating}</span> : null}
                    {c.blacklisted ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700"><Ban size={9} />Blacklist</span> : null}
                  </div>
                </td>
                <td>{c.personalNo}</td>
                <td>{c.licenseNo} <span className="text-neutral-400">({fmtDate(c.licenseExpiry)})</span></td>
                <td>{c.phone}</td>
                <td>{c.city}</td>
                <td className="px-4">
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal({ mode: "edit", data: c })} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDel(c)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!pageRows.length ? <tr><td colSpan={6} className="text-center text-neutral-400 py-8">Nuk u gjet asnjë klient.</td></tr> : null}
          </tbody>
        </table>
        <div className="px-4 pb-3"><Pagination page={page} setPage={setPage} total={filtered.length} perPage={perPage} /></div>
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "new" ? "Klient i ri" : "Edito klientin"} wide>
        {modal ? <ClientForm data={modal.data} onSave={save} onCancel={() => setModal(null)} /> : null}
      </Modal>
      <ConfirmDialog open={!!confirmDel} title="Fshi klientin?" message={`A jeni i sigurt që doni të fshini "${confirmDel?.firstName} ${confirmDel?.lastName}"?`} danger onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
function ClientForm({ data, onSave, onCancel }) {
  const [f, setF] = useState(data);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.firstName || !f.lastName || !f.phone) return; onSave(f); }}>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Emri" required><input value={f.firstName} onChange={set("firstName")} className={inputCls} required /></Field>
        <Field label="Mbiemri" required><input value={f.lastName} onChange={set("lastName")} className={inputCls} required /></Field>
        <Field label="Numri personal"><input value={f.personalNo} onChange={set("personalNo")} className={inputCls} pattern="[0-9]*" title="Vetëm numra" /></Field>
        <Field label="Numri i patentë shoferit"><input value={f.licenseNo} onChange={set("licenseNo")} className={inputCls} /></Field>
        <Field label="Skadimi i patentës"><input type="date" value={f.licenseExpiry} onChange={set("licenseExpiry")} className={inputCls} /></Field>
        <Field label="Telefoni" required><input value={f.phone} onChange={set("phone")} className={inputCls} required /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set("email")} className={inputCls} /></Field>
        <Field label="Adresa"><input value={f.address} onChange={set("address")} className={inputCls} /></Field>
        <Field label="Qyteti"><input value={f.city} onChange={set("city")} className={inputCls} /></Field>
        <Field label="Shteti"><input value={f.country} onChange={set("country")} className={inputCls} /></Field>
        <Field label="Kodi i referimit"><input value={f.referralCode || ""} readOnly placeholder="Gjenerohet automatikisht" className={inputCls + " bg-neutral-50 text-neutral-500"} /></Field>
        <Field label="Referuar nga (kodi)"><input value={f.referredBy || ""} onChange={(e) => setF({ ...f, referredBy: e.target.value.toUpperCase() })} placeholder="P.sh. AM8F2K" className={inputCls + " uppercase"} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 my-3">
        <div className="bg-neutral-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-neutral-600 mb-2 flex items-center gap-1.5"><Star size={12} className="text-amber-500" />Vlerësimi i klientit</div>
          <StarRating value={f.rating || 0} onChange={(v) => setF({ ...f, rating: v })} />
        </div>
        <div className="bg-neutral-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-neutral-600 mb-2 flex items-center gap-1.5"><Ban size={12} className="text-red-600" />Blacklist</div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!f.blacklisted} onChange={(e) => setF({ ...f, blacklisted: e.target.checked })} className="w-4 h-4 accent-red-600" />
            Shëno këtë klient në blacklist
          </label>
        </div>
      </div>
      <Field label="Shënime"><textarea value={f.notes} onChange={set("notes")} className={inputCls} rows={2} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white">Ruaj</button>
      </div>
    </form>
  );
}

/* ============================== Employees ============================== */

function EmployeesPage({ db, currentCompany, persist, logAction, notify }) {
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const employees = db.users.filter((u) => u.companyId === currentCompany.id && u.role === "employee");

  const save = (f) => {
    if (modal.mode === "new") {
      const u = { id: uid("u"), role: "employee", companyId: currentCompany.id, active: true, mustChangePassword: true, ...f };
      persist((p) => ({ ...p, users: [u, ...p.users] }));
      logAction("Punëtor u krijua", `${u.name} (${u.username})`);
      notify("Punëtori u shtua.");
    } else {
      persist((p) => ({ ...p, users: p.users.map((u) => u.id === f.id ? { ...u, ...f } : u) }));
      logAction("Punëtor u editua", f.username);
      notify("Të dhënat u ruajtën.");
    }
    setModal(null);
  };
  const toggleActive = (u) => {
    persist((p) => ({ ...p, users: p.users.map((x) => x.id === u.id ? { ...x, active: !x.active } : x) }));
    logAction(u.active ? "Punëtor u çaktivizua" : "Punëtor u aktivizua", u.username);
    notify("Statusi u përditsua.");
  };
  const doDelete = () => {
    persist((p) => ({ ...p, users: p.users.filter((u) => u.id !== confirmDel.id) }));
    logAction("Punëtor u fshi", confirmDel.username);
    notify("Punëtori u fshi.", "error");
    setConfirmDel(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl font-bold">Punëtorët</h1>
        <button onClick={() => setModal({ mode: "new", data: { username: "", name: "", password: "puna123" } })} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"><Plus size={15} />Punëtor i ri</button>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Emri</th><th>Username</th><th>Statusi</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {employees.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2.5 px-4 font-medium">{u.name}</td>
                <td>{u.username}</td>
                <td><Badge cls={u.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}>{u.active ? "Aktiv" : "Joaktiv"}</Badge></td>
                <td className="px-4">
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal({ mode: "edit", data: u })} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><Pencil size={14} /></button>
                    <button onClick={() => toggleActive(u)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><ShieldCheck size={14} /></button>
                    <button onClick={() => setConfirmDel(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!employees.length ? <tr><td colSpan={4} className="text-center text-neutral-400 py-8">Nuk ka punëtorë ende.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "new" ? "Punëtor i ri" : "Edito punëtorin"}>
        {modal ? <EmployeeForm data={modal.data} onSave={save} onCancel={() => setModal(null)} /> : null}
      </Modal>
      <ConfirmDialog open={!!confirmDel} title="Fshi punëtorin?" message={`A jeni i sigurt që doni të fshini "${confirmDel?.name}"?`} danger onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}
function EmployeeForm({ data, onSave, onCancel }) {
  const [f, setF] = useState(data);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.name || !f.username) return; onSave(f); }}>
      <Field label="Emri i plotë" required><input value={f.name} onChange={set("name")} className={inputCls} required /></Field>
      <Field label="Username" required><input value={f.username} onChange={set("username")} className={inputCls} required /></Field>
      <Field label="Password" required><input value={f.password} onChange={set("password")} className={inputCls} required /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white">Ruaj</button>
      </div>
    </form>
  );
}

/* ============================== Reservations ============================== */

function emptyReservation(vehicleId) {
  return {
    clientId: "", vehicleId: vehicleId || "", pickupDate: todayISO(), pickupTime: "09:00", returnDate: addDays(todayISO(), 1), returnTime: "09:00",
    pickupLocation: "", returnLocation: "", dailyPrice: 0, deposit: 0, paid: 0, paymentMethod: "Cash", paymentStatus: "unpaid", status: "pending",
    notes: "", conditionPickup: "", conditionReturn: "", kmPickup: "", kmReturn: "", fuelPickup: "", fuelReturn: "",
  };
}

function ReservationsPage({ db, currentCompany, currentUser, persist, logAction, notify, full }) {
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const perPage = 8;

  const cid = currentCompany.id;
  const allRes = db.reservations.filter((r) => r.companyId === cid && (full || r.createdBy === currentUser.id));
  const clients = db.clients.filter((c) => c.companyId === cid);
  const vehicles = db.vehicles.filter((v) => v.companyId === cid);

  const filtered = allRes.filter((r) => {
    if (statusF !== "all" && r.status !== statusF) return false;
    const client = clients.find((c) => c.id === r.clientId);
    const veh = vehicles.find((v) => v.id === r.vehicleId);
    const s = q.toLowerCase();
    return !s || `${client?.firstName} ${client?.lastName} ${veh?.brand} ${veh?.model} ${veh?.plate} ${r.num}`.toLowerCase().includes(s);
  }).sort((a, b) => b.num - a.num);
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const save = (f) => {
    if (!vehicleIsFree(f.vehicleId, f.pickupDate, f.returnDate, db.reservations.filter((r) => r.companyId === cid), f.id)) {
      notify("Kjo veturë është tashmë e rezervuar për këto data!", "error");
      return;
    }
    if (modal.mode === "new") {
      const nextNum = Math.max(1000, ...db.reservations.filter((r) => r.companyId === cid).map((r) => r.num || 0)) + 1;
      const r = { ...f, id: uid("r"), companyId: cid, num: nextNum, createdBy: currentUser.id };
      persist((p) => ({ ...p, reservations: [r, ...p.reservations], vehicles: p.vehicles.map((v) => v.id === f.vehicleId && r.status !== "pending" ? { ...v, status: "reserved" } : v) }));
      logAction("Rezervim u krijua", `#${nextNum}`);
      notify("Rezervimi u krijua.");
    } else {
      persist((p) => ({ ...p, reservations: p.reservations.map((r) => r.id === f.id ? { ...f } : r) }));
      logAction("Rezervim u editua", `#${f.num}`);
      notify("Rezervimi u përditsua.");
    }
    setModal(null);
  };

  const setStatus = (r, status) => {
    let vehStatusUpdate = null;
    if (status === "active") vehStatusUpdate = "in_use";
    if (status === "completed" || status === "cancelled") vehStatusUpdate = "free";
    if (status === "confirmed") vehStatusUpdate = "reserved";
    persist((p) => ({
      ...p,
      reservations: p.reservations.map((x) => x.id === r.id ? { ...x, status } : x),
      vehicles: vehStatusUpdate ? p.vehicles.map((v) => v.id === r.vehicleId ? { ...v, status: vehStatusUpdate } : v) : p.vehicles,
    }));
    logAction("Statusi i rezervimit u ndryshua", `#${r.num} → ${STATUS_META[status].label}`);
    notify(`Statusi u ndryshua në "${STATUS_META[status].label}".`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl font-bold">Rezervimet</h1>
        <button onClick={() => setModal({ mode: "new", data: emptyReservation() })} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"><Plus size={15} />Rezervim i ri</button>
      </div>
      <div className="flex flex-wrap gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Kërko klient, veturë, nr. rezervimi..." />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={inputCls + " w-auto"}>
          <option value="all">Të gjitha statuset</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Nr.</th><th>Klienti</th><th>Vetura</th><th>Marrja</th><th>Kthimi</th><th>Totali</th><th>Pagesa</th><th>Statusi</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {pageRows.map((r) => {
              const client = clients.find((c) => c.id === r.clientId);
              const veh = vehicles.find((v) => v.id === r.vehicleId);
              const days = daysBetween(r.pickupDate, r.returnDate);
              const total = days * Number(r.dailyPrice || 0);
              const isLate = r.status === "active" && r.returnDate < todayISO();
              return (
                <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2.5 px-4 font-mono text-xs">#{r.num}</td>
                  <td className="font-medium">{client?.firstName} {client?.lastName}</td>
                  <td>{veh?.brand} {veh?.model}</td>
                  <td>{fmtDate(r.pickupDate)}</td>
                  <td>{fmtDate(r.returnDate)}</td>
                  <td>{fmtMoney(total)}</td>
                  <td><Badge cls={PAY_STATUS_META[r.paymentStatus]?.cls}>{PAY_STATUS_META[r.paymentStatus]?.label}</Badge></td>
                  <td><Badge cls={STATUS_META[isLate ? "late" : r.status]?.cls}>{STATUS_META[isLate ? "late" : r.status]?.label}</Badge></td>
                  <td className="px-4">
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setModal({ mode: "edit", data: r })} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500" title="Edito"><Pencil size={13} /></button>
                      {r.status === "pending" ? <button onClick={() => setStatus(r, "confirmed")} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">Konfirmo</button> : null}
                      {r.status === "confirmed" ? <button onClick={() => setStatus(r, "active")} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-red-100 text-red-700">Marrje</button> : null}
                      {r.status === "active" ? <button onClick={() => setStatus(r, "completed")} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-700">Kthim</button> : null}
                      {["pending", "confirmed"].includes(r.status) ? <button onClick={() => setConfirmCancel(r)} className="px-2 py-1 rounded-md text-[11px] font-semibold bg-neutral-100 text-neutral-600">Anulo</button> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!pageRows.length ? <tr><td colSpan={9} className="text-center text-neutral-400 py-8">Nuk u gjet asnjë rezervim.</td></tr> : null}
          </tbody>
        </table>
        <div className="px-4 pb-3"><Pagination page={page} setPage={setPage} total={filtered.length} perPage={perPage} /></div>
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "new" ? "Rezervim i ri" : `Edito rezervimin #${modal?.data?.num || ""}`} wide>
        {modal ? <ReservationForm data={modal.data} clients={clients} vehicles={vehicles} coupons={db.coupons.filter((c) => c.companyId === cid)} reservations={db.reservations.filter((r) => r.companyId === cid)} onSave={save} onCancel={() => setModal(null)} onAddClient={(client) => { const c = { ...client, id: uid("c"), companyId: cid }; persist((p) => ({ ...p, clients: [c, ...p.clients] })); logAction("Klient u shtua nga rezervimi", `${c.firstName} ${c.lastName}`); notify("Klienti u shtua."); return c.id; }} /> : null}
      </Modal>
      <ConfirmDialog open={!!confirmCancel} title="Anulo rezervimin?" message={`Rezervimi #${confirmCancel?.num} do të shënohet si i anuluar.`} danger onConfirm={() => { setStatus(confirmCancel, "cancelled"); setConfirmCancel(null); }} onCancel={() => setConfirmCancel(null)} />
    </div>
  );
}

function ReservationForm({ data, clients, vehicles, coupons = [], reservations = [], onSave, onCancel, onAddClient }) {
  const [f, setF] = useState({ ...data, couponCode: data.couponCode || "", discountAmount: data.discountAmount || 0, signature: data.signature || "" });
  const [showClientModal, setShowClientModal] = useState(false);
  const [showSigModal, setShowSigModal] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  useEffect(() => {
    const v = vehicles.find((x) => x.id === f.vehicleId);
    if (v && !data.id) setF((prev) => ({ ...prev, dailyPrice: v.dailyPrice }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.vehicleId]);
  const selectedClient = clients.find((c) => c.id === f.clientId);
  const selVehicle = vehicles.find((v) => v.id === f.vehicleId);
  const utilPct = selVehicle ? Math.min(100, Math.round((reservations.filter((r) => r.vehicleId === selVehicle.id && r.status !== "cancelled").reduce((s, r) => s + Math.min(daysBetween(r.pickupDate, r.returnDate), 30), 0) / 30) * 100)) : 0;
  const priceSuggestion = selVehicle ? suggestPrice(selVehicle.dailyPrice, f.pickupDate, utilPct) : null;
  const completedCount = selectedClient ? reservations.filter((r) => r.clientId === selectedClient.id && r.status === "completed").length : 0;
  const tier = loyaltyTier(completedCount);
  const days = daysBetween(f.pickupDate, f.returnDate);
  const subtotal = days * Number(f.dailyPrice || 0);
  const discount = Number(f.discountAmount || 0);
  const total = Math.max(0, subtotal - discount);
  const remaining = total - Number(f.paid || 0);

  const applyCoupon = () => {
    const code = (f.couponCode || "").trim().toUpperCase();
    if (!code) { setF({ ...f, discountAmount: 0 }); setCouponMsg(""); return; }
    const cp = coupons.find((c) => c.code.toUpperCase() === code && c.active);
    if (!cp) { setCouponMsg("❌ Kuponi nuk është valid ose është çaktivizuar."); setF({ ...f, discountAmount: 0 }); return; }
    if (cp.expiresAt && cp.expiresAt < todayISO()) { setCouponMsg("❌ Kuponi ka skaduar."); setF({ ...f, discountAmount: 0 }); return; }
    if (cp.usageLimit && cp.usedCount >= cp.usageLimit) { setCouponMsg("❌ Kuponi ka arritur limitin e përdorimit."); setF({ ...f, discountAmount: 0 }); return; }
    const disc = cp.type === "percent" ? Math.round(subtotal * (cp.value / 100) * 100) / 100 : cp.value;
    setF({ ...f, discountAmount: disc });
    setCouponMsg(`✅ Zbritje e aplikuar: −${fmtMoney(disc)} (${cp.type === "percent" ? cp.value + "%" : "vlerë fikse"})`);
  };
  const applyLoyalty = () => {
    if (!tier || !tier.discount) return;
    const disc = Math.round(subtotal * (tier.discount / 100) * 100) / 100;
    setF({ ...f, discountAmount: disc, couponCode: `VIP-${tier.label.toUpperCase()}` });
    setCouponMsg(`✅ Zbritje besnikërie ${tier.label}: −${fmtMoney(disc)} (${tier.discount}%)`);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.clientId || !f.vehicleId) return; onSave(f); }}>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Klienti" required>
          <div className="flex gap-2">
            <select value={f.clientId} onChange={set("clientId")} className={inputCls + " flex-1"} required>
              <option value="">Zgjedh klientin</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} {c.phone ? `· ${c.phone}` : ""}</option>)}
            </select>
            {onAddClient ? (
              <button type="button" onClick={() => setShowClientModal(true)} title="Shto klient të ri" className="px-3 py-2 rounded-lg text-sm font-semibold bg-neutral-900 hover:bg-neutral-800 text-white flex items-center gap-1 whitespace-nowrap"><Plus size={14} />Klient i ri</button>
            ) : null}
          </div>
        </Field>
        <Field label="Vetura" required>
          <select value={f.vehicleId} onChange={set("vehicleId")} className={inputCls} required>
            <option value="">Zgjedh veturën</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>)}
          </select>
        </Field>
        <Field label="Data e marrjes" required><input type="date" value={f.pickupDate} onChange={set("pickupDate")} className={inputCls} required /></Field>
        <Field label="Ora e marrjes"><input type="time" value={f.pickupTime} onChange={set("pickupTime")} className={inputCls} /></Field>
        <Field label="Data e kthimit" required><input type="date" value={f.returnDate} onChange={set("returnDate")} className={inputCls} required /></Field>
        <Field label="Ora e kthimit"><input type="time" value={f.returnTime} onChange={set("returnTime")} className={inputCls} /></Field>
        <Field label="Vendi i marrjes"><input value={f.pickupLocation} onChange={set("pickupLocation")} className={inputCls} /></Field>
        <Field label="Vendi i kthimit"><input value={f.returnLocation} onChange={set("returnLocation")} className={inputCls} /></Field>
        <Field label="Çmimi ditor (€)">
          <input type="number" value={f.dailyPrice} onChange={set("dailyPrice", true)} className={inputCls} />
          {priceSuggestion && priceSuggestion.price > 0 && priceSuggestion.price !== Number(f.dailyPrice) ? (
            <button type="button" onClick={() => setF({ ...f, dailyPrice: priceSuggestion.price })} className="mt-1 text-[11px] text-red-600 hover:underline flex items-center gap-1 text-left">
              <Sparkles size={11} className="shrink-0" />Çmim i sugjeruar: {fmtMoney(priceSuggestion.price)}{priceSuggestion.seasonPct ? ` · sezon +${priceSuggestion.seasonPct}%` : ""}{priceSuggestion.demandPct ? ` · kërkesë +${priceSuggestion.demandPct}%` : ""} — apliko
            </button>
          ) : null}
        </Field>
        <Field label="Depozita (€)"><input type="number" value={f.deposit} onChange={set("deposit", true)} className={inputCls} /></Field>
        <Field label="Pagesa e kryer (€)"><input type="number" value={f.paid} onChange={set("paid", true)} className={inputCls} /></Field>
        <Field label="Mënyra e pagesës">
          <select value={f.paymentMethod} onChange={set("paymentMethod")} className={inputCls}><option>Cash</option><option>Kartelë</option><option>Transfer bankar</option></select>
        </Field>
        <Field label="Statusi i pagesës">
          <select value={f.paymentStatus} onChange={set("paymentStatus")} className={inputCls}>{Object.entries(PAY_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </Field>
        <Field label="Statusi i rezervimit">
          <select value={f.status} onChange={set("status")} className={inputCls}>{Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </Field>
      </div>
      {selectedClient?.blacklisted ? (
        <div className="my-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          <Ban size={14} className="shrink-0 mt-0.5" />
          <div><b>Kujdes:</b> Ky klient është në blacklist. Kontrollo historikun para se të vazhdosh me rezervimin.</div>
        </div>
      ) : null}
      {tier ? (
        <div className="my-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
          <Award size={14} className="shrink-0 text-amber-600" />
          <span className="text-neutral-700">Klient <b>{tier.label}</b> ({completedCount} qira të përfunduara).</span>
          {tier.discount ? <button type="button" onClick={applyLoyalty} className="ml-auto px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-500 hover:bg-amber-600 text-white whitespace-nowrap">Apliko zbritjen VIP −{tier.discount}%</button> : null}
        </div>
      ) : null}
      <div className="mt-2 pt-3 border-t border-neutral-100">
        <div className="text-xs font-semibold text-neutral-600 mb-2 flex items-center gap-1.5"><Tag size={12} className="text-red-600" />Kupon zbritjeje (opsional)</div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={f.couponCode || ""} onChange={(e) => setF({ ...f, couponCode: e.target.value.toUpperCase() })} placeholder="P.sh. VERE2026" className={inputCls + " flex-1 min-w-[180px] uppercase"} />
          <button type="button" onClick={applyCoupon} className="px-3 py-2 rounded-lg text-sm font-semibold border border-neutral-300 hover:bg-neutral-50 whitespace-nowrap">Aplikoni</button>
          {f.discountAmount > 0 ? <button type="button" onClick={() => { setF({ ...f, couponCode: "", discountAmount: 0 }); setCouponMsg(""); }} className="px-3 py-2 rounded-lg text-sm font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700">Hiq</button> : null}
        </div>
        {couponMsg ? <div className="text-[11px] mt-1 text-neutral-600">{couponMsg}</div> : null}
      </div>
      <div className="grid grid-cols-4 gap-3 bg-neutral-50 rounded-lg p-3 my-3 text-sm">
        <div><div className="text-neutral-400 text-xs">Ditë</div><div className="font-bold">{days}</div></div>
        <div><div className="text-neutral-400 text-xs">Nen-total</div><div className="font-bold">{fmtMoney(subtotal)}</div></div>
        <div><div className="text-neutral-400 text-xs">Zbritje</div><div className="font-bold text-green-600">{discount > 0 ? "−" + fmtMoney(discount) : "—"}</div></div>
        <div><div className="text-neutral-400 text-xs">Totali final</div><div className="font-bold text-red-600">{fmtMoney(total)}</div></div>
      </div>
      <div className="pt-1 mb-2">
        <div className="text-xs font-semibold text-neutral-600 mb-2 flex items-center gap-1.5"><Pencil size={12} className="text-red-600" />Nënshkrimi dixhital i klientit</div>
        <div className="flex items-center gap-3">
          {f.signature ? (
            <img src={f.signature} alt="Nënshkrimi" className="h-16 border border-neutral-300 rounded-lg bg-white" />
          ) : (
            <div className="h-16 w-40 border-2 border-dashed border-neutral-300 rounded-lg flex items-center justify-center text-[11px] text-neutral-400">Nuk ka nënshkrim</div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowSigModal(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 text-white">{f.signature ? "Rinënshkruaj" : "Merr nënshkrimin"}</button>
            {f.signature ? <button type="button" onClick={() => setF({ ...f, signature: "" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 hover:bg-neutral-50">Hiq</button> : null}
          </div>
        </div>
      </div>
      <details className="mb-3">
        <summary className="text-xs font-semibold text-neutral-600 cursor-pointer mb-2">Gjendja e veturës (marrje / kthim)</summary>
        <div className="grid sm:grid-cols-2 gap-x-4 pt-2">
          <Field label="Gjendja në marrje"><input value={f.conditionPickup} onChange={set("conditionPickup")} className={inputCls} /></Field>
          <Field label="Gjendja në kthim"><input value={f.conditionReturn} onChange={set("conditionReturn")} className={inputCls} /></Field>
          <Field label="Km në marrje"><input type="number" value={f.kmPickup} onChange={set("kmPickup", true)} className={inputCls} /></Field>
          <Field label="Km në kthim"><input type="number" value={f.kmReturn} onChange={set("kmReturn", true)} className={inputCls} /></Field>
          <Field label="Karburanti në marrje"><input value={f.fuelPickup} onChange={set("fuelPickup")} className={inputCls} /></Field>
          <Field label="Karburanti në kthim"><input value={f.fuelReturn} onChange={set("fuelReturn")} className={inputCls} /></Field>
        </div>
      </details>
      <Field label="Shënime shtesë"><textarea value={f.notes} onChange={set("notes")} className={inputCls} rows={2} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white">Ruaj rezervimin</button>
      </div>
      <Modal open={showClientModal} onClose={() => setShowClientModal(false)} title="Klient i ri" wide>
        <ClientForm data={emptyClient} onSave={(client) => { const newId = onAddClient(client); setF((prev) => ({ ...prev, clientId: newId })); setShowClientModal(false); }} onCancel={() => setShowClientModal(false)} />
      </Modal>
      <Modal open={showSigModal} onClose={() => setShowSigModal(false)} title="Nënshkrimi i klientit">
        <SignatureCanvas onSave={(dataUrl) => { setF({ ...f, signature: dataUrl }); setShowSigModal(false); }} onCancel={() => setShowSigModal(false)} />
      </Modal>
    </form>
  );
}

/* ============================== Calendar ============================== */

function CalendarPage({ db, currentCompany }) {
  const cid = currentCompany.id;
  const [cursor, setCursor] = useState(new Date());
  const [selVehicle, setSelVehicle] = useState("all");
  const [selStatus, setSelStatus] = useState("all");
  const [detail, setDetail] = useState(null);

  const reservations = db.reservations.filter((r) => r.companyId === cid)
    .filter((r) => selVehicle === "all" || r.vehicleId === selVehicle)
    .filter((r) => selStatus === "all" || r.status === selStatus);
  const clients = db.clients.filter((c) => c.companyId === cid);
  const vehicles = db.vehicles.filter((v) => v.companyId === cid);

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const resByDay = (d) => {
    const dateStr = new Date(year, month, d).toISOString().slice(0, 10);
    return reservations.filter((r) => dateStr >= r.pickupDate && dateStr < r.returnDate);
  };

  const totalFleet = vehicles.length || 1;
  const dayLoad = (d) => resByDay(d).length;
  const monthTotal = cells.filter(Boolean).reduce((s, d) => s + dayLoad(d), 0);
  let busiest = { d: null, n: 0 };
  cells.filter(Boolean).forEach((d) => { const n = dayLoad(d); if (n > busiest.n) busiest = { d, n }; });
  const heat = (n) => {
    const pct = n / totalFleet;
    if (n === 0) return "bg-white hover:bg-neutral-50";
    if (pct >= 0.8) return "bg-red-600/90 text-white";
    if (pct >= 0.5) return "bg-red-500/70 text-white";
    if (pct >= 0.25) return "bg-red-200";
    return "bg-red-50";
  };
  const isToday = (d) => new Date(year, month, d).toISOString().slice(0, 10) === todayISO();

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="ink-gradient text-white p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="display text-2xl font-bold">Kalendari</h1>
            <p className="text-white/60 text-sm mt-0.5">{monthTotal} rezervime këtë muaj{busiest.d ? ` · dita më e ngarkuar: ${busiest.d}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition"><ChevronLeft size={16} /></button>
            <span className="font-semibold text-sm w-36 text-center capitalize">{cursor.toLocaleDateString("sq-AL", { month: "long", year: "numeric" })}</span>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition"><ChevronRight size={16} /></button>
            <button onClick={() => setCursor(new Date())} className="ml-1 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-semibold transition">Sot</button>
          </div>
        </div>
        <div className="p-3 flex flex-wrap items-center gap-3 border-b hairline">
          <select value={selVehicle} onChange={(e) => setSelVehicle(e.target.value)} className={inputCls + " w-auto"}>
            <option value="all">Të gjitha veturat</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model}</option>)}
          </select>
          <select value={selStatus} onChange={(e) => setSelStatus(e.target.value)} className={inputCls + " w-auto"}>
            <option value="all">Të gjitha statuset</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="flex items-center gap-1.5 ml-auto text-[11px] text-neutral-500">
            <span>Ngarkesa:</span>
            <span className="w-4 h-4 rounded bg-red-50 border hairline" /><span className="w-4 h-4 rounded bg-red-200" /><span className="w-4 h-4 rounded bg-red-500/70" /><span className="w-4 h-4 rounded bg-red-600/90" />
            <span>e lartë</span>
          </div>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-neutral-400 mb-1.5 uppercase tracking-wide">
            {["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((d, i) => (
              <div key={i} className={`min-h-[92px] rounded-xl border p-1.5 transition ${d ? `hairline ${heat(dayLoad(d))} ${isToday(d) ? "ring-2 ring-red-500 ring-offset-1" : ""}` : "border-transparent"}`}>
                {d ? (
                  <>
                    <div className={`text-[11px] font-bold mb-1 flex items-center justify-between ${dayLoad(d) / totalFleet >= 0.5 ? "text-white" : "text-neutral-500"}`}>
                      <span className={isToday(d) ? "w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center" : ""}>{d}</span>
                      {dayLoad(d) > 0 ? <span className="text-[9px] font-semibold opacity-80">{dayLoad(d)}</span> : null}
                    </div>
                    <div className="space-y-1">
                      {resByDay(d).slice(0, 2).map((r) => {
                        const client = clients.find((c) => c.id === r.clientId);
                        const veh = vehicles.find((v) => v.id === r.vehicleId);
                        const isLate = r.status === "active" && r.returnDate < todayISO();
                        return (
                          <button key={r.id} onClick={() => setDetail(r)} className={`w-full text-left px-1.5 py-0.5 rounded-md text-[10px] font-semibold truncate shadow-sm ${STATUS_META[isLate ? "late" : r.status]?.cls}`}>
                            {client?.lastName} · {veh?.model}
                          </button>
                        );
                      })}
                      {resByDay(d).length > 2 ? <div className={`text-[10px] font-medium ${dayLoad(d) / totalFleet >= 0.5 ? "text-white/80" : "text-neutral-400"}`}>+{resByDay(d).length - 2} më shumë</div> : null}
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Rezervimi #${detail?.num || ""}`}>
        {detail ? <ReservationDetailView r={detail} db={db} /> : null}
      </Modal>
    </div>
  );
}

function ReservationDetailView({ r, db }) {
  const client = db.clients.find((c) => c.id === r.clientId);
  const veh = db.vehicles.find((v) => v.id === r.vehicleId);
  const days = daysBetween(r.pickupDate, r.returnDate);
  const total = days * Number(r.dailyPrice || 0);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2"><Badge cls={STATUS_META[r.status]?.cls}>{STATUS_META[r.status]?.label}</Badge><Badge cls={PAY_STATUS_META[r.paymentStatus]?.cls}>{PAY_STATUS_META[r.paymentStatus]?.label}</Badge></div>
      <div><UserIcon size={13} className="inline mr-1.5 text-neutral-400" />{client?.firstName} {client?.lastName} · {client?.phone}</div>
      <div><Car size={13} className="inline mr-1.5 text-neutral-400" />{veh?.brand} {veh?.model} ({veh?.plate})</div>
      <div><CalendarDays size={13} className="inline mr-1.5 text-neutral-400" />{fmtDate(r.pickupDate)} {r.pickupTime} → {fmtDate(r.returnDate)} {r.returnTime}</div>
      <div className="grid grid-cols-3 gap-2 bg-neutral-50 rounded-lg p-3">
        <div><div className="text-neutral-400 text-xs">Ditë</div><div className="font-bold">{days}</div></div>
        <div><div className="text-neutral-400 text-xs">Totali</div><div className="font-bold">{fmtMoney(total)}</div></div>
        <div><div className="text-neutral-400 text-xs">Paguar</div><div className="font-bold">{fmtMoney(r.paid)}</div></div>
      </div>
      {r.notes ? <div className="text-neutral-500 text-xs">Shënime: {r.notes}</div> : null}
    </div>
  );
}

/* ============================== Contracts ============================== */

function ContractsPage({ db, currentCompany, currentUser }) {
  const cid = currentCompany.id;
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null);
  const scoped = db.reservations.filter((r) => r.companyId === cid && (currentUser.role !== "employee" || r.createdBy === currentUser.id));
  const rows = scoped.filter((r) => {
    const client = db.clients.find((c) => c.id === r.clientId);
    const s = q.toLowerCase();
    return !s || `${client?.firstName} ${client?.lastName} ${r.num}`.toLowerCase().includes(s);
  }).sort((a, b) => b.num - a.num);

  return (
    <div className="space-y-4">
      <h1 className="display text-xl font-bold">Kontratat</h1>
      <SearchBox value={q} onChange={setQ} placeholder="Kërko klient, nr. rezervimi..." />
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Nr. Kontrata</th><th>Klienti</th><th>Data</th><th>Statusi</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const client = db.clients.find((c) => c.id === r.clientId);
              return (
                <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2.5 px-4 font-mono text-xs">#{r.num}</td>
                  <td className="font-medium">{client?.firstName} {client?.lastName}</td>
                  <td>{fmtDate(r.pickupDate)}</td>
                  <td><Badge cls={STATUS_META[r.status]?.cls}>{STATUS_META[r.status]?.label}</Badge></td>
                  <td className="px-4"><button onClick={() => setActive(r)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white flex items-center gap-1.5"><Eye size={13} />Shiko kontratën</button></td>
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={5} className="text-center text-neutral-400 py-8">Asnjë kontratë.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Modal open={!!active} onClose={() => setActive(null)} title="Kontrata e qirase" wide>
        {active ? <ContractPrint r={active} db={db} company={currentCompany} /> : null}
      </Modal>
    </div>
  );
}

function ContractPrint({ r, db, company }) {
  const client = db.clients.find((c) => c.id === r.clientId);
  const veh = db.vehicles.find((v) => v.id === r.vehicleId);
  const days = daysBetween(r.pickupDate, r.returnDate);
  const total = days * Number(r.dailyPrice || 0);
  const remaining = total - Number(r.paid || 0);

  const doPrint = () => {
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) return;
    w.document.write(`<html><head><title>Kontrata #${r.num}</title><style>
      body{font-family:Georgia,serif;color:#111;padding:36px;font-size:13px;line-height:1.5}
      h1{font-size:20px;margin:0 0 2px} h2{font-size:13px;color:#555;margin:0 0 20px;font-weight:normal}
      table{width:100%;border-collapse:collapse;margin-bottom:16px} td{padding:4px 0;vertical-align:top}
      .label{color:#666;width:170px;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
      .section{border-top:2px solid #111;margin-top:18px;padding-top:10px}
      .redline{border-top:3px solid #DC2626;margin:14px 0}
      .sig{margin-top:50px;display:flex;justify-content:space-between}
      .sig div{width:45%;border-top:1px solid #111;padding-top:6px;font-size:11px;color:#555;text-align:center}
      .total{font-size:16px;font-weight:bold}
    </style></head><body>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:6px">
        ${company.logo ? `<img src="${company.logo}" alt="logo" style="width:64px;height:64px;object-fit:contain;border-radius:8px" />` : ""}
        <div><h1>${company.name}</h1><h2>${company.address || ""}, ${company.city || ""} · ${company.phone || ""} · ${company.email || ""}</h2></div>
      </div>
      <div class="redline"></div>
      <h1 style="font-size:16px">KONTRATË QIRAJE VETURE</h1>
      <h2>Nr. Kontrata: #${r.num} &nbsp;·&nbsp; Data: ${fmtDate(todayISO())}</h2>
      <div class="section"><b>TË DHËNAT E KLIENTIT</b>
      <table>
        <tr><td class="label">Emri dhe mbiemri</td><td>${client?.firstName || ""} ${client?.lastName || ""}</td></tr>
        <tr><td class="label">Numri personal</td><td>${client?.personalNo || "-"}</td></tr>
        <tr><td class="label">Nr. patentë shoferit</td><td>${client?.licenseNo || "-"}</td></tr>
        <tr><td class="label">Telefoni / Adresa</td><td>${client?.phone || "-"} · ${client?.address || ""} ${client?.city || ""}</td></tr>
      </table></div>
      <div class="section"><b>TË DHËNAT E VETURËS</b>
      <table>
        <tr><td class="label">Marka / Modeli</td><td>${veh?.brand || ""} ${veh?.model || ""}</td></tr>
        <tr><td class="label">Targa</td><td>${veh?.plate || "-"}</td></tr>
        <tr><td class="label">Viti</td><td>${veh?.year || "-"}</td></tr>
        <tr><td class="label">Kilometrazhi</td><td>${veh?.km ?? "-"}</td></tr>
      </table></div>
      <div class="section"><b>DETAJET E QIRAS��</b>
      <table>
        <tr><td class="label">Marrja</td><td>${fmtDate(r.pickupDate)} ${r.pickupTime} · ${r.pickupLocation || "-"}</td></tr>
        <tr><td class="label">Kthimi</td><td>${fmtDate(r.returnDate)} ${r.returnTime} · ${r.returnLocation || "-"}</td></tr>
        <tr><td class="label">Çmimi ditor / Ditë</td><td>${fmtMoney(r.dailyPrice)} x ${days} ditë</td></tr>
        <tr><td class="label">Paguar / Mbetet</td><td>${fmtMoney(r.paid)} / ${fmtMoney(remaining)}</td></tr>
        <tr><td class="label">Totali</td><td class="total">${fmtMoney(total)}</td></tr>
      </table></div>
      <div class="section"><b>GJENDJA E VETURËS NË MARRJE</b><p>${r.conditionPickup || "Pa shënime."}</p></div>
      <div class="section"><b>KUSHTET E PËRGJITHSHME</b>
      <p style="font-size:11px;color:#444">Qiramarrësi është përgjegjës për veturën gjatë gjithë periudhës së qirasë. Çdo dëmtim jashtë konsumit normal do të faturohet sipas çmimores së firmës. Kthimi i vonuar i veturës mund të rezultojë në tarifa shtesë ditore.</p></div>
      <div class="sig"><div>Nënshkrimi i klientit</div><div>Nënshkrimi dhe vula e firmës</div></div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) { /* ignore */ } }, 200);
  };

  return (
    <div className="space-y-4">
      <div className="border border-neutral-200 rounded-xl p-5 bg-neutral-50 text-sm print-area">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-lg font-bold">{company.name}</div>
            <div className="text-xs text-neutral-500">{company.address} · {company.city} · {company.phone}</div>
          </div>
          <div className="text-right text-xs text-neutral-500">
            <div className="font-bold text-neutral-900">Kontratë #{r.num}</div>
            <div>{fmtDate(todayISO())}</div>
          </div>
        </div>
        <div className="border-t-4 border-red-600 my-3" />
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Klienti</div>
            <div>{client?.firstName} {client?.lastName}</div>
            <div className="text-xs text-neutral-500">Nr. Personal: {client?.personalNo || "-"}</div>
            <div className="text-xs text-neutral-500">Patentë: {client?.licenseNo || "-"}</div>
            <div className="text-xs text-neutral-500">Telefon: {client?.phone || "-"}</div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Vetura</div>
            <div>{veh?.brand} {veh?.model} ({veh?.year})</div>
            <div className="text-xs text-neutral-500">Targa: {veh?.plate}</div>
            <div className="text-xs text-neutral-500">Kilometrazhi: {veh?.km?.toLocaleString?.() || veh?.km || "-"}</div>
          </div>
        </div>
        <div className="border-t border-neutral-200 my-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><div className="text-neutral-400">Marrja</div><div className="font-semibold">{fmtDate(r.pickupDate)} {r.pickupTime}</div></div>
          <div><div className="text-neutral-400">Kthimi</div><div className="font-semibold">{fmtDate(r.returnDate)} {r.returnTime}</div></div>
          <div><div className="text-neutral-400">Ditet</div><div className="font-semibold">{days}</div></div>
          <div><div className="text-neutral-400">Totali</div><div className="font-bold text-red-600">{fmtMoney(total)}</div></div>
          <div><div className="text-neutral-400">Çmimi/ditë</div><div className="font-semibold">{fmtMoney(r.dailyPrice)}</div></div>
          <div><div className="text-neutral-400">Depozita</div><div className="font-semibold">{fmtMoney(r.deposit)}</div></div>
          <div><div className="text-neutral-400">Paguar</div><div className="font-semibold">{fmtMoney(r.paid)}</div></div>
          <div><div className="text-neutral-400">Mbetet</div><div className="font-bold text-red-600">{fmtMoney(remaining)}</div></div>
        </div>
        {r.conditionPickup ? (
          <>
            <div className="border-t border-neutral-200 my-3" />
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide mb-1">Gjendja në marrje</div>
            <div className="text-xs">{r.conditionPickup}</div>
          </>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 no-print">
        <button onClick={doPrint} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700"><Printer size={14} />Printo kontratën</button>
      </div>
    </div>
  );
}

/* ============================== Reports ============================== */

function ReportsPage({ db, currentCompany }) {
  const cid = currentCompany.id;
  const reservations = db.reservations.filter((r) => r.companyId === cid && r.status !== "cancelled");
  const vehicles = db.vehicles.filter((v) => v.companyId === cid);
  const clients = db.clients.filter((c) => c.companyId === cid);

  const now = new Date();
  const thisMonthKey = now.toISOString().slice(0, 7);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = lastMonthDate.toISOString().slice(0, 7);

  const totalRevenue = reservations.reduce((s, r) => s + Number(r.paid || 0), 0);
  const thisMonthRevenue = reservations.filter((r) => (r.pickupDate || "").slice(0, 7) === thisMonthKey).reduce((s, r) => s + Number(r.paid || 0), 0);
  const lastMonthRevenue = reservations.filter((r) => (r.pickupDate || "").slice(0, 7) === lastMonthKey).reduce((s, r) => s + Number(r.paid || 0), 0);
  const outstanding = reservations.reduce((s, r) => {
    const days = daysBetween(r.pickupDate, r.returnDate);
    const total = days * Number(r.dailyPrice || 0);
    return s + Math.max(0, total - Number(r.paid || 0));
  }, 0);

  const byMonth = {};
  reservations.forEach((r) => {
    const k = (r.pickupDate || "").slice(0, 7);
    if (k) byMonth[k] = (byMonth[k] || 0) + Number(r.paid || 0);
  });
  const months = Object.keys(byMonth).sort().slice(-6);
  const maxV = Math.max(1, ...months.map((m) => byMonth[m]));

  const vehicleStats = vehicles.map((v) => {
    const rs = reservations.filter((r) => r.vehicleId === v.id);
    const revenue = rs.reduce((s, r) => s + Number(r.paid || 0), 0);
    const rentDays = rs.reduce((s, r) => s + daysBetween(r.pickupDate, r.returnDate), 0);
    return { v, revenue, rentDays, count: rs.length };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const clientStats = clients.map((c) => {
    const rs = reservations.filter((r) => r.clientId === c.id);
    const revenue = rs.reduce((s, r) => s + Number(r.paid || 0), 0);
    return { c, revenue, count: rs.length };
  }).sort((a, b) => b.count - a.count).slice(0, 5);

  const byStatus = {};
  db.reservations.filter((r) => r.companyId === cid).forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });

  return (
    <div className="space-y-6">
      <h1 className="display text-xl font-bold">Raportet</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Të ardhura totale" value={fmtMoney(totalRevenue)} icon={BarChart3} accent="green" />
        <StatCard label="Këtë muaj" value={fmtMoney(thisMonthRevenue)} icon={CalendarDays} accent="black" />
        <StatCard label="Muajin e kaluar" value={fmtMoney(lastMonthRevenue)} icon={CalendarDays} accent="slate" />
        <StatCard label="Për të arkëtuar" value={fmtMoney(outstanding)} icon={AlertTriangle} accent="red" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3">Të ardhurat sipas muajit (6 muajt e fundit)</h3>
          {months.length === 0 ? <div className="text-xs text-neutral-400">Nuk ka të dhëna.</div> : (
            <div className="flex items-end gap-2 h-40">
              {months.map((m) => (
                <div key={m} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] text-neutral-500 font-semibold">{fmtMoney(byMonth[m])}</div>
                  <div className="w-full bg-red-500 rounded-t" style={{ height: `${(byMonth[m] / maxV) * 100}%`, minHeight: 6 }} />
                  <span className="text-[10px] text-neutral-500">{m}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3">Rezervimet sipas statusit</h3>
          <div className="space-y-2">
            {Object.entries(STATUS_META).map(([k, meta]) => {
              const count = byStatus[k] || 0;
              const total = Object.values(byStatus).reduce((s, n) => s + n, 0);
              const pct = total ? (count / total) * 100 : 0;
              return (
                <div key={k}>
                  <div className="flex justify-between text-xs mb-1"><span>{meta.label}</span><span className="font-semibold">{count}</span></div>
                  <div className="h-2 rounded-full bg-neutral-100"><div className="h-2 rounded-full bg-red-500" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3">Top 5 veturat sipas të ardhurave</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-neutral-400 text-xs"><th className="py-1.5">Vetura</th><th>Rezervime</th><th>Ditë</th><th>Të ardhura</th></tr></thead>
            <tbody>
              {vehicleStats.map((s) => (
                <tr key={s.v.id} className="border-t border-neutral-100">
                  <td className="py-2 font-medium">{s.v.brand} {s.v.model} <span className="text-neutral-400 text-xs">({s.v.plate})</span></td>
                  <td>{s.count}</td>
                  <td>{s.rentDays}</td>
                  <td className="font-semibold">{fmtMoney(s.revenue)}</td>
                </tr>
              ))}
              {!vehicleStats.length ? <tr><td colSpan={4} className="py-3 text-neutral-400 text-center">Nuk ka të dhëna.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3">Top 5 klientët</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-neutral-400 text-xs"><th className="py-1.5">Klienti</th><th>Rezervime</th><th>Vlerë</th></tr></thead>
            <tbody>
              {clientStats.map((s) => (
                <tr key={s.c.id} className="border-t border-neutral-100">
                  <td className="py-2 font-medium">{s.c.firstName} {s.c.lastName}</td>
                  <td>{s.count}</td>
                  <td className="font-semibold">{fmtMoney(s.revenue)}</td>
                </tr>
              ))}
              {!clientStats.length ? <tr><td colSpan={3} className="py-3 text-neutral-400 text-center">Nuk ka të dhëna.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============================== Invoices (Fatura) ============================== */

function InvoicesPage({ db, currentCompany, currentUser, notify, logAction }) {
  const cid = currentCompany.id;
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [active, setActive] = useState(null);
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Auto-generate invoices from reservations that are completed or active/confirmed with payment
  const invoices = db.reservations
    .filter((r) => r.companyId === cid && r.status !== "cancelled")
    .map((r) => {
      const client = db.clients.find((c) => c.id === r.clientId);
      const veh = db.vehicles.find((v) => v.id === r.vehicleId);
      const days = daysBetween(r.pickupDate, r.returnDate);
      const subtotal = days * Number(r.dailyPrice || 0);
      const vat = Math.round(subtotal * 0.18 * 100) / 100; // 18% TVSH Kosovë
      const total = subtotal + vat;
      const paid = Number(r.paid || 0);
      const remaining = total - paid;
      return {
        id: r.id,
        num: `FAT-${new Date(r.pickupDate).getFullYear()}-${String(r.num).padStart(4, "0")}`,
        resNum: r.num,
        date: r.pickupDate,
        client, veh, r, days, subtotal, vat, total, paid, remaining,
        payStatus: r.paymentStatus,
      };
    });

  const filtered = invoices.filter((inv) => {
    if (statusF !== "all" && inv.payStatus !== statusF) return false;
    const s = q.toLowerCase();
    return !s || `${inv.client?.firstName} ${inv.client?.lastName} ${inv.num}`.toLowerCase().includes(s);
  }).sort((a, b) => b.resNum - a.resNum);
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const totalRevenue = invoices.reduce((s, i) => s + i.paid, 0);
  const totalPending = invoices.reduce((s, i) => s + i.remaining, 0);
  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);

  const printInvoice = (inv) => {
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) { notify("Lejo pop-ups për të printuar!", "error"); return; }
    const co = currentCompany;
    w.document.write(`<html><head><title>Fatura ${inv.num}</title><style>
      body{font-family:Arial,sans-serif;color:#111;padding:36px;font-size:12px;line-height:1.5}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #DC2626;padding-bottom:14px;margin-bottom:20px}
      .co-name{font-size:22px;font-weight:bold;margin:0} .co-sub{color:#666;font-size:11px;margin-top:4px}
      .invoice-title{text-align:right} .invoice-title h1{margin:0;font-size:28px;color:#DC2626;letter-spacing:2px} .invoice-title .num{color:#111;font-weight:bold;font-size:14px}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
      .info-block h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:1px solid #ddd;padding-bottom:4px}
      .info-block p{margin:2px 0;font-size:12px}
      table.items{width:100%;border-collapse:collapse;margin-top:16px} table.items th{background:#111;color:#fff;text-align:left;padding:10px;font-size:11px;text-transform:uppercase}
      table.items td{padding:10px;border-bottom:1px solid #eee;font-size:12px}
      table.totals{width:280px;margin-left:auto;margin-top:12px;border-collapse:collapse}
      table.totals td{padding:6px 10px;font-size:12px} table.totals tr.total td{border-top:2px solid #111;font-weight:bold;font-size:15px;padding-top:10px}
      .footer{margin-top:40px;border-top:1px solid #ddd;padding-top:12px;color:#666;font-size:10px;text-align:center}
      .paid-stamp{display:inline-block;padding:4px 10px;border:2px solid #059669;color:#059669;font-weight:bold;transform:rotate(-8deg);font-size:14px;letter-spacing:2px}
    </style></head><body>
      <div class="header">
        <div style="display:flex;align-items:center;gap:14px">${co.logo ? `<img src="${co.logo}" alt="logo" style="width:64px;height:64px;object-fit:contain;border-radius:8px" />` : ""}<div><h2 class="co-name">${co.name}</h2><div class="co-sub">${co.address || ""}, ${co.city || ""}<br/>${co.phone || ""} · ${co.email || ""}<br/>Nr. Fiskal: ${co.taxNo || "-"}</div></div></div>
        <div class="invoice-title"><h1>FATURË</h1><div class="num">${inv.num}</div><div style="color:#666;font-size:11px">Data: ${fmtDate(todayISO())}</div>${inv.payStatus === "paid" ? '<div style="margin-top:10px" class="paid-stamp">PAGUAR</div>' : ""}</div>
      </div>
      <div class="info-grid">
        <div class="info-block"><h3>Faturuar për</h3>
          <p><b>${inv.client?.firstName || ""} ${inv.client?.lastName || ""}</b></p>
          <p>${inv.client?.address || ""} ${inv.client?.city || ""}</p>
          <p>Nr. Personal: ${inv.client?.personalNo || "-"}</p>
          <p>Tel: ${inv.client?.phone || "-"}</p>
        </div>
        <div class="info-block"><h3>Detaje të qirasë</h3>
          <p>Nr. Rezervimi: <b>#${inv.resNum}</b></p>
          <p>Vetura: ${inv.veh?.brand || ""} ${inv.veh?.model || ""} (${inv.veh?.plate || "-"})</p>
          <p>Periudha: ${fmtDate(inv.r.pickupDate)} → ${fmtDate(inv.r.returnDate)}</p>
          <p>Mënyra e pagesës: ${inv.r.paymentMethod || "-"}</p>
        </div>
      </div>
      <table class="items">
        <thead><tr><th>Përshkrimi</th><th style="text-align:center">Ditë</th><th style="text-align:right">Çmimi/ditë</th><th style="text-align:right">Vlera</th></tr></thead>
        <tbody>
          <tr><td>Qira e veturës ${inv.veh?.brand || ""} ${inv.veh?.model || ""} (${inv.veh?.plate || ""})</td><td style="text-align:center">${inv.days}</td><td style="text-align:right">${fmtMoney(inv.r.dailyPrice)}</td><td style="text-align:right">${fmtMoney(inv.subtotal)}</td></tr>
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Nën-totali:</td><td style="text-align:right">${fmtMoney(inv.subtotal)}</td></tr>
        <tr><td>TVSH (18%):</td><td style="text-align:right">${fmtMoney(inv.vat)}</td></tr>
        <tr class="total"><td>TOTALI:</td><td style="text-align:right">${fmtMoney(inv.total)}</td></tr>
        <tr><td style="color:#059669">Paguar:</td><td style="text-align:right;color:#059669">${fmtMoney(inv.paid)}</td></tr>
        <tr><td style="color:#DC2626"><b>Për pagesë:</b></td><td style="text-align:right;color:#DC2626"><b>${fmtMoney(inv.remaining)}</b></td></tr>
      </table>
      <div class="footer">Faleminderit që zgjodhët ${co.name}! Kjo faturë është gjeneruar automatikisht nga sistemi CarData.</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (e) { /* ignore */ } }, 250);
    if (logAction) logAction("Fatura u printua", inv.num);
  };

  return (
    <div className="space-y-4">
      <h1 className="display text-xl font-bold">Faturat</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Të faturuara gjithsej" value={fmtMoney(totalInvoiced)} icon={FileText} accent="black" />
        <StatCard label="Të arkëtuara" value={fmtMoney(totalRevenue)} icon={Check} accent="green" />
        <StatCard label="Për pagesë" value={fmtMoney(totalPending)} icon={AlertTriangle} accent="red" />
      </div>
      <div className="flex flex-wrap gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Kërko klient ose nr. fature..." />
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={inputCls + " w-auto"}>
          <option value="all">Të gjitha statuset</option>
          {Object.entries(PAY_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Nr. Fatura</th><th>Data</th><th>Klienti</th><th>Vetura</th><th>Nën-total</th><th>TVSH (18%)</th><th>Totali</th><th>Statusi</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {pageRows.map((inv) => (
              <tr key={inv.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="py-2.5 px-4 font-mono text-xs font-semibold">{inv.num}</td>
                <td>{fmtDate(inv.date)}</td>
                <td className="font-medium">{inv.client?.firstName} {inv.client?.lastName}</td>
                <td className="text-neutral-600">{inv.veh?.brand} {inv.veh?.model}</td>
                <td>{fmtMoney(inv.subtotal)}</td>
                <td className="text-neutral-500">{fmtMoney(inv.vat)}</td>
                <td className="font-bold">{fmtMoney(inv.total)}</td>
                <td><Badge cls={PAY_STATUS_META[inv.payStatus]?.cls}>{PAY_STATUS_META[inv.payStatus]?.label}</Badge></td>
                <td className="px-4">
                  <div className="flex gap-1.5">
                    <button onClick={() => setActive(inv)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500" title="Shiko"><Eye size={14} /></button>
                    <button onClick={() => printInvoice(inv)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500" title="Printo"><Printer size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!pageRows.length ? <tr><td colSpan={9} className="text-center text-neutral-400 py-8">Asnjë faturë.</td></tr> : null}
          </tbody>
        </table>
        <div className="px-4 pb-3"><Pagination page={page} setPage={setPage} total={filtered.length} perPage={perPage} /></div>
      </div>

      <Modal open={!!active} onClose={() => setActive(null)} title={`Fatura ${active?.num || ""}`} wide>
        {active ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200">
              <div>
                <div className="text-xs text-neutral-400 uppercase tracking-wide">Faturuar për</div>
                <div className="font-semibold text-base">{active.client?.firstName} {active.client?.lastName}</div>
                <div className="text-neutral-500 text-xs">{active.client?.phone} · {active.client?.address} {active.client?.city}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-neutral-400">Data e faturës</div>
                <div className="font-semibold">{fmtDate(todayISO())}</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-xs">
              <div><span className="text-neutral-400">Rezervimi:</span> <b>#{active.resNum}</b></div>
              <div><span className="text-neutral-400">Vetura:</span> {active.veh?.brand} {active.veh?.model} ({active.veh?.plate})</div>
              <div><span className="text-neutral-400">Periudha:</span> {fmtDate(active.r.pickupDate)} → {fmtDate(active.r.returnDate)}</div>
              <div><span className="text-neutral-400">Mënyra e pagesës:</span> {active.r.paymentMethod || "-"}</div>
            </div>
            <table className="w-full text-sm border-t border-b border-neutral-200">
              <thead><tr className="text-xs text-neutral-400"><th className="text-left py-2">Përshkrimi</th><th>Ditë</th><th className="text-right">Çmimi</th><th className="text-right">Vlera</th></tr></thead>
              <tbody>
                <tr className="border-t border-neutral-100">
                  <td className="py-2">Qira e veturës {active.veh?.brand} {active.veh?.model}</td>
                  <td className="text-center">{active.days}</td>
                  <td className="text-right">{fmtMoney(active.r.dailyPrice)}</td>
                  <td className="text-right font-semibold">{fmtMoney(active.subtotal)}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-end">
              <div className="w-full sm:w-72 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-neutral-500">Nën-totali:</span><span>{fmtMoney(active.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">TVSH (18%):</span><span>{fmtMoney(active.vat)}</span></div>
                <div className="flex justify-between border-t border-neutral-200 pt-1.5 font-bold text-base"><span>TOTALI:</span><span>{fmtMoney(active.total)}</span></div>
                <div className="flex justify-between text-emerald-600"><span>Paguar:</span><span>{fmtMoney(active.paid)}</span></div>
                <div className="flex justify-between text-red-600 font-semibold"><span>Për pagesë:</span><span>{fmtMoney(active.remaining)}</span></div>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button onClick={() => printInvoice(active)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"><Printer size={14} />Printo faturën</button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ============================== Reusable: StarRating & SignatureCanvas ============================== */

function StarRating({ value = 0, onChange, readOnly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(n)} onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange && onChange(n === value ? 0 : n)}
          className={readOnly ? "cursor-default" : "cursor-pointer"}>
          <Star size={20} className={(hover || value) >= n ? "fill-amber-400 text-amber-400" : "text-neutral-300"} />
        </button>
      ))}
      {value ? <span className="text-xs text-neutral-500 ml-1">{value}/5</span> : null}
    </div>
  );
}

function SignatureCanvas({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  const pos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - rect.left) * (canvas.width / rect.width), y: (t.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext("2d"); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current.getContext("2d"); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setHasDrawn(true); };
  const end = () => { drawing.current = false; };
  const clear = () => { const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); setHasDrawn(false); };
  const doSave = () => { if (!hasDrawn) return; onSave(canvasRef.current.toDataURL("image/png")); };

  return (
    <div>
      <p className="text-xs text-neutral-500 mb-2">Nënshkruani brenda kornizës me maus ose gisht.</p>
      <canvas ref={canvasRef} width={500} height={200}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        className="w-full border-2 border-dashed border-neutral-300 rounded-lg touch-none bg-white" />
      <div className="flex justify-between gap-2 pt-3">
        <button type="button" onClick={clear} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Pastro</button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
          <button type="button" onClick={doSave} disabled={!hasDrawn} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white disabled:opacity-40">Ruaj nënshkrimin</button>
        </div>
      </div>
    </div>
  );
}

/* ============================== Expenses ============================== */

const EXPENSE_CATEGORIES = ["Karburant", "Servisim", "Sigurim", "Regjistrim", "Marketing", "Rroga", "Të tjera"];

function ExpensesPage({ db, currentCompany, persist, logAction, notify }) {
  const cid = currentCompany.id;
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [catF, setCatF] = useState("all");
  const expenses = db.expenses.filter((e) => e.companyId === cid).filter((e) => catF === "all" || e.category === catF).sort((a, b) => (a.date < b.date ? 1 : -1));
  const vehicles = db.vehicles.filter((v) => v.companyId === cid);
  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  const save = (f) => {
    if (modal.mode === "new") {
      const e = { ...f, id: uid("e"), companyId: cid };
      persist((p) => ({ ...p, expenses: [e, ...p.expenses] }));
      logAction("Shpenzim u shtua", `${f.category} · ${fmtMoney(f.amount)}`);
      notify("Shpenzimi u shtua.");
    } else {
      persist((p) => ({ ...p, expenses: p.expenses.map((e) => e.id === f.id ? f : e) }));
      logAction("Shpenzim u editua", `${f.category}`);
      notify("Shpenzimi u përditsua.");
    }
    setModal(null);
  };
  const doDelete = () => {
    persist((p) => ({ ...p, expenses: p.expenses.filter((e) => e.id !== confirmDel.id) }));
    logAction("Shpenzim u fshi", confirmDel.category);
    notify("Shpenzimi u fshi.", "error");
    setConfirmDel(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl font-bold">Shpenzimet</h1>
        <button onClick={() => setModal({ mode: "new", data: { date: todayISO(), category: "Karburant", amount: 0, vehicleId: "", notes: "" } })} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"><Plus size={15} />Shpenzim i ri</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className={inputCls + " w-auto"}>
          <option value="all">Të gjitha kategoritë</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto text-sm text-neutral-500">Totali: <span className="font-bold text-red-600">{fmtMoney(total)}</span></div>
      </div>
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-left text-neutral-400 text-xs border-b border-neutral-100"><th className="py-2.5 px-4">Data</th><th>Kategoria</th><th>Vetura</th><th>Shuma</th><th>Shënime</th><th className="px-4">Veprime</th></tr></thead>
          <tbody>
            {expenses.map((e) => {
              const v = vehicles.find((x) => x.id === e.vehicleId);
              return (
                <tr key={e.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="py-2.5 px-4">{fmtDate(e.date)}</td>
                  <td><Badge cls="bg-neutral-100 text-neutral-700">{e.category}</Badge></td>
                  <td>{v ? `${v.brand} ${v.model}` : "—"}</td>
                  <td className="font-semibold">{fmtMoney(e.amount)}</td>
                  <td className="text-neutral-500 max-w-[200px] truncate">{e.notes}</td>
                  <td className="px-4">
                    <div className="flex gap-1.5">
                      <button onClick={() => setModal({ mode: "edit", data: e })} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDel(e)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!expenses.length ? <tr><td colSpan={6} className="text-center text-neutral-400 py-8">Nuk ka shpenzime ende.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "new" ? "Shpenzim i ri" : "Edito shpenzimin"}>
        {modal ? <ExpenseForm data={modal.data} vehicles={vehicles} onSave={save} onCancel={() => setModal(null)} /> : null}
      </Modal>
      <ConfirmDialog open={!!confirmDel} title="Fshi shpenzimin?" message="A jeni i sigurt?" danger onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}

function ExpenseForm({ data, vehicles, onSave, onCancel }) {
  const [f, setF] = useState(data);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.amount) return; onSave(f); }}>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Data" required><input type="date" value={f.date} onChange={set("date")} className={inputCls} required /></Field>
        <Field label="Kategoria"><select value={f.category} onChange={set("category")} className={inputCls}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Shuma (€)" required><input type="number" step="0.01" value={f.amount} onChange={set("amount", true)} className={inputCls} required /></Field>
        <Field label="Vetura (opsionale)"><select value={f.vehicleId || ""} onChange={set("vehicleId")} className={inputCls}><option value="">— Asnjë —</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plate})</option>)}</select></Field>
      </div>
      <Field label="Shënime"><textarea value={f.notes} onChange={set("notes")} className={inputCls} rows={2} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white">Ruaj</button>
      </div>
    </form>
  );
}

/* ============================== Coupons ============================== */

function CouponsPage({ db, currentCompany, persist, logAction, notify }) {
  const cid = currentCompany.id;
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const coupons = db.coupons.filter((c) => c.companyId === cid);

  const save = (f) => {
    if (modal.mode === "new") {
      const c = { ...f, id: uid("cp"), companyId: cid, code: f.code.toUpperCase(), usedCount: f.usedCount || 0 };
      persist((p) => ({ ...p, coupons: [c, ...p.coupons] }));
      logAction("Kupon u krijua", c.code);
      notify("Kuponi u shtua.");
    } else {
      persist((p) => ({ ...p, coupons: p.coupons.map((c) => c.id === f.id ? { ...f, code: f.code.toUpperCase() } : c) }));
      logAction("Kupon u editua", f.code);
      notify("Kuponi u përditsua.");
    }
    setModal(null);
  };
  const doDelete = () => {
    persist((p) => ({ ...p, coupons: p.coupons.filter((c) => c.id !== confirmDel.id) }));
    logAction("Kupon u fshi", confirmDel.code);
    notify("Kuponi u fshi.", "error");
    setConfirmDel(null);
  };
  const toggle = (c) => {
    persist((p) => ({ ...p, coupons: p.coupons.map((x) => x.id === c.id ? { ...x, active: !x.active } : x) }));
    notify("Statusi u përditsua.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-xl font-bold">Kupona zbritjeje</h1>
        <button onClick={() => setModal({ mode: "new", data: { code: "", type: "percent", value: 10, active: true, expiresAt: "", usageLimit: 0, usedCount: 0, notes: "" } })} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"><Plus size={15} />Kupon i ri</button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {coupons.map((c) => {
          const expired = c.expiresAt && c.expiresAt < todayISO();
          return (
            <div key={c.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div className="font-bold text-lg tracking-wide flex items-center gap-2"><Tag size={16} className="text-red-600" />{c.code}</div>
                <Badge cls={c.active && !expired ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}>{expired ? "Skaduar" : c.active ? "Aktiv" : "Joaktiv"}</Badge>
              </div>
              <div className="text-2xl font-bold text-red-600 mt-2">{c.type === "percent" ? `${c.value}%` : fmtMoney(c.value)}</div>
              <div className="text-xs text-neutral-500 mt-1">Skadon: {c.expiresAt ? fmtDate(c.expiresAt) : "Pa afat"}</div>
              <div className="text-xs text-neutral-500">Përdorur: {c.usedCount || 0}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</div>
              {c.notes ? <div className="text-xs text-neutral-400 mt-1">{c.notes}</div> : null}
              <div className="flex gap-1.5 mt-3 pt-3 border-t border-neutral-100">
                <button onClick={() => toggle(c)} className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold border border-neutral-300 hover:bg-neutral-50">{c.active ? "Çaktivizo" : "Aktivizo"}</button>
                <button onClick={() => setModal({ mode: "edit", data: c })} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"><Pencil size={14} /></button>
                <button onClick={() => setConfirmDel(c)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
        {!coupons.length ? <div className="col-span-full text-center text-neutral-400 py-8 bg-white rounded-xl border border-neutral-200">Nuk ka kupona ende.</div> : null}
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === "new" ? "Kupon i ri" : "Edito kuponin"}>
        {modal ? <CouponForm data={modal.data} onSave={save} onCancel={() => setModal(null)} /> : null}
      </Modal>
      <ConfirmDialog open={!!confirmDel} title="Fshi kuponin?" message="A jeni i sigurt?" danger onConfirm={doDelete} onCancel={() => setConfirmDel(null)} />
    </div>
  );
}

function CouponForm({ data, onSave, onCancel }) {
  const [f, setF] = useState(data);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!f.code) return; onSave(f); }}>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Kodi" required><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className={inputCls + " uppercase"} required /></Field>
        <Field label="Tipi"><select value={f.type} onChange={set("type")} className={inputCls}><option value="percent">Përqindje (%)</option><option value="flat">Vlerë fikse (€)</option></select></Field>
        <Field label="Vlera" required><input type="number" step="0.01" value={f.value} onChange={set("value", true)} className={inputCls} required /></Field>
        <Field label="Skadon më"><input type="date" value={f.expiresAt || ""} onChange={set("expiresAt")} className={inputCls} /></Field>
        <Field label="Limiti i përdorimit (0 = pa limit)"><input type="number" value={f.usageLimit} onChange={set("usageLimit", true)} className={inputCls} /></Field>
        <Field label="Herë të përdorura"><input type="number" value={f.usedCount} onChange={set("usedCount", true)} className={inputCls} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer my-2">
        <input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="w-4 h-4 accent-red-600" />
        Aktiv
      </label>
      <Field label="Shënime"><textarea value={f.notes} onChange={set("notes")} className={inputCls} rows={2} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300">Anulo</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white">Ruaj</button>
      </div>
    </form>
  );
}

/* ============================== Chatbot Assistant ============================== */
const CHAT_QA = [
  { q: "Si t\u00eb krijoj nj\u00eb rezervim?", a: "Shko te 'Rezervimet' \u2192 kliko 'Rezervim' \u2192 zgjidh klientin dhe vetur\u00ebn, vendos datat dhe ruaj. Mund t\u00eb aplikosh edhe kupon ose zbritje VIP.", view: "reservations" },
  { q: "Si t\u00eb shtoj nj\u00eb vetur\u00eb?", a: "Te 'Veturat' kliko butonin 'Shto' dhe plot\u00ebso mark\u00ebn, modelin, targ\u00ebn dhe \u00e7mimin ditor. Mos harro dokumentet & servisimin.", view: "vehicles" },
  { q: "Si funksionon programi i referimit?", a: "\u00c7do klient ka nj\u00eb kod unik referimi. Kur regjistron nj\u00eb klient t\u00eb ri, zgjidh kush e solli te 'Referuar nga'. Statistikat shihen te Raportet.", view: "clients" },
  { q: "Si llogariten nivelet VIP?", a: "Bronze (1+ qira), Silver (4+), Gold (8+, 10% zbritje), Platinum (15+, 15% zbritje). Zbritja aplikohet automatikisht te rezervimi.", view: "clients" },
  { q: "Si t\u00eb printoj nj\u00eb kontrat\u00eb ose fatur\u00eb?", a: "Te 'Rezervimet' ose 'Kontratat' kliko ikon\u00ebn e dokumentit, pastaj 'Printo'. Logo e firm\u00ebs shfaqet automatikisht.", view: "contracts" },
  { q: "Si t\u00eb shoh raportet financiare?", a: "Te 'Raportet' gjen t\u00eb ardhurat, fitimin neto, shpenzimet sipas kategoris\u00eb dhe shfryt\u00ebzimin e flot\u00ebs.", view: "reports" },
];

function Chatbot({ company, setView, role }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ from: "bot", text: `P\u00ebrsh\u00ebndetje! Jam asistenti i ${company ? company.name : "CarData"}. Si mund t\u00eb ndihmoj?` }]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  useEffect(() => { if (open && endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  const answer = (text) => {
    const t = text.toLowerCase();
    const hit = CHAT_QA.find((x) => x.q.toLowerCase() === t)
      || CHAT_QA.find((x) => t.split(" ").filter((w) => w.length > 3).some((w) => x.q.toLowerCase().includes(w) || x.a.toLowerCase().includes(w)));
    if (hit) return hit;
    if (t.includes("faleminderit") || t.includes("flm")) return { a: "Me k\u00ebnaq\u00ebsi! N\u00ebse ke pyetje t\u00eb tjera, jam k\u00ebtu." };
    return { a: "Nuk jam i sigurt p\u00ebr k\u00ebt\u00eb, por mund t\u00eb provosh nj\u00eb nga pyetjet e shpejta m\u00eb posht\u00eb, ose kontakto administratorin e firm\u00ebs." };
  };
  const send = (text) => {
    const q = (text || input).trim();
    if (!q) return;
    const res = answer(q);
    setMsgs((m) => [...m, { from: "user", text: q }, { from: "bot", text: res.a, view: res.view }]);
    setInput("");
  };

  return (
    <div className="no-print fixed bottom-5 right-5 z-[70] flex flex-col items-end">
      {open ? (
        <div className="mb-3 w-[340px] max-w-[calc(100vw-2.5rem)] card overflow-hidden animate-slide-in">
          <div className="ink-gradient text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center"><Sparkles size={16} /></div>
              <div><div className="font-bold text-sm display">Asistenti CarData</div><div className="text-[10px] text-white/60 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Online</div></div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-white/10"><X size={16} /></button>
          </div>
          <div className="h-72 overflow-y-auto p-3 space-y-2 bg-neutral-50">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${m.from === "user" ? "brand-gradient text-white rounded-br-sm" : "bg-white border hairline text-neutral-700 rounded-bl-sm"}`}>
                  {m.text}
                  {m.view && setView ? <button onClick={() => { setView(m.view); setOpen(false); }} className="block mt-1.5 text-red-600 font-semibold hover:underline">Hape faqen \u2192</button> : null}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1 border-t hairline bg-white">
            {CHAT_QA.slice(0, 4).map((x) => (
              <button key={x.q} onClick={() => send(x.q)} className="text-[10px] px-2 py-1 rounded-full bg-neutral-100 hover:bg-red-50 hover:text-red-600 text-neutral-600 font-medium transition">{x.q}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-2 flex items-center gap-2 bg-white">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Shkruaj pyetjen..." className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/40" />
            <button type="submit" className="w-9 h-9 rounded-xl brand-gradient text-white flex items-center justify-center shrink-0"><Send size={15} /></button>
          </form>
        </div>
      ) : null}
      <button onClick={() => setOpen((o) => !o)} className="w-14 h-14 rounded-full brand-gradient text-white shadow-xl shadow-red-900/30 flex items-center justify-center btn-shine hover:scale-105 transition">
        {open ? <X size={22} /> : <MessageSquare size={22} />}
      </button>
    </div>
  );
}
