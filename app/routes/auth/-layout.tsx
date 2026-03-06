import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f0f0e8] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#6b7280]">
            Restricted Access
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default AuthShell;
