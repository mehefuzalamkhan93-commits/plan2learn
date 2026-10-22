'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Renders AI-generated answers, study tool results, and notes as styled Markdown.
 * Uses react-markdown + remark-gfm (no raw HTML injection).
 */
export default function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn('ai-markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h4>{children}</h4>,
          h5: ({ children }) => <h5>{children}</h5>,
          h6: ({ children }) => <h6>{children}</h6>,
          p: ({ children }) => <p>{children}</p>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong>{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          hr: () => <hr />,
          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
          code: ({ className, children, ...props }) => (
            <code className={className} {...props}>
              {children}
            </code>
          ),
          pre: ({ children }) => <pre>{children}</pre>,
          table: ({ children }) => (
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th>{children}</th>,
          td: ({ children }) => <td>{children}</td>,
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt || ''} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
