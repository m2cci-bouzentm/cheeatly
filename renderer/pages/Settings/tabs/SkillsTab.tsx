import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Trash2, ArrowLeft, Save, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type SkillInfo = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  bundled: boolean;
};

type ViewMode = 'preview' | 'edit';

const SkillList = ({
  skills,
  importing,
  importError,
  onImport,
  onToggle,
  onRemove,
  onSelect,
}: {
  skills: SkillInfo[];
  importing: boolean;
  importError: string | null;
  onImport: () => void;
  onToggle: (name: string, enabled: boolean) => void;
  onRemove: (name: string) => void;
  onSelect: (skill: SkillInfo) => void;
}) => (
  <div>
    <p className="text-sm text-text-tertiary mb-4">
      Skills give the AI specialized knowledge. Click a skill to view or edit.
      Import <code className="text-xs bg-white/5 px-1 py-0.5 rounded">.md</code> files with YAML frontmatter
      (<code className="text-xs bg-white/5 px-1 py-0.5 rounded">name</code> and <code className="text-xs bg-white/5 px-1 py-0.5 rounded">description</code> fields).
    </p>

    <div className="mb-4">
      <Button
        variant="outline"
        size="sm"
        onClick={onImport}
        disabled={importing}
        className="flex items-center gap-2"
      >
        <Upload className="w-3.5 h-3.5" />
        {importing ? 'Importing...' : 'Import Skill (.md)'}
      </Button>
    </div>

    {importError && (
      <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
        {importError}
      </p>
    )}

    <div className="space-y-1">
      {skills.length === 0 && (
        <p className="text-sm text-text-tertiary py-8 text-center">No skills loaded yet.</p>
      )}

      {skills.map(skill => (
        <div
          key={skill.id}
          onClick={() => onSelect(skill)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group cursor-pointer"
        >
          <Switch
            checked={skill.enabled}
            onCheckedChange={(checked) => {
              onToggle(skill.name, checked);
            }}
            onClick={(e) => e.stopPropagation()}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate">
                {skill.name}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                skill.bundled
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}>
                {skill.bundled ? 'Bundled' : 'Custom'}
              </span>
            </div>
            <p className="text-xs text-text-tertiary truncate mt-0.5">
              {skill.description}
            </p>
          </div>

          <FileText className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors shrink-0" />

          {!skill.bundled && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onRemove(skill.name); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              title="Delete skill"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  </div>
);

const SkillDetail = ({
  skill,
  onBack,
  onToggle,
}: {
  skill: SkillInfo;
  onBack: () => void;
  onToggle: (name: string, enabled: boolean) => void;
}) => {
  const [content, setContent] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [description, setDescription] = useState(skill.description);
  const [mode, setMode] = useState<ViewMode>('preview');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.electronAPI.skillsGet(skill.name).then(c => {
      setContent(c);
      setEditContent(c ?? '');
    });
  }, [skill.name]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.skillsUpdate(skill.name, {
        content: editContent,
        description,
      });
      setContent(editContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setMode('preview');
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const stripFrontmatter = (md: string): string => {
    return md.replace(/^---\n[\s\S]*?\n---\n*/, '');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          className="h-7 w-7 text-text-tertiary hover:text-text-primary"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary truncate">
              {skill.name}
            </h2>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              skill.bundled
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              {skill.bundled ? 'Bundled' : 'Custom'}
            </span>
          </div>
        </div>

        <Switch
          checked={skill.enabled}
          onCheckedChange={(checked) => onToggle(skill.name, checked)}
        />
      </div>

      <div className="mb-3">
        <label className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary mb-1.5 block">
          Description
        </label>
        {mode === 'edit' ? (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-secondary resize-none focus:outline-none focus:ring-1 focus:ring-white/20"
            placeholder="When should this skill be used?"
            rows={3}
          />
        ) : (
          <p className="text-sm text-text-secondary leading-relaxed">
            {description || 'No description'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
          <button
            onClick={() => setMode('preview')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              mode === 'preview'
                ? 'bg-white/10 text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              mode === 'edit'
                ? 'bg-white/10 text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            Edit
          </button>
        </div>

        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
          {(mode === 'edit' || description !== skill.description) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 h-7 text-xs"
            >
              <Save className="w-3 h-3" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {content === null ? (
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
          Loading...
        </div>
      ) : mode === 'preview' ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar rounded-lg border border-white/5 bg-white/[0.02] p-4">
          <div className="markdown-content prose prose-sm prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {stripFrontmatter(content)}
            </ReactMarkdown>
          </div>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full min-h-[400px] bg-white/[0.02] border border-white/10 rounded-lg p-4 text-sm font-mono text-text-secondary resize-vertical focus:outline-none focus:ring-1 focus:ring-white/20 custom-scrollbar"
          spellCheck={false}
        />
      )}
    </div>
  );
};

export const SkillsTab = () => {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const selectedRef = useRef(selectedSkill);
  selectedRef.current = selectedSkill;

  const loadSkills = useCallback(() => {
    window.electronAPI.skillsList().then(list => {
      setSkills(list);
      const current = selectedRef.current;
      if (current) {
        const updated = list.find(s => s.name === current.name);
        if (updated) setSelectedSkill(updated);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadSkills();
    const off = window.electronAPI.onSkillsChanged(loadSkills);
    return off;
  }, [loadSkills]);

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);
    try {
      const res = await window.electronAPI.skillsImport();
      if (res?.error) setImportError(res.error);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled } : s));
    if (selectedSkill?.name === name) {
      setSelectedSkill(prev => prev ? { ...prev, enabled } : null);
    }
    try {
      await window.electronAPI.skillsToggle(name, enabled);
    } catch {
      setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled: !enabled } : s));
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await window.electronAPI.skillsRemove(name);
      if (selectedSkill?.name === name) setSelectedSkill(null);
    } catch (e) {
      console.error('Skill removal failed:', e);
    }
  };

  if (selectedSkill) {
    return (
      <SkillDetail
        skill={selectedSkill}
        onBack={() => setSelectedSkill(null)}
        onToggle={handleToggle}
      />
    );
  }

  return (
    <SkillList
      skills={skills}
      importing={importing}
      importError={importError}
      onImport={handleImport}
      onToggle={handleToggle}
      onRemove={handleRemove}
      onSelect={setSelectedSkill}
    />
  );
};
