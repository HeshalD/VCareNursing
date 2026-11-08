import React, { useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Link2, Link2Off,
  AlignLeft, AlignCenter, AlignRight, Quote, ImagePlus, Undo2, Redo2, Loader2,
} from 'lucide-react';

const STYLE_OPTIONS = [
  { value: 'h1', label: 'Header' },
  { value: 'h2', label: 'Sub-header 1' },
  { value: 'h3', label: 'Sub-header 2' },
  { value: 'p', label: 'Body' },
];

const ToolButton = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={!!active}
    disabled={disabled}
    // mousedown keeps the text selection in the editor while a button is pressed
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={`p-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      active ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    {children}
  </button>
);

const Divider = () => <span className="w-px h-6 bg-slate-200 mx-1" aria-hidden="true" />;

const isSafeUrl = (url) => /^(https?:\/\/|mailto:|tel:)/i.test(url);

// Rich-text editor for success-story articles. `value` is the initial HTML (the editor owns the
// content afterwards); `onChange` receives sanitisable HTML, or '' when the article is empty.
const RichTextEditor = ({ value, onChange, onUploadImage }) => {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image,
    ],
    content: value || '',
    editorProps: { attributes: { class: 'story-prose px-5 py-4 focus:outline-none min-h-[18rem]' } },
    onUpdate: ({ editor: ed }) => onChange(ed.isEmpty ? '' : ed.getHTML()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) return null;
      let style = 'p';
      if (ed.isActive('heading', { level: 1 })) style = 'h1';
      else if (ed.isActive('heading', { level: 2 })) style = 'h2';
      else if (ed.isActive('heading', { level: 3 })) style = 'h3';
      return {
        style,
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        underline: ed.isActive('underline'),
        strike: ed.isActive('strike'),
        bullet: ed.isActive('bulletList'),
        ordered: ed.isActive('orderedList'),
        quote: ed.isActive('blockquote'),
        link: ed.isActive('link'),
        left: ed.isActive({ textAlign: 'left' }),
        center: ed.isActive({ textAlign: 'center' }),
        right: ed.isActive({ textAlign: 'right' }),
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
      };
    },
  });

  if (!editor || !state) return null;

  const setStyle = (v) => {
    const chain = editor.chain().focus();
    if (v === 'p') chain.setParagraph().run();
    else chain.setHeading({ level: Number(v.slice(1)) }).run();
  };

  const setLink = () => {
    const previous = editor.getAttributes('link').href || '';
    const input = window.prompt('Link address (https://…)', previous);
    if (input === null) return;
    const url = input.trim();
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!isSafeUrl(url)) {
      window.alert('Please enter a link starting with https://, http://, mailto: or tel:');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      editor.chain().focus().setImage({ src: url, alt: file.name.replace(/\.[^.]+$/, '') }).run();
    } catch (err) {
      setUploadError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-slate-300 rounded-xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50">
        <select
          value={state.style}
          onChange={(e) => setStyle(e.target.value)}
          aria-label="Text style"
          className="text-sm border border-slate-200 rounded-md bg-white px-2 py-1.5 mr-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Divider />
        <ToolButton title="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></ToolButton>
        <ToolButton title="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></ToolButton>
        <ToolButton title="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-4 h-4" /></ToolButton>
        <ToolButton title="Strikethrough" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton title="Bullet list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></ToolButton>
        <ToolButton title="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></ToolButton>
        <ToolButton title="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton title="Align left" active={state.left} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="w-4 h-4" /></ToolButton>
        <ToolButton title="Align centre" active={state.center} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="w-4 h-4" /></ToolButton>
        <ToolButton title="Align right" active={state.right} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton title="Add or edit link" active={state.link} onClick={setLink}><Link2 className="w-4 h-4" /></ToolButton>
        <ToolButton title="Remove link" disabled={!state.link} onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}><Link2Off className="w-4 h-4" /></ToolButton>
        <ToolButton title="Insert image" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        </ToolButton>
        <Divider />
        <ToolButton title="Undo" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="w-4 h-4" /></ToolButton>
        <ToolButton title="Redo" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="w-4 h-4" /></ToolButton>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImage} />
      </div>
      {uploadError && <p className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b border-red-100">{uploadError}</p>}
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
