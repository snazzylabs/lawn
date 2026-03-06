import { useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";
import { useAuthState } from "@/lib/auth";

export default function Homepage() {
  const { isLoading, isAuthenticated } = useAuthState();
  const teams = useQuery(api.teams.list, isAuthenticated ? {} : "skip");
  const isCheckingMembership = isAuthenticated && teams === undefined;
  const hasMembership = (teams?.length ?? 0) > 0;

  useEffect(() => {
    if (isLoading || !isAuthenticated || teams === undefined) return;
    if (teams.length > 0 && typeof window !== "undefined") {
      window.location.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, teams]);

  return (
    <main className="min-h-screen bg-[#f0f0e8] px-6 flex items-center justify-center">
      <section className="w-full max-w-md border border-[#1a1a1a]/20 bg-white/75 px-8 py-10 text-center">
        <p className="text-[11px] uppercase tracking-[0.25em] text-[#6b7280]">
          Restricted Access
        </p>
        <h1 className="mt-3 text-xl font-semibold text-[#111827]">Workspace</h1>
        <p className="mt-3 text-sm text-[#6b7280]">
          OAuth login for Snazzy Labs team members only.
        </p>

        {isLoading || isCheckingMembership ? (
          <p className="mt-8 text-sm text-[#6b7280]">Checking access...</p>
        ) : hasMembership ? (
          <p className="mt-8 text-sm text-[#6b7280]">Redirecting...</p>
        ) : isAuthenticated ? (
          <div className="mt-8 space-y-3">
            <p className="text-sm text-[#374151]">
              This account is not currently provisioned.
            </p>
            <a
              href="mailto:videos@snazzylabs.com"
              className="text-sm font-semibold text-[#111827] underline underline-offset-4"
            >
              Request access
            </a>
          </div>
        ) : (
          <Link
            to="/sign-in"
            preload="intent"
            className="mt-8 inline-flex items-center justify-center border border-[#1f2937] px-5 py-2.5 text-sm font-semibold text-[#111827] transition-colors hover:bg-[#f3f4f6]"
          >
            Continue with OAuth
          </Link>
        )}
      </section>
    </main>
  );
}
