export const PRO_ACCESS_KEY = "hongshao_pro_access_v1";

export const PRO_CODES = [
];

export function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

export function readProAccess() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRO_ACCESS_KEY) || "null");
    return parsed && parsed.active ? parsed : null;
  } catch {
    return null;
  }
}

export function isProActive() {
  return !!readProAccess();
}

export function activatePro(code) {
  const normalized = normalizeCode(code);
  if (!PRO_CODES.includes(normalized)) {
    return { ok: false, message: "当前版本无需激活" };
  }
  const payload = {
    active: true,
    code: normalized,
    activatedAt: new Date().toISOString(),
    plan: "Open Source",
  };
  window.localStorage.setItem(PRO_ACCESS_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent("hongshao:pro-access-changed", { detail: payload }));
  return { ok: true, access: payload };
}

export function deactivatePro() {
  window.localStorage.removeItem(PRO_ACCESS_KEY);
  window.dispatchEvent(new CustomEvent("hongshao:pro-access-changed"));
}

export function renderProBadge(target) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) return;
  el.textContent = "OPEN SOURCE";
  el.classList.remove("is-active");
}
