import React from 'react';
import {
  Mic,
  Monitor,
  Keyboard,
  LogOut,
  FlaskConical,
  FileText,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AIProvidersSettings } from './providers/AIProvidersSettings';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import {
  SettingsOverlayStateProvider,
  useSettingsOverlayContext,
} from './SettingsContext';
import { MockupAssistantOverlay } from './SettingsLayout';
import { GeneralTab } from './tabs/GeneralTab';
import { AudioTab } from './tabs/AudioTab';
import { ShortcutsTab } from './tabs/ShortcutsTab';
import { ContextTab } from './tabs/ContextTab';
import { SkillsTab } from './tabs/SkillsTab';

interface SettingsPageProps {
  onClose: () => void;
  initialTab?: string;
}

const TABS = [
  { id: 'general', label: 'General', icon: Monitor },
  { id: 'ai-providers', label: 'AI Providers', icon: FlaskConical },
  { id: 'skills', label: 'Skills', icon: Zap },
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'context', label: 'Context', icon: FileText },
  { id: 'keybinds', label: 'Keybinds', icon: Keyboard },
];

const SettingsShell: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    activeTab,
    setActiveTab,
    isPreviewingOpacity,
    previewOverlayOpacity,
  } = useSettingsOverlayContext();

  return (
    <div className="h-full w-full flex flex-col bg-bg-secondary text-text-secondary font-sans overflow-hidden">
      <PageHeader title="Settings" onBack={onClose} />

      <div
        className="flex flex-1 min-h-0"
        style={{ visibility: isPreviewingOpacity ? 'hidden' : 'visible' }}
      >
        <div className="w-48 bg-bg-secondary flex flex-col border-r border-border-subtle shrink-0">
          <nav className="p-3 space-y-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant="ghost"
                onClick={() => setActiveTab(id)}
                className={`w-full justify-start px-2 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2.5 ${
                  activeTab === id
                    ? 'bg-bg-item-active text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'
                }`}
              >
                <Icon size={15} /> {label}
              </Button>
            ))}
          </nav>

          <div className="mt-auto p-3 border-t border-border-subtle">
            <Button
              variant="ghost"
              onClick={() => window.electronAPI.quitApp()}
              className="w-full justify-start px-2 py-1.5 rounded-md text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-400 flex items-center gap-2.5"
            >
              <LogOut size={15} /> Quit Cheatly
            </Button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="max-w-3xl mx-auto px-6 py-6"
          >
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'ai-providers' && <AIProvidersSettings />}
            {activeTab === 'skills' && <SkillsTab />}
            {activeTab === 'audio' && <AudioTab />}
            {activeTab === 'context' && <ContextTab />}
            {activeTab === 'keybinds' && <ShortcutsTab />}
          </motion.div>
        </main>
      </div>

      <div
        id="settings-mockup-wrapper"
        className="fixed inset-0 z-[49] pointer-events-none transition-opacity duration-150"
        style={{ opacity: isPreviewingOpacity ? 1 : 0 }}
      >
        <MockupAssistantOverlay opacity={previewOverlayOpacity} />
      </div>
    </div>
  );
};

const SettingsPage: React.FC<SettingsPageProps> = ({
  onClose,
  initialTab = 'general',
}) => (
  <SettingsOverlayStateProvider isOpen={true} initialTab={initialTab}>
    <SettingsShell onClose={onClose} />
  </SettingsOverlayStateProvider>
);

export default SettingsPage;
