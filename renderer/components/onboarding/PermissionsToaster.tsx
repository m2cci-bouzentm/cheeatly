import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Monitor, Mic, Settings, RotateCw } from 'lucide-react';
import cheatlyIcon from '../../../assets/icon.png';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { markPermsToasterSeen } from '../../lib/firstRunFlags';

const STARTUP_DELAY_MS = 1_200;

type PermStatus =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'loading';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
}

const SPRING = {
  type: 'spring' as const,
  stiffness: 180,
  damping: 22,
  mass: 0.9,
};
const FADE = {
  enter: { opacity: 0, y: 12 },
  in: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97 },
};

export const PermissionsToaster: React.FC<Props> = ({ isOpen, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<string>('darwin');
  const [micStatus, setMicStatus] = useState<PermStatus>('loading');
  const [scrStatus, setScrStatus] = useState<PermStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const reduced = useReducedMotion() ?? false;

  const isLight = false;

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    try {
      const p = await window.electronAPI.checkPermissions();
      if (p) {
        setPlatform(p.platform);
        setMicStatus(p.microphone as PermStatus);
        setScrStatus(p.screen as PermStatus);
      }
    } catch {
      setMicStatus('not-determined');
      setScrStatus('not-determined');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // No polling: macOS permission state only refreshes on user action.
  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      return;
    }
    const t = setTimeout(async () => {
      await refreshStatus();
      setVisible(true);
    }, STARTUP_DELAY_MS);
    return () => clearTimeout(t);
  }, [isOpen, refreshStatus]);

  const openSystemSettings = () => {
    if (platform !== 'darwin') return;
    window.electronAPI.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    );
  };

  const handleDismiss = () => {
    markPermsToasterSeen();
    onDismiss();
  };

  const allGranted =
    platform === 'darwin'
      ? micStatus === 'granted' && scrStatus === 'granted'
      : micStatus === 'granted';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="perm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`fixed inset-0 z-[9998] flex items-center justify-center backdrop-blur-[16px] ${
            isLight ? 'bg-white/45' : 'bg-black/60'
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismiss();
          }}
        >
          <motion.div
            key="perm-card"
            initial={
              reduced
                ? FADE.enter
                : { opacity: 0, scale: 0.95, y: 16, filter: 'blur(12px)' }
            }
            animate={
              reduced
                ? FADE.in
                : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
            }
            exit={
              reduced
                ? FADE.exit
                : { opacity: 0, scale: 0.97, y: 8, filter: 'blur(4px)' }
            }
            transition={SPRING}
          >
            <Card
              className="w-[480px] max-w-[92vw] rounded-[20px] overflow-hidden border-0 p-7 relative font-['-apple-system',BlinkMacSystemFont,'SF_Pro_Display',system-ui,sans-serif]"
              style={{
                background: isLight
                  ? 'linear-gradient(160deg, #FFFFFF 0%, #FAFAFC 100%)'
                  : 'linear-gradient(160deg, rgba(24,24,32,0.98) 0%, rgba(16,16,22,0.99) 100%)',
                boxShadow: isLight
                  ? '0 32px 80px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.12)'
                  : '0 40px 100px rgba(0,0,0,0.9), 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              {/* Close */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleDismiss}
                aria-label="Dismiss"
                className={`absolute top-4 right-4 z-10 w-[26px] h-[26px] rounded-full bg-transparent border-none opacity-40 hover:opacity-80 transition-opacity ${
                  isLight ? 'hover:bg-black/[0.06]' : 'hover:bg-white/[0.08]'
                }`}
              >
                <X
                  size={12}
                  strokeWidth={2.5}
                  className={isLight ? 'text-black' : 'text-white'}
                />
              </Button>

              {/* Header */}
              <div className="flex items-center gap-2 mb-5">
                <img
                  src={cheatlyIcon}
                  alt=""
                  className="w-[18px] h-[18px] rounded-sm shrink-0"
                />
                <span className="text-xs font-semibold tracking-[0.1em] uppercase text-text-tertiary">
                  Permissions
                </span>
              </div>

              <h2 className="text-[22px] font-bold tracking-[-0.03em] text-text-primary mb-1.5 leading-[1.2]">
                {platform === 'darwin'
                  ? 'Two permissions needed'
                  : 'Microphone permission needed'}
              </h2>
              <p className="text-sm leading-[1.6] text-text-tertiary mb-6">
                macOS only lets you grant them in{' '}
                <strong className="font-semibold text-text-secondary">
                  System Settings
                </strong>
                . This card shows where you stand. Click Refresh after granting.
              </p>

              {/* Status rows */}
              <div className="flex flex-col gap-2.5">
                {platform === 'darwin' && (
                  <PermStatusRow
                    icon={Monitor}
                    label="Screen Recording"
                    description="Captures meeting audio from other apps"
                    status={scrStatus}
                    isLight={isLight}
                  />
                )}
                <PermStatusRow
                  icon={Mic}
                  label="Microphone"
                  description="Transcribes your own voice"
                  status={micStatus}
                  isLight={isLight}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 mt-5">
                <motion.button
                  onClick={allGranted ? handleDismiss : openSystemSettings}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex-1 h-[46px] flex items-center justify-center gap-2 px-5 rounded-[11px] border-none cursor-pointer text-sm font-semibold text-white tracking-[-0.01em] relative overflow-hidden font-['-apple-system',BlinkMacSystemFont,'SF_Pro_Display',system-ui,sans-serif] ${
                    allGranted
                      ? 'bg-[linear-gradient(160deg,#34D399_0%,#10B981_60%,#0a9e6e_100%)] shadow-[0_8px_24px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(255,255,255,0.2)]'
                      : 'bg-[linear-gradient(160deg,#5B8EF0_0%,#3B6FE8_50%,#2D5FD4_100%)] shadow-[0_8px_24px_rgba(37,99,235,0.35),inset_0_1px_0_rgba(255,255,255,0.2)]'
                  }`}
                >
                  <span className="absolute top-[2px] left-2 right-2 h-[40%] rounded-full bg-[linear-gradient(to_bottom,rgba(255,255,255,0.7),rgba(255,255,255,0.05))] blur-[0.5px] pointer-events-none z-[1]" />
                  <span className="relative z-[2] flex items-center gap-2">
                    <Settings size={14} strokeWidth={2} />
                    {allGranted ? "You're all set" : 'Open System Settings'}
                  </span>
                </motion.button>

                <motion.button
                  onClick={refreshStatus}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  title="Re-check permission status"
                  className={`h-[46px] px-4 flex items-center justify-center gap-2 rounded-[11px] cursor-pointer text-sm font-semibold tracking-[-0.01em] border font-['-apple-system',BlinkMacSystemFont,'SF_Pro_Display',system-ui,sans-serif] ${
                    isLight
                      ? 'bg-black/[0.04] border-black/[0.08] text-text-primary hover:bg-black/[0.07]'
                      : 'bg-white/[0.06] border-white/[0.1] text-white hover:bg-white/[0.1]'
                  }`}
                >
                  <RotateCw
                    size={14}
                    strokeWidth={2}
                    className={refreshing ? 'animate-spin' : ''}
                  />
                  Refresh
                </motion.button>
              </div>

              <p className="text-[11px] leading-[1.5] text-text-tertiary text-center mt-3.5 mb-0 opacity-80">
                System Settings &rarr; Privacy &amp; Security &rarr; Screen
                Recording / Microphone
              </p>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// One permission status row. Read-only by design: the badge reflects the
// last check, nothing here mutates OS state.
function PermStatusRow({
  icon: Icon,
  label,
  description,
  status,
  isLight,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  status: PermStatus;
  isLight: boolean;
}) {
  const granted = status === 'granted';
  const loading = status === 'loading';

  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-3.5 rounded-[14px] border transition-colors duration-300 ${
        granted
          ? 'border-emerald-400/25 bg-emerald-400/[0.05]'
          : isLight
            ? 'border-black/[0.08] bg-black/[0.03]'
            : 'border-white/[0.07] bg-white/[0.04]'
      }`}
    >
      <div
        className={`w-[38px] h-[38px] rounded-[10px] shrink-0 flex items-center justify-center transition-colors duration-300 ${
          granted
            ? 'bg-emerald-400/[0.12] text-emerald-400'
            : 'bg-blue-500/[0.12] text-blue-400'
        }`}
      >
        <Icon size={18} strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary">{label}</div>
        <div className="text-xs text-text-tertiary mt-0.5">{description}</div>
      </div>

      {loading ? (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-[5px] rounded-full text-[11.5px] font-semibold whitespace-nowrap border ${
            isLight
              ? 'bg-black/[0.04] text-black/40 border-black/[0.08]'
              : 'bg-white/[0.06] text-white/40 border-white/[0.1]'
          }`}
        >
          Checking…
        </span>
      ) : granted ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-[5px] rounded-full text-[11.5px] font-semibold whitespace-nowrap bg-emerald-400/[0.12] text-emerald-400 border border-emerald-400/25">
          <span className="w-[7px] h-[7px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
          Granted
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-3 py-[5px] rounded-full text-[11.5px] font-semibold whitespace-nowrap bg-amber-400/[0.1] text-amber-400 border border-amber-400/25">
          <span className="w-[7px] h-[7px] rounded-full bg-amber-400 animate-pulse" />
          Not granted
        </span>
      )}
    </div>
  );
}
