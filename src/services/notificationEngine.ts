import type { MarketAsset, Signal } from "../types";
import type { AlertRule, WatchlistItem } from "./institutionalIntelligence";

export type NotificationKind = "SIGNAL" | "REGIME" | "EVENT" | "ANOMALY" | "DATA" | "SYSTEM";
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  symbol?: string;
  title: string;
  message: string;
  severity: "INFO" | "MEDIUM" | "HIGH";
  createdAt: string;
  read: boolean;
  source: string;
}

const notifications: NotificationItem[] = [];
const fingerprints = new Map<string, number>();

function push(item: Omit<NotificationItem, "id" | "createdAt" | "read">) {
  const key = `${item.kind}:${item.symbol ?? "GLOBAL"}:${item.title}:${item.message}`;
  const now = Date.now();
  const previous = fingerprints.get(key) ?? 0;
  if (now - previous < 15 * 60 * 1000) return null;
  fingerprints.set(key, now);
  const row: NotificationItem = { ...item, id: `NTF-${now}-${notifications.length}`, createdAt: new Date(now).toISOString(), read: false };
  notifications.unshift(row);
  if (notifications.length > 250) notifications.length = 250;
  return row;
}

export function evaluateMonitoring(assets: MarketAsset[], signals: Signal[], alerts: AlertRule[], watchlist: WatchlistItem[]) {
  const generated: NotificationItem[] = [];
  const watch = new Set(watchlist.map(x => x.symbol));
  for (const signal of signals) {
    const relevantAlerts = alerts.filter(a => a.enabled && a.symbol === signal.symbol && (a.direction === "ANY" || a.direction === signal.direction));
    for (const alert of relevantAlerts) {
      if (signal.score >= alert.threshold) {
        const item = push({ kind: "SIGNAL", symbol: signal.symbol, title: `Signal ${signal.direction} déclenché`, message: `Score ${signal.score}/100 ≥ seuil ${alert.threshold}.`, severity: signal.score >= 85 ? "HIGH" : "MEDIUM", source: "Signal Engine" });
        if (item) generated.push(item);
      }
    }
    if (watch.has(signal.symbol) && signal.score >= 80) {
      const item = push({ kind: "SIGNAL", symbol: signal.symbol, title: "Signal fort sur watchlist", message: `${signal.direction} · confiance ${signal.confidence.toFixed(0)}% · score ${signal.score}/100.`, severity: "HIGH", source: "Monitoring" });
      if (item) generated.push(item);
    }
  }
  for (const asset of assets) {
    if (asset.dataSource === "live" && asset.dataQuality && asset.dataQuality !== "FRESH") {
      const item = push({ kind: "DATA", symbol: asset.symbol, title: "Qualité de données dégradée", message: `${asset.provider ?? "Provider"} · ${asset.dataQuality} · score ${asset.dataQualityScore ?? "—"}/100.`, severity: asset.dataQuality === "INVALID" ? "HIGH" : "MEDIUM", source: "Data Quality" });
      if (item) generated.push(item);
    }
    if (Math.abs(asset.change24h) >= 5) {
      const item = push({ kind: "ANOMALY", symbol: asset.symbol, title: "Mouvement inhabituel", message: `Variation 24h ${asset.change24h >= 0 ? "+" : ""}${asset.change24h.toFixed(2)}%.`, severity: Math.abs(asset.change24h) >= 10 ? "HIGH" : "MEDIUM", source: "Institutional Core" });
      if (item) generated.push(item);
    }
  }
  return generated;
}

export function pushAutomationNotifications(items: Array<{ symbol: string; title: string; message: string; severity: "INFO" | "MEDIUM" | "HIGH"; source?: string }>) {
  return items.map(item => push({ kind: "SYSTEM", symbol: item.symbol, title: item.title, message: item.message, severity: item.severity, source: item.source ?? "Automation Engine" })).filter(Boolean) as NotificationItem[];
}

export function getNotifications(unreadOnly = false) { return unreadOnly ? notifications.filter(n => !n.read) : [...notifications]; }
export function markNotificationRead(id: string) { const n = notifications.find(x => x.id === id); if (n) n.read = true; return n ?? null; }
export function markAllNotificationsRead() { notifications.forEach(n => { n.read = true; }); return notifications.length; }
export function clearNotifications() { notifications.length = 0; return 0; }
export function notificationStatus() { return { total: notifications.length, unread: notifications.filter(n => !n.read).length, lastNotificationAt: notifications[0]?.createdAt ?? null }; }
