import { useId, type ChangeEvent } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import '../motion/gsapSetup';
import { usePress } from '../motion/press';
import { AnimatedButton } from './AnimatedButton';

export type FileWellItem = {
  name: string;
  size: number;
};

export type FileWellProps = {
  accept: string;
  multiple?: boolean;
  files: FileWellItem[];
  onPick: (fileList: FileList) => void;
  onRemove?: (index: number) => void;
  label: string;
  hint: string;
  capture?: boolean | 'user' | 'environment';
};

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${Math.round(size)} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function captureAttr(
  capture: FileWellProps['capture'],
): 'user' | 'environment' | undefined {
  if (capture === true) return 'environment';
  if (capture === 'user' || capture === 'environment') return capture;
  return undefined;
}

export function FileWell({
  accept,
  multiple = false,
  files,
  onPick,
  onRemove,
  label,
  hint,
  capture,
}: FileWellProps) {
  const id = useId();
  const { ref, bind } = usePress<HTMLLabelElement>();
  const Glyph = capture ? Camera : Upload;
  const captureValue = captureAttr(capture);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (list && list.length > 0) onPick(list);
    event.target.value = '';
  };

  return (
    <div className="well">
      <label ref={ref} className="well__hit" htmlFor={id} {...bind}>
        <input
          id={id}
          className="sr-only"
          type="file"
          accept={accept}
          multiple={multiple}
          capture={captureValue}
          onChange={handleChange}
        />
        <span className="well__glyph" aria-hidden="true">
          <Glyph size={22} strokeWidth={2} />
        </span>
        <span className="well__label">{label}</span>
        <span className="well__hint">{hint}</span>
      </label>
      {files.length > 0 ? (
        <ul className="well__list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="well__item">
              <div className="well__meta">
                <p className="well__file">{file.name}</p>
                <p className="well__size tabular">{formatBytes(file.size)}</p>
              </div>
              {onRemove ? (
                <AnimatedButton
                  variant="ghost"
                  className="btn--icon well__remove"
                  icon={X}
                  aria-label={`Remove ${file.name}`}
                  onClick={() => onRemove(index)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
