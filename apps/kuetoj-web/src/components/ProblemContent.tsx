import katex from 'katex';
import 'katex/dist/katex.min.css';

export type ProblemContentFormat = 'text' | 'latex';

type ProblemContentProps = {
  value?: string | null;
  format?: ProblemContentFormat | string | null;
  className?: string;
};

type ContentToken =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; display: boolean };

function findNextMath(source: string, fromIndex: number) {
  const candidates = [
    { start: source.indexOf('$$', fromIndex), opener: '$$', closer: '$$', display: true },
    { start: source.indexOf('\\[', fromIndex), opener: '\\[', closer: '\\]', display: true },
    { start: source.indexOf('\\(', fromIndex), opener: '\\(', closer: '\\)', display: false },
    { start: source.indexOf('$', fromIndex), opener: '$', closer: '$', display: false },
  ].filter((candidate) => candidate.start >= 0);

  if (!candidates.length) return null;

  candidates.sort((left, right) => left.start - right.start);
  return candidates[0];
}

function tokenizeLatex(source: string): ContentToken[] {
  const tokens: ContentToken[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const next = findNextMath(source, cursor);
    if (!next) {
      tokens.push({ kind: 'text', value: source.slice(cursor) });
      break;
    }

    if (next.start > cursor) {
      tokens.push({ kind: 'text', value: source.slice(cursor, next.start) });
    }

    const contentStart = next.start + next.opener.length;
    const end = source.indexOf(next.closer, contentStart);
    if (end < 0) {
      tokens.push({ kind: 'text', value: source.slice(next.start) });
      break;
    }

    tokens.push({
      kind: 'math',
      value: source.slice(contentStart, end),
      display: next.display,
    });
    cursor = end + next.closer.length;
  }

  return tokens.length ? tokens : [{ kind: 'text', value: source }];
}

function renderMath(value: string, displayMode: boolean) {
  return katex.renderToString(value, {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
  });
}

export function ProblemContent({ value, format, className = '' }: ProblemContentProps) {
  const text = value && value.length ? value : '-';

  if (format !== 'latex') {
    return <pre className={`whitespace-pre-wrap font-sans ${className}`}>{text}</pre>;
  }

  return (
    <div className={`whitespace-pre-wrap font-sans ${className}`}>
      {tokenizeLatex(text).map((token, index) => {
        if (token.kind === 'text') {
          return <span key={`text-${index}`}>{token.value}</span>;
        }

        const Tag = token.display ? 'div' : 'span';
        return (
          <Tag
            key={`math-${index}`}
            className={token.display ? 'my-3 overflow-x-auto py-1' : 'inline-block max-w-full align-baseline'}
            dangerouslySetInnerHTML={{ __html: renderMath(token.value, token.display) }}
          />
        );
      })}
    </div>
  );
}
