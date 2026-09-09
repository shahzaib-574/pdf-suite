import { useState } from 'react';
import { ArrowUpRight, Search, ShieldCheck, Moon, Sun, Files, Monitor, ArrowRight } from 'lucide-react';
import { TOOLS, toolMatchesQuery } from '../lib/catalog';
import { TOOL_ICONS } from '../screens/icons';
import { useTheme } from '../theme/context';

const categories = ['All tools', 'Convert', 'Organize', 'Edit & protect', 'Capture & read'] as const;
type Category = typeof categories[number];
const groups: Record<string, Category> = {
  merge: 'Organize', split: 'Organize', organize: 'Organize', compress: 'Organize',
  images: 'Convert', 'pdf-images': 'Convert', 'docx-pdf': 'Convert', 'pdf-docx': 'Convert',
  watermark: 'Edit & protect', numbers: 'Edit & protect', protect: 'Edit & protect',
  scan: 'Capture & read', view: 'Capture & read',
};
const titles: Record<string, string> = { merge: 'Merge PDF', split: 'Split PDF', compress: 'Compress PDF', scan: 'Scan to PDF', organize: 'Organize PDF', protect: 'Protect PDF', view: 'PDF reader' };

export function WebHeader() {
  const { resolvedTheme, toggleTheme } = useTheme();
  return <header className="web-header">
    <a className="web-brand" href="#/" aria-label="Ream PDF Suite home"><Files size={30} strokeWidth={2} /><span>ream<span className="web-brand-sub">PDF SUITE</span></span></a>
    <nav id="primary-navigation" aria-label="Primary navigation">
      <a href="#/">All PDF tools</a><a href="#/tool/pdf-docx">PDF to Word</a><a href="#/recents">Recent files</a>
      <button className="web-theme" type="button" onClick={toggleTheme} aria-label={resolvedTheme === 'dark' ? 'Use light theme' : 'Use dark theme'}>{resolvedTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
    </nav>
  </header>;
}

export function WebHome() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('All tools');
  const tools = TOOLS.filter(tool => tool.available !== false && toolMatchesQuery(tool, query) && (category === 'All tools' || groups[tool.id] === category));
  return <main className="web-home" id="main-content">
    <section className="web-hero">
      <div className="web-hero-copy"><p className="web-eyebrow">A LITTLE LESS PAPERWORK.</p><h1>Big plans.<br />Small PDF problems.</h1><p>Merge, convert, organize and protect your PDFs. All in your browser. All on your terms.</p><a className="web-cta" href="#/tool/merge">Start with a PDF <ArrowRight size={19} /></a></div>
      <div className="web-feature"><div className="web-feature-top"><ShieldCheck size={30} /><span>YOUR FILES STAY YOURS</span></div><h2>Your browser.<br /> Your workspace.</h2><p>Documents are processed on this device. No file uploads. No account to create.</p><div className="web-feature-bottom"><span>{TOOLS.length} tools. One place.</span><Monitor size={23}/></div></div>
    </section>
    <section className="web-tools" aria-labelledby="web-tools-title">
      <div className="web-tools-heading"><h2 id="web-tools-title">What would you like to do?</h2><label className="web-search"><Search size={19}/><input type="search" aria-label="Search PDF tools" placeholder="Find a PDF tool…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
      <div className="web-filters" role="group" aria-label="Filter tools">{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="web-tool-grid">{tools.map(tool => { const Icon = TOOL_ICONS[tool.id]; return <a className={`web-tool web-tool--${groups[tool.id]?.split(' ')[0].toLowerCase()}`} href={`#/tool/${tool.id}`} key={tool.id}><div className="web-tool-icons"><span><Icon size={28} strokeWidth={1.7}/></span><ArrowUpRight size={18}/></div><h3>{titles[tool.id] ?? tool.title}</h3><p>{tool.blurb}.</p></a>; })}</div>
      {!tools.length && <div className="web-empty" role="status"><h3>No tools found</h3><p>Try another search or choose All tools.</p><button type="button" onClick={() => {setQuery('');setCategory('All tools');}}>Clear filters</button></div>}
    </section>
    <section className="web-how"><h2>From to-do to done.</h2><ol><li><span>01</span><h3>Choose your tool</h3><p>One focused workspace for the task at hand.</p></li><li><span>02</span><h3>Add your files</h3><p>Choose documents from your device and adjust the options.</p></li><li><span>03</span><h3>Make it yours</h3><p>Process locally, then download your finished file.</p></li></ol></section>
    <section className="web-faq"><h2>Good to know.</h2><details><summary>Are my documents uploaded?</summary><p>No. PDF processing happens in your browser. Your recent files are stored in this browser on this device; you can remove them from Recent files. Hosting services still receive normal page requests.</p></details><details><summary>Which files can I work with?</summary><p>PDFs, DOCX documents, and JPEG, PNG or WebP images. Inputs are limited to 200 files and 128 MB in total. Individual tools may have additional limits.</p></details><details><summary>Will Word conversions look exactly the same?</summary><p>PDF to Word rebuilds editable text, tables and images, with English OCR for scanned pages. Complex layouts can change. Word to PDF supports simplified DOCX conversion; review the output before sharing.</p></details><details><summary>Can I scan a document with my phone?</summary><p>Yes. Open Scan to PDF and allow camera access, or select photos already on your device. Review and adjust the pages before creating the PDF.</p></details></section>
  </main>;
}

export function WebFooter() {
  return <footer className="web-footer"><a className="web-brand" href="#/"><Files size={25}/><span>ream</span></a><p>Less paperwork. More possibility.</p><nav aria-label="Footer"><a href="./privacy.html">Privacy</a><a href="#/settings">Preferences</a><a href="#/recents">Your files</a></nav></footer>;
}
