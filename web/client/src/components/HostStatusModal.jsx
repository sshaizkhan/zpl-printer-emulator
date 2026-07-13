import { useState, useEffect } from 'react';
import useConfigStore from '../store/configStore';
import Modal from './Modal';
import { Radio, Save } from 'lucide-react';

export default function HostStatusModal({ printerId, onClose }) {
  const { printers } = useConfigStore();
  const printer = printers.find((p) => p.id === printerId) || {};
  const [form, setForm] = useState({ ...printer });

  useEffect(() => {
    const p = printers.find((p) => p.id === printerId) || {};
    setForm({ ...p });
  }, [printers, printerId]);

  const toggle = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));

  const handleSave = async () => {
    await fetch(`/api/printers/${printerId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    onClose();
  };

  return (
    <Modal title="Host Status (~HS)" icon={Radio} onClose={onClose} size="lg">
      <div style={{ maxHeight: '68vh', overflowY: 'auto', padding: '1.125rem 1.25rem' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Configure which status flags the emulator reports when a{' '}
          <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.1rem 0.375rem' }}>~HS</code>{' '}
          command is received.
        </p>

        <div className="settings-section">
          <div className="settings-panel">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 1rem' }}>
              {[
                ['zplHeadOpen', 'Head Open'],
                ['zplPaperOut', 'Paper Out'],
                ['zplRibbonOut', 'Ribbon Out'],
                ['zplPaperJam', 'Paper Jam'],
                ['zplPrinterPaused', 'Printer Paused'],
                ['zplCutterFault', 'Cutter Fault'],
                ['zplHeadTooHot', 'Head Too Hot'],
                ['zplMotorOverheat', 'Motor Overheat'],
                ['zplRewindFault', 'Rewind Fault'],
              ].map(([key, label]) => (
                <label key={key} className="check-item">
                  <input type="checkbox" checked={!!form[key]} onChange={() => toggle(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handleSave} className="btn-primary">
          <Save size={15} />
          Save Changes
        </button>
      </div>
    </Modal>
  );
}
