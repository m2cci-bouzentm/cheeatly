import React, { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ModelOption {
  id: string;
  name: string;
}

interface ModelSelectProps {
  value: string;
  options: ModelOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const ModelSelect: React.FC<ModelSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select model',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.id === value);

  const paddingClass = className.includes('py-') ? '' : 'py-1.5';

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-40 bg-bg-input border-border-subtle rounded-lg px-3 ${paddingClass} ${className} text-xs text-text-primary focus:border-accent-primary flex items-center justify-between hover:bg-bg-elevated`}
        type="button"
      >
        <span className="truncate pr-2">
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-full bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animated fadeIn">
          <div className="p-1 space-y-0.5">
            {options.map((option) => (
              <Button
                key={option.id}
                variant="ghost"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                className={`w-full justify-between px-3 py-2 h-auto text-xs rounded-md ${value === option.id ? 'bg-bg-input hover:bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                type="button"
              >
                <span className="truncate">{option.name}</span>
                {value === option.id && (
                  <Check
                    size={14}
                    className="text-accent-primary shrink-0 ml-2"
                  />
                )}
              </Button>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500 italic">
                No models available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
