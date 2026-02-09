import { useEffect } from 'react';
import useConfigStore from '../store/configStore';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

const typeConfig = {
  success: {
    icon: CheckCircle,
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-800 dark:text-emerald-300',
    iconColor: 'text-emerald-500',
  },
  error: {
    icon: XCircle,
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-800 dark:text-red-300',
    iconColor: 'text-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-300',
    iconColor: 'text-amber-500',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-300',
    iconColor: 'text-blue-500',
  },
};

function Toast({ notification, onRemove }) {
  const config = typeConfig[notification.type] || typeConfig.info;
  const Icon = config.icon;

  useEffect(() => {
    const timer = setTimeout(() => onRemove(notification.id), 4000);
    return () => clearTimeout(timer);
  }, [notification.id, onRemove]);

  return (
    <div
      className={`toast-enter flex items-start gap-3 rounded-lg border ${config.bg} ${config.border} p-3 shadow-lg backdrop-blur-sm`}
    >
      <Icon size={18} className={`mt-0.5 flex-none ${config.iconColor}`} />
      <p className={`flex-1 text-sm ${config.text}`}>{notification.text}</p>
      <button
        onClick={() => onRemove(notification.id)}
        className="flex-none rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { notifications, removeNotification } = useConfigStore();

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 flex-col gap-2">
      {notifications.slice(0, 5).map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <Toast notification={n} onRemove={removeNotification} />
        </div>
      ))}
    </div>
  );
}
