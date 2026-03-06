import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Link, useParams } from "@tanstack/react-router";
import { formatDuration } from "@/lib/utils";
import { VideoWorkflowStatusControl } from "@/components/videos/VideoWorkflowStatusControl";
import { MessageSquare, Video } from "lucide-react";

export default function ProjectPublicPage() {
  const params = useParams({ strict: false });
  const publicId = params.publicId as string;

  const data = useQuery(api.projects.getByPublicId, { publicId });

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
          <p className="text-lg font-black text-[#1a1a1a]">Project not found</p>
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
              <Link
                key={video._id}
                to="/watch/$publicId"
                params={{ publicId: video.publicId } as any}
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
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
