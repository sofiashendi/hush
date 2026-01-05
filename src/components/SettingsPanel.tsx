import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Cloud, Key } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [workerUrl, setWorkerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [autoPaste, setAutoPaste] = useState(false);

  useEffect(() => {
    // Load config on mount
    const load = async () => {
      try {
        const config = await window.electronAPI.getConfig();
        setWorkerUrl(config.apiUrl || '');
        setApiKey(config.apiKey || '');
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
        apiUrl: workerUrl,
        apiKey: apiKey,
        autoPaste: autoPaste
      });
      onClose();
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Failed to save settings.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative w-full max-w-2xl bg-[#1c1c1e] rounded-3xl border border-white/10 shadow-2xl overflow-hidden pointer-events-auto"
      style={{
        backgroundColor: '#1c1c1e',
        opacity: 1,
        backdropFilter: 'none',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' // Softer shadow for grey bg
      }}
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
      <div className="px-6 py-6 space-y-6">
        {/* Cloudflare Worker URL */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-white/70 text-sm">
            <Cloud className="w-4 h-4 text-blue-400" />
            Cloudflare Worker URL
          </label>
          <input
            type="text"
            value={workerUrl}
            onChange={(e) => setWorkerUrl(e.target.value)}
            placeholder="https://your-worker.workers.dev"
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-blue-400/50 transition-colors backdrop-blur-xl"
          />
        </div>

        {/* Cloudflare Worker API Key */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-white/70 text-sm">
            <Key className="w-4 h-4 text-green-400" />
            Cloudflare Worker API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-green-400/50 transition-colors backdrop-blur-xl"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Auto-paste toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white/90 text-sm">Auto-paste Text</h3>
            <p className="text-white/40 text-xs mt-0.5">
              Automatically paste transcribed text into active window
            </p>
          </div>
          <button
            onClick={() => setAutoPaste(!autoPaste)}
            className={`relative w-12 h-7 rounded-full transition-colors ${autoPaste ? 'bg-blue-500' : 'bg-white/20'
              }`}
          >
            <motion.div
              className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg"
              animate={{
                left: autoPaste ? '24px' : '4px'
              }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/70 text-sm border border-white/10"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 transition-colors text-white text-sm"
        >
          Save Changes
        </button>
      </div>
    </motion.div>
  );
}
