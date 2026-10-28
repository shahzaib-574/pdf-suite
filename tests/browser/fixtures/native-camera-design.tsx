import {
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  Check,
  Images,
  LoaderCircle,
  Zap,
  ZapOff,
} from "lucide-react";
import "./native-camera-design.css";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
/** Header bounds are checked before creating a URL or asking the browser to decode. */
function dimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes[0] !== 255 || bytes[1] !== 216) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) return null;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) return null;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) return null;
    const size = view.getUint16(offset);
    if (size < 2 || offset + size > bytes.length) return null;
    if (
      [
        192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
      ].includes(marker)
    ) {
      if (size < 8) return null;
      return {
        width: view.getUint16(offset + 5),
        height: view.getUint16(offset + 3),
      };
    }
    offset += size;
  }
  return null;
}
function CameraDesignPreview() {
  const [wide, setWide] = useState(false),
    [light, setLight] = useState(false),
    [captured, setCaptured] = useState(false);
  const [image, setImage] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [selected, setSelected] = useState<{
    file: File;
    width: number;
    height: number;
  } | null>(null);
  const [loading, setLoading] = useState(false),
    [message, setMessage] = useState(
      "No camera or photo-library permission is requested.",
    );
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  // Fresh leases survive StrictMode/HMR replay; revoke after the committed source swap.
  useLayoutEffect(() => {
    if (!selected) {
      setImage(null);
      return;
    }
    const url = URL.createObjectURL(selected.file);
    setImage({ url, width: selected.width, height: selected.height });
    return () => {
      queueMicrotask(() => URL.revokeObjectURL(url));
    };
  }, [selected]);
  function reset() {
    revision.current++;
    setSelected(null);
    setLoading(false);
    setLight(false);
    setCaptured(false);
    setError("");
    setMessage("Preview reset. No media was stored.");
    if (input.current) input.current.value = "";
  }
  async function select(file: File | undefined) {
    if (!file) return;
    const owner = ++revision.current;
    setLoading(true);
    setError("");
    setCaptured(false);
    let candidate: string | undefined;
    try {
      if (file.size > MAX_BYTES)
        throw Error("Choose a JPEG or PNG under 8 MB for this visual preview.");
      if (!["image/jpeg", "image/png"].includes(file.type))
        throw Error("This visual preview supports JPEG and PNG images.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const size = dimensions(bytes);
      if (
        !size ||
        size.width <= 0 ||
        size.height <= 0 ||
        size.width * size.height > MAX_PIXELS
      )
        throw Error(
          "Choose a valid image up to 16 megapixels. Large files are rejected before decoding.",
        );
      if (owner !== revision.current) return;
      candidate = URL.createObjectURL(file);
      const decoded = new Image();
      decoded.src = candidate;
      await decoded.decode();
      if (owner !== revision.current) return;
      if (decoded.naturalWidth * decoded.naturalHeight > MAX_PIXELS)
        throw Error("That image is too large to preview.");
      setSelected({
        file,
        width: decoded.naturalWidth,
        height: decoded.naturalHeight,
      });
      setMessage(
        "Local image selected. It stays in this tab—not a native gallery thumbnail.",
      );
    } catch (e) {
      if (owner === revision.current)
        setError(
          e instanceof Error ? e.message : "Could not preview that image.",
        );
    } finally {
      if (candidate) URL.revokeObjectURL(candidate);
      if (owner === revision.current) setLoading(false);
    }
  }
  return (
    <main className="camera-design">
      <header className="camera-design__intro">
        <h1>Camera design preview—not native camera</h1>
        <p>
          Review the quieter controls. Light and capture are visual simulations.
        </p>
      </header>
      <div
        className="camera-design__controls"
        role="group"
        aria-label="Preview framing"
      >
        <button aria-pressed={!wide} onClick={() => setWide(false)}>
          Phone
        </button>
        <button aria-pressed={wide} onClick={() => setWide(true)}>
          Wide view
        </button>
        <span>Choose a local JPEG/PNG with the gallery icon.</span>
      </div>
      <div className={`camera-design__stage${wide ? " is-wide" : ""}`}>
        <section
          data-camera-design-screen
          className={`camera-design__screen${captured ? " is-captured" : ""}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") reset();
          }}
        >
          <header className="camera-design__header">
            <button
              className="camera-design__icon"
              aria-label="Reset camera preview"
              onClick={reset}
            >
              <ArrowLeft aria-hidden="true" size={24} />
            </button>
            <h2>Document camera</h2>
            <button
              className={`camera-design__icon camera-design__light${light ? " is-on" : ""}`}
              aria-label={
                light ? "Turn simulated light off" : "Turn simulated light on"
              }
              aria-pressed={light}
              onClick={() => setLight((v) => !v)}
            >
              {light ? (
                <Zap size={24} fill="currentColor" aria-hidden="true" />
              ) : (
                <ZapOff size={24} aria-hidden="true" />
              )}
            </button>
          </header>
          <div className="camera-design__viewfinder">
            {image ? (
              <img
                className="camera-design__photo"
                src={image.url}
                alt="Locally selected preview image"
              />
            ) : (
              <div
                className="camera-design__sample"
                role="img"
                aria-label="Illustrated document sample; no camera access"
              >
                <div className="camera-design__paper">
                  <div className="sample-title" />
                  <div className="sample-subtitle" />
                  <div className="sample-rule" />
                  <div className="sample-lines" />
                  <div className="sample-table" />
                  <div className="sample-lines is-short" />
                </div>
              </div>
            )}
            <div className="camera-design__edges" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            {captured ? (
              <span className="camera-design__confirmation" aria-hidden="true">
                <Check size={32} />
              </span>
            ) : null}
          </div>
          <footer className="camera-design__footer">
            <button
              className="camera-design__gallery"
              aria-label="Choose gallery image for this preview"
              aria-busy={loading}
              disabled={loading}
              onClick={() => input.current?.click()}
            >
              {loading ? (
                <LoaderCircle
                  className="is-loading"
                  aria-hidden="true"
                  size={26}
                />
              ) : image ? (
                <img src={image.url} alt="Selected local image thumbnail" />
              ) : (
                <Images size={27} aria-hidden="true" />
              )}
            </button>
            <button
              className="camera-design__shutter"
              aria-label="Simulate capture"
              disabled={loading}
              onClick={() => {
                setCaptured(true);
                setMessage(
                  "Simulated capture complete. No photo was taken or saved.",
                );
              }}
            >
              <span />
            </button>
            <span
              className="camera-design__footer-balance"
              aria-hidden="true"
            />
          </footer>
          <input
            hidden
            ref={input}
            type="file"
            accept="image/*"
            aria-label="Choose local preview image"
            onChange={(e) => {
              void select(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </section>
      </div>
      <div className="camera-design__feedback">
        <p role="status" aria-live="polite">
          {message}
        </p>
        {error ? <p role="alert">{error}</p> : null}
        <p>
          Native gallery access and hardware light are not represented by this
          browser preview.
        </p>
      </div>
    </main>
  );
}
if (import.meta.env.DEV)
  createRoot(document.getElementById("fixture")!).render(
    <StrictMode>
      <CameraDesignPreview />
    </StrictMode>,
  );
