import React, { useState, useEffect } from 'react';
import {
  MoreHorizontal,
  RefreshCw,
  Ghost,
  Trash2,
  Download,
} from 'lucide-react';
import { generateMeetingPDF } from '../../utils/pdfGenerator';
import { formatGroupLabel, formatMeetingTime } from '../../utils/dateUtils';
import icon from '../../components/icon.png';
import MeetingDetails from '../MeetingDetails';
import { motion, AnimatePresence } from 'framer-motion';
import { analytics } from '../../lib/analytics/analytics.service';
import { useShortcuts } from '../../hooks/useShortcuts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import LauncherHeader from './components/LauncherHeader';
import type { Meeting, MeetingsProps } from './types';

const Meetings: React.FC<MeetingsProps> = ({
  onStartMeeting,
  onOpenSettings,
  onPageChange,
}) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isDetectable, setIsDetectable] = useState(false);
  const [isMeetingActive, setIsMeetingActive] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  const fetchMeetings = () => {
    window.electronAPI
      .getRecentMeetings()
      .then(setMeetings)
      .catch((err) => console.error('Failed to fetch meetings:', err));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    analytics.trackCommandExecuted('refresh_meetings');
    try {
      setShowNotification(true);
      fetchMeetings();
      setTimeout(() => {
        setShowNotification(false);
      }, 3000);
    } catch (e) {
      console.error('Refresh failed in handleRefresh:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const { isShortcutPressed } = useShortcuts();
  const isLight = false;
  useEffect(() => {
    let mounted = true;
    console.log('Launcher mounted');

    window.electronAPI.getUndetectable().then((undetectable) => {
      if (mounted) setIsDetectable(!undetectable);
    });

    let removeUndetectableListener: (() => void) | undefined;
    removeUndetectableListener = window.electronAPI.onUndetectableChanged(
      (undetectable) => {
        setIsDetectable(!undetectable);
      }
    );

    fetchMeetings();

    // Guard async state sync so unmounted launchers are not written to.
    window.electronAPI
      .getMeetingActive()
      .then((active) => {
        if (mounted) setIsMeetingActive(active);
      })
      .catch(() => {});

    let removeMeetingStateListener: (() => void) | undefined;
    removeMeetingStateListener = window.electronAPI.onMeetingStateChanged(
      ({ isActive }) => {
        setIsMeetingActive(isActive);
      }
    );

    const removeMeetingsListener = window.electronAPI.onMeetingsUpdated(() => {
      console.log('Received meetings-updated event');
      fetchMeetings();
    });

    return () => {
      mounted = false;
      if (removeMeetingsListener) removeMeetingsListener();
      if (removeUndetectableListener) removeUndetectableListener();
      if (removeMeetingStateListener) removeMeetingStateListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only: stable setup that must run exactly once

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutPressed(e, 'toggleVisibility')) {
        e.preventDefault();
        window.electronAPI.toggleWindow();
        return;
      }
      if (isShortcutPressed(e, 'moveWindowUp')) {
        e.preventDefault();
        window.electronAPI.moveWindowUp();
        return;
      }
      if (isShortcutPressed(e, 'moveWindowDown')) {
        e.preventDefault();
        window.electronAPI.moveWindowDown();
        return;
      }
      if (isShortcutPressed(e, 'moveWindowLeft')) {
        e.preventDefault();
        window.electronAPI.moveWindowLeft();
        return;
      }
      if (isShortcutPressed(e, 'moveWindowRight')) {
        e.preventDefault();
        window.electronAPI.moveWindowRight();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isShortcutPressed]);

  const toggleDetectable = () => {
    const newState = !isDetectable;
    setIsDetectable(newState);
    window.electronAPI.setUndetectable(!newState);
    analytics.trackModeSelected(newState ? 'launcher' : 'undetectable');
  };

  const groupedMeetings = meetings.reduce(
    (acc, meeting) => {
      const label = formatGroupLabel(meeting.date);
      if (!acc[label]) acc[label] = [];
      acc[label].push(meeting);
      return acc;
    },
    {} as Record<string, Meeting[]>
  );

  // Date labels are strings, so sort known relative labels before parsed dates.
  const sortedGroups = Object.keys(groupedMeetings).sort((a, b) => {
    if (a === 'Today') return -1;
    if (b === 'Today') return 1;
    if (a === 'Yesterday') return -1;
    if (b === 'Yesterday') return 1;
    return new Date(b).getTime() - new Date(a).getTime();
  });

  const [forwardMeeting, setForwardMeeting] = useState<Meeting | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuEntered, setMenuEntered] = useState(false);

  useEffect(() => {
    setMenuEntered(false);
  }, [activeMenuId]);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (onPageChange) {
      onPageChange(!selectedMeeting);
    }
  }, [selectedMeeting, onPageChange]);

  const handleOpenMeeting = async (meeting: Meeting) => {
    setForwardMeeting(null);
    console.log('[Launcher] Opening meeting:', meeting.id);
    analytics.trackCommandExecuted('open_meeting_details');

    try {
      console.log('[Launcher] Fetching full meeting details...');
      const fullMeeting = await window.electronAPI.getMeetingDetails(
        meeting.id
      );
      console.log('[Launcher] Got meeting details:', fullMeeting);
      console.log(
        '[Launcher] Transcript count:',
        fullMeeting?.transcript?.length
      );
      if (fullMeeting) {
        setSelectedMeeting(fullMeeting);
        return;
      }
    } catch (err) {
      console.error('[Launcher] Failed to fetch meeting details:', err);
    }
    setSelectedMeeting(meeting);
  };

  const handleBack = () => {
    setForwardMeeting(selectedMeeting);
    setSelectedMeeting(null);
  };

  const handleForward = () => {
    if (forwardMeeting) {
      setSelectedMeeting(forwardMeeting);
      setForwardMeeting(null);
    }
  };

  const formatDurationPill = (durationStr: string) => {
    if (!durationStr) return '00:00';

    if (durationStr.includes(':')) {
      const parts = durationStr.split(':');
      const mins = parts[0];
      const secs = parts[1] || '00';

      const formattedMins = mins.length >= 3 ? mins : mins.padStart(2, '0');
      return `${formattedMins}:${secs}`;
    }

    const minutes = parseInt(durationStr.replace('min', '').trim()) || 0;
    const mm = minutes.toString().padStart(2, '0');
    return `${mm}:00`;
  };

  return (
    <div className="h-full w-full flex flex-col bg-bg-primary text-text-primary font-sans overflow-hidden selection:bg-accent-secondary/30">
      <LauncherHeader
        isLight={isLight}
        selectedMeeting={selectedMeeting}
        forwardMeeting={forwardMeeting}
        handleBack={handleBack}
        handleForward={handleForward}
        onOpenSettings={onOpenSettings}
      />

      <div className="relative flex-1 flex flex-col overflow-hidden">
        {!isDetectable && (
          <div
            className={`absolute inset-1 border-2 border-dashed rounded-2xl pointer-events-none z-[100] ${isLight ? 'border-black/15' : 'border-white/20'}`}
          />
        )}
        <AnimatePresence mode="wait">
          {selectedMeeting ? (
            <motion.div
              key="details"
              className="flex-1 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MeetingDetails
                meeting={selectedMeeting}
                onBack={handleBack}
                onOpenSettings={onOpenSettings}
              />
            </motion.div>
          ) : (
            <motion.div
              key="launcher"
              className="flex-1 flex flex-col overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <section
                className={`${isLight ? 'bg-bg-secondary' : 'bg-bg-elevated'} px-6 pt-5 pb-6 border-b border-border-subtle shrink-0`}
              >
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h1 className="text-2xl font-celeb-light font-medium text-text-primary tracking-wide drop-shadow-sm">
                        My Cheatly
                      </h1>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={`rounded-lg text-text-secondary hover:text-text-primary transition-colors ${isRefreshing ? 'animate-spin text-blue-400' : ''} ${isLight ? 'hover:bg-black/8' : 'hover:bg-white/10'}`}
                        title="Refresh State"
                      >
                        <RefreshCw size={16} />
                      </Button>

                      <Card
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1 min-w-[130px] transition-colors ${isLight ? 'bg-bg-elevated border-border-muted shadow-sm' : 'bg-bg-primary border-border-muted'}`}
                      >
                        {isDetectable ? (
                          <Ghost
                            size={14}
                            strokeWidth={2}
                            className="text-text-secondary transition-colors"
                          />
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="transition-colors"
                          >
                            <path
                              d="M12 2C7.58172 2 4 5.58172 4 10V22L7 19L9.5 21.5L12 19L14.5 21.5L17 19L20 22V10C20 5.58172 16.4183 2 12 2Z"
                              fill={isLight ? '#48484A' : 'white'}
                            />
                            <circle
                              cx="9"
                              cy="10"
                              r="1.5"
                              fill={isLight ? 'white' : 'black'}
                            />
                            <circle
                              cx="15"
                              cy="10"
                              r="1.5"
                              fill={isLight ? 'white' : 'black'}
                            />
                          </svg>
                        )}
                        <span className="text-xs font-medium flex-1 transition-colors text-text-secondary">
                          {isDetectable ? 'Detectable' : 'Undetectable'}
                        </span>
                        <div
                          className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${!isDetectable ? 'bg-accent-primary' : 'bg-bg-toggle-switch'}`}
                          onClick={toggleDetectable}
                        >
                          <div
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${!isDetectable ? 'left-[18px]' : 'left-0.5'}`}
                          />
                        </div>
                      </Card>
                    </div>
                    <div className="flex-1 mx-4" />

                    <motion.button
                      onClick={() => {
                        if (isMeetingActive) {
                          // setWindowMode restores overlay mode without stealing foreground focus.
                          window.electronAPI.setWindowMode('overlay', true);
                          analytics.trackCommandExecuted(
                            'resume_meeting_from_launcher'
                          );
                          return;
                        }
                        onStartMeeting();
                        analytics.trackCommandExecuted('start_cheatly_cta');
                      }}
                      whileHover={{ scale: 1.01, filter: 'brightness(1.1)' }}
                      whileTap={{ scale: 0.99 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="group relative overflow-hidden text-white px-5 py-2.5 rounded-lg font-celeb font-medium tracking-normal flex items-center justify-center gap-2.5 backdrop-blur-xl shrink-0"
                      style={{
                        boxShadow: isMeetingActive
                          ? 'inset 0 1px 1px rgba(255,255,255,0.7), inset 0 -1px 2px rgba(0,0,0,0.1), 0 2px 10px rgba(16,185,129,0.45), 0 0 0 1px rgba(255,255,255,0.15)'
                          : 'inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -1px 2px rgba(0,0,0,0.35), 0 2px 10px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.12)',
                        transition: 'box-shadow 0.5s ease-out',
                      }}
                    >
                      <div
                        className={`absolute inset-0 bg-gradient-to-b from-zinc-800 via-zinc-900 to-black transition-opacity duration-500 ease-out ${isMeetingActive ? 'opacity-0' : 'opacity-100'}`}
                      />
                      <div
                        className={`absolute inset-0 bg-gradient-to-b from-emerald-400 via-emerald-500 to-green-600 transition-opacity duration-500 ease-out ${isMeetingActive ? 'opacity-100' : 'opacity-0'}`}
                      />

                      <div className="absolute inset-x-3 top-0 h-[40%] bg-gradient-to-b from-white/40 to-transparent blur-[2px] rounded-b-lg opacity-80 pointer-events-none z-10" />
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-10" />

                      <div className="relative z-20 flex items-center gap-2.5">
                        <AnimatePresence mode="wait" initial={false}>
                          {isMeetingActive ? (
                            <motion.div
                              key="meeting"
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: 0.22, ease: 'easeOut' }}
                              className="flex items-center gap-2.5"
                            >
                              <span className="relative flex h-[8px] w-[8px] shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                                <span className="relative inline-flex rounded-full h-[8px] w-[8px] bg-white" />
                              </span>
                              <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)] text-lg leading-none">
                                Stop Cheatly
                              </span>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="start"
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: 0.22, ease: 'easeOut' }}
                              className="flex items-center gap-2.5"
                            >
                              <img
                                src={icon}
                                alt="Logo"
                                className="w-[18px] h-[18px] object-contain opacity-90"
                              />
                              <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)] text-lg leading-none">
                                Start Cheatly
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.button>
                  </div>
                </div>
              </section>

              <main className="flex-1 overflow-y-auto custom-scrollbar bg-bg-primary">
                <section className="px-6 py-5 min-h-full">
                  <div className="max-w-4xl mx-auto space-y-8">
                    {sortedGroups.map((label) => (
                      <section key={label}>
                        <h3 className="text-base font-medium text-text-secondary mb-3 pl-1">
                          {label}
                        </h3>
                        <div className="space-y-1">
                          {groupedMeetings[label].map((m) => (
                            <motion.div
                              key={m.id}
                              layoutId={`meeting-${m.id}`}
                              className="group relative flex items-center justify-between px-3 py-2 rounded-lg bg-transparent hover:bg-bg-elevated transition-colors"
                              onClick={() => handleOpenMeeting(m)}
                            >
                              <div
                                className={`font-medium text-sm max-w-[60%] truncate ${m.summaryStatus === 'pending' ? 'text-blue-400 italic animate-pulse' : 'text-text-primary'}`}
                              >
                                {m.title}
                              </div>

                              <div className="flex items-center gap-4">
                                {m.summaryStatus === 'pending' ? (
                                  <div className="flex items-center gap-2 transition-all duration-200 ease-out group-hover:opacity-0 group-hover:translate-x-2 delayed-hover-exit">
                                    <RefreshCw
                                      size={12}
                                      className="animate-spin text-blue-500"
                                    />
                                    <span className="text-xs text-blue-500 font-medium">
                                      Summarizing…
                                    </span>
                                  </div>
                                ) : m.summaryStatus === 'failed' ? (
                                  // Slide left on hover: the ⋯ menu fades in absolutely at
                                  // right-3 and would land on top of the retry button.
                                  <div className="flex items-center gap-2 transition-transform duration-200 ease-out group-hover:-translate-x-8">
                                    <span className="text-xs text-red-400 font-medium">
                                      Summary failed
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full"
                                      title="Retry summary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.electronAPI.retryMeetingSummary(
                                          m.id
                                        );
                                      }}
                                    >
                                      <RefreshCw size={12} />
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="relative z-10 bg-bg-elevated text-text-secondary text-xxs px-1.5 py-0.5 rounded-full font-medium min-w-[35px] text-center tracking-wide">
                                      {formatDurationPill(m.duration)}
                                    </span>

                                    <span className="text-base text-text-secondary font-medium min-w-[60px] text-right transition-all duration-200 ease-out group-hover:opacity-0 group-hover:translate-x-2 delayed-hover-exit">
                                      {formatMeetingTime(m.date)}
                                    </span>
                                  </>
                                )}
                              </div>

                              <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 translate-x-4 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-x-0">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(
                                      activeMenuId === m.id ? null : m.id
                                    );
                                  }}
                                >
                                  <MoreHorizontal size={16} />
                                </Button>
                              </div>

                              <AnimatePresence>
                                {activeMenuId === m.id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                    transition={{ duration: 0.1 }}
                                    className={`absolute right-0 top-full mt-1 w-[90px] backdrop-blur-xl rounded-lg z-50 overflow-hidden border ${isLight ? 'bg-bg-elevated border-border-muted shadow-glass-md' : 'bg-bg-elevated/80 border-border-subtle shadow-glass-lg'}`}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseEnter={() => setMenuEntered(true)}
                                    onMouseLeave={() => {
                                      if (menuEntered) setActiveMenuId(null);
                                    }}
                                  >
                                    <div className="p-1 flex flex-col gap-0.5">
                                      <Button
                                        variant="ghost"
                                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary rounded-lg transition-colors text-left justify-start h-auto ${isLight ? 'hover:bg-bg-item-surface' : 'hover:bg-white/10'}`}
                                        onClick={async () => {
                                          setActiveMenuId(null);
                                          analytics.trackPdfExported();
                                          try {
                                            const fullMeeting =
                                              await window.electronAPI.getMeetingDetails(
                                                m.id
                                              );
                                            if (fullMeeting) {
                                              generateMeetingPDF(fullMeeting);
                                              return;
                                            }
                                          } catch (e) {
                                            console.error(
                                              'Failed to fetch details for PDF',
                                              e
                                            );
                                            generateMeetingPDF(m);
                                            return;
                                          }
                                          generateMeetingPDF(m);
                                        }}
                                      >
                                        <Download size={13} />
                                        Export
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors text-left justify-start h-auto"
                                        onClick={async () => {
                                          const success =
                                            await window.electronAPI.deleteMeeting(
                                              m.id
                                            );
                                          if (success)
                                            setMeetings((prev) =>
                                              prev.filter(
                                                (meeting) => meeting.id !== m.id
                                              )
                                            );
                                          setActiveMenuId(null);
                                        }}
                                      >
                                        <Trash2 size={13} />
                                        Delete
                                      </Button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          ))}
                        </div>
                      </section>
                    ))}

                    {meetings.length === 0 && (
                      <div className="p-4 text-text-tertiary text-sm">
                        No recent meetings.
                      </div>
                    )}
                  </div>
                </section>
              </main>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ x: 300, opacity: 0, scale: 0.9 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 300, opacity: 0, scale: 0.95 }}
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 30,
              mass: 1,
            }}
            className={`fixed bottom-10 right-10 z-toast flex items-center gap-4 pl-4 pr-6 py-3.5 rounded-[18px] backdrop-blur-xl saturate-[180%] ring-1 ring-black/10 ${isLight ? 'bg-bg-elevated/90 border border-border-muted shadow-glass-lg' : 'bg-bg-elevated/40 border border-border-subtle shadow-glass-xl'}`}
          >
            <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-b from-blue-400/20 to-blue-600/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] border border-white/5">
              <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-md" />
              <RefreshCw
                size={15}
                className="text-blue-300 animate-[spin_2s_linear_infinite] drop-shadow-[0_0_5px_rgba(59,130,246,0.6)]"
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-text-primary leading-none tracking-tight">
                Refreshed
              </span>
              <span className="text-sm text-text-tertiary font-medium leading-none tracking-wide">
                Meetings updated
              </span>
            </div>

            <div className="absolute inset-0 rounded-[18px] bg-gradient-to-tr from-white/5 via-transparent to-transparent pointer-events-none" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Meetings;
