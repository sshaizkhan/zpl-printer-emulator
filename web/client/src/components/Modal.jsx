import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, icon: Icon, onClose, children, size = 'md' }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const maxWidths = { sm: '440px', md: '520px', lg: '680px', xl: '880px' };

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} className="modal-overlay">
      <div className="modal-panel" style={{ width: '100%', maxWidth: maxWidths[size] || '520px' }}>
        <div className="modal-header">
          <div className="modal-title-row">
            {Icon && (
              <div className="modal-icon">
                <Icon size={16} />
              </div>
            )}
            <h2 className="modal-title">{title}</h2>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
