import { useState } from 'react';
import { UploadCloud, FileJson } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';

export interface UploadState {
  tenantName: string;
  prefix: string;
  files: File[];
}

function fileList(files: FileList | null): File[] {
  return Array.from(files ?? []);
}

export function UploadCard({
  title,
  state,
  onChange,
  disabledPrefix,
}: {
  title: string;
  state: UploadState;
  onChange: (state: UploadState) => void;
  disabledPrefix?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const applyFiles = (files: FileList | null) => {
    onChange({ ...state, files: fileList(files) });
  };

  return (
    <Card>
      <CardHeader className="soft-gradient rounded-t-lg border-b">
        <CardTitle className="flex items-center gap-2">
          <FileJson className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>Upload one or more Intune JSON exports. Processing stays in this browser.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="space-y-1 text-sm font-medium">
          Name
          <Input value={state.tenantName} onChange={(event) => onChange({ ...state, tenantName: event.target.value })} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Prefixes to remove
          <Input
            disabled={disabledPrefix}
            placeholder="ACME, ACME -, ACME_"
            value={state.prefix}
            onChange={(event) => onChange({ ...state, prefix: event.target.value })}
          />
        </label>
        <label
          className={`upload-dropzone focus-ring flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-cyan-950/60 shadow-[0_0_28px_rgba(0,220,255,0.20)]'
              : 'border-cyan-700/60 bg-background/35 hover:border-primary hover:bg-cyan-950/45'
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            applyFiles(event.dataTransfer.files);
          }}
        >
          <div className="mb-3 rounded-full border border-fuchsia-400/30 bg-card p-3 text-primary shadow-sm">
            <UploadCloud className="h-7 w-7" />
          </div>
          <span className="font-semibold">Drop JSON exports or click to browse</span>
          <span className="mt-1 text-sm text-muted-foreground">Multiple files are supported</span>
          <input className="hidden" type="file" accept=".json,application/json" multiple onChange={(event) => applyFiles(event.target.files)} />
        </label>
        <div className="space-y-1 text-sm">
          {state.files.length === 0 ? (
            <span className="text-muted-foreground">No files selected</span>
          ) : (
            state.files.map((file) => (
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 shadow-sm" key={file.name}>
                <span>{file.name}</span>
                <span className="text-muted-foreground">{Math.round(file.size / 1024)} KB</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
