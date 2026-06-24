import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ContextFile {
  id: string;
  filename: string;
  createdAt: string;
}

export const ContextTab = () => {
  const [contextText, setContextText] = useState('');
  const [saved, setSaved] = useState(true);
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    setUploadError(null);
    try {
      const res = await window.electronAPI.contextUploadFile();
      if (res?.cancelled) return;
      if (res?.success && res.file) {
        setFiles((prev) => [...prev, res.file!]);
      } else {
        setUploadError(res?.error || 'Upload failed. Please try again.');
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.');
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
    <div>
      <p className="text-sm text-text-tertiary mb-6">
        Information the AI uses to personalize suggestions during meetings. Only text content is extracted from uploaded documents — images are ignored.
        {!saved && <span className="ml-2 text-amber-400">Saving...</span>}
        {saved && contextText && (
          <span className="ml-2 text-emerald-400">Saved</span>
        )}
      </p>

      <div className="space-y-6">
        <div className="space-y-2.5">
          <label className="text-sm font-medium text-text-primary">Description</label>
          <Textarea
            value={contextText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Add any context you want the AI to know about — your background, preferences, current situation, etc."
            className="min-h-[180px] resize-y text-sm bg-bg-item-surface border-border-subtle rounded-lg"
            maxLength={4000}
          />
          <p className="text-[11px] text-text-tertiary text-right">
            {contextText.length}/4000
          </p>
        </div>

        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-text-primary">
              Files
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpload}
              disabled={uploading}
              className="h-7 text-[11px] gap-1.5 rounded-md"
            >
              <Upload className="w-3 h-3" />
              {uploading ? 'Uploading...' : 'Upload file'}
            </Button>
          </div>

          {uploadError && (
            <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
              {uploadError}
            </p>
          )}

          {files.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-subtle py-6 text-center">
              <FileText className="w-6 h-6 text-text-tertiary mx-auto mb-1.5 opacity-40" />
              <p className="text-xs text-text-tertiary">
                No files uploaded. Upload documents to give the AI more context.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-item-surface border border-border-subtle group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                    <span className="text-sm truncate text-text-primary">
                      {file.filename}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(file.id)}
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-red-400 rounded-md"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
