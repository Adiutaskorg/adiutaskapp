import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa_install_dismissed";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if previously dismissed within 7 days
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Small delay so it doesn't appear immediately on load
      setTimeout(() => setVisible(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-sm"
        >
          <div className="card flex items-center gap-3 p-4 shadow-notion-lg">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/20">
              <Download className="h-5 w-5 text-brand-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Instalar adiutask</p>
              <p className="text-2xs text-surface-400">Acceso rápido desde tu pantalla de inicio</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleInstall}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white
                           transition-colors hover:bg-brand-500"
              >
                Instalar
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-lg p-1.5 text-surface-500 transition-colors hover:text-surface-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
