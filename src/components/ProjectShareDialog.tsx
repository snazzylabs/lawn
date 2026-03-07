"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  Plus,
  Trash2,
  Eye,
  Lock,
  ExternalLink,
  Globe,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelativeTime } from "@/lib/utils";

interface ProjectShareDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectShareDialog({
  projectId,
  open,
  onOpenChange,
}: ProjectShareDialogProps) {
  const project = useQuery(api.projects.get, { projectId });
  const shareLinks = useQuery(api.projectShareLinks.list, { projectId });
  const createShareLink = useMutation(api.projectShareLinks.create);
  const deleteShareLink = useMutation(api.projectShareLinks.remove);
  const setVisibility = useMutation(api.projects.setVisibility);
  const createProjectShortLink = useAction(api.shortLinks.createProjectShortLink);
  const shortenUrl = useAction(api.shortLinks.shortenUrl);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [publicShortUrl, setPublicShortUrl] = useState<string | null>(null);
  const [isGeneratingPublicShortUrl, setIsGeneratingPublicShortUrl] =
    useState(false);
  const [projectPublicIdOverride, setProjectPublicIdOverride] = useState<
    string | null
  >(null);
  const [newLinkOptions, setNewLinkOptions] = useState({
    expiresInDays: undefined as number | undefined,
    password: undefined as string | undefined,
  });
  const isMountedRef = useRef(true);
  const latestShortenRequestRef = useRef(0);

  const projectPublicId = projectPublicIdOverride ?? project?.publicId ?? null;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open || !projectPublicId || project?.visibility !== "public") {
      setPublicShortUrl(null);
      setIsGeneratingPublicShortUrl(false);
      return;
    }

    let cancelled = false;
    const requestId = ++latestShortenRequestRef.current;
    const longUrl = `${window.location.origin}/projects/${projectPublicId}`;
    setIsGeneratingPublicShortUrl(true);

    void (async () => {
      try {
        const result = await shortenUrl({ longUrl });
        if (
          cancelled ||
          !isMountedRef.current ||
          latestShortenRequestRef.current !== requestId
        ) {
          return;
        }
        setPublicShortUrl(result?.shortUrl ?? null);
      } catch (error) {
        console.error("Failed to shorten project URL:", error);
        if (
          cancelled ||
          !isMountedRef.current ||
          latestShortenRequestRef.current !== requestId
        ) {
          return;
        }
        setPublicShortUrl(null);
      } finally {
        const canUpdate =
          !cancelled &&
          isMountedRef.current &&
          latestShortenRequestRef.current === requestId;
        if (canUpdate) {
          setIsGeneratingPublicShortUrl(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, project?.visibility, projectPublicId, shortenUrl]);

  const handleCreateLink = async () => {
    setIsCreating(true);
    try {
      const result = await createShareLink({
        projectId,
        expiresInDays: newLinkOptions.expiresInDays,
        password: newLinkOptions.password,
      });

      setProjectPublicIdOverride(result.projectPublicId);
      setNewLinkOptions({
        expiresInDays: undefined,
        password: undefined,
      });

      const longUrl = `${window.location.origin}/projects/${result.projectPublicId}?st=${result.token}`;
      await createProjectShortLink({ shareLinkId: result.linkId, longUrl });
    } catch (error) {
      console.error("Failed to create project share link:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSetVisibility = async (visibility: "public" | "private") => {
    if (!project || isUpdatingVisibility || project.visibility === visibility) {
      return;
    }

    setIsUpdatingVisibility(true);
    try {
      const result = await setVisibility({ projectId, visibility });
      if (result.publicId) {
        setProjectPublicIdOverride(result.publicId);
      }
      if (visibility === "private") {
        setPublicShortUrl(null);
      }
    } catch (error) {
      console.error("Failed to update project visibility:", error);
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const handleCopyLink = (token: string, shortUrl?: string) => {
    if (!projectPublicId) return;
    const url =
      shortUrl || `${window.location.origin}/projects/${projectPublicId}?st=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyPublicLink = () => {
    if (!projectPublicId) return;
    const longUrl = `${window.location.origin}/projects/${projectPublicId}`;
    const url = publicShortUrl ?? longUrl;
    navigator.clipboard.writeText(url);
    setCopiedId("public");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteLink = async (linkId: Id<"projectShareLinks">) => {
    if (!confirm("Are you sure you want to delete this share link?")) return;
    try {
      await deleteShareLink({ linkId });
    } catch (error) {
      console.error("Failed to delete project share link:", error);
    }
  };

  const publicProjectPath = projectPublicId ? `/projects/${projectPublicId}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1100px)] max-w-[1100px] max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            Public projects can be viewed by anyone with the URL. Restricted
            links support password and expiration.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-3 border-2 border-[#1a1a1a] p-4 bg-[#e8e8e0]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-[#1a1a1a]">Visibility</h3>
                    <p className="text-xs text-[#666]">
                      Private disables the public project URL. Restricted links still
                      work.
                    </p>
                  </div>
                  <Badge variant={project?.visibility === "public" ? "success" : "secondary"}>
                    {project?.visibility === "public" ? "Public" : "Private"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={project?.visibility === "public" ? "default" : "outline"}
                    disabled={isUpdatingVisibility || project === undefined}
                    onClick={() => void handleSetVisibility("public")}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    Public
                  </Button>
                  <Button
                    variant={project?.visibility === "private" ? "default" : "outline"}
                    disabled={isUpdatingVisibility || project === undefined}
                    onClick={() => void handleSetVisibility("private")}
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Private
                  </Button>
                </div>

                {publicProjectPath ? (
                  <div className="p-3 border-2 border-[#1a1a1a] bg-[#f0f0e8] space-y-2">
                    <div className="text-xs text-[#666]">Public URL</div>
                    <code className="block text-sm bg-[#e8e8e0] px-2 py-1 font-mono truncate">
                      {publicProjectPath}
                    </code>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={handleCopyPublicLink}
                        disabled={
                          project?.visibility !== "public" || isGeneratingPublicShortUrl
                        }
                      >
                        {copiedId === "public" ? (
                          <Check className="mr-2 h-4 w-4" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        {isGeneratingPublicShortUrl ? "Preparing..." : "Copy URL"}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        disabled={project?.visibility !== "public"}
                        onClick={() => window.open(publicProjectPath, "_blank")}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 border-2 border-[#1a1a1a] p-4 bg-[#e8e8e0]">
                <h3 className="font-bold text-sm text-[#1a1a1a]">
                  Create restricted share link
                </h3>

                <div>
                  <label className="text-sm text-[#888]">Expiration</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between mt-1">
                        {newLinkOptions.expiresInDays
                          ? `${newLinkOptions.expiresInDays} days`
                          : "Never"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() =>
                          setNewLinkOptions((o) => ({ ...o, expiresInDays: undefined }))
                        }
                      >
                        Never
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setNewLinkOptions((o) => ({ ...o, expiresInDays: 1 }))
                        }
                      >
                        1 day
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setNewLinkOptions((o) => ({ ...o, expiresInDays: 7 }))
                        }
                      >
                        7 days
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setNewLinkOptions((o) => ({ ...o, expiresInDays: 30 }))
                        }
                      >
                        30 days
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div>
                  <label className="text-sm text-[#888]">Password (optional)</label>
                  <Input
                    type="password"
                    placeholder="Leave empty for no password"
                    value={newLinkOptions.password || ""}
                    onChange={(e) =>
                      setNewLinkOptions((o) => ({
                        ...o,
                        password: e.target.value || undefined,
                      }))
                    }
                    className="mt-1"
                  />
                </div>

                <Button onClick={handleCreateLink} disabled={isCreating} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  {isCreating ? "Creating..." : "Create restricted link"}
                </Button>
              </div>
            </div>
            <div className="space-y-2 border-2 border-[#1a1a1a] p-4 bg-[#e8e8e0]">
              <h3 className="font-bold text-sm text-[#1a1a1a]">Restricted links</h3>
              {shareLinks === undefined ? (
                <p className="text-sm text-[#888]">Loading...</p>
              ) : shareLinks.length === 0 ? (
                <p className="text-sm text-[#888]">No share links yet</p>
              ) : (
                <div className="space-y-2">
                  {shareLinks.map((link) => (
                    <div
                      key={link._id}
                      className="flex items-center justify-between p-3 border-2 border-[#1a1a1a]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm bg-[#e8e8e0] px-2 py-0.5 font-mono truncate max-w-[200px]">
                            {link.shortUrl || "/projects/..."}
                          </code>
                          {link.isExpired ? <Badge variant="destructive">Expired</Badge> : null}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[#888]">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {link.viewCount} views
                          </span>
                          {link.hasPassword ? (
                            <span className="flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              Protected
                            </span>
                          ) : null}
                          {link.expiresAt ? (
                            <span>Expires {formatRelativeTime(link.expiresAt)}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyLink(link.token, link.shortUrl)}
                        >
                          {copiedId === link.token ? (
                            <Check className="h-4 w-4 text-[#2F6DB4]" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (!projectPublicId) return;
                            window.open(
                              `/projects/${projectPublicId}?st=${link.token}`,
                              "_blank",
                            );
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-[#dc2626] hover:text-[#dc2626]"
                          onClick={() => void handleDeleteLink(link._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
