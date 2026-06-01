import { useState } from 'react';
import useConfigStore from '../store/configStore';
import SettingsModal from './SettingsModal';
import TestModal from './TestModal';
import ErrorsWarningsModal from './ErrorsWarningsModal';
import {
  Printer, PenTool, Settings, FlaskConical, AlertTriangle,
  Power, Moon, Sun, Trash2, Plus, X,
} from 'lucide-react';

export default function Layout({ children }) {
  const {
    activeTab, setActiveTab,
    printers, activePrinterId, setActivePrinterId,
    tcpStatuses, labelsByPrinter, darkMode, toggleDarkMode,
  } = useConfigStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const activePrinter = printers.find((p) => p.id === activePrinterId) || printers[0] || {};
  const activeTcpStatus = tcpStatuses[activePrinterId] || { running: false };
  const activeLabels = labelsByPrinter[activePrinterId] || [];

  const handleToggleTcp = async () => {
    if (!activePrinterId) return;
    const ep = activeTcpStatus.running
      ? `/api/printers/${activePrinterId}/tcp/stop`
      : `/api/printers/${activePrinterId}/tcp/start`;
    await fetch(ep, { method: 'POST' });
  };

  const handleClearLabels = async () => {
    if (activeLabels.length === 0 || !activePrinterId) return;
    if (confirm(`Remove ${activeLabels.length} label${activeLabels.length > 1 ? 's' : ''}?`)) {
      await fetch(`/api/printers/${activePrinterId}/labels`, { method: 'DELETE' });
    }
  };

  const handleAddPrinter = async () => {
    const res = await fetch('/api/printers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.success) setActivePrinterId(data.printer.id);
  };

  const handleRemovePrinter = async (e, printerId) => {
    e.stopPropagation();
    if (printers.length <= 1) return;
    const printer = printers.find((p) => p.id === printerId);
    if (!confirm(`Remove "${printer?.name}"?`)) return;
    await fetch(`/api/printers/${printerId}`, { method: 'DELETE' });
  };

  const handleToggleLanguage = async (lang) => {
    if (!activePrinterId) return;
    await fetch(`/api/printers/${activePrinterId}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    });
  };

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--bg)' }}>
      {/* App Bar */}
      <header className="app-bar">
        <div className="flex items-center gap-2.5">
          <div className="app-logo"><Printer size={17} /></div>
          <div>
            <h1 className="app-title">Printer Emulator</h1>
            <p className="app-version">EN Systems · v5.0.0</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="lang-pill">
            <button
              onClick={() => handleToggleLanguage('zpl')}
              className={activePrinter.language !== 'epl' ? 'active' : ''}
            >ZPL</button>
            <button
              onClick={() => handleToggleLanguage('epl')}
              className={activePrinter.language === 'epl' ? 'active' : ''}
            >EPL</button>
          </div>

          <div className="status-chip">
            <span className={`led ${activeTcpStatus.running ? 'online' : ''}`} />
            <span>
              {activeTcpStatus.running
                ? `${activePrinter.host || '0.0.0.0'}:${activePrinter.port || '9100'}`
                : 'offline'}
            </span>
          </div>

          <button
            onClick={handleToggleTcp}
            className={`bar-icon-btn ${activeTcpStatus.running ? 'power-on' : ''}`}
            title={activeTcpStatus.running ? 'Stop TCP Server' : 'Start TCP Server'}
          >
            <Power size={16} />
          </button>

          <span className="bar-divider" />

          <button onClick={toggleDarkMode} className="bar-icon-btn" title="Toggle theme">
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Nav Rail */}
        <aside className="nav-rail">
          <div className="nav-body">
            <div className="nav-section">
              <p className="nav-section-label">Views</p>
              <button
                onClick={() => setActiveTab('printer')}
                className={`nav-item ${activeTab === 'printer' ? 'active' : ''}`}
              >
                <Printer size={14} />
                Printer Output
              </button>
              <button
                onClick={() => setActiveTab('designer')}
                className={`nav-item ${activeTab === 'designer' ? 'active' : ''}`}
              >
                <PenTool size={14} />
                Label Designer
              </button>
            </div>

            <div className="nav-section">
              <p className="nav-section-label">
                Printers
                <button onClick={handleAddPrinter} className="nav-add-btn" title="Add Printer">
                  <Plus size={11} />
                </button>
              </p>
              {printers.map((p) => {
                const status = tcpStatuses[p.id] || {};
                const isActive = p.id === activePrinterId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePrinterId(p.id)}
                    className={`printer-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <span className={`led ${status.running ? 'online' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <p className="printer-name">{p.name}</p>
                      <p className="printer-meta">:{p.port} · {(p.language || 'zpl').toUpperCase()}</p>
                    </div>
                    {printers.length > 1 && (
                      <button
                        onClick={(e) => handleRemovePrinter(e, p.id)}
                        className="printer-remove-btn"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="nav-section">
              <p className="nav-section-label">Tools</p>
              <button onClick={() => setShowTest(true)} className="nav-item">
                <FlaskConical size={14} />
                Test Print
              </button>
              <button onClick={() => setShowErrors(true)} className="nav-item">
                <AlertTriangle size={14} style={{ color: '#F59E0B' }} />
                Errors & Warnings
              </button>
              <button
                onClick={handleClearLabels}
                className="nav-item"
                disabled={activeLabels.length === 0}
              >
                <Trash2 size={14} />
                Clear Labels
                {activeLabels.length > 0 && (
                  <span
                    className="ml-auto font-mono text-[10px]"
                    style={{ color: 'var(--nav-label)' }}
                  >
                    {activeLabels.length}
                  </span>
                )}
              </button>
              <button onClick={() => setShowSettings(true)} className="nav-item">
                <Settings size={14} />
                Settings
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      {showSettings && (
        <SettingsModal printerId={activePrinterId} onClose={() => setShowSettings(false)} />
      )}
      {showTest && (
        <TestModal
          printerId={activePrinterId}
          language={activePrinter.language}
          onClose={() => setShowTest(false)}
        />
      )}
      {showErrors && (
        <ErrorsWarningsModal printerId={activePrinterId} onClose={() => setShowErrors(false)} />
      )}
    </div>
  );
}
