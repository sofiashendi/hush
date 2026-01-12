import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [model, setModel] = useState('base');
  const [autoPaste, setAutoPaste] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const config = await window.electronAPI.getConfig();
        setModel(config.model || 'base');
        setAutoPaste(config.autoPaste ?? false);
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    try {
      await window.electronAPI.saveConfig({
        model: model,
        autoPaste: autoPaste,
      });
      onClose();
    } catch (err) {
      console.error('[Settings] Failed to save settings:', err);
    }
  };

  useEffect(() => {
    const cleanup = window.electronAPI.onDownloadProgress((percent: number) => {
      setDownloadProgress(percent);
      setIsDownloading(percent < 100);
    });
    return cleanup;
  }, []);

  const handleModelChange = async (newModel: string) => {
    if (newModel === model) return;
    setIsDownloading(true);
    setDownloadProgress(-1);
    setModelError(null);
    try {
      await window.electronAPI.switchModel(newModel);
      setModel(newModel);
    } catch (err) {
      console.error('Failed to switch model:', err);
      setModelError(
        'Failed to switch model. The model may still be loading or there was an error.'
      );
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const models = [
    { id: 'base', label: 'Base', sublabel: 'Fast & Lightweight', size: '~60MB' },
    { id: 'small', label: 'Small', sublabel: 'Balanced', size: '~190MB' },
    { id: 'large-v3-turbo', label: 'Large', sublabel: 'Max Accuracy', size: '~550MB' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden pointer-events-auto"
      style={{ backgroundColor: '#1c1c1e', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
    >
      {/* Header */}
      <div className="relative px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-white/90">Settings</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center border border-white/10"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '32px', backgroundColor: 'rgba(255,255,255,0.03)' }}>
        {/* Model Selection */}
        <div style={{ marginBottom: '24px' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: '16px' }}>
            <label style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500, fontSize: '16px' }}>
              Transcription Model
            </label>
            {isDownloading && (
              <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 500 }}>
                {downloadProgress < 0
                  ? 'Switching...'
                  : downloadProgress < 100
                    ? `Downloading ${downloadProgress}%`
                    : 'Finalizing...'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {models.map((m) => {
              const isSelected = model === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => handleModelChange(m.id)}
                  disabled={isDownloading}
                  className="flex flex-col text-left transition-all"
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: isSelected ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.1)',
                    backgroundColor: isSelected
                      ? 'rgba(59,130,246,0.15)'
                      : 'rgba(255,255,255,0.05)',
                    cursor: isDownloading ? 'not-allowed' : 'pointer',
                    opacity: isDownloading ? 0.5 : 1,
                  }}
                >
                  <div
                    className="flex justify-between items-center"
                    style={{ marginBottom: '4px' }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                        color: isSelected ? '#fff' : 'rgba(255,255,255,0.8)',
                      }}
                    >
                      {m.label}
                    </span>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                      {m.size}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                    {m.sublabel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progress Bar */}
          {isDownloading && (
            <div
              className="relative w-full overflow-hidden"
              style={{
                height: '6px',
                backgroundColor: 'rgba(0,0,0,0.3)',
                borderRadius: '3px',
                marginTop: '16px',
              }}
            >
              <motion.div
                className="absolute h-full"
                style={{ background: 'linear-gradient(to right, #3b82f6, #60a5fa)' }}
                initial={{ width: 0 }}
                animate={{ width: `${downloadProgress}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </div>
          )}

          {/* Error Message */}
          {modelError && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '14px',
              }}
            >
              {modelError}
            </div>
          )}
        </div>

        {/* Divider */}
        <div
          style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: '24px' }}
        />

        {/* Auto-paste toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3
              style={{
                color: 'rgba(255,255,255,0.9)',
                fontWeight: 500,
                fontSize: '16px',
                marginBottom: '4px',
              }}
            >
              Auto-Paste Text
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', maxWidth: '320px' }}>
              Automatically pastes the text into your active window after transcription.
            </p>
          </div>
          <button
            onClick={() => setAutoPaste(!autoPaste)}
            className="relative flex-shrink-0"
            style={{
              width: '52px',
              height: '32px',
              borderRadius: '16px',
              backgroundColor: autoPaste ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
            }}
          >
            <motion.div
              className="absolute"
              style={{
                top: '4px',
                left: '4px',
                width: '24px',
                height: '24px',
                borderRadius: '12px',
                backgroundColor: '#fff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
              animate={{ x: autoPaste ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex justify-end gap-3"
        style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(255,255,255,0.03)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            background: 'linear-gradient(to right, #3b82f6, #22c55e)',
            border: 'none',
            color: '#fff',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Save Changes
        </button>
      </div>
    </motion.div>
  );
}
