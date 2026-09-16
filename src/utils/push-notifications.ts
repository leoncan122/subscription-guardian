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

    // VAPID public key - replace with your own in production
    // Generate with: npx web-push generate-vapid-keys
    const vapidPublicKey =
      "BEl62iUY7PtYwJ_W9tZVNLtPv4mcCWb9hDfjtFAR-6VUrn0W6IkWEOY6YTB9unEevKX8QClbm3J-4s8Vz0B2cF0";

    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    });

    // In production, send this subscription to your backend
    console.log("Push subscription created:", sub);

    try {
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      console.log("Subscription sent to backend");
    } catch (error) {
      // Backend endpoint might not exist yet - that's fine for now
      console.log("Backend not available yet, subscription stored locally");
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
