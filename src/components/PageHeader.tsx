import { ArrowLeft } from 'lucide-react';
import { isMac } from '../utils/platformUtils';

interface PageHeaderProps {
  title: string;
  onBack: () => void;
}

export function PageHeader({ title, onBack }: PageHeaderProps) {
  return (
    <header className="relative w-full h-[36px] shrink-0 flex items-center pl-0 drag-region select-none bg-bg-secondary border-b border-border-subtle">
      <div className="flex items-center gap-1.5 no-drag">
        {isMac && <div className="w-[70px]" />}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 ml-1.5 px-2 py-0.5 rounded-md text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={14} />
          <span className="font-medium">{title}</span>
        </button>
      </div>
    </header>
  );
}
