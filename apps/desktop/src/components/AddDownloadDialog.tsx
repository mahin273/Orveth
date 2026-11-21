import React, { useState, useMemo, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Folder,
  File,
  Shield,
  Layers,
  Upload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddDownloadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (url: string, destination?: string, filename?: string, hash?: string) => Promise<void>;
  onAddBatch?: (urls: string[], destination?: string) => Promise<void>;
  defaultDestination: string;
}

export function parseAndExpandUrls(input: string): string[] {
  const lines = input.split(/[\r\n]+/);
  const results: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Check for sequence pattern [start-end], e.g. [01-10] or [1-20]
    const patternMatch = line.match(/\[(\d+)-(\d+)\]/);
    if (patternMatch) {
      const fullMatch = patternMatch[0];
      const startStr = patternMatch[1];
      const endStr = patternMatch[2];
      const startNum = parseInt(startStr, 10);
      const endNum = parseInt(endStr, 10);
      const padLen = startStr.length;

      const min = Math.min(startNum, endNum);
      const max = Math.min(Math.max(startNum, endNum), min + 200); // safety cap: 200 items max

      for (let i = min; i <= max; i++) {
        const numStr = String(i).padStart(padLen, "0");
        const expanded = line.replace(fullMatch, numStr);
        if (expanded.startsWith("http://") || expanded.startsWith("https://")) {
          results.push(expanded);
        } else if (expanded.includes(".")) {
          results.push(`https://${expanded}`);
        }
      }
    } else {
      if (line.startsWith("http://") || line.startsWith("https://")) {
        results.push(line);
      } else if (line.includes(".")) {
        results.push(`https://${line}`);
      }
    }
  }

  return Array.from(new Set(results));
}

export const AddDownloadDialog: React.FC<AddDownloadDialogProps> = ({
  isOpen,
  onClose,
  onAdd,
  onAddBatch,
  defaultDestination,
}) => {
  const [mode, setMode] = useState<"single" | "batch">("single");

  // Single mode state
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [destination, setDestination] = useState(defaultDestination);
  const [expectedHash, setExpectedHash] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Batch mode state
  const [batchText, setBatchText] = useState("");
  const [batchDestination, setBatchDestination] = useState(defaultDestination);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectedBatchUrls = useMemo(() => {
    return parseAndExpandUrls(batchText);
  }, [batchText]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setBatchText((prev) => (prev ? `${prev}\n${text}` : text));
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "single") {
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
    } else {
      if (detectedBatchUrls.length === 0) {
        setError("No valid URLs found in the input. Ensure URLs begin with http:// or https://");
        return;
      }

      try {
        setLoading(true);
        if (onAddBatch) {
          await onAddBatch(detectedBatchUrls, batchDestination.trim() || undefined);
        } else {
          for (const u of detectedBatchUrls) {
            await onAdd(u, batchDestination.trim() || undefined);
          }
        }
        setBatchText("");
        onClose();
      } catch (err: any) {
        setError(err?.toString() || "Failed to add batch downloads");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-black border-border shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-zinc-400" />
              <span>Add Downloads</span>
            </DialogTitle>

            {/* Mode Toggle Switch */}
            <div className="flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  mode === "single"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Single URL
              </button>
              <button
                type="button"
                onClick={() => setMode("batch")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 ${
                  mode === "batch"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Batch / Pattern</span>
              </button>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {mode === "single"
              ? "Queue a single direct HTTP or HTTPS download."
              : "Paste multiple URLs or use patterns like [01-10] to queue in bulk."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive font-medium">
              {error}
            </div>
          )}

          {mode === "single" ? (
            <>
              {/* Single URL Input */}
              <div className="space-y-1.5">
                <Label htmlFor="url" className="text-xs flex items-center gap-1.5 text-muted-foreground">
                  <LinkIcon className="w-3 h-3 text-foreground" />
                  <span>Source URL *</span>
                </Label>
                <Input
                  id="url"
                  type="url"
                  required
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/archive.tar.gz"
                  className="bg-secondary/40 border-border/80 text-xs font-mono"
                />
              </div>

              {/* Advanced options toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  <span>
                    {showAdvanced
                      ? "Hide advanced parameters"
                      : "Advanced parameters (destination, name, hash)"}
                  </span>
                  {showAdvanced ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Advanced options */}
              {showAdvanced && (
                <div className="space-y-3 pt-2 border-t border-border/60">
                  {/* Destination */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="destination"
                      className="text-xs flex items-center gap-1.5 text-muted-foreground"
                    >
                      <Folder className="w-3 h-3 text-foreground" />
                      <span>Destination Directory</span>
                    </Label>
                    <Input
                      id="destination"
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="bg-secondary/40 border-border/80 text-xs font-mono"
                    />
                  </div>

                  {/* Custom filename */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="filename"
                      className="text-xs flex items-center gap-1.5 text-muted-foreground"
                    >
                      <File className="w-3 h-3 text-foreground" />
                      <span>Custom Filename (Optional)</span>
                    </Label>
                    <Input
                      id="filename"
                      type="text"
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      placeholder="Auto-detected from URL or server response"
                      className="bg-secondary/40 border-border/80 text-xs"
                    />
                  </div>

                  {/* SHA-256 */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="hash"
                      className="text-xs flex items-center gap-1.5 text-muted-foreground"
                    >
                      <Shield className="w-3 h-3 text-foreground" />
                      <span>Expected SHA-256 Checksum (Optional)</span>
                    </Label>
                    <Input
                      id="hash"
                      type="text"
                      value={expectedHash}
                      onChange={(e) => setExpectedHash(e.target.value)}
                      placeholder="e.g. b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
                      className="bg-secondary/40 border-border/80 font-mono text-[11px]"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Batch URLs Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="batchUrls"
                    className="text-xs flex items-center gap-1.5 text-muted-foreground"
                  >
                    <span>URLs List (one per line)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".txt,.urls,.text"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Import .txt</span>
                    </button>
                  </div>
                </div>

                <textarea
                  id="batchUrls"
                  rows={6}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder={`https://example.com/file_1.zip\nhttps://example.com/file_2.zip\nhttps://example.com/data_[01-08].tar.gz`}
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 leading-relaxed resize-none"
                />

                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
                  <span>Supports sequence patterns like [01-10]</span>
                  <span className="font-mono text-zinc-300">
                    {detectedBatchUrls.length} valid URL{detectedBatchUrls.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {/* Batch Destination */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="batchDestination"
                  className="text-xs flex items-center gap-1.5 text-muted-foreground"
                >
                  <Folder className="w-3 h-3 text-foreground" />
                  <span>Destination Directory</span>
                </Label>
                <Input
                  id="batchDestination"
                  type="text"
                  value={batchDestination}
                  onChange={(e) => setBatchDestination(e.target.value)}
                  className="bg-secondary/40 border-border/80 text-xs font-mono"
                />
              </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs border-border/80 bg-secondary/20 hover:bg-secondary/50 text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || (mode === "batch" && detectedBatchUrls.length === 0)}
              className="text-xs bg-white text-black hover:bg-zinc-200"
            >
              {loading
                ? "Starting..."
                : mode === "single"
                ? "Start Download"
                : `Queue ${detectedBatchUrls.length} Downloads`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
