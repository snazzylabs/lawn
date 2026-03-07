import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/lib/utils";
import { VideoWorkflowStatusControl } from "@/components/videos/VideoWorkflowStatusControl";
import { AlertCircle, Lock, MessageSquare, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectPublicPage() {
  const params = useParams({ strict: false });
  const publicId = params.publicId as string;
  const location = useLocation();
  const issueAccessGrant = useMutation(api.projectShareLinks.issueAccessGrant);
  const shareToken = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get("st");
    return token && token.length > 0 ? token : null;
  }, [location.search]);
  const videoGrantToken = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get("vg");
    return token && token.length > 0 ? token : null;
  }, [location.search]);

  const [grantToken, setGrantToken] = useState<string | null>(null);
  const [hasAttemptedAutoGrant, setHasAttemptedAutoGrant] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [isRequestingGrant, setIsRequestingGrant] = useState(false);

  const shareInfo = useQuery(
    api.projectShareLinks.getByToken,
    shareToken ? { token: shareToken } : "skip",
  );
  const publicData = useQuery(
    api.projects.getByPublicId,
    shareToken ? "skip" : { publicId },
  );
  const restrictedData = useQuery(
    api.projects.getByPublicIdForShareGrant,
    shareToken && grantToken ? { publicId, grantToken } : "skip",
  );
  const videoGrantData = useQuery(
    api.projects.getByPublicIdForShareGrant,
    videoGrantToken ? { publicId, videoGrantToken } : "skip",
  );
  const data = videoGrantToken ? videoGrantData : shareToken ? restrictedData : publicData;

  useEffect(() => {
    setGrantToken(null);
    setHasAttemptedAutoGrant(false);
    setPasswordError(false);
    setPasswordInput("");
  }, [shareToken, publicId]);

  const acquireGrant = useCallback(
    async (password?: string) => {
      if (!shareToken || isRequestingGrant) return false;
      setIsRequestingGrant(true);
      setPasswordError(false);

      try {
        const result = await issueAccessGrant({ token: shareToken, password });
        if (result.ok && result.grantToken) {
          setGrantToken(result.grantToken);
          return true;
        }

        setPasswordError(Boolean(password));
        return false;
      } catch {
        setPasswordError(Boolean(password));
        return false;
      } finally {
        setIsRequestingGrant(false);
      }
    },
    [issueAccessGrant, isRequestingGrant, shareToken],
  );

  useEffect(() => {
    if (!shareToken || !shareInfo || grantToken) return;
    if (shareInfo.status !== "ok" || hasAttemptedAutoGrant) return;

    setHasAttemptedAutoGrant(true);
    void acquireGrant();
  }, [acquireGrant, grantToken, hasAttemptedAutoGrant, shareInfo, shareToken]);

  const isBootstrappingRestricted =
    (Boolean(shareToken) &&
      (shareInfo === undefined ||
        (shareInfo?.status === "ok" &&
          ((!grantToken && (!hasAttemptedAutoGrant || isRequestingGrant)) ||
            (Boolean(grantToken) && restrictedData === undefined))))) ||
    (Boolean(videoGrantToken) && videoGrantData === undefined);

  if (isBootstrappingRestricted) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center">
        <p className="text-[#888] text-sm">Opening shared project...</p>
      </div>
    );
  }

  if (shareToken && (shareInfo?.status === "missing" || shareInfo?.status === "expired")) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#dc2626]/10 flex items-center justify-center mb-4 border-2 border-[#dc2626]">
              <AlertCircle className="h-6 w-6 text-[#dc2626]" />
            </div>
            <CardTitle>Link expired or invalid</CardTitle>
            <CardDescription>
              This project share link is no longer valid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/" preload="intent" className="block">
              <Button variant="outline" className="w-full">
                Go to Snazzy Labs
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (shareToken && shareInfo?.status === "requiresPassword" && !grantToken) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#e8e8e0] flex items-center justify-center mb-4 border-2 border-[#1a1a1a]">
              <Lock className="h-6 w-6 text-[#888]" />
            </div>
            <CardTitle>Password required</CardTitle>
            <CardDescription>
              This project share link is password protected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await acquireGrant(passwordInput);
              }}
              className="space-y-4"
            >
              <Input
                type="password"
                placeholder="Enter password"
                value={passwordInput}
                onChange={(event) => setPasswordInput(event.target.value)}
                autoFocus
              />
              {passwordError && (
                <p className="text-sm text-[#dc2626]">Incorrect password</p>
              )}
              <Button type="submit" className="w-full" disabled={!passwordInput || isRequestingGrant}>
                {isRequestingGrant ? "Verifying..." : "View project"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (
    shareToken &&
    shareInfo?.status === "ok" &&
    !grantToken &&
    hasAttemptedAutoGrant &&
    !isRequestingGrant
  ) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-[#dc2626]/10 flex items-center justify-center mb-4 border-2 border-[#dc2626]">
              <AlertCircle className="h-6 w-6 text-[#dc2626]" />
            </div>
            <CardTitle>Could not open project</CardTitle>
            <CardDescription>
              This project share link could not be verified. Try opening the link
              again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center">
        <p className="text-[#888] text-sm">Loading...</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-black text-[#1a1a1a]">Project not available</p>
          <p className="text-sm text-[#888]">This project may be private or no longer available.</p>
        </div>
      </div>
    );
  }

  const { project, videos } = data;

  return (
    <div className="min-h-screen bg-[#f0f0e8]">
      <header className="border-b-2 border-[#1a1a1a] bg-[#f0f0e8]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-[#888] hover:text-[#1a1a1a] text-sm font-bold">
              Snazzy Labs
            </Link>
            <div className="h-4 w-[2px] bg-[#1a1a1a]/20" />
            <h1 className="text-xl font-black text-[#1a1a1a]">{project.name}</h1>
          </div>
          {project.description && (
            <p className="text-sm text-[#888] mt-1">{project.description}</p>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {videos.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Video className="h-8 w-8 text-[#888] mx-auto" />
            <p className="text-[#888]">No public videos in this project yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <a
                key={video._id}
                href={`/watch/${video.publicId}`}
                className="block border-2 border-[#1a1a1a] bg-[#f0f0e8] hover:bg-[#e8e8e0] transition-colors"
              >
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full aspect-video object-cover border-b-2 border-[#1a1a1a]"
                  />
                ) : (
                  <div className="w-full aspect-video bg-[#1a1a1a] flex items-center justify-center border-b-2 border-[#1a1a1a]">
                    <Video className="h-8 w-8 text-[#888]" />
                  </div>
                )}
                <div className="p-3 space-y-1">
                  <h3 className="font-bold text-sm text-[#1a1a1a] truncate">{video.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-[#888]">
                    {video.duration && (
                      <span className="font-mono">{formatDuration(video.duration)}</span>
                    )}
                    {video.commentCount > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {video.commentCount}
                      </span>
                    )}
                    {video.workflowStatus && (
                      <VideoWorkflowStatusControl
                        status={video.workflowStatus}
                        onChange={() => {}}
                        disabled
                      />
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
