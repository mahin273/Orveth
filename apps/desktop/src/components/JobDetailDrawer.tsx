import React from "react";
import { DownloadJob } from "../api";
import { X, ShieldCheck, ShieldAlert, CheckCircle, AlertTriangle, Hash, Layers } from "lucide-react";

interface JobDetailDrawerProps {
  job: DownloadJob | null;
  onClose: () => void;
  onRetry: (id: string) => void;
}

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({
  job,
  onClose,
  onRetry,
}) => {
  if (!job) return null;

  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between shrink-0 overflow-y-auto">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Details</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <div className="text-slate-500 font-semibold mb-1">Filename</div>
            <div className="text-slate-200 font-medium break-all">{job.file_name}</div>
          </div>

          <div>
            <div className="text-slate-500 font-semibold mb-1">Status</div>
            <div className="capitalize text-slate-200 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>{job.status.replace("_", " ")}</span>
            </div>
          </div>

          <div>
            <div className="text-slate-500 font-semibold mb-1">Destination</div>
            <div className="text-slate-300 font-mono text-[11px] break-all bg-slate-950 p-2 rounded-lg border border-slate-800">
              {job.destination}
            </div>
          </div>

          <div>
            <div className="text-slate-500 font-semibold mb-1">Source URL</div>
            <div className="text-slate-400 font-mono text-[11px] break-all bg-slate-950 p-2 rounded-lg border border-slate-800">
              {job.url}
            </div>
          </div>

          <div>
            <div className="text-slate-500 font-semibold mb-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Transfer Mode</span>
            </div>
            <div className="text-slate-300">
              {job.segmented ? "Multi-connection segmented transfer" : "Single stream transfer"}
            </div>
          </div>

          {/* Verification section */}
          <div className="p-3 bg-slate-800/40 border border-slate-700/40 rounded-xl space-y-1.5">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-indigo-400" />
              <span>Integrity Verification</span>
            </div>
            <div className="text-slate-400">
              {job.verification_status === "matched" && (
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>SHA-256 Checksum Verified Match</span>
                </div>
              )}
              {job.verification_status === "mismatch" && (
                <div className="flex items-center gap-1.5 text-red-400 font-semibold">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Checksum Mismatch! File may be corrupt.</span>
                </div>
              )}
              {job.verification_status === "calculated" && (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>Checksum calculated (no expected hash provided)</span>
                </div>
              )}
              {job.verification_status === "not_requested" && (
                <div className="text-slate-500">Not verified</div>
              )}
            </div>
            {job.expected_hash && (
              <div className="text-[10px] text-slate-500 font-mono break-all pt-1">
                Expected: {job.expected_hash}
              </div>
            )}
          </div>

          {/* Error if present */}
          {job.last_error_message && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl space-y-1">
              <div className="font-semibold text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Error Details</span>
              </div>
              <div className="text-slate-300 font-mono text-[11px] break-all">
                {job.last_error_message}
              </div>
              {job.status === "failed" && (
                <button
                  onClick={() => onRetry(job.id)}
                  className="mt-2 w-full py-1.5 bg-red-600/80 hover:bg-red-600 text-white font-medium rounded-lg text-xs transition-colors"
                >
                  Retry Job
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
