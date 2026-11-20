import React, { useState } from "react";
import { X, ChevronDown, ChevronUp, Link as LinkIcon, Folder, File, Shield } from "lucide-react";

interface AddDownloadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (url: string, destination?: string, filename?: string, hash?: string) => Promise<void>;
  defaultDestination: string;
}

export const AddDownloadDialog: React.FC<AddDownloadDialogProps> = ({
  isOpen,
  onClose,
  onAdd,
  defaultDestination,
}) => {
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [destination, setDestination] = useState(defaultDestination);
  const [expectedHash, setExpectedHash] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Please provide a valid download URL.");
      return;
    }

    try {
      setLoading(true);
      await onAdd(
        trimmedUrl,
        destination.trim() || undefined,
        filename.trim() || undefined,
        expectedHash.trim() || undefined
      );
      setUrl("");
      setFilename("");
      setExpectedHash("");
      onClose();
    } catch (err: any) {
      setError(err?.toString() || "Failed to add download");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-slate-100">Add New Download</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          {/* URL Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Download URL *</span>
            </label>
            <input
              type="url"
              required
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/file.zip"
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Advanced toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              <span>{showAdvanced ? "Hide options" : "More options (destination, name, checksum)"}</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Advanced section */}
          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              {/* Destination */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-amber-400" />
                  <span>Destination Folder</span>
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Custom filename */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <File className="w-3.5 h-3.5 text-purple-400" />
                  <span>Custom Filename (Optional)</span>
                </label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="Auto-detected from URL if blank"
                  className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* SHA-256 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Expected SHA-256 Checksum (Optional)</span>
                </label>
                <input
                  type="text"
                  value={expectedHash}
                  onChange={(e) => setExpectedHash(e.target.value)}
                  placeholder="e.g. b94d27b9934d3e08a52e52d7da7d..."
                  className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3.5 py-2 text-sm font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
          )}

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
              disabled={loading}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shadow-indigo-600/30"
            >
              {loading ? "Adding..." : "Add & Start"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
