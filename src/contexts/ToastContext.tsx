import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ToastContextValue {
  toast: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; text: string; show: boolean }[]>([]);

  const toast = useCallback((msg: string) => {
    const id = Date.now();
    setMessages((prev) => [...prev, { id, text: msg, show: false }]);
    requestAnimationFrame(() => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, show: true } : m)));
    });
    setTimeout(() => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, show: false } : m)));
      setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), 300);
    }, 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div id="toast-wrap">
        {messages.map((m) => (
          <div key={m.id} className={`toast ${m.show ? 'show' : ''}`}>
            {m.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
