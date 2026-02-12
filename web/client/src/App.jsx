import { useEffect } from 'react';
import useSocket from './hooks/useSocket';
import useConfigStore from './store/configStore';
import Layout from './components/Layout';
import PrinterTab from './components/PrinterTab';
import DesignerTab from './components/DesignerTab';
import ToastContainer from './components/ToastContainer';

export default function App() {
  useSocket();
  const { activeTab, darkMode } = useConfigStore();

  useEffect(() => {
    // Fetch initial printers state
    fetch('/api/printers')
      .then((r) => r.json())
      .then((data) => {
        const store = useConfigStore.getState();
        store.setPrintersState({
          printers: data.printers,
          activePrinterId: data.activePrinterId,
          tcpStatuses: data.tcpStatuses,
          labelHistories: {},
        });
        // Load labels for each printer
        data.printers.forEach((p) => {
          fetch(`/api/printers/${p.id}/labels`)
            .then((r) => r.json())
            .then((labels) => useConfigStore.getState().setLabels(p.id, labels))
            .catch(() => {});
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <div className="h-full">
      <Layout>
        {activeTab === 'printer' ? <PrinterTab /> : <DesignerTab />}
      </Layout>
      <ToastContainer />
    </div>
  );
}
