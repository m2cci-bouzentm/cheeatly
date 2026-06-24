import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';

interface ContextFile {
  id: string;
  filename: string;
  createdAt: string;
}

function ContextPage({ onClose }: { onClose: () => void }) {
  const [contextText, setContextText] = useState('');
  const [saved, setSaved] = useState(true);
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    window.electronAPI
      .contextGetDescription()
      .then((res) => {
        if (res.success && res.content) setContextText(res.content);
      })
      .catch(() => {});
    window.electronAPI
      .contextGetFiles()
      .then((res) => {
        if (res.success) setFiles(res.files);
      })
      .catch(() => {});
  }, []);

  const handleTextChange = useCallback((value: string) => {
    setContextText(value);
    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      window.electronAPI
        .contextSaveDescription(value)
        .then(() => setSaved(true))
        .catch(() => {});
    }, 800);
  }, []);

  const handleUpload = async () => {
    setUploading(true);
    try {
      const res = await window.electronAPI.contextUploadFile();
      if (res?.success && res.file) {
        setFiles((prev) => [...prev, res.file!]);
      }
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await window.electronAPI.contextDeleteFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-bg-secondary text-text-secondary font-sans overflow-hidden">
      <PageHeader title="Context" onBack={onClose} />

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="max-w-3xl mx-auto px-8 py-8"
        >
          <p className="text-sm text-text-tertiary mb-8">
            Information the AI uses to personalize suggestions during meetings.
            {!saved && <span className="ml-2 text-amber-400">Saving...</span>}
            {saved && contextText && (
              <span className="ml-2 text-emerald-400">Saved</span>
            )}
          </p>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-sm font-medium text-text-primary">
                Description
              </label>
              <Textarea
                value={contextText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Add any context you want the AI to know about — your background, preferences, current situation, etc."
                className="min-h-[200px] resize-y text-sm bg-bg-item-surface border-border-subtle"
                maxLength={4000}
              />
              <p className="text-xs text-text-tertiary text-right">
                {contextText.length}/4000
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-primary">
                  Files
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="h-8 text-xs gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? 'Uploading...' : 'Upload file'}
                </Button>
              </div>

              {files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-subtle py-10 text-center">
                  <FileText className="w-8 h-8 text-text-tertiary mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-text-tertiary">
                    No files uploaded. Upload documents to give the AI more
                    context.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl bg-bg-item-surface border border-border-subtle group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-text-tertiary shrink-0" />
                        <span className="text-sm truncate text-text-primary">
                          {file.filename}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(file.id)}
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

export default ContextPage;
