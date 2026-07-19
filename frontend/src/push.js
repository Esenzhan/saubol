import { api } from "./api/client.js";

// applicationServerKey нужен как Uint8Array, а VAPID-ключ приходит из env
// в urlsafe-base64 — стандартное преобразование для Push API, копия того,
// что рекомендует MDN/web-push.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// На iOS Safari Push API работает только когда сайт установлен на экран
// «Домой» (display: standalone) — в обычной вкладке браузера PushManager
// просто не существует до установки. На Android/десктопе работает сразу.
export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && !!import.meta.env.VITE_VAPID_PUBLIC_KEY;
}

export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Push-уведомления не поддерживаются в этом браузере");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешение на уведомления не выдано");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
  });

  await api.subscribePush(subscription.toJSON());
  return subscription;
}

export async function disablePush() {
  const sub = await getExistingSubscription();
  if (!sub) return;
  await api.unsubscribePush(sub.endpoint);
  await sub.unsubscribe();
}
