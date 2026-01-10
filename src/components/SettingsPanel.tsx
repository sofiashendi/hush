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
        console.error("Failed to load settings:", err);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    try {
      await window.electronAPI.saveConfig({
        model: model,
        autoPaste: autoPaste
      });
    } catch (err) {
      console.error("[Settings] Failed to save settings:", err);
    }
    onClose();
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
      console.error("Failed to switch model:", err);
      setModelError("Failed to switch model. The model may still be loading or there was an error.");
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const models = [
    { id: 'base', label: 'Base', sublabel: 'Fast & Lightweight', size: '~60MB' },
    { id: 'small', label: 'Small', sublabel: 'Balanced', size: '~190MB' },
    { id: 'large-v3-turbo', label: 'Large', sublabel: 'Max Accuracy', size: '~550MB' }
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
      <div className="p-8 bg-white/[0.03]">
        {/* Model Selection */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <label className="text-white/90 font-medium text-base">
              Transcription Model
            </label>
            {isDownloading && (
              <span className="text-xs font-medium" style={{ color: '#60a5fa' }}>
                {downloadProgress < 0 ? 'Switching...' : downloadProgress < 100 ? `Downloading ${downloadProgress}%` : 'Finalizing...'}
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
                  className={`flex flex-col p-4 rounded-[12px] border-2 text-left transition-all ${isSelected
                    ? 'border-[#3b82f6] bg-[rgba(59,130,246,0.15)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                    } ${isDownloading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`font-semibold text-[15px] ${isSelected ? 'text-white' : 'text-white/80'}`}>
                      {m.label}
                    </span>
                    <span className="text-[11px] text-white/40">{m.size}</span>
                  </div>
                  <span className="text-xs text-white/50">{m.sublabel}</span>
                </button>
              );
            })}
          </div>

          {/* Progress Bar */}
          {isDownloading && (
            <div className="relative w-full h-1.5 bg-black/30 rounded overflow-hidden mt-4">
              <motion.div
                className="absolute h-full"
                style={{ background: 'linear-gradient(to right, #3b82f6, #60a5fa)' }}
                initial={{ width: 0 }}
                animate={{ width: `${downloadProgress}%` }}
                transition={{ ease: "easeOut" }}
              />
            </div>
          )}

          {/* Error Message */}
          {modelError && (
            <div className="mt-4 px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
              {modelError}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/10 mb-6" />

        {/* Auto-paste toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white/90 font-medium text-base mb-1">
              Auto-Paste Text
            </h3>
            <p className="text-white/50 text-sm max-w-xs">
              Automatically pastes the text into your active window after transcription.
            </p>
          </div>
          <button
            onClick={() => setAutoPaste(!autoPaste)}
            className={`relative w-[52px] h-8 rounded-2xl border-0 cursor-pointer transition-colors flex-shrink-0`}
            style={{ backgroundColor: autoPaste ? '#3b82f6' : 'rgba(255,255,255,0.1)' }}
          >
            <motion.div
              className="absolute top-1 left-1 w-6 h-6 rounded-xl bg-white shadow-md"
              animate={{ x: autoPaste ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10 bg-white/[0.03] flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm cursor-pointer hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg border-0 text-white text-sm cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(to right, #3b82f6, #22c55e)' }}
        >
          Save Changes
        </button>
      </div>
    </motion.div>
  );
}
