import { useId, useRef, useState, type ChangeEvent } from "react";
import { Camera, Upload, X, ArrowUp, ArrowDown } from "lucide-react";
import "../motion/gsapSetup";
import { usePress } from "../motion/press";
import { AnimatedButton } from "./AnimatedButton";
import {
  androidGalleryPickerAvailable,
  fileArrayToFileList,
  pickGalleryImages,
} from "../store/incoming";

export type FileWellItem = {
  name: string;
  size: number;
};

export type FileWellProps = {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  files: FileWellItem[];
  onPick: (fileList: FileList) => void;
  onRemove?: (index: number) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  label: string;
  hint: string;
  capture?: boolean | "user" | "environment";
};

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${Math.round(size)} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function captureAttr(
  capture: FileWellProps["capture"],
): "user" | "environment" | undefined {
  if (capture === true) return "environment";
  if (capture === "user" || capture === "environment") return capture;
  return undefined;
}

export function FileWell({
  accept,
  multiple = false,
  disabled = false,
  files,
  onPick,
  onRemove,
  onMove,
  label,
  hint,
  capture,
}: FileWellProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const { ref, bind } = usePress<HTMLLabelElement>();
  const Glyph = capture ? Camera : Upload;
  const captureValue = captureAttr(capture);
  const useNativeGallery =
    androidGalleryPickerAvailable() &&
    accept.startsWith("image/") &&
    !captureValue;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (list && list.length > 0) onPick(list);
    event.target.value = "";
  };

  async function chooseImages(): Promise<void> {
    if (disabled) return;
    setPickerError(null);
    try {
      const native = await pickGalleryImages(multiple ? 100 : 1);
      if (native === null) {
        inputRef.current?.click();
        return;
      }
      if (native.length) onPick(fileArrayToFileList(native));
    } catch (error) {
      setPickerError(
        error instanceof Error ? error.message : "Could not add those photos.",
      );
    }
  }

  function onNativeHit(event: { preventDefault(): void }): void {
    if (!useNativeGallery || disabled) return;
    event.preventDefault();
    void chooseImages();
  }

  return (
    <div className="well">
      <input
        ref={inputRef}
        id={id}
        className="sr-only"
        type="file"
        disabled={disabled}
        accept={accept}
        multiple={multiple}
        capture={captureValue}
        tabIndex={useNativeGallery ? -1 : undefined}
        onChange={handleChange}
      />
      <label
        ref={ref}
        className="well__hit"
        htmlFor={useNativeGallery ? undefined : id}
        role={useNativeGallery ? "button" : undefined}
        tabIndex={useNativeGallery && !disabled ? 0 : undefined}
        onClick={onNativeHit}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          onNativeHit(event);
        }}
        {...bind}
      >
        <span className="well__glyph" aria-hidden="true">
          <Glyph size={22} strokeWidth={2} />
        </span>
        <span className="well__label">{label}</span>
        <span className="well__hint">{hint}</span>
      </label>
      {pickerError ? (
        <p className="well__hint" role="alert">
          {pickerError}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul className="well__list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="well__item">
              <div className="well__meta">
                <p className="well__file">{file.name}</p>
                <p className="well__size tabular">{formatBytes(file.size)}</p>
              </div>
              {onMove && files.length > 1 ? (
                <>
                  <AnimatedButton
                    variant="ghost"
                    className="btn--icon"
                    icon={ArrowUp}
                    disabled={disabled || index === 0}
                    aria-label={`Move ${file.name} earlier`}
                    onClick={() => onMove(index, -1)}
                  />
                  <AnimatedButton
                    variant="ghost"
                    className="btn--icon"
                    icon={ArrowDown}
                    disabled={disabled || index === files.length - 1}
                    aria-label={`Move ${file.name} later`}
                    onClick={() => onMove(index, 1)}
                  />
                </>
              ) : null}
              {onRemove ? (
                <AnimatedButton
                  variant="ghost"
                  className="btn--icon well__remove"
                  icon={X}
                  disabled={disabled}
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
