import React from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Settings,
  Search,
} from 'lucide-react';
import { isMac } from '../../../utils/platformUtils';
import WindowControls from './WindowControls';
import { Button } from '@/components/ui/button';
import type { Meeting } from '../types';

interface LauncherHeaderProps {
  isLight: boolean;
  selectedMeeting: Meeting | null;
  forwardMeeting: Meeting | null;
  handleBack: () => void;
  handleForward: () => void;
  onOpenSettings: (tab?: string) => void;
}

const LauncherHeader: React.FC<LauncherHeaderProps> = ({
  isLight,
  selectedMeeting,
  forwardMeeting,
  handleBack,
  handleForward,
  onOpenSettings,
}) => {
  return (
    <header
      className={`relative w-full h-[40px] shrink-0 flex items-center justify-between px-2 drag-region select-none ${isLight ? 'bg-bg-primary' : 'bg-[#0a0a0a]'} border-b border-white/5 z-[200]`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isMac && <div className="w-[70px] shrink-0" />}

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={selectedMeeting ? handleBack : undefined}
            disabled={!selectedMeeting}
            className={
              selectedMeeting
                ? 'text-white/60 hover:text-white'
                : 'text-white/20'
            }
          >
            <ArrowLeft size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleForward}
            disabled={!forwardMeeting}
            className={
              forwardMeeting ? 'text-white/60 hover:text-white' : 'text-white/0'
            }
          >
            <ArrowRight size={14} />
          </Button>
        </div>

        <div className="relative flex-1 max-w-[320px] mx-2 group no-drag">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 group-focus-within:text-white/40 transition-colors" />
          <input
            type="text"
            placeholder="Type / to search"
            className="w-full h-7 bg-white/5 border border-white/10 rounded-lg pl-8 pr-10 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/20">
            /
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 no-drag">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onOpenSettings()}
          className="h-7 w-7 text-white/60 hover:text-white hover:bg-white/10"
        >
          <Settings size={14} />
        </Button>
        {!isMac && <WindowControls />}
      </div>
    </header>
  );
};

export default LauncherHeader;
