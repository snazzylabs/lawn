"use client";

import { useEffect } from "react";

type ConfettiBurstProps = {
  triggerKey: number;
  durationMs?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
};

const COLORS = [
  "#2F6DB4",
  "#4DA7F8",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
];

export function ConfettiBurst({
  triggerKey,
  durationMs = 1800,
}: ConfettiBurstProps) {
  useEffect(() => {
    if (!triggerKey || typeof window === "undefined") return;

    const canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
    document.body.appendChild(canvas);

    const context = canvas.getContext("2d");
    if (!context) {
      document.body.removeChild(canvas);
      return;
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const centerX = canvas.width / 2;
    const startY = Math.max(80, canvas.height * 0.18);
    const particles: Particle[] = Array.from({ length: 160 }, () => {
      const angle = (Math.random() * Math.PI) - Math.PI / 2;
      const speed = 4 + Math.random() * 8;
      return {
        x: centerX + (Math.random() - 0.5) * 120,
        y: startY + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
        vy: Math.sin(angle) * speed - (Math.random() * 2),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.25,
        size: 4 + Math.random() * 7,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? COLORS[0],
      };
    });

    const gravity = 0.18;
    const drag = 0.992;
    const startedAt = performance.now();
    let rafId: number | null = null;

    const draw = (now: number) => {
      const elapsed = now - startedAt;
      const fade = Math.max(0, 1 - elapsed / durationMs);
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const particle of particles) {
        particle.vx *= drag;
        particle.vy = particle.vy * drag + gravity;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.rotationSpeed;

        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.globalAlpha = fade;
        context.fillStyle = particle.color;
        context.fillRect(
          -particle.size / 2,
          -particle.size / 3,
          particle.size,
          particle.size * 0.66,
        );
        context.restore();
      }

      if (elapsed < durationMs) {
        rafId = window.requestAnimationFrame(draw);
        return;
      }

      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", resize);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };

    rafId = window.requestAnimationFrame(draw);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", resize);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [durationMs, triggerKey]);

  return null;
}
