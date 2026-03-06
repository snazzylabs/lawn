
import { useQuery } from "convex/react";
import { useAuthState } from "@/lib/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import {
  Outlet,
  Link,
  useLocation,
  useParams,
} from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UploadProgress } from "@/components/upload/UploadProgress";
import { useVideoUploadManager, type UploadRequestItem } from "./-useVideoUploadManager";
import { DashboardUploadProvider } from "@/lib/dashboardUploadContext";

const VIDEO_FILE_EXTENSIONS = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || VIDEO_FILE_EXTENSIONS.test(file.name);
}

function getVideoFiles(files: FileList | null) {
  if (!files) return [];
  return Array.from(files).filter(isVideoFile);
}

function baseName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function dragEventHasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export default function DashboardLayout() {
  const { isLoading, isAuthenticated } = useAuthState();
  const isLoaded = !isLoading;
  const userId = isAuthenticated ? "authenticated" : null;
  const teams = useQuery(api.teams.list, userId ? {} : "skip");
  const location = useLocation();
  const { pathname, searchStr } = location;
  const params = useParams({ strict: false });
  const teamSlug =
    typeof params.teamSlug === "string" ? params.teamSlug : undefined;
  const routeProjectId =
    typeof params.projectId === "string"
      ? (params.projectId as Id<"projects">)
      : undefined;
  const routeVideoId =
    typeof params.videoId === "string" ? params.videoId : undefined;
  const publicPlaybackId = useQuery(
    api.videos.getPublicIdByVideoId,
    routeVideoId ? { videoId: routeVideoId } : "skip",
  );
  const uploadTargets = useQuery(
    api.projects.listUploadTargets,
    teamSlug ? { teamSlug } : {},
  );
  const {
    uploads,
    uploadFilesToProject,
    cancelUpload,
  } = useVideoUploadManager();
  const [isGlobalDragActive, setIsGlobalDragActive] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [uploadSetupOpen, setUploadSetupOpen] = useState(false);
  const [uploadSetupProjectId, setUploadSetupProjectId] = useState<Id<"projects"> | null>(null);
  const [uploadDrafts, setUploadDrafts] = useState<
    Array<{
      file: File;
      titleMode: "proof" | "custom";
      customTitle: string;
      isFinalProof: boolean;
    }>
  >([]);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const dragDepthRef = useRef(0);
  const uploadableProjectIds = useMemo(
    () => new Set((uploadTargets ?? []).map((target) => target.projectId)),
    [uploadTargets],
  );
  const canUploadToCurrentProject = routeProjectId
    ? uploadableProjectIds.has(routeProjectId)
    : false;
  const allowGlobalVideoUploadDrop = Boolean(
    routeProjectId &&
      !routeVideoId &&
      (canUploadToCurrentProject || uploadTargets === undefined),
  );
  const nextProofNumber = useQuery(
    api.videos.getNextProofNumber,
    uploadSetupProjectId ? { projectId: uploadSetupProjectId } : "skip",
  );

  const openUploadSetup = useCallback((projectId: Id<"projects">, files: File[]) => {
    if (files.length === 0) return;
    setUploadSetupProjectId(projectId);
    setUploadDrafts(
      files.map((file) => ({
        file,
        titleMode: "proof",
        customTitle: baseName(file.name),
        isFinalProof: false,
      })),
    );
    setUploadSetupOpen(true);
  }, []);

  const requestUpload = useCallback(
    (inputFiles: File[], preferredProjectId?: Id<"projects">) => {
      const files = inputFiles.filter(isVideoFile);
      if (files.length === 0) return;

      if (preferredProjectId) {
        openUploadSetup(preferredProjectId, files);
        return;
      }

      if (
        routeProjectId &&
        (canUploadToCurrentProject || uploadTargets === undefined)
      ) {
        openUploadSetup(routeProjectId, files);
        return;
      }

      if (uploadTargets && uploadTargets.length === 0) {
        window.alert("You do not have upload access to any projects.");
        return;
      }

      setPendingFiles(files);
      setProjectPickerOpen(true);
    },
    [
      canUploadToCurrentProject,
      openUploadSetup,
      routeProjectId,
      uploadTargets,
    ],
  );

  const handleProjectSelected = useCallback(
    (projectId: Id<"projects">) => {
      const files = pendingFiles;
      if (!files || files.length === 0) return;

      setProjectPickerOpen(false);
      setPendingFiles(null);
      openUploadSetup(projectId, files);
    },
    [openUploadSetup, pendingFiles],
  );

  const handleProjectPickerOpenChange = useCallback((open: boolean) => {
    setProjectPickerOpen(open);
    if (!open) {
      setPendingFiles(null);
    }
  }, []);

  const handleUploadSetupOpenChange = useCallback((open: boolean) => {
    setUploadSetupOpen(open);
    if (!open) {
      setUploadDrafts([]);
      setUploadSetupProjectId(null);
    }
  }, []);

  const handleStartUpload = useCallback(() => {
    if (!uploadSetupProjectId || uploadDrafts.length === 0 || nextProofNumber === undefined) return;

    const items: UploadRequestItem[] = uploadDrafts.map((draft, index) => {
      const proofTitle = `Proof ${nextProofNumber + index}`;
      const customTitle = draft.customTitle.trim();
      const chosenTitle =
        draft.titleMode === "custom" && customTitle
          ? customTitle
          : proofTitle;
      return {
        file: draft.file,
        title: chosenTitle,
        isFinalProof: draft.isFinalProof,
      };
    });

    setUploadSetupOpen(false);
    setUploadDrafts([]);
    const projectId = uploadSetupProjectId;
    setUploadSetupProjectId(null);
    void uploadFilesToProject(projectId, items);
  }, [nextProofNumber, uploadDrafts, uploadFilesToProject, uploadSetupProjectId]);

  useEffect(() => {
    if (!allowGlobalVideoUploadDrop) {
      dragDepthRef.current = 0;
      setIsGlobalDragActive(false);
      return;
    }

    const handleDragEnter = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsGlobalDragActive(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      setIsGlobalDragActive(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsGlobalDragActive(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsGlobalDragActive(false);

      const files = getVideoFiles(event.dataTransfer?.files ?? null);
      if (files.length === 0) return;
      requestUpload(files);
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [allowGlobalVideoUploadDrop, requestUpload]);

  const uploadContext = useMemo(
    () => ({
      requestUpload,
      uploads,
      cancelUpload,
    }),
    [requestUpload, uploads, cancelUpload],
  );
  const isResolvingPublicPlaybackExemption =
    Boolean(isLoaded && !userId && routeVideoId) && publicPlaybackId === undefined;
  const isCheckingMembership = Boolean(userId) && teams === undefined;
  const hasTeamMembership = (teams?.length ?? 0) > 0;

  useEffect(() => {
    if (!isLoaded || userId) return;
    if (typeof window === "undefined") return;

    if (routeVideoId) {
      if (publicPlaybackId === undefined) return;
      if (publicPlaybackId) {
        window.location.replace(`/watch/${publicPlaybackId}`);
        return;
      }
    }

    const redirectUrl = `${pathname}${searchStr}`;
    window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }, [isLoaded, userId, pathname, searchStr, routeVideoId, publicPlaybackId]);

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f0f0e8]">
        <div className="text-[#888]">Loading...</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f0f0e8]">
        <div className="text-[#888]">
          {isResolvingPublicPlaybackExemption
            ? "Checking public playback access..."
            : "Redirecting to sign in..."}
        </div>
      </div>
    );
  }

  if (isCheckingMembership) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f0f0e8]">
        <div className="text-[#888]">Checking workspace access...</div>
      </div>
    );
  }

  if (!hasTeamMembership) {
    return (
      <div className="h-full bg-[#f0f0e8] flex items-center justify-center px-4">
        <div className="max-w-md w-full border border-[#1a1a1a]/20 bg-white/70 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#6b7280]">
            Access Restricted
          </p>
          <h1 className="mt-3 text-xl font-semibold text-[#111827]">
            Team membership required
          </h1>
          <p className="mt-3 text-sm text-[#4b5563]">
            Your authenticated account is not an active Snazzy Labs team member.
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center justify-center border border-[#111827] px-4 py-2 text-sm font-semibold text-[#111827] hover:bg-[#f3f4f6]"
            >
              Back to entry
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative h-full flex flex-col bg-[#f0f0e8]")}>
      {/* Main content */}
      <main className="flex-1 overflow-auto flex flex-col">
        <DashboardUploadProvider value={uploadContext}>
          <Outlet />
        </DashboardUploadProvider>
      </main>

      {allowGlobalVideoUploadDrop && isGlobalDragActive && (
        <div className="pointer-events-none fixed inset-0 z-40">
          <div className="absolute inset-0 bg-[#1a1a1a]/20" />
          <div className="absolute inset-4 border-4 border-dashed border-[#2F6DB4] bg-[#2F6DB4]/10 flex items-center justify-center">
            <p className="border-2 border-[#1a1a1a] bg-[#f0f0e8] px-4 py-2 text-sm font-bold text-[#1a1a1a]">
              Drop videos to upload
            </p>
          </div>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="fixed left-4 right-4 top-16 z-50 space-y-2 sm:bottom-4 sm:top-auto sm:right-auto sm:w-full sm:max-w-sm">
          {uploads.map((upload) => (
            <UploadProgress
              key={upload.id}
              fileName={upload.file.name}
              fileSize={upload.file.size}
              progress={upload.progress}
              status={upload.status}
              error={upload.error}
              bytesPerSecond={upload.bytesPerSecond}
              estimatedSecondsRemaining={upload.estimatedSecondsRemaining}
              onCancel={() => cancelUpload(upload.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={projectPickerOpen} onOpenChange={handleProjectPickerOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a project</DialogTitle>
            <DialogDescription>
              {pendingFiles?.length ? `Upload ${pendingFiles.length} video${pendingFiles.length > 1 ? "s" : ""} to:` : "Pick a project to start uploading."}
            </DialogDescription>
          </DialogHeader>
          {uploadTargets === undefined ? (
            <p className="text-sm text-[#888]">Loading projects...</p>
          ) : uploadTargets.length === 0 ? (
            <p className="text-sm text-[#888]">
              No uploadable projects found for your account.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto border-2 border-[#1a1a1a] divide-y-2 divide-[#1a1a1a]">
              {uploadTargets.map((target) => (
                <button
                  key={target.projectId}
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-[#e8e8e0] transition-colors"
                  onClick={() => handleProjectSelected(target.projectId)}
                >
                  <p className="font-bold text-[#1a1a1a]">{target.projectName}</p>
                  <p className="text-xs text-[#888]">{target.teamName}</p>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={uploadSetupOpen} onOpenChange={handleUploadSetupOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prepare Upload</DialogTitle>
            <DialogDescription>
              Name each upload and optionally flag it as Final Proof.
            </DialogDescription>
          </DialogHeader>

          {uploadDrafts.length === 0 ? (
            <p className="text-sm text-[#888]">No videos selected.</p>
          ) : nextProofNumber === undefined ? (
            <p className="text-sm text-[#888]">Loading proof defaults...</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto border-2 border-[#1a1a1a] divide-y-2 divide-[#1a1a1a]">
              {uploadDrafts.map((draft, index) => {
                const proofTitle = `Proof ${nextProofNumber + index}`;
                return (
                  <div key={`${draft.file.name}-${index}`} className="p-3 space-y-2 bg-[#f0f0e8]">
                    <div className="text-sm font-bold text-[#1a1a1a] truncate" title={draft.file.name}>
                      {draft.file.name}
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-sm text-[#1a1a1a]">
                        <input
                          type="radio"
                          name={`title-mode-${index}`}
                          checked={draft.titleMode === "proof"}
                          onChange={() =>
                            setUploadDrafts((prev) =>
                              prev.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, titleMode: "proof" } : entry,
                              ),
                            )
                          }
                        />
                        <span className="font-mono">Default: {proofTitle}</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#1a1a1a]">
                        <input
                          type="radio"
                          name={`title-mode-${index}`}
                          checked={draft.titleMode === "custom"}
                          onChange={() =>
                            setUploadDrafts((prev) =>
                              prev.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, titleMode: "custom" } : entry,
                              ),
                            )
                          }
                        />
                        <span>Custom title</span>
                      </label>
                      <input
                        type="text"
                        value={draft.customTitle}
                        onChange={(event) =>
                          setUploadDrafts((prev) =>
                            prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, customTitle: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        disabled={draft.titleMode !== "custom"}
                        placeholder="Enter custom title"
                        className={cn(
                          "w-full border-2 border-[#1a1a1a] bg-[#f0f0e8] px-2 py-1.5 text-sm text-[#1a1a1a] focus:outline-none",
                          draft.titleMode !== "custom" && "opacity-60",
                        )}
                      />
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm font-bold text-[#1a1a1a]">
                      <input
                        type="checkbox"
                        checked={draft.isFinalProof}
                        onChange={(event) =>
                          setUploadDrafts((prev) =>
                            prev.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, isFinalProof: event.target.checked }
                                : entry,
                            ),
                          )
                        }
                      />
                      Mark as Final Proof
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => handleUploadSetupOpenChange(false)}
              className="h-9 px-3 border-2 border-[#1a1a1a] bg-[#f0f0e8] text-sm font-bold text-[#1a1a1a] hover:bg-[#e8e8e0]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartUpload}
              disabled={uploadDrafts.length === 0 || nextProofNumber === undefined}
              className="h-9 px-4 border-2 border-[#1a1a1a] bg-[#2F6DB4] text-sm font-bold text-white hover:bg-[#255a94] disabled:opacity-60"
            >
              Start Upload
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
