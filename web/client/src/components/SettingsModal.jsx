import { useState, useEffect } from 'react';
import useConfigStore from '../store/configStore';
import Modal from './Modal';
import { Settings, Save } from 'lucide-react';

export default function SettingsModal({ printerId, onClose }) {
  const { printers } = useConfigStore();
  const printer = printers.find((p) => p.id === printerId) || {};
  const [form, setForm] = useState({ ...printer });

  useEffect(() => {
    const p = printers.find((p) => p.id === printerId) || {};
    setForm({ ...p });
  }, [printers, printerId]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
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
    <Modal title={`Settings: ${printer.name || 'Printer'}`} icon={Settings} onClose={onClose} size="lg">
      <div style={{ maxHeight: '68vh', overflowY: 'auto', padding: '1.125rem 1.25rem' }}>

        <Section title="Printer Identity">
          <div>
            <label className="label-text">Printer Name</label>
            <input type="text" className="input-field" value={form.name || ''} onChange={(e) => update('name', e.target.value)} placeholder="Printer 1" />
          </div>
        </Section>

        {form.language !== 'epl' && <Section title="Printer Properties">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <div>
              <label className="label-text">Print Density</label>
              <select className="select-field" value={form.density || '8'} onChange={(e) => update('density', e.target.value)}>
                <option value="6">6 dpmm (152 dpi)</option>
                <option value="8">8 dpmm (203 dpi)</option>
                <option value="12">12 dpmm (300 dpi)</option>
                <option value="24">24 dpmm (600 dpi)</option>
              </select>
            </div>
            <div>
              <label className="label-text">Unit</label>
              <select className="select-field" value={form.unit || '1'} onChange={(e) => update('unit', e.target.value)}>
                <option value="1">inches (in)</option>
                <option value="2">centimeters (cm)</option>
                <option value="3">millimeters (mm)</option>
                <option value="4">pixels (px)</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div>
              <label className="label-text">Width</label>
              <input type="number" className="input-field" value={form.width || '4'} step="0.01" min="1" onChange={(e) => update('width', e.target.value)} />
            </div>
            <div>
              <label className="label-text">Height</label>
              <input type="number" className="input-field" value={form.height || '6'} step="0.01" min="1" onChange={(e) => update('height', e.target.value)} />
            </div>
          </div>
        </Section>}

        <Section title="Network">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="label-text">Host</label>
              <input type="text" className="input-field" value={form.host || '0.0.0.0'} onChange={(e) => update('host', e.target.value)} />
            </div>
            <div>
              <label className="label-text">Port</label>
              <input type="number" className="input-field" value={form.port || '9100'} min="1" max="65535" onChange={(e) => update('port', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div>
              <label className="label-text">Buffer Size (bytes)</label>
              <input type="number" className="input-field" value={form.bufferSize || '4096'} min="1024" max="51200" onChange={(e) => update('bufferSize', e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label className="check-item">
                <input type="checkbox" checked={!!form.keepTcpSocket} onChange={() => toggle('keepTcpSocket')} />
                <span>Keep TCP socket alive</span>
              </label>
            </div>
          </div>
        </Section>

        <Section title="Storage">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label className="check-item">
              <input type="checkbox" checked={!!form.saveLabels} onChange={() => toggle('saveLabels')} />
              <span>Save labels to disk</span>
            </label>
            <div>
              <label className="label-text">File Type</label>
              <select className="select-field" value={form.filetype || '3'} onChange={(e) => update('filetype', e.target.value)} disabled={!form.saveLabels}>
                <option value="1">PNG</option>
                <option value="2">PDF</option>
                <option value="3">RAW</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <label className="label-text">Save Directory</label>
            <input type="text" className="input-field" value={form.path || '/tmp/labels'} onChange={(e) => update('path', e.target.value)} disabled={!form.saveLabels} placeholder="/path/to/labels" />
          </div>
        </Section>
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

function Section({ title, children }) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="settings-panel">{children}</div>
    </div>
  );
}
