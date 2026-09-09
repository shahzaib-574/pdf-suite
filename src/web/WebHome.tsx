import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, FilePenLine, Search, Moon, Sun } from 'lucide-react';
import { APP_SHORT_NAME, TOOLS, toolMatchesQuery } from '../lib/catalog';
import { TOOL_ICONS } from '../screens/icons';
import { useTheme } from '../theme/context';
import { navigate } from '../screens/nav';
import type { ToolId } from '../lib/types';

const categories = ['All tools', 'Convert', 'Organize', 'Edit & protect', 'Capture & read'] as const;
type Category = typeof categories[number];
const groups: Record<string, Category> = {
  merge: 'Organize', split: 'Organize', organize: 'Organize', compress: 'Organize',
  images: 'Convert', 'pdf-images': 'Convert', 'docx-pdf': 'Convert', 'pdf-docx': 'Convert',
  watermark: 'Edit & protect', numbers: 'Edit & protect', protect: 'Edit & protect',
  scan: 'Capture & read', view: 'Capture & read',
};
const titles: Record<string, string> = { merge: 'Merge PDF', split: 'Split PDF', compress: 'Compress PDF', scan: 'Scan to PDF', organize: 'Organize PDF', protect: 'Protect PDF', view: 'PDF reader' };

function websiteTools() {
  return TOOLS.filter((tool) => tool.available !== false && tool.id !== 'scan');
}

function ToolMark({ id }: { id: ToolId }) {
  if (id === 'docx-pdf') {
    return (
      <span className="web-tool-mark web-tool-mark--docx">
        <FilePenLine size={20} strokeWidth={2.05} />
        <span className="web-tool-mark__strip">Docx</span>
      </span>
    );
  }
  const Icon = TOOL_ICONS[id];
  return (
    <span>
      <Icon size={28} strokeWidth={1.7} />
    </span>
  );
}

type WebNav = {
  category: Category;
  setCategory: (category: Category) => void;
};

const WebNavContext = createContext<WebNav | null>(null);

export function WebNavProvider({ children }: { children: ReactNode }) {
  const [category, setCategory] = useState<Category>('All tools');
  const value = useMemo(() => ({ category, setCategory }), [category]);
  return <WebNavContext.Provider value={value}>{children}</WebNavContext.Provider>;
}

function useWebNav(): WebNav {
  const ctx = useContext(WebNavContext);
  if (!ctx) throw new Error('WebNavProvider required');
  return ctx;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <a className="web-brand" href="#/" aria-label="Ream PDF Suite home">
      <img className="web-brand-mark" src="./favicon.svg" alt="" width={34} height={34} />
      <span className="web-brand-copy">
        <span className="web-brand-name">{APP_SHORT_NAME}</span>
        {compact ? null : <span className="web-brand-tag">On-device PDF tools</span>}
      </span>
    </a>
  );
}

export function WebHeader() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const { category, setCategory } = useWebNav();
  return (
    <header className="web-header">
      <BrandMark />
      <nav id="primary-navigation" aria-label="Primary navigation">
        <div className="web-filters" role="group" aria-label="Filter tools">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={category === item}
              onClick={() => {
                setCategory(item);
                const hash = window.location.hash || '#/';
                if (hash !== '#/' && hash !== '#') navigate('#/');
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </nav>
      <button
        className="web-theme"
        type="button"
        onClick={toggleTheme}
        aria-label={resolvedTheme === 'dark' ? 'Use light theme' : 'Use dark theme'}
      >
        {resolvedTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </header>
  );
}

export function WebHome() {
  const [query, setQuery] = useState('');
  const { category, setCategory } = useWebNav();
  const tools = websiteTools().filter(
    (tool) =>
      toolMatchesQuery(tool, query) &&
      (category === 'All tools' || groups[tool.id] === category),
  );
  return (
    <main className="web-home" id="main-content">
      <section className="web-tools" aria-labelledby="web-tools-title">
        <div className="web-tools-heading">
          <h1 id="web-tools-title">Make Your Documents Ready</h1>
          <label className="web-search">
            <Search size={19} />
            <input
              type="search"
              aria-label="Search PDF tools"
              placeholder="Find a PDF tool…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="web-tool-grid">
          {tools.map((tool) => {
            return (
              <a
                className={`web-tool web-tool--${tool.id === 'docx-pdf' ? 'docx' : groups[tool.id]?.split(' ')[0].toLowerCase()}`}
                href={`#/tool/${tool.id}`}
                key={tool.id}
              >
                <div className="web-tool-icons">
                  <ToolMark id={tool.id} />
                  <ArrowUpRight size={18} />
                </div>
                <h3>{titles[tool.id] ?? tool.title}</h3>
                <p>{tool.blurb}.</p>
              </a>
            );
          })}
        </div>
        {!tools.length && (
          <div className="web-empty" role="status">
            <h3>No tools found</h3>
            <p>Try another search or choose All tools.</p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('All tools');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
      <section className="web-how">
        <h2>From to-do to done.</h2>
        <ol>
          <li>
            <span>01</span>
            <h3>Choose your tool</h3>
            <p>One focused workspace for the task at hand.</p>
          </li>
          <li>
            <span>02</span>
            <h3>Add your files</h3>
            <p>Choose documents from your device and adjust the options.</p>
          </li>
          <li>
            <span>03</span>
            <h3>Make it yours</h3>
            <p>Process locally, then download your finished file.</p>
          </li>
        </ol>
      </section>
      <section className="web-faq">
        <h2>Good to know.</h2>
        <details>
          <summary>Are my documents uploaded?</summary>
          <p>
            No. PDF processing happens in your browser. Your recent files are stored in this browser on this device; you can remove them from Recent files. Hosting services still receive normal page requests.
          </p>
        </details>
        <details>
          <summary>Which files can I work with?</summary>
          <p>
            PDFs, DOCX documents, and JPEG, PNG or WebP images. Inputs are limited to 200 files and 128 MB in total. Individual tools may have additional limits.
          </p>
        </details>
        <details>
          <summary>Will Word conversions look exactly the same?</summary>
          <p>
            PDF to Word rebuilds editable text, tables and images, with English OCR for scanned pages. Complex layouts can change. Word to PDF supports simplified DOCX conversion; review the output before sharing.
          </p>
        </details>
      </section>
    </main>
  );
}

export function WebFooter() {
  return (
    <footer className="web-footer">
      <div className="web-footer-brand">
        <BrandMark />
        <p>Less paperwork. More possibility.</p>
      </div>
      <nav className="web-footer-nav web-footer-nav--solutions" aria-labelledby="web-footer-solutions">
        <h2 id="web-footer-solutions">Solutions</h2>
        <ul>
          {websiteTools().map((tool) => (
            <li key={tool.id}>
              <a href={`#/tool/${tool.id}`}>{titles[tool.id] ?? tool.title}</a>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="web-footer-nav web-footer-nav--links" aria-labelledby="web-footer-links">
        <h2 id="web-footer-links">Navigate</h2>
        <ul>
          <li>
            <a href="#/">All tools</a>
          </li>
          <li>
            <a href="#/recents">Your files</a>
          </li>
          <li>
            <a href="#/settings">Preferences</a>
          </li>
          <li>
            <a href="./privacy.html">Privacy</a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
