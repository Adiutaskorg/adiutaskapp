import { useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { API_BASE } from "@/lib/api";

interface UseNotificationsOptions {
  enabled: boolean;
}

export function useNotifications({ enabled }: UseNotificationsOptions) {
  const token = useAuthStore((s) => s.token);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("[Push] Notifications not supported");
      return false;
    }

    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;

    const permission = await Notification.requestPermission();
    return permission === "granted";
  }, []);

  const subscribeToPush = useCallback(async () => {
    try {
      const granted = await requestPermission();
      if (!granted) return;

      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

      if (!vapidPublicKey) {
        console.warn("[Push] VAPID public key not configured");
        return;
      }

      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      // Send subscription to backend
      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(subscription),
      });

      console.log("[Push] Subscribed successfully");
    } catch (err) {
      console.error("[Push] Subscription failed:", err);
    }
  }, [token, requestPermission]);

  useEffect(() => {
    if (enabled && token) {
      subscribeToPush();
    }
  }, [enabled, token, subscribeToPush]);

  return { requestPermission };
}

/** Convert VAPID key from base64 to Uint8Array */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}
