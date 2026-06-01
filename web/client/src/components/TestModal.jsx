import { useState } from 'react';
import Modal from './Modal';
import { FlaskConical, Printer, FileText, Sparkles } from 'lucide-react';

const EPL_HELLO_WORLD = `#!A1
#IMS60.0/30.0
#ERY
#J22.0#T10.0#M2/2
#YT107/0///Hello World!
#Q1/`;

const EPL_SAMPLE_LABEL = `#!A1
#IMS70.0/85.0
#ERY
#J66.0#T15.0#M2/2
#YT107/0///THERMO
#J60.0#T20.5#M1/1
#YT106/0///PRINTING-SYSTEM
#J50.0#T20.5
#YT104/0///The easy way
#J45.0#T15.0
#YT104/0///to create your labels
#J25.0#T18.5
#YB1/0M/7/3///123456789012
#J15.0#T11.0#M1/1
#YT104/0///PRICE
#J15.0#T37.0#M2/2
#YT106/0///120,95
#J28.0#T11.0#M1/1
#YT103/1///90-degree-rotation
#J7.0#T51.0
#YT104/2///180-degree-rotation
#Q1/`;

export default function TestModal({ printerId, language, onClose }) {
  const isEpl = language === 'epl';
  const [labelData, setLabelData] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    if (!labelData.trim()) return;
    setLoading(true);
    try {
      await fetch(`/api/printers/${printerId}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: labelData,
      });
      onClose();
    } catch (e) {
      console.error('Print error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleHelloWorld = () => {
    setLabelData(
      isEpl
        ? EPL_HELLO_WORLD
        : '^XA\n^CFA,50\n^FO100,100\n^FDHello World^FS\n^XZ'
    );
  };

  const handleSampleLabel = () => {
    setLabelData(
      isEpl
        ? EPL_SAMPLE_LABEL
        : `^XA
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
    reader.onload = (ev) => setLabelData(ev.target.result);
    reader.readAsText(file);
  };

  return (
    <Modal title={isEpl ? 'EPL Printer Test' : 'ZPL Printer Test'} icon={FlaskConical} onClose={onClose} size="lg">
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
            <input
              type="file"
              className="hidden"
              accept=".raw,.bin,.txt,.zpl,.epl,.print"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        <textarea
          value={labelData}
          onChange={(e) => setLabelData(e.target.value)}
          className="input-field font-mono"
          rows={16}
          placeholder={
            isEpl
              ? 'Paste EPL data here or use one of the templates above...'
              : 'Paste ZPL data here or use one of the templates above...'
          }
          spellCheck={false}
        />
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button
          onClick={handlePrint}
          disabled={loading || !labelData.trim()}
          className="btn-primary"
        >
          <Printer size={16} />
          {loading ? 'Printing...' : 'Print'}
        </button>
      </div>
    </Modal>
  );
}
