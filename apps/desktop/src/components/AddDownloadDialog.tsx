import React, { useState } from "react";
import { ChevronDown, ChevronUp, Link as LinkIcon, Folder, File, Shield } from "lucide-react";
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px] bg-black border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
            New Download Task
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Queue a new download via direct HTTP or HTTPS address.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive font-medium">
              {error}
            </div>
          )}

          {/* URL Input */}
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
              <span>{showAdvanced ? "Hide advanced parameters" : "Advanced parameters (destination, name, hash)"}</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Advanced options */}
          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-border/60">
              {/* Destination */}
              <div className="space-y-1.5">
                <Label htmlFor="destination" className="text-xs flex items-center gap-1.5 text-muted-foreground">
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
                <Label htmlFor="filename" className="text-xs flex items-center gap-1.5 text-muted-foreground">
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
                <Label htmlFor="hash" className="text-xs flex items-center gap-1.5 text-muted-foreground">
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
              disabled={loading}
              className="text-xs bg-white text-black hover:bg-zinc-200"
            >
              {loading ? "Starting..." : "Start Download"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
