import { useState } from 'react';
import Modal from './Modal';
import { FlaskConical, Printer, FileText, Sparkles } from 'lucide-react';

export default function TestModal({ printerId, onClose }) {
  const [zplData, setZplData] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    if (!zplData.trim()) return;
    setLoading(true);
    try {
      await fetch(`/api/printers/${printerId}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: zplData,
      });
      onClose();
    } catch (e) {
      console.error('Print error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleHelloWorld = () => {
    setZplData('^XA\n^CFA,50\n^FO100,100\n^FDHello World^FS\n^XZ');
  };

  const handleSampleLabel = () => {
    setZplData(
      `^XA
^FO50,50^A0N,40,40^FDShipping Label^FS
^FO50,100^GB700,1,3^FS
^FO50,120^A0N,25,25^FDFrom: EN Systems Corp.^FS
^FO50,155^A0N,25,25^FD123 Main Street^FS
^FO50,190^A0N,25,25^FDNew York, NY 10001^FS
^FO50,240^GB700,1,3^FS
^FO50,260^A0N,25,25^FDTo: John Smith^FS
^FO50,295^A0N,25,25^FD456 Oak Avenue^FS
^FO50,330^A0N,25,25^FDLos Angeles, CA 90001^FS
^FO50,380^GB700,1,3^FS
^FO200,420^BQN,2,6^FDQA,https://example.com/track/12345^FS
^FO50,420^A0N,20,20^FDTracking: 1Z999AA10123456784^FS
^XZ`
    );
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setZplData(ev.target.result);
    reader.readAsText(file);
  };

  return (
    <Modal title="ZPL Printer Test" icon={FlaskConical} onClose={onClose} size="lg">
      <div className="px-6 py-4">
        <div className="mb-3 flex gap-2">
          <button onClick={handleHelloWorld} className="btn-secondary text-xs">
            <Sparkles size={14} />
            Hello World
          </button>
          <button onClick={handleSampleLabel} className="btn-secondary text-xs">
            <FileText size={14} />
            Sample Label
          </button>
          <label className="btn-secondary cursor-pointer text-xs">
            <FileText size={14} />
            Load File
            <input type="file" className="hidden" accept=".raw,.bin,.txt,.zpl,.print" onChange={handleFileUpload} />
          </label>
        </div>

        <textarea
          value={zplData}
          onChange={(e) => setZplData(e.target.value)}
          className="input-field font-mono"
          rows={16}
          placeholder="Paste ZPL data here or use one of the templates above..."
          spellCheck={false}
        />
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button
          onClick={handlePrint}
          disabled={loading || !zplData.trim()}
          className="btn-primary"
        >
          <Printer size={16} />
          {loading ? 'Printing...' : 'Print'}
        </button>
      </div>
    </Modal>
  );
}
