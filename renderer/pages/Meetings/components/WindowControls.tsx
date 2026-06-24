import React, { useState, useEffect } from 'react';
import { Minus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isMac } from '../../../utils/platformUtils';

const WindowControls: React.FC = () => {
  // Module-level isMac keeps the pre-hook early return stable.
  if (isMac) return null;

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let active = true;

    window.electronAPI
      .windowIsMaximized()
      .then((maximized: boolean) => {
        if (active) setIsMaximized(maximized);
      })
      .catch(() => {});

    const unsubscribe = window.electronAPI.onWindowMaximizedChanged(
      (maximized: boolean) => {
        setIsMaximized(maximized);
      }
    );

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const handleMinimize = () => window.electronAPI.windowMinimize();
  const handleMaximize = () => window.electronAPI.windowMaximize();
  const handleClose = () => window.electronAPI.windowClose();

  return (
    <div className="flex h-[40px]">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleMinimize}
        className="w-[46px] h-full rounded-none border-0 bg-transparent text-text-secondary hover:text-text-primary hover:bg-white/10 duration-100"
        title="Minimize"
      >
        <Minus size={16} strokeWidth={1.5} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleMaximize}
        className="w-[46px] h-full rounded-none border-0 bg-transparent text-text-secondary hover:text-text-primary hover:bg-white/10 duration-100"
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="5" y="3" width="8" height="8" rx="0.5" />
            <path d="M3 5V11C3 11.5523 3.44772 12 4 12H10" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3.5" y="3.5" width="9" height="9" rx="0.5" />
          </svg>
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleClose}
        className="w-[46px] h-full rounded-none border-0 bg-transparent text-text-secondary hover:text-white hover:bg-red-500 duration-100"
        title="Close"
      >
        <X size={16} strokeWidth={1.5} />
      </Button>
    </div>
  );
};

export default WindowControls;
