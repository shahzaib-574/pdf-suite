import { useId, useRef, useState, type ChangeEvent } from "react";
import { Camera, Upload, Plus } from "lucide-react";
import "../motion/gsapSetup";
import { usePress } from "../motion/press";
import { FileOrderGrid } from "./FileOrderGrid";
import type { PickedFile } from "../lib/types";
import {
  androidGalleryPickerAvailable,
  fileArrayToFileList,
  pickGalleryImages,
} from "../store/incoming";

export type FileWellItem = {
  name: string;
  size: number;
  /** Stable identity, required for the reorderable preview grid. */
  id?: string;
  /** Source bytes for first-page or image previews. */
  source?: PickedFile;
};

export type FileWellProps = {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  files: FileWellItem[];
  onPick: (fileList: FileList) => void;
  onRemove?: (index: number) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  /** Enables the preview grid: receives old indices in their new order. */
  onReorder?: (order: number[]) => void;
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
  onReorder,
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
      const native = await pickGalleryImages(multiple ? 200 : 1);
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

  const compact = files.length > 0;
  // A lone file that cannot be reordered gets the wide card, and + replaces it.
  const single = !multiple || (!onReorder && files.length === 1);
  const hitProps = {
    htmlFor: useNativeGallery ? undefined : id,
    role: useNativeGallery ? "button" : undefined,
    tabIndex: useNativeGallery && !disabled ? 0 : undefined,
    onClick: onNativeHit,
    onKeyDown: (event: { key: string; preventDefault(): void }) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      onNativeHit(event);
    },
  };

  return (
    <div
      className="well"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        if (disabled) return;
        if (!multiple && event.dataTransfer.files.length > 1) {
          setPickerError("Choose one file for this tool.");
          return;
        }
        setPickerError(null);
        onPick(event.dataTransfer.files);
      }}
    >
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
      {compact ? null : (
        <label ref={ref} className="well__hit" {...hitProps} {...bind}>
          <span className="well__glyph" aria-hidden="true">
            <Glyph size={22} strokeWidth={2} />
          </span>
          <span className="well__label">{label}</span>
          <span className="well__hint">{hint}</span>
        </label>
      )}
      {pickerError ? (
        <p className="well__hint" role="alert">
          {pickerError}
        </p>
      ) : null}
      {compact ? (
        <FileOrderGrid
          items={files.map((file, index) => ({
            ...file,
            id: file.id ?? `${file.name}-${index}`,
          }))}
          disabled={disabled}
          hint={hint}
          single={single}
          formatBytes={formatBytes}
          onReorder={onReorder}
          onMove={onMove}
          onRemove={onRemove}
          addControl={
            <label
              className={`well__add${disabled ? " is-disabled" : ""}`}
              aria-label={single ? "Choose a different file" : label}
              title={single ? "Choose a different file" : label}
              {...hitProps}
            >
              <Plus size={22} strokeWidth={2.2} aria-hidden="true" />
            </label>
          }
        />
      ) : null}
    </div>
  );
}
