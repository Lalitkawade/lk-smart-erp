import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'birthday' | 'warning' | 'alert' | 'info';
  icon: string;
  color: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface Props {
  notifications: NotificationItem[];
}

export const NotificationToaster: React.FC<Props> = ({ notifications }) => {
  const [visibleItems, setVisibleItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    // Show new notifications staggering them slightly
    if (notifications.length > 0) {
      const showQueue = async () => {
        for (let i = 0; i < notifications.length; i++) {
          await new Promise(res => setTimeout(res, i === 0 ? 500 : 300));
          setVisibleItems(prev => {
            if (prev.find(p => p.id === notifications[i].id)) return prev;
            return [...prev, notifications[i]];
          });
        }
      };
      showQueue();
    }
  }, [notifications]);

  const dismiss = (id: string) => {
    setVisibleItems(prev => prev.filter(item => item.id !== id));
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
      <AnimatePresence>
        {visibleItems.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`pointer-events-auto overflow-hidden bg-white dark:bg-slate-900 border-l-4 rounded-xl shadow-2xl flex flex-col ${item.color}`}
          >
            <div className="p-4 flex gap-3 items-start relative">
              <div className="text-2xl pt-1">
                <i className={item.icon}></i>
              </div>
              <div className="flex-1 pr-6">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{item.title}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                  {item.message}
                </p>
                {item.actionLabel && item.onAction && (
                  <button 
                    onClick={() => {
                      item.onAction!();
                      dismiss(item.id);
                    }}
                    className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold uppercase rounded transition active:scale-95"
                  >
                    {item.actionLabel}
                  </button>
                )}
              </div>
              <button 
                onClick={() => dismiss(item.id)}
                className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
};
