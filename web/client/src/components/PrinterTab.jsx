import useConfigStore from '../store/configStore';
import { Image, Clock, Download, Maximize2 } from 'lucide-react';
import { useState } from 'react';

export default function PrinterTab() {
  const { labels } = useConfigStore();
  const [selectedLabel, setSelectedLabel] = useState(null);

  const handleDownload = (label) => {
    const a = document.createElement('a');
    a.href = label.image;
    a.download = `label-${label.id}.png`;
    a.click();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Label count bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Image size={14} />
          <span>
            {labels.length} label{labels.length !== 1 ? 's' : ''} rendered
          </span>
        </div>
        {labels.length > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Latest first
          </span>
        )}
      </div>

      {/* Labels grid */}
      <div className="flex-1 overflow-auto p-4">
        {labels.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <Image size={36} className="text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="mb-1 text-lg font-medium text-gray-700 dark:text-gray-300">
              No labels yet
            </h3>
            <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
              Start the TCP server and send ZPL data to see rendered labels appear here.
              You can also use the Test button to send ZPL manually.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {labels.map((label) => (
              <div
                key={label.id}
                className="label-enter group card overflow-hidden transition-shadow hover:shadow-md"
              >
                <div className="relative bg-white p-2 dark:bg-gray-800">
                  <img
                    src={label.image}
                    alt="ZPL Label"
                    className="w-full border border-gray-100 object-contain dark:border-gray-700"
                    style={{ maxHeight: '200px' }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                    <button
                      onClick={() => setSelectedLabel(label)}
                      className="rounded-lg bg-white/90 p-2 shadow-sm hover:bg-white"
                      title="View full size"
                    >
                      <Maximize2 size={16} className="text-gray-700" />
                    </button>
                    <button
                      onClick={() => handleDownload(label)}
                      className="rounded-lg bg-white/90 p-2 shadow-sm hover:bg-white"
                      title="Download"
                    >
                      <Download size={16} className="text-gray-700" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 border-t border-gray-100 px-2 py-1.5 dark:border-gray-700">
                  <Clock size={12} className="text-gray-400" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(label.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full-size label viewer */}
      {selectedLabel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
          onClick={() => setSelectedLabel(null)}
        >
          <div
            className="max-h-full max-w-full overflow-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {new Date(selectedLabel.timestamp).toLocaleString()}
              </span>
              <div className="flex gap-2">
                <button onClick={() => handleDownload(selectedLabel)} className="btn-secondary text-xs">
                  <Download size={14} />
                  Download PNG
                </button>
                <button onClick={() => setSelectedLabel(null)} className="btn-ghost text-xs">
                  Close
                </button>
              </div>
            </div>
            <img
              src={selectedLabel.image}
              alt="ZPL Label"
              className="border border-gray-200 dark:border-gray-700"
              style={{ maxHeight: '80vh', maxWidth: '80vw' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
