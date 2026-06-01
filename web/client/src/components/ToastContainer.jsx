import { useEffect } from 'react';
import useConfigStore from '../store/configStore';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

const TYPE = {
  success: { icon: CheckCircle, color: '#10B981', border: 'rgba(16,185,129,0.25)' },
  error:   { icon: XCircle,     color: '#EF4444', border: 'rgba(239,68,68,0.25)' },
  warning: { icon: AlertTriangle,color: '#F59E0B', border: 'rgba(245,158,11,0.25)' },
  info:    { icon: Info,         color: '#3B82F6', border: 'rgba(59,130,246,0.25)' },
};

function Toast({ notification, onRemove }) {
  const cfg = TYPE[notification.type] || TYPE.info;
  const Icon = cfg.icon;

  useEffect(() => {
    const t = setTimeout(() => onRemove(notification.id), 4200);
    return () => clearTimeout(t);
  }, [notification.id, onRemove]);

  return (
    <div
      className="toast-enter"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.625rem',
        padding: '0.75rem',
        borderRadius: '10px',
        border: `1px solid ${cfg.border}`,
        background: 'var(--surface)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
      }}
    >
      <Icon size={15} style={{ color: cfg.color, marginTop: '1px', flexShrink: 0 }} />
      <p style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text)', lineHeight: 1.45 }}>
        {notification.text}
      </p>
      <button
        onClick={() => onRemove(notification.id)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '18px', height: '18px', border: 'none', background: 'transparent',
          color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '4px',
          flexShrink: 0, transition: 'color 0.13s',
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { notifications, removeNotification } = useConfigStore();
  return (
    <div style={{
      position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 100,
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
      width: '320px', pointerEvents: 'none',
    }}>
      {notifications.slice(0, 5).map((n) => (
        <div key={n.id} style={{ pointerEvents: 'auto' }}>
          <Toast notification={n} onRemove={removeNotification} />
        </div>
      ))}
    </div>
  );
}
