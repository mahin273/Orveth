import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Folder,
  File,
  Shield,
  Layers,
  Upload,
  Film,
  Music,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
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
import { api, MediaInspectionResult, MediaFormatInfo, YtDlpStatus } from "@/api";

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

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(1)} ${units[idx]}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const AddDownloadDialog: React.FC<AddDownloadDialogProps> = ({
  isOpen,
  onClose,
  onAdd,
  onAddBatch,
  defaultDestination,
}) => {
  const [mode, setMode] = useState<"single" | "batch" | "media">("single");

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

  // Media mode state
  const [mediaUrl, setMediaUrl] = useState("");
  const [ytdlpStatus, setYtdlpStatus] = useState<YtDlpStatus | null>(null);
  const [isInstallingYtDlp, setIsInstallingYtDlp] = useState(false);
  const [isInspectingMedia, setIsInspectingMedia] = useState(false);
  const [mediaResult, setMediaResult] = useState<MediaInspectionResult | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<MediaFormatInfo | null>(null);
  const [mediaFormatType, setMediaFormatType] = useState<"video" | "audio">("video");
  const [mediaDestination, setMediaDestination] = useState(defaultDestination);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check yt-dlp status on open
  useEffect(() => {
    if (isOpen) {
      api.checkYtDlpStatus()
        .then(setYtdlpStatus)
        .catch(() => setYtdlpStatus({ available: false }));
    }
  }, [isOpen]);

  const isMediaLikely = useMemo(() => {
    const l = url.toLowerCase();
    return (
      l.includes("youtube.com") ||
      l.includes("youtu.be") ||
      l.includes("vimeo.com") ||
      l.includes("soundcloud.com") ||
      l.includes("twitch.tv") ||
      l.includes("tiktok.com") ||
      l.includes("twitter.com") ||
      l.includes("x.com") ||
      l.includes("reddit.com")
    );
  }, [url]);

  const detectedBatchUrls = useMemo(() => {
    return parseAndExpandUrls(batchText);
  }, [batchText]);

  const handleInstallYtDlp = async () => {
    setError(null);
    setIsInstallingYtDlp(true);
    try {
      const res = await api.installYtDlp();
      setYtdlpStatus(res);
    } catch (err: any) {
      setError(`Failed to install yt-dlp: ${err?.toString() || "Unknown error"}`);
    } finally {
      setIsInstallingYtDlp(false);
    }
  };

  const handleInspectMedia = async (inspectTargetUrl?: string) => {
    const target = (inspectTargetUrl || mediaUrl).trim();
    if (!target) {
      setError("Please enter a media URL to inspect.");
      return;
    }
    setError(null);
    setIsInspectingMedia(true);
    setMediaResult(null);
    setSelectedFormat(null);

    try {
      const result = await api.inspectMedia(target);
      setMediaResult(result);
      if (result.formats && result.formats.length > 0) {
        // Pick highest resolution video by default, or first audio if video not present
        const firstVideo = result.formats.find((f) => f.is_video);
        if (firstVideo) {
          setSelectedFormat(firstVideo);
          setMediaFormatType("video");
        } else {
          setSelectedFormat(result.formats[0]);
          setMediaFormatType("audio");
        }
      }
    } catch (err: any) {
      setError(err?.toString() || "Media inspection failed.");
    } finally {
      setIsInspectingMedia(false);
    }
  };

  const handleDownloadMedia = async () => {
    if (!mediaResult || !selectedFormat) {
      setError("Please select a stream format.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let finalStreamUrl = selectedFormat.direct_url;
      if (!finalStreamUrl) {
        finalStreamUrl = await api.resolveMediaStream(mediaResult.url, selectedFormat.format_id);
      }

      // Generate sanitized filename: Title [Resolution].ext
      const cleanTitle = mediaResult.title.replace(/[/\\?%*:|"<>]/g, "_").trim();
      const qualTag = selectedFormat.resolution || selectedFormat.note || selectedFormat.format_id;
      const computedName = `${cleanTitle} [${qualTag}].${selectedFormat.ext}`;

      await onAdd(finalStreamUrl, mediaDestination.trim() || undefined, computedName);
      setMediaResult(null);
      setSelectedFormat(null);
      setMediaUrl("");
      onClose();
    } catch (err: any) {
      setError(err?.toString() || "Failed to start media download");
    } finally {
      setLoading(false);
    }
  };

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

    if (mode === "media") {
      await handleDownloadMedia();
      return;
    }

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
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto bg-black border-border shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-2">
            <DialogTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-zinc-400" />
              <span>Add Downloads</span>
            </DialogTitle>

            {/* Mode Toggle Switch */}
            <div className="flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
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
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 ${
                  mode === "batch"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Batch</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("media");
                  if (url && !mediaUrl) {
                    setMediaUrl(url);
                  }
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 ${
                  mode === "media"
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Film className="w-3 h-3 text-purple-400" />
                <span>Video / Media</span>
              </button>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {mode === "single"
              ? "Queue a single direct HTTP or HTTPS download."
              : mode === "batch"
              ? "Paste multiple URLs or use patterns like [01-10] to queue in bulk."
              : "Inspect and download video/audio streams from web platforms."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
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

                {isMediaLikely && (
                  <div className="flex items-center justify-between p-2 rounded bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Media streaming platform link detected</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setMediaUrl(url);
                        setMode("media");
                        handleInspectMedia(url);
                      }}
                      className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium text-[10px] flex items-center gap-1 transition-colors"
                    >
                      <span>Inspect with yt-dlp</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
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
          ) : mode === "batch" ? (
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
          ) : (
            /* Media & Video Mode */
            <div className="space-y-4">
              {/* yt-dlp Status Banner */}
              {ytdlpStatus && !ytdlpStatus.available && (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-white flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      <span>yt-dlp Engine Not Installed</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Orveth can automatically download the official standalone Linux binary.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isInstallingYtDlp}
                    onClick={handleInstallYtDlp}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white shrink-0 ml-3"
                  >
                    {isInstallingYtDlp ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                        <span>Installing...</span>
                      </>
                    ) : (
                      <span>Install yt-dlp</span>
                    )}
                  </Button>
                </div>
              )}

              {/* URL Input and Inspect Button */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mediaUrl" className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <Film className="w-3 h-3 text-purple-400" />
                    <span>Media Web Page or Stream URL</span>
                  </Label>
                  {ytdlpStatus?.available && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>yt-dlp active</span>
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    id="mediaUrl"
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... or Vimeo, SoundCloud"
                    className="bg-secondary/40 border-border/80 text-xs font-mono flex-1"
                  />
                  <Button
                    type="button"
                    disabled={isInspectingMedia || !ytdlpStatus?.available || !mediaUrl.trim()}
                    onClick={() => handleInspectMedia()}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white shrink-0"
                  >
                    {isInspectingMedia ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                        <span>Probing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 mr-1.5" />
                        <span>Inspect</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Inspected Media Details */}
              {mediaResult && (
                <div className="space-y-3 pt-2 border-t border-border/60">
                  {/* Media Header Card */}
                  <div className="flex gap-3 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                    {mediaResult.thumbnail_url ? (
                      <img
                        src={mediaResult.thumbnail_url}
                        alt="Thumbnail"
                        className="w-24 h-16 object-cover rounded bg-zinc-900 border border-zinc-800 shrink-0"
                      />
                    ) : (
                      <div className="w-24 h-16 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                        <Film className="w-6 h-6 text-zinc-600" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-xs font-medium text-white line-clamp-2 leading-snug">
                        {mediaResult.title}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                        {mediaResult.uploader && <span>{mediaResult.uploader}</span>}
                        {mediaResult.duration_seconds && (
                          <span className="font-mono bg-zinc-900 px-1.5 py-0.2 rounded border border-zinc-800 text-zinc-300">
                            {formatDuration(mediaResult.duration_seconds)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Format Category Switcher (Video vs Audio) */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground font-medium">Select Stream Quality:</span>
                    <div className="flex items-center p-0.5 bg-zinc-900 border border-zinc-800 rounded text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setMediaFormatType("video");
                          const firstVid = mediaResult.formats.find((f) => f.is_video);
                          if (firstVid) setSelectedFormat(firstVid);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${
                          mediaFormatType === "video"
                            ? "bg-purple-600 text-white"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <Film className="w-3 h-3" />
                        <span>Video Streams</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMediaFormatType("audio");
                          const firstAud = mediaResult.formats.find((f) => f.is_audio);
                          if (firstAud) setSelectedFormat(firstAud);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${
                          mediaFormatType === "audio"
                            ? "bg-purple-600 text-white"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <Music className="w-3 h-3" />
                        <span>Audio Only</span>
                      </button>
                    </div>
                  </div>

                  {/* Formats Grid / List */}
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {mediaResult.formats
                      .filter((f) =>
                        mediaFormatType === "video" ? f.is_video : f.is_audio && !f.is_video
                      )
                      .map((fmt) => {
                        const isSelected = selectedFormat?.format_id === fmt.format_id;
                        return (
                          <div
                            key={fmt.format_id}
                            onClick={() => setSelectedFormat(fmt)}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-all text-xs ${
                              isSelected
                                ? "bg-purple-500/10 border-purple-500/50 text-white"
                                : "bg-zinc-950/70 border-zinc-800 hover:border-zinc-700 text-zinc-300"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isSelected ? "bg-purple-400" : "bg-zinc-600"
                                }`}
                              />
                              <span className="font-medium">
                                {fmt.resolution || fmt.note || fmt.format_id}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400 uppercase bg-zinc-900 px-1 rounded">
                                {fmt.ext}
                              </span>
                              {fmt.vcodec && (
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  {fmt.vcodec.split(".")[0]}
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] font-mono text-zinc-400">
                              {formatBytes(fmt.filesize_approx)}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Media Destination */}
                  <div className="space-y-1.5 pt-2">
                    <Label
                      htmlFor="mediaDestination"
                      className="text-xs flex items-center gap-1.5 text-muted-foreground"
                    >
                      <Folder className="w-3 h-3 text-foreground" />
                      <span>Destination Directory</span>
                    </Label>
                    <Input
                      id="mediaDestination"
                      type="text"
                      value={mediaDestination}
                      onChange={(e) => setMediaDestination(e.target.value)}
                      className="bg-secondary/40 border-border/80 text-xs font-mono"
                    />
                  </div>
                </div>
              )}
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
              disabled={
                loading ||
                (mode === "batch" && detectedBatchUrls.length === 0) ||
                (mode === "media" && (!mediaResult || !selectedFormat))
              }
              className={`text-xs ${
                mode === "media"
                  ? "bg-purple-600 text-white hover:bg-purple-500"
                  : "bg-white text-black hover:bg-zinc-200"
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : mode === "single" ? (
                "Start Download"
              ) : mode === "batch" ? (
                `Queue ${detectedBatchUrls.length} Downloads`
              ) : (
                "Download Selected Stream"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

