import { useState, useEffect, useMemo } from 'react';
import useConfigStore from '../store/configStore';
import Modal from './Modal';
import { AlertTriangle, Save } from 'lucide-react';

export default function ErrorsWarningsModal({ printerId, onClose }) {
  const { printers } = useConfigStore();
  const printer = printers.find((p) => p.id === printerId) || {};
  const [form, setForm] = useState({ ...printer });

  useEffect(() => {
    const p = printers.find((p) => p.id === printerId) || {};
    setForm({ ...p });
  }, [printers, printerId]);

  const toggle = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));
  const isTruthy = (val) => [1, '1', true, 'true'].includes(val);

  const hqesPreview = useMemo(() => {
    let errorFlags = 0;
    if (isTruthy(form.hqesMediaOut)) errorFlags |= 0x01;
    if (isTruthy(form.hqesRibbonOut)) errorFlags |= 0x02;
    if (isTruthy(form.hqesHeadOpen)) errorFlags |= 0x04;
    if (isTruthy(form.hqesCutterFault)) errorFlags |= 0x08;
    if (isTruthy(form.hqesPrintheadOverTemp)) errorFlags |= 0x10;
    if (isTruthy(form.hqesMotorOverTemp)) errorFlags |= 0x20;
    if (isTruthy(form.hqesBadPrintheadElement)) errorFlags |= 0x40;
    if (isTruthy(form.hqesPrintheadDetectionError)) errorFlags |= 0x80;
    let warningFlags = 0;
    if (isTruthy(form.hqesMediaNearEnd)) warningFlags |= 0x08;
    if (isTruthy(form.hqesRibbonNearEnd)) warningFlags |= 0x01;
    if (isTruthy(form.hqesReplacePrinthead)) warningFlags |= 0x04;
    if (isTruthy(form.hqesCleanPrinthead)) warningFlags |= 0x02;
    return `PRINTER STATUS\nERRORS: 1 00000000 ${errorFlags.toString(16).padStart(8,'0')}\nWARNINGS: 1 00000000 ${warningFlags.toString(16).padStart(8,'0')}`;
  }, [form]);

  const handleSave = async () => {
    await fetch(`/api/printers/${printerId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    onClose();
  };

  return (
    <Modal title="Errors & Warnings (~HQES)" icon={AlertTriangle} onClose={onClose} size="lg">
      <div style={{ maxHeight: '68vh', overflowY: 'auto', padding: '1.125rem 1.25rem' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Configure which errors and warnings the emulator reports when a{' '}
          <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.1rem 0.375rem' }}>~HQES</code>{' '}
          command is received.
        </p>

        {/* Errors */}
        <div className="settings-section">
          <h3 className="settings-section-title" style={{ color: '#EF4444' }}>Errors</h3>
          <div className="settings-panel" style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.03)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              {[
                ['hqesMediaOut', 'Media Out'],
                ['hqesRibbonOut', 'Ribbon Out'],
                ['hqesHeadOpen', 'Head Open'],
                ['hqesCutterFault', 'Cutter Fault'],
                ['hqesPrintheadOverTemp', 'Printhead Over-Temp'],
                ['hqesMotorOverTemp', 'Motor Over-Temp'],
                ['hqesBadPrintheadElement', 'Bad Printhead Element'],
                ['hqesPrintheadDetectionError', 'Printhead Detection Error'],
              ].map(([key, label]) => (
                <label key={key} className="check-item">
                  <input type="checkbox" style={{ accentColor: '#EF4444' }} checked={isTruthy(form[key])} onChange={() => toggle(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Warnings */}
        <div className="settings-section">
          <h3 className="settings-section-title" style={{ color: '#F59E0B' }}>Warnings</h3>
          <div className="settings-panel" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.03)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
              {[
                ['hqesMediaNearEnd', 'Media Near End'],
                ['hqesRibbonNearEnd', 'Need to Calibrate Media'],
                ['hqesReplacePrinthead', 'Replace Printhead'],
                ['hqesCleanPrinthead', 'Clean Printhead'],
              ].map(([key, label]) => (
                <label key={key} className="check-item">
                  <input type="checkbox" style={{ accentColor: '#F59E0B' }} checked={isTruthy(form[key])} onChange={() => toggle(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="settings-section">
          <h3 className="settings-section-title">Response Preview</h3>
          <pre className="code-block">{hqesPreview}</pre>
        </div>
      </div>

      <div className="modal-footer">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handleSave} className="btn-primary">
          <Save size={15} />
          Save
        </button>
      </div>
    </Modal>
  );
}
