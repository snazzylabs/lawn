import { Link } from "@tanstack/react-router";
import { UserButton } from "@clerk/tanstack-react-start";
import { Bell, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeToggle";
import React from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { prewarmDashboardIndex } from "../../app/routes/dashboard/-index.data";
import { isSelfHosted } from "@/lib/selfHosted";
import { UserMenu } from "@/components/auth/UserMenu";
import { videoPath } from "@/lib/routes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ThemeToggleButton() {
  const { theme, toggleTheme, mounted } = useTheme();

  if (!mounted) return <div className="w-8 h-8" />;

  return (
    <button
      onClick={toggleTheme}
      className="w-8 h-8 flex items-center justify-center text-[#888] hover:text-[#1a1a1a] hover:bg-[#e8e8e0] transition-colors"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode (⌘⇧L)`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  );
}

function NotificationBell({ teamId, teamSlug }: { teamId: Id<"teams">; teamSlug: string }) {
  const notifications = useQuery(api.notifications.getUnread, { teamId });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const count = notifications?.length ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative w-8 h-8 flex items-center justify-center text-[#888] hover:text-[#1a1a1a] hover:bg-[#e8e8e0] transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-[#2F6DB4] text-white text-[10px] font-bold px-1">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        {count === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-[#888]">
            No new notifications
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#ccc]">
              <span className="text-xs font-bold text-[#888] uppercase tracking-wide">Notifications</span>
              <button
                onClick={() => markAllRead({ teamId })}
                className="text-xs text-[#2F6DB4] hover:underline"
              >
                Mark all read
              </button>
            </div>
            {notifications?.map((n) => (
              <DropdownMenuItem key={n._id} asChild>
                <Link
                  to={videoPath(teamSlug, n.projectId, n.videoId)}
                  onClick={() => markRead({ notificationId: n._id })}
                  className="flex flex-col items-start gap-1 px-3 py-2.5 cursor-pointer"
                >
                  <span className="text-sm leading-snug">{n.message}</span>
                  <span className="text-xs text-[#888] font-mono">
                    {formatTimeAgo(n.createdAt)}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type PathSegment = {
  label: React.ReactNode;
  href?: string;
  prewarmIntentHandlers?: ReturnType<typeof useRoutePrewarmIntent>;
};

export function DashboardHeader({
  children,
  paths = [],
  teamId,
  teamSlug,
}: {
  children?: React.ReactNode;
  paths?: PathSegment[];
  teamId?: Id<"teams">;
  teamSlug?: string;
}) {
  const convex = useConvex();
  const prewarmHomeIntentHandlers = useRoutePrewarmIntent(() =>
    prewarmDashboardIndex(convex),
  );

  return (
    <header className="flex-shrink-0 border-b-2 border-[#1a1a1a] bg-[#f0f0e8] grid grid-cols-[1fr_auto] sm:grid-cols-[auto_1fr_auto] items-center px-4 sm:px-6">
      {/* Breadcrumb */}
      <div className="flex items-center text-xl font-black tracking-tighter text-[#1a1a1a] min-w-0 h-11 sm:h-14">
        <Link
          to="/dashboard"
          preload="intent"
          className="hover:text-[#2F6DB4] transition-colors mr-2 flex-shrink-0"
          {...prewarmHomeIntentHandlers}
        >
          Snazzy Labs
        </Link>
        {paths.map((path, index) => {
          const isIntermediate = paths.length >= 2 && index < paths.length - 1;
          return (
          <div key={index} className={`${isIntermediate ? 'hidden sm:flex' : 'flex'} items-center min-w-0 flex-shrink`}>
            <span className="text-[#888] mr-2 flex-shrink-0">/</span>
            {path.href ? (
              <Link
                to={path.href}
                preload="intent"
                className="hover:text-[#2F6DB4] transition-colors truncate mr-2"
                {...path.prewarmIntentHandlers}
              >
                {path.label}
              </Link>
            ) : (
              <div className="truncate flex items-center gap-3">
                {path.label}
              </div>
            )}
          </div>
        );
        })}
      </div>

      {/* User controls — pinned top-right */}
      <div className="row-start-1 col-start-2 sm:col-start-3 flex items-center gap-4 pl-4 border-l-2 border-[#1a1a1a]/10 h-8">
        {teamId && teamSlug && <NotificationBell teamId={teamId} teamSlug={teamSlug} />}
        <ThemeToggleButton />
        {isSelfHosted ? (
          <UserMenu />
        ) : (
          <UserButton
            appearance={{
              variables: {
                colorText: "#1a1a1a",
                colorTextSecondary: "#888",
                colorBackground: "#f0f0e8",
              },
              elements: {
                avatarBox: "w-8 h-8 rounded-none border-2 border-[#1a1a1a]",
                userButtonPopoverCard: "bg-[#f0f0e8] border-2 border-[#1a1a1a] rounded-none shadow-[8px_8px_0px_0px_var(--shadow-color)]",
                userButtonPopoverActionButton: "!text-[#1a1a1a] hover:!bg-[#e8e8e0] rounded-none",
                userButtonPopoverActionButtonText: "!text-[#1a1a1a] hover:!text-[#1a1a1a] font-mono font-bold",
                userButtonPopoverActionButtonIcon: "!text-[#1a1a1a] hover:!text-[#1a1a1a]",
                userButtonPopoverFooter: "hidden",
              },
            }}
          />
        )}
      </div>

      {/* Children — second row on mobile, middle column on desktop */}
      {children && (
        <div className="col-span-full pb-2 sm:pb-0 sm:col-span-1 sm:col-start-2 sm:row-start-1 flex items-center gap-2 sm:gap-3 sm:justify-end sm:h-14 sm:pl-4 min-w-0">
          {children}
        </div>
      )}
    </header>
  );
}
