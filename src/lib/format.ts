export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const pad = (n: number, width = 6) => String(n).padStart(width, "0");

export const nowISO = () => new Date().toISOString();

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const daysBetween = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
