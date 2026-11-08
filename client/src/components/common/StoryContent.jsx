import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Renders a success story's article HTML. The server already sanitises on save; this is a second
// pass in the browser so nothing unsafe can reach the page even if stored content was tampered with.
const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'style'];

const StoryContent = ({ html, className = '' }) => {
  const clean = useMemo(
    () => DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR }),
    [html]
  );
  if (!clean) return null;
  return <div className={`story-prose ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />;
};

export default StoryContent;
