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

    const errHex = errorFlags.toString(16).padStart(8, '0');
    const warnHex = warningFlags.toString(16).padStart(8, '0');
    return `PRINTER STATUS\nERRORS: 1 00000000 ${errHex}\nWARNINGS: 1 00000000 ${warnHex}`;
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
      <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Configure which errors and warnings the emulator reports when a{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">~HQES</code>{' '}
          command is received.
        </p>

        {/* Errors */}
        <div className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Errors
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/30 dark:bg-red-900/10">
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
              <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded py-1">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700"
                  checked={isTruthy(form[key])}
                  onChange={() => toggle(key)}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Warnings */}
        <div className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Warnings
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/30 dark:bg-amber-900/10">
            {[
              ['hqesMediaNearEnd', 'Media Near End'],
              ['hqesRibbonNearEnd', 'Need to Calibrate Media'],
              ['hqesReplacePrinthead', 'Replace Printhead'],
              ['hqesCleanPrinthead', 'Clean Printhead'],
            ].map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded py-1">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-700"
                  checked={isTruthy(form[key])}
                  onChange={() => toggle(key)}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
          <h4 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            ~HQES Response Preview
          </h4>
          <pre className="rounded-md bg-gray-900 p-3 text-xs text-green-400 dark:bg-black">
            {hqesPreview}
          </pre>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button onClick={handleSave} className="btn-danger">
          <Save size={16} />
          Save
        </button>
      </div>
    </Modal>
  );
}
