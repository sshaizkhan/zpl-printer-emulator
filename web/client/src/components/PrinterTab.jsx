import useConfigStore from '../store/configStore';
import { Layers, Clock, Download, Maximize2, Trash2, X } from 'lucide-react';
import { useState } from 'react';

export default function PrinterTab() {
  const { activePrinterId, labelsByPrinter } = useConfigStore();
  const labels = labelsByPrinter[activePrinterId] || [];
  const [selectedLabel, setSelectedLabel] = useState(null);

  const handleDownload = (label) => {
    const a = document.createElement('a');
    a.href = label.image;
    a.download = `label-${label.id}.png`;
    a.click();
  };

  const handleDelete = async (label) => {
    await fetch(`/api/printers/${activePrinterId}/labels/${label.id}`, { method: 'DELETE' });
    if (selectedLabel?.id === label.id) setSelectedLabel(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Content bar */}
      <div className="content-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers size={13} style={{ color: 'var(--text-muted)' }} />
          <span>
            {labels.length === 0
              ? 'No labels'
              : `${labels.length} label${labels.length !== 1 ? 's' : ''} rendered`}
          </span>
        </div>
        {labels.length > 0 && (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.625rem', color: 'var(--text-muted)' }}>
            Latest first
          </span>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {labels.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Layers size={28} />
            </div>
            <h3 className="empty-title">No labels yet</h3>
            <p className="empty-desc">
              Start the TCP server and send label data. Use Test Print for a quick test.
            </p>
          </div>
        ) : (
          <div className="label-grid">
            {labels.map((label) => (
              <div key={label.id} className="label-card">
                <div className="label-image-wrap">
                  <img
                    src={label.image}
                    alt="Label"
                    style={{ width: '100%', objectFit: 'contain', maxHeight: '200px', display: 'block' }}
                  />
                  <div className="label-overlay">
                    <button
                      className="card-btn"
                      onClick={() => setSelectedLabel(label)}
                      title="View"
                    >
                      <Maximize2 size={14} />
                    </button>
                    <button
                      className="card-btn"
                      onClick={() => handleDownload(label)}
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      className="card-btn del"
                      onClick={() => handleDelete(label)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="label-footer">
                  <Clock size={9} style={{ flexShrink: 0 }} />
                  {new Date(label.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full-size viewer */}
      {selectedLabel && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedLabel(null)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: '90vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title-row">
                <span className="modal-title">Label Preview</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.625rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                  {new Date(selectedLabel.timestamp).toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                <button className="btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }} onClick={() => handleDownload(selectedLabel)}>
                  <Download size={13} /> Download
                </button>
                <button className="btn-danger" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }} onClick={() => { handleDelete(selectedLabel); }}>
                  <Trash2 size={13} /> Delete
                </button>
                <button className="modal-close" onClick={() => setSelectedLabel(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div style={{ padding: '1.5rem', background: '#FAFAF8', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={selectedLabel.image}
                alt="Label"
                style={{ maxWidth: '75vw', maxHeight: '70vh', display: 'block', boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
