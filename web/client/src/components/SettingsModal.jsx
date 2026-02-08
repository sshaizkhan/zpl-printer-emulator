import { useState, useEffect } from 'react';
import useConfigStore from '../store/configStore';
import Modal from './Modal';
import { Settings, Save } from 'lucide-react';

export default function SettingsModal({ onClose }) {
  const { configs } = useConfigStore();
  const [form, setForm] = useState({ ...configs });

  useEffect(() => {
    setForm({ ...configs });
  }, [configs]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));

  const handleSave = async () => {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    onClose();
  };

  return (
    <Modal title="Printer Settings" icon={Settings} onClose={onClose} size="lg">
      <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
        {/* Printer Properties */}
        <Section title="Printer Properties">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label-text">Print Density</label>
              <select
                className="select-field"
                value={form.density || '8'}
                onChange={(e) => update('density', e.target.value)}
              >
                <option value="6">6 dpmm (152 dpi)</option>
                <option value="8">8 dpmm (203 dpi)</option>
                <option value="12">12 dpmm (300 dpi)</option>
                <option value="24">24 dpmm (600 dpi)</option>
              </select>
            </div>
            <div>
              <label className="label-text">Unit</label>
              <select
                className="select-field"
                value={form.unit || '1'}
                onChange={(e) => update('unit', e.target.value)}
              >
                <option value="1">inches (in)</option>
                <option value="2">centimeters (cm)</option>
                <option value="3">millimeters (mm)</option>
                <option value="4">pixels (px)</option>
              </select>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Width</label>
              <input
                type="number"
                className="input-field"
                value={form.width || '4'}
                step="0.01"
                min="1"
                onChange={(e) => update('width', e.target.value)}
              />
            </div>
            <div>
              <label className="label-text">Height</label>
              <input
                type="number"
                className="input-field"
                value={form.height || '6'}
                step="0.01"
                min="1"
                onChange={(e) => update('height', e.target.value)}
              />
            </div>
          </div>
        </Section>

        {/* Network */}
        <Section title="Network">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Host</label>
              <input
                type="text"
                className="input-field"
                value={form.host || '0.0.0.0'}
                onChange={(e) => update('host', e.target.value)}
              />
            </div>
            <div>
              <label className="label-text">Port</label>
              <input
                type="number"
                className="input-field"
                value={form.port || '9100'}
                min="1"
                max="65535"
                onChange={(e) => update('port', e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Buffer Size (bytes)</label>
              <input
                type="number"
                className="input-field"
                value={form.bufferSize || '4096'}
                min="1024"
                max="51200"
                onChange={(e) => update('bufferSize', e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Checkbox
                label="Keep TCP socket alive"
                checked={form.keepTcpSocket}
                onChange={() => toggle('keepTcpSocket')}
              />
            </div>
          </div>
        </Section>

        {/* Storage */}
        <Section title="Storage">
          <div className="grid grid-cols-2 gap-3">
            <Checkbox
              label="Save labels to disk"
              checked={form.saveLabels}
              onChange={() => toggle('saveLabels')}
            />
            <div>
              <label className="label-text">File Type</label>
              <select
                className="select-field"
                value={form.filetype || '3'}
                onChange={(e) => update('filetype', e.target.value)}
                disabled={!form.saveLabels}
              >
                <option value="1">PNG</option>
                <option value="2">PDF</option>
                <option value="3">RAW</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="label-text">Save Directory</label>
            <input
              type="text"
              className="input-field"
              value={form.path || '/tmp/labels'}
              onChange={(e) => update('path', e.target.value)}
              disabled={!form.saveLabels}
              placeholder="/path/to/labels"
            />
          </div>
        </Section>

        {/* ZPL Status (~HS) */}
        <Section title="ZPL Status (~HS)">
          <div className="grid grid-cols-3 gap-x-4 gap-y-2">
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
              <Checkbox
                key={key}
                label={label}
                checked={form[key]}
                onChange={() => toggle(key)}
              />
            ))}
          </div>
        </Section>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button onClick={handleSave} className="btn-primary">
          <Save size={16} />
          Save Changes
        </button>
      </div>
    </Modal>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        {children}
      </div>
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg py-1">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
        checked={!!checked}
        onChange={onChange}
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}
