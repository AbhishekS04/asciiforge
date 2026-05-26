import React, { useState } from 'react';
import { BatchItem, Settings, EffectId } from '../types';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <span className="modal-title">⌨️ PIPELINE SHORTCUTS</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '16px' }}>×</button>
        </div>
        <div className="modal-body">
          <table className="shortcuts-table">
            <tbody>
              <tr>
                <td className="shortcuts-key">C</td>
                <td className="shortcuts-desc">Toggle Split Comparison mode</td>
              </tr>
              <tr>
                <td className="shortcuts-key">+ / =</td>
                <td className="shortcuts-desc">Zoom In</td>
              </tr>
              <tr>
                <td className="shortcuts-key">- / _</td>
                <td className="shortcuts-desc">Zoom Out</td>
              </tr>
              <tr>
                <td className="shortcuts-key">0</td>
                <td className="shortcuts-desc">Reset Zoom and Pan</td>
              </tr>
              <tr>
                <td className="shortcuts-key">H / ?</td>
                <td className="shortcuts-desc">Open Keyboard Shortcuts</td>
              </tr>
              <tr>
                <td className="shortcuts-key">ESC</td>
                <td className="shortcuts-desc">Close Modals / Reset Toolbars</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="primary">CLOSE CONSOLE</button>
        </div>
      </div>
    </div>
  );
};

interface BatchProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEffect: EffectId;
  settings: Settings;
  processSingleImage: (file: File) => Promise<string>; // returns base64 data URL
}

export const BatchProcessModal: React.FC<BatchProcessModalProps> = ({
  isOpen,
  onClose,
  activeEffect,
  settings: _settings,
  processSingleImage
}) => {
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      const newItems: BatchItem[] = files.map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        status: 'queued'
      }));
      setQueue((prev) => [...prev, ...newItems]);
    }
  };

  const clearQueue = () => {
    setQueue([]);
  };

  const startBatchProcessing = async () => {
    if (queue.length === 0 || isProcessing) return;
    setIsProcessing(true);

    const updatedQueue = [...queue];

    for (let i = 0; i < updatedQueue.length; i++) {
      if (updatedQueue[i].status === 'done') continue;

      updatedQueue[i].status = 'processing';
      setQueue([...updatedQueue]);

      try {
        const resultUrl = await processSingleImage(updatedQueue[i].file);
        updatedQueue[i].status = 'done';
        updatedQueue[i].result = resultUrl;
      } catch (err) {
        console.error(err);
        updatedQueue[i].status = 'failed';
      }

      setQueue([...updatedQueue]);
    }

    setIsProcessing(false);
  };

  const downloadResult = (item: BatchItem) => {
    if (!item.result) return;
    const a = document.createElement('a');
    a.href = item.result;
    a.download = `asciiforge_${item.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <span className="modal-title">📦 BATCH QUEUE RENDERING</span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '16px' }}>×</button>
        </div>
        
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            Process folders of images concurrently using the active filter (<strong style={{ color: 'var(--accent-color)' }}>{activeEffect}</strong>).
            Files are compiled completely in memory on the client-side off-thread.
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <label className="btn primary" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-color)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              flex: 1
            }}>
              📂 ADD FILES TO BATCH
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelection}
                style={{ display: 'none' }}
              />
            </label>

            <button
              onClick={startBatchProcessing}
              disabled={queue.length === 0 || isProcessing}
              className="active"
              style={{ flex: 1, padding: '10px 16px' }}
            >
              🚀 {isProcessing ? 'RENDERING QUEUE...' : 'START BATCH RENDER'}
            </button>
          </div>

          <div className="batch-queue">
            {queue.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                fontSize: '12px'
              }}>
                Queue is empty. Select image files to begin batch rendering.
              </div>
            ) : (
              queue.map((item) => (
                <div className="batch-item-row" key={item.id}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '60%' }}>
                    <span style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
                      {item.size}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      color: item.status === 'done' ? 'var(--accent-color)' :
                             item.status === 'processing' ? 'var(--accent-cyan)' :
                             item.status === 'failed' ? '#ff4444' : 'var(--text-secondary)'
                    }}>
                      {item.status === 'done' ? '✓ DONE' :
                       item.status === 'processing' ? '◳ RENDERING' :
                       item.status === 'failed' ? '✗ FAILED' : 'QUEUED'}
                    </span>

                    {item.result && (
                      <button
                        onClick={() => downloadResult(item)}
                        style={{ padding: '2px 6px', fontSize: '10px', borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
                      >
                        DOWNLOAD
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={clearQueue} disabled={queue.length === 0 || isProcessing} style={{ borderColor: '#ff4444', color: '#ff4444' }}>
            CLEAR QUEUE
          </button>
          <button onClick={onClose} disabled={isProcessing}>
            CLOSE CONSOLE
          </button>
        </div>
      </div>
    </div>
  );
};
