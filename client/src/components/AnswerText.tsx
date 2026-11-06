import type { ReactNode } from "react";

/**
 * Tiny, dependency-free renderer for the LLM's markdown-ish output:
 * bullets, numbered lists, headings, **bold**, `inline code` and ``` fences.
 * Builds React nodes (no dangerouslySetInnerHTML), and tolerates
 * half-streamed input such as an unclosed ** or ``` fence.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-zinc-50">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[0.85em] text-sky-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export function AnswerText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];

  let listItems: ReactNode[] = [];
  let listOrdered = false;
  let codeLines: string[] | null = null;

  const flushList = () => {
    if (listItems.length === 0) return;
    const ListTag = listOrdered ? "ol" : "ul";
    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        className={`my-2 space-y-2 pl-5 ${
          listOrdered ? "list-decimal" : "list-disc"
        } marker:text-zinc-500`}
      >
        {listItems}
      </ListTag>
    );
    listItems = [];
  };

  const flushCode = () => {
    if (!codeLines) return;
    blocks.push(
      <pre
        key={`code-${blocks.length}`}
        className="my-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm leading-relaxed text-zinc-200"
      >
        <code>{codeLines.join("\n")}</code>
      </pre>
    );
    codeLines = null;
  };

  lines.forEach((rawLine, i) => {
    const line = rawLine.trimEnd();

    if (line.trimStart().startsWith("```")) {
      if (codeLines) {
        flushCode();
      } else {
        flushList();
        codeLines = [];
      }
      return;
    }

    if (codeLines) {
      codeLines.push(rawLine);
      return;
    }

    const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (listItems.length > 0 && ordered !== listOrdered) flushList();
      listOrdered = ordered;
      const content = (bullet ?? numbered)![1];
      listItems.push(
        <li key={`li-${i}`} className="pl-1">
          {renderInline(content, `li-${i}`)}
        </li>
      );
      return;
    }

    flushList();

    if (!line.trim()) return;

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p
          key={`h-${i}`}
          className="mt-3 mb-1 text-sm font-semibold tracking-wide text-zinc-400 uppercase"
        >
          {renderInline(heading[1], `h-${i}`)}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`p-${i}`} className="my-2">
        {renderInline(line, `p-${i}`)}
      </p>
    );
  });

  flushList();
  flushCode();

  return <div className="text-[1.05rem] leading-relaxed text-zinc-200">{blocks}</div>;
}
