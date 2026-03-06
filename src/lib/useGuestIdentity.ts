"use client";

import { useState, useEffect, useCallback } from "react";

export interface GuestIdentity {
  guestId: string;
  name: string;
  company?: string;
}

const COOKIE_NAME = "lawn.guest";
const MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

function readCookie(): GuestIdentity | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
  } catch {
    return null;
  }
}

function writeCookie(identity: GuestIdentity) {
  const value = encodeURIComponent(JSON.stringify(identity));
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

export function useGuestIdentity() {
  const [guest, setGuest] = useState<GuestIdentity | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setGuest(readCookie());
    setIsReady(true);
  }, []);

  const setGuestIdentity = useCallback(
    (name: string, company?: string) => {
      const existing = readCookie();
      const identity: GuestIdentity = {
        guestId: existing?.guestId ?? crypto.randomUUID(),
        name,
        company: company || undefined,
      };
      writeCookie(identity);
      setGuest(identity);
    },
    [],
  );

  return { guest, setGuestIdentity, isReady };
}
