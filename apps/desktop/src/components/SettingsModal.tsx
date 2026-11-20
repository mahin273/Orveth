import React, { useState } from "react";
import { EngineSettings } from "../api";
import { X, Save } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EngineSettings;
  onSave: (settings: EngineSettings) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings: initialSettings,
  onSave,
}) => {
  const [settings, setSettings] = useState<EngineSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(settings);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-slate-100">Preferences</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          {/* Default download dir */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300">Default Destination Directory</label>
            <input
              type="text"
              value={settings.default_destination}
              onChange={(e) =>
                setSettings({ ...settings, default_destination: e.target.value })
              }
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Active downloads & segments */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Max Active Downloads</label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.max_active_downloads}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_active_downloads: parseInt(e.target.value) || 1,
                  })
                }
                className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Default Segments per Job</label>
              <input
                type="number"
                min="1"
                max="16"
                value={settings.default_segment_count}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_segment_count: parseInt(e.target.value) || 1,
                  })
                }
                className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Collision policy */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300">Filename Collision Behavior</label>
            <select
              value={settings.collision_policy}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  collision_policy: e.target.value as "rename" | "overwrite" | "prompt",
                })
              }
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="rename">Auto-rename (e.g. file (1).iso)</option>
              <option value="overwrite">Overwrite existing</option>
              <option value="prompt">Prompt / Error</option>
            </select>
          </div>

          {/* Bandwidth cap */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-300">
              Global Bandwidth Limit (KB/s, 0 for unlimited)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={
                settings.global_bandwidth_limit_bytes_per_sec
                  ? Math.round(settings.global_bandwidth_limit_bytes_per_sec / 1024)
                  : 0
              }
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                setSettings({
                  ...settings,
                  global_bandwidth_limit_bytes_per_sec: val > 0 ? val * 1024 : undefined,
                });
              }}
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shadow-indigo-600/30"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving..." : "Save Preferences"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
