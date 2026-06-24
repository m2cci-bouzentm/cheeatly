import React, { useState, useEffect, useRef } from 'react';

interface KeyRecorderProps {
  currentKeys: string[];
  onSave: (keys: string[]) => void;
  className?: string;
}

const DISPLAY_KEYS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

const recordedMainKey = (key: string, code: string): string => {
  if (code.startsWith('Key')) return key.toUpperCase();
  if (code.startsWith('Digit')) return key;
  if (code === 'Space') return 'Space';
  if (key === 'Enter') return 'Enter';
  if (key === 'Backspace') return 'Backspace';
  if (key.startsWith('Arrow')) return key;
  return key.toUpperCase();
};

export const KeyRecorder: React.FC<KeyRecorderProps> = ({
  currentKeys,
  onSave,
  className,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRecording && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isRecording]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    const key = e.key;
    const code = e.code;
    const meta = e.metaKey;
    const ctrl = e.ctrlKey;
    const alt = e.altKey;
    const shift = e.shiftKey;

    // Ignore modifier key presses alone if possible, but we need to show them
    const modifiers = [];
    if (meta) modifiers.push('⌘');
    if (ctrl) modifiers.push('⌃');
    if (alt) modifiers.push('⌥');
    if (shift) modifiers.push('⇧');

    let mainKey = '';
    if (
      key !== 'Meta' &&
      key !== 'Control' &&
      key !== 'Alt' &&
      key !== 'Shift'
    ) {
      mainKey = recordedMainKey(key, code);
    }

    if (mainKey) {
      setRecordedKeys([...modifiers, mainKey]);
      setIsRecording(false);
      onSave([...modifiers, mainKey]);
      return;
    }
    setRecordedKeys([...modifiers]);
  };

  return (
    <div
      className={`relative flex items-center gap-1.5 group ${className || ''}`}
      onClick={() => setIsRecording(true)}
    >
      {isRecording ? (
        <div
          ref={inputRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsRecording(false)}
          className="flex items-center gap-1 bg-bg-input border border-accent-primary text-accent-primary px-2 py-1 rounded-md text-xs font-sans shadow-sm outline-none min-w-[60px] justify-center"
        >
          {recordedKeys.length > 0 ? recordedKeys.join(' + ') : 'Press keys...'}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {currentKeys.map((k, i) => {
            const displayKey = DISPLAY_KEYS[k] ?? k;

            return (
              <span
                key={i}
                className="bg-bg-input text-text-secondary h-6 min-w-[26px] px-1.5 rounded-md text-xs font-sans flex items-center justify-center shadow-sm border border-border-subtle group-hover:border-text-tertiary transition-colors"
              >
                {displayKey}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
