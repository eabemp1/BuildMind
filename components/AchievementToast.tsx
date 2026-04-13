"use client";

/**
 * components/AchievementToast.tsx
 *
 * Duolingo × Free Fire styled badge unlock notification.
 * Shows a dramatic drop animation when a new badge is earned.
 */

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getUnlocked, markAchievementSeen, ACHIEVEMENTS, RARITY_COLORS, RARITY_LABELS,
  type Achievement, type UnlockedAchievement,
} from "@/lib/achievements";

interface ToastItem {
  achievement: Achievement;
  record: UnlockedAchievement;
}

export default function AchievementToast() {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [current, setCurrent] = useState<ToastItem | null>(null);

  const advance = useCallback(() => {
    setQueue(prev => {
      if (prev.length === 0) { setCurrent(null); return prev; }
      const [next, ...rest] = prev;
      setCurrent(next);
      return rest;
    });
  }, []);

  // Poll for unseen achievements every 4 seconds
  useEffect(() => {
    const check = () => {
      const unlocked = getUnlocked().filter(u => !u.seen);
      if (unlocked.length === 0) return;
      const items: ToastItem[] = unlocked.flatMap(record => {
        const achievement = ACHIEVEMENTS.find(a => a.id === record.id);
        return achievement ? [{ achievement, record }] : [];
      });
      if (items.length === 0) return;
      // Mark seen immediately to avoid duplicates
      items.forEach(item => markAchievementSeen(item.record.id));
      setQueue(prev => [...prev, ...items]);
    };
    check();
    const interval = setInterval(check, 4000);
    return () => clearInterval(interval);
  }, []);

  // When queue gets items and nothing is showing, show first
  useEffect(() => {
    if (!current && queue.length > 0) advance();
  }, [queue, current, advance]);

  if (!current) return null;

  const colors = RARITY_COLORS[current.achievement.rarity];
  const isLegendary = current.achievement.rarity === "legendary";
  const isEpic      = current.achievement.rarity === "epic";

  return (
    <AnimatePresence>
      <motion.div
        key={current.achievement.id}
        initial={{ opacity: 0, y: -80, scale: 0.7, rotateX: -30 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
        exit={{ opacity: 0, y: -60, scale: 0.85 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
        style={{
          position: "fixed",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          pointerEvents: "auto",
          fontFamily: "system-ui, sans-serif",
        }}
        onClick={() => { setCurrent(null); setTimeout(advance, 300); }}
      >
        {/* Legendary particle burst */}
        {(isLegendary || isEpic) && (
          <div style={{ position: "absolute", inset: -30, pointerEvents: "none", overflow: "visible" }}>
            {[...Array(isLegendary ? 12 : 6)].map((_, i) => (
              <motion.div
                key={i}
                style={{
                  position: "absolute",
                  top: "50%", left: "50%",
                  width: isLegendary ? 5 : 3,
                  height: isLegendary ? 5 : 3,
                  borderRadius: "50%",
                  background: colors.text,
                }}
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{
                  opacity: 0,
                  x: Math.cos((i / (isLegendary ? 12 : 6)) * Math.PI * 2) * 60,
                  y: Math.sin((i / (isLegendary ? 12 : 6)) * Math.PI * 2) * 60,
                  scale: 0,
                }}
                transition={{ duration: 0.8, delay: 0.15 }}
              />
            ))}
          </div>
        )}

        <div style={{
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          borderRadius: 16,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          minWidth: 280,
          maxWidth: 360,
          boxShadow: `0 8px 32px ${colors.glow}, 0 2px 8px rgba(0,0,0,0.5)`,
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
        }}>
          {/* Shimmer line for legendary */}
          {isLegendary && (
            <motion.div
              style={{
                position: "absolute", top: 0, left: "-100%", right: 0, height: 2,
                background: `linear-gradient(90deg, transparent, ${colors.text}, transparent)`,
              }}
              animate={{ left: ["−100%", "200%"] }}
              transition={{ duration: 1.5, delay: 0.3, repeat: 2 }}
            />
          )}

          {/* Badge icon */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
            style={{
              width: 52, height: 52, borderRadius: 12,
              background: `${colors.border}55`,
              border: `1.5px solid ${colors.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, flexShrink: 0,
              boxShadow: `0 0 14px ${colors.glow}`,
            }}
          >
            {current.achievement.emoji}
          </motion.div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: colors.text, marginBottom: 3 }}>
              🏆 Achievement Unlocked · {RARITY_LABELS[current.achievement.rarity]}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 2, lineHeight: 1.2 }}>
              {current.achievement.label}
            </div>
            <div style={{ fontSize: 11, color: "#a0a0a0", lineHeight: 1.4 }}>
              {current.achievement.description}
            </div>
            <div style={{ fontSize: 10, color: colors.text, marginTop: 4, fontWeight: 500 }}>
              +{current.achievement.xp} XP
            </div>
          </div>

          {/* Dismiss hint */}
          <div style={{ fontSize: 9, color: "#444", flexShrink: 0 }}>tap to close</div>
        </div>

        {/* Auto-dismiss after 5s */}
        <motion.div
          style={{ position: "absolute", bottom: 0, left: 0, height: 2, background: colors.text, borderRadius: "0 0 16px 16px" }}
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: 5, ease: "linear" }}
          onAnimationComplete={() => { setCurrent(null); setTimeout(advance, 300); }}
        />
      </motion.div>
    </AnimatePresence>
  );
}
