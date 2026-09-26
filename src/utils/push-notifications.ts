import { BASE_PATH } from "@/lib/constants";

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.warn("Notifications not supported");
    return false;
  }

  if (Notification.permission === "granted") return true;

  if (Notification.permission === "denied") {
    console.warn("Notification permission denied");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return false;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push not supported");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      console.log("Already subscribed to push");
      return true;
    }

    const granted = await requestNotificationPermission();
    if (!granted) return false;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.warn("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured - push notifications are disabled");
      return false;
    }

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    });

    try {
      const res = await fetch(`${BASE_PATH}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) console.warn("Failed to save push subscription on the backend");
    } catch (error) {
      console.error("Failed to reach the push subscribe endpoint:", error);
    }

    return true;
  } catch (error) {
    console.error("Push subscription failed:", error);
    return false;
  }
}

export async function sendPushNotification(
  title: string,
  body: string
): Promise<boolean> {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    console.warn("Notification permission not granted");
    return false;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "subscription-reminder",
    } as NotificationOptions);

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch (error) {
    console.error("Failed to send notification:", error);
    return false;
  }
}
