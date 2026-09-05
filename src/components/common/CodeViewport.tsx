import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, Download, Share2, CheckCircle2, Upload, Trash2, Sparkles } from 'lucide-react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useSuiteStore } from '../../store/useSuiteStore';

export interface FileTabItem {
  id: string;
  name: string;
  language: string;
  content: string;
  filename: string;
  icon?: string;
  isEditable?: boolean;
}

interface CodeViewportProps {
  files: FileTabItem[];
  activeFileId: string;
  baselineContent?: string;
  onSelectFile: (id: string) => void;
  onContentChange?: (newContent: string) => void;
  onUploadFile?: (fileContent: string, fileName: string) => void;
  onClearContent?: () => void;
  headerSlot?: React.ReactNode;
}

// Normalizes CRLF and LF to uniform \n
function normalizeEol(str: string): string {
  return (str || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Fast and accurate line diff detector against baseline document (Git / VS Code style)
export function computeAddedOrModifiedLines(baselineStr: string, currentStr: string): number[] {
  const normBaseline = normalizeEol(baselineStr);
  const normCurrent = normalizeEol(currentStr);

  if (!normBaseline || normBaseline === normCurrent || !normCurrent) return [];

  const baselineLines = normBaseline.split('\n');
  const currentLines = normCurrent.split('\n');

  // Fast path: equal line count (in-place edits)
  if (baselineLines.length === currentLines.length) {
    const modified: number[] = [];
    for (let i = 0; i < currentLines.length; i++) {
      if (currentLines[i] !== baselineLines[i]) {
        modified.push(i + 1); // 1-indexed for Monaco
      }
    }
    return modified;
  }

  const n = baselineLines.length;
  const m = currentLines.length;

  // Accurate LCS (Longest Common Subsequence) diff line mapper
  if (n <= 2500 && m <= 2500) {
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (baselineLines[i] === currentLines[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    const modified: number[] = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && baselineLines[i - 1] === currentLines[j - 1]) {
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        modified.push(j); // 1-indexed for Monaco
        j--;
      } else {
        i--;
      }
    }
    return modified.sort((a, b) => a - b);
  }

  // Fallback for huge files
  const baselineSet = new Set(baselineLines.map((l) => l.trim()));
  const modifiedLines: number[] = [];
  for (let i = 0; i < currentLines.length; i++) {
    const trimmed = currentLines[i].trim();
    if (trimmed.length > 0 && !baselineSet.has(trimmed)) {
      modifiedLines.push(i + 1);
    }
  }
  return modifiedLines;
}

export const CodeViewport: React.FC<CodeViewportProps> = ({
  files,
  activeFileId,
  baselineContent,
  onSelectFile,
  onContentChange,
  onUploadFile,
  onClearContent,
  headerSlot,
}) => {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [hasRecentChanges, setHasRecentChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { serializeToUrlHash } = useSuiteStore();

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const prevFileIdRef = useRef<string>(activeFileId);
  const internalBaselineRef = useRef<string>(normalizeEol(baselineContent !== undefined ? baselineContent : ''));
  const isUserTypingRef = useRef<boolean>(false);
  const decorationsRef = useRef<string[]>([]);
  const clearTimerRef = useRef<any>(null);

  const currentFile = files.find((f) => f.id === activeFileId) || files[0];
  const isEditable = currentFile?.isEditable ?? false;
  const isContentEmpty = !currentFile?.content || !currentFile.content.trim();

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    prevFileIdRef.current = activeFileId;
    if (baselineContent !== undefined) {
      internalBaselineRef.current = normalizeEol(baselineContent);
    } else {
      internalBaselineRef.current = normalizeEol(currentFile?.content || '');
    }
  };

  // Monitor content changes against baseline for VS Code-style modified line highlighting
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !currentFile) return;

    try {
      // If switched file tab, clear decorations
      if (prevFileIdRef.current !== activeFileId) {
        if (decorationsRef.current.length > 0) {
          decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
        }
        prevFileIdRef.current = activeFileId;
        internalBaselineRef.current = normalizeEol(baselineContent !== undefined ? baselineContent : currentFile.content);
        setHasRecentChanges(false);
        return;
      }

      const baseline = baselineContent !== undefined ? normalizeEol(baselineContent) : internalBaselineRef.current;
      const current = normalizeEol(currentFile.content);

      // If document matches baseline exactly (restored to original state), clear all decorations
      if (!current || current === baseline) {
        if (decorationsRef.current.length > 0) {
          decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
        }
        setHasRecentChanges(false);
        return;
      }

      const modifiedLines = computeAddedOrModifiedLines(baseline, current);

      if (modifiedLines.length === 0) {
        if (decorationsRef.current.length > 0) {
          decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
        }
        setHasRecentChanges(false);
        return;
      }

      const model = editorRef.current.getModel();
      const maxLine = model ? model.getLineCount() : 1000;
      const validLines = modifiedLines.filter((l) => l >= 1 && l <= maxLine);

      if (validLines.length > 0) {
        const monaco = monacoRef.current;
        const newDecorations = validLines.map((lineNum) => ({
          range: new monaco.Range(lineNum, 1, lineNum, 1),
          options: {
            isWholeLine: true,
            className: 'vs-code-diff-line-add',
            linesDecorationsClassName: 'vs-code-diff-gutter-add',
          },
        }));

        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);
        setHasRecentChanges(true);

        // If change was triggered from UI buttons/quick fixes (not direct keystroke), smoothly reveal line
        if (!isUserTypingRef.current) {
          editorRef.current.revealLineInCenterIfOutsideViewport(validLines[0]);
        }

        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
        clearTimerRef.current = setTimeout(() => {
          setHasRecentChanges(false);
        }, 5000);
      }
    } catch (err) {
      console.warn('Monaco diff decoration safe catch:', err);
    }
  }, [currentFile?.content, activeFileId, baselineContent]);

  const handleCopy = () => {
    if (!currentFile || isContentEmpty) return;
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!currentFile || isContentEmpty) return;
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentFile.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = () => {
    if (isContentEmpty) return;
    serializeToUrlHash();
    navigator.clipboard.writeText(window.location.href);
    setShared(true);
    setTimeout(() => setShared(false), 2500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text && onUploadFile) {
        onUploadFile(text, file.name);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  return (
    <div className="editor-pane">
      {/* Hidden File Input for Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".conf,.txt,.yaml,.yml,.dockerfile,Dockerfile"
        style={{ display: 'none' }}
      />

      {/* Top File Tabs & Action Bar */}
      <div className="editor-topbar">
        {/* Left File Sub-Tabs */}
        <div className="file-tabs-list">
          {files.map((file) => {
            const isActive = file.id === activeFileId;
            return (
              <button
                key={file.id}
                onClick={() => onSelectFile(file.id)}
                className={`file-tab-btn ${isActive ? 'active' : ''}`}
              >
                <span>{file.icon || '📄'}</span>
                <span>{file.name}</span>
                {file.isEditable && (
                  <span style={{ fontSize: '9px', padding: '1px 4px', background: 'rgba(6, 182, 212, 0.2)', color: '#22d3ee', borderRadius: '3px', marginLeft: '3px' }}>
                    EDIT
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Dock: Inline Score Badge + Action Buttons */}
        <div className="editor-actions-dock">
          {headerSlot}

          {/* Change Indicator Tag when Form Toggles are changed */}
          {hasRecentChanges && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 7px', background: 'rgba(6, 182, 212, 0.18)', border: '1px solid rgba(6, 182, 212, 0.45)', borderRadius: '4px', fontSize: '11px', color: '#22d3ee', fontWeight: 700 }}>
              <Sparkles style={{ width: '12px', height: '12px' }} />
              <span>Line Modified</span>
            </div>
          )}

          {/* Upload Button */}
          {onUploadFile && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-dock-action"
              title="Upload your existing configuration file"
            >
              <Upload style={{ width: '13px', height: '13px', color: '#38bdf8' }} />
              <span>Upload</span>
            </button>
          )}

          {/* Clear Code Button */}
          {onClearContent && isEditable && (
            <button
              onClick={onClearContent}
              disabled={isContentEmpty}
              className="btn-dock-action"
              style={{ opacity: isContentEmpty ? 0.35 : 1, cursor: isContentEmpty ? 'not-allowed' : 'pointer' }}
              title={isContentEmpty ? 'Editor is already empty' : 'Clear editor code'}
            >
              <Trash2 style={{ width: '13px', height: '13px', color: '#f43f5e' }} />
              <span>Clear</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            disabled={isContentEmpty}
            className="btn-dock-action"
            style={{ opacity: isContentEmpty ? 0.35 : 1, cursor: isContentEmpty ? 'not-allowed' : 'pointer' }}
            title={isContentEmpty ? 'Cannot copy empty content' : 'Copy configuration to clipboard'}
          >
            {copied ? <Check style={{ width: '13px', height: '13px', color: '#10b981' }} /> : <Copy style={{ width: '13px', height: '13px' }} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownload}
            disabled={isContentEmpty}
            className="btn-dock-action"
            style={{ opacity: isContentEmpty ? 0.35 : 1, cursor: isContentEmpty ? 'not-allowed' : 'pointer' }}
            title={isContentEmpty ? 'Cannot download empty content' : `Download ${currentFile?.filename || 'file'}`}
          >
            <Download style={{ width: '13px', height: '13px' }} />
            <span>Download</span>
          </button>

          <button
            onClick={handleShare}
            disabled={isContentEmpty}
            className="btn-dock-action btn-dock-primary"
            style={{ opacity: isContentEmpty ? 0.35 : 1, cursor: isContentEmpty ? 'not-allowed' : 'pointer' }}
            title={isContentEmpty ? 'Cannot share empty configuration' : 'Share encrypted client-side link'}
          >
            {shared ? <CheckCircle2 style={{ width: '13px', height: '13px' }} /> : <Share2 style={{ width: '13px', height: '13px' }} />}
            <span>{shared ? 'Copied' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* Monaco Editor Container */}
      <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
        {currentFile && (
          <Editor
            height="100%"
            language={currentFile.language}
            theme="vs-dark"
            value={currentFile.content}
            onMount={handleEditorDidMount}
            onChange={(val) => {
              if (onContentChange && isEditable && val !== undefined && val !== currentFile.content) {
                isUserTypingRef.current = true;
                onContentChange(val);
                setTimeout(() => {
                  isUserTypingRef.current = false;
                }, 50);
              }
            }}
            options={{
              readOnly: !isEditable,
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'none',
              lineDecorationsWidth: 12,
              padding: { top: 12, bottom: 12 },
              smoothScrolling: true,
            }}
          />
        )}
      </div>
    </div>
  );
};
