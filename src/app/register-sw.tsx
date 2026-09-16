"use client";

import { useEffect, useState } from "react";
import { requestNotificationPermission, subscribeToPush } from "@/utils/push-notifications";
import { BASE_PATH } from "@/lib/constants";

export function RegisterSW() {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Check if running in PWA mode
    const inPWA =
      window.matchMedia("(display-mode: standalone)").matches ||
      ((typeof (navigator as any).standalone === "boolean") && (navigator as any).standalone);
    setIsPWA(inPWA);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
        .then((registration) => {
          console.log("SW registered:", registration.scope);

          // Check for updates
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("New content available; please refresh.");
              }
            });
          });
        })
        .catch((error) => {
          console.error("SW registration failed:", error);
        });

      // Check install prompt capability
      let deferredPrompt: BeforeInstallPromptEvent | null = null;

      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e as unknown as BeforeInstallPromptEvent;
        console.log("Install prompt available");
      });

      window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        console.log("PWA installed");
      });
    }

    // Request notification permission and subscribe to push
    subscribeToPush();
  }, []);

  return null;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
