import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  Search,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';

type GuideSection = {
  level: 'Basic' | 'Intermediate' | 'Advanced';
  title: string;
  summary: string;
  tags: string[];
  bullets: string[];
  examples?: { label: string; code: string }[];
};

const guideSections: GuideSection[] = [
  {
    level: 'Basic',
    title: 'Problem Statement Structure',
    summary:
      'A strong statement tells the story, defines the task, then moves into exact input and output rules.',
    tags: ['statement', 'structure', 'input', 'output', 'samples'],
    bullets: [
      'Start with the objective in one or two short paragraphs.',
      'Define every variable before using it in constraints or formulas.',
      'Keep the input format and output format separate from the main story.',
      'Put sample explanations after the sample case only when they clarify the expected reasoning.',
      'Avoid hidden assumptions such as sorted input, unique values, one-indexing, or modulo unless you write them explicitly.',
    ],
  },
  {
    level: 'Basic',
    title: 'Using Text and LaTeX Modes',
    summary:
      'Use Text mode for ordinary statements and LaTeX mode when the statement needs math notation rendered inline.',
    tags: ['text mode', 'latex mode', 'renderer', 'katex'],
    bullets: [
      'The KUETOJ renderer preserves line breaks and spacing; it does not convert Markdown headings or tables automatically.',
      'Use LaTeX mode for math-heavy statements, constraints, equations, and explanations.',
      'Write normal prose as normal text even in LaTeX mode; only wrap formulas in math delimiters.',
      'Do not paste a full LaTeX document with documentclass, packages, begin document, or end document.',
    ],
    examples: [
      {
        label: 'Inline and display math',
        code: String.raw`Inline: \(1 \le n \le 10^5\)
Display:
\[
answer = \sum_{i=1}^{n} a_i
\]`,
      },
    ],
  },
  {
    level: 'Basic',
    title: 'Common Math Notation',
    summary:
      'Most contest statements only need inequalities, superscripts, subscripts, fractions, sums, and modulo notation.',
    tags: ['constraints', 'inequality', 'fraction', 'sum', 'modulo'],
    bullets: [
      'Use ^ for superscripts and _ for subscripts.',
      'Wrap multi-character superscripts or subscripts in braces.',
      'Use \\le and \\ge for less-than-or-equal and greater-than-or-equal.',
      'Use \\cdot for multiplication when x could be confused with a variable.',
      'Write modulo clearly, especially whether the final answer or an intermediate value is modulo M.',
    ],
    examples: [
      {
        label: 'Contest notation',
        code: String.raw`\(1 \le n \le 2 \cdot 10^5\)
\(a_i \le 10^9\)
\(\frac{x + y}{2}\)
\(\sum_{i=1}^{n} a_i\)
\(10^9 + 7\)`,
      },
    ],
  },
  {
    level: 'Basic',
    title: 'Escaping Special Characters',
    summary:
      'Some characters have special meaning in LaTeX and should be escaped when they are meant as literal text.',
    tags: ['escape', 'special characters', 'underscore', 'percent'],
    bullets: [
      'Use \\_ for a literal underscore in names such as file_name.',
      'Use \\% for a literal percent sign.',
      'Use \\{ and \\} for literal braces.',
      'Use \\text{...} inside math when a word must appear inside a formula.',
      'If a formula fails to render, check for missing braces and unclosed math delimiters first.',
    ],
    examples: [
      {
        label: 'Literal text inside math',
        code: String.raw`\(score = \text{accepted} \times 100\)
Use file\_name when writing a literal underscore.`,
      },
    ],
  },
  {
    level: 'Intermediate',
    title: 'Constraints and Edge Cases',
    summary:
      'Constraints should tell participants both the allowed input range and the algorithmic scale of the task.',
    tags: ['constraints', 'edge cases', 'limits', 'complexity'],
    bullets: [
      'State the number of test cases and whether the sum of n over all tests is bounded.',
      'Mention if values may be negative, zero, duplicated, disconnected, cyclic, or empty.',
      'Use one consistent indexing convention and say whether arrays are 0-indexed or 1-indexed.',
      'If floating-point output is accepted, specify absolute or relative error.',
      'Match constraints to the intended solution complexity and hidden tests.',
    ],
    examples: [
      {
        label: 'Multi-test constraints',
        code: String.raw`The first line contains \(T\) test cases.
The sum of \(n\) over all test cases does not exceed \(2 \cdot 10^5\).`,
      },
    ],
  },
  {
    level: 'Intermediate',
    title: 'Sample Cases and Explanations',
    summary:
      'Samples should be small enough to inspect and representative enough to prevent misreading the task.',
    tags: ['sample', 'sample explanation', 'test cases'],
    bullets: [
      'Keep sample input and output exactly as participants should see them.',
      'Do not include prompts, arrows, extra labels, or comments inside sample input/output blocks.',
      'Use the note field to explain non-obvious sample output.',
      'Include at least one normal case; add corner cases only if they teach an important rule.',
      'Make sure sample output has the exact required formatting.',
    ],
  },
  {
    level: 'Intermediate',
    title: 'Piecewise, Cases, and Aligned Equations',
    summary:
      'Use display math for formulas that are too wide or too important to hide inside a paragraph.',
    tags: ['cases', 'aligned', 'piecewise', 'equation'],
    bullets: [
      'Use cases for piecewise definitions.',
      'Use aligned when showing several related equations.',
      'Prefer display math for recurrence relations, dynamic programming formulas, and long derivations.',
      'Keep equations short; a readable formula beats a clever one.',
    ],
    examples: [
      {
        label: 'Piecewise value',
        code: String.raw`\[
f(x)=
\begin{cases}
0, & x < 0\\
x^2, & x \ge 0
\end{cases}
\]`,
      },
      {
        label: 'Aligned equations',
        code: String.raw`\[
\begin{aligned}
dp_i &= \min(dp_{i-1}, dp_{i-2}) + cost_i\\
answer &= dp_n
\end{aligned}
\]`,
      },
    ],
  },
  {
    level: 'Advanced',
    title: 'Sets, Graphs, and Matrices',
    summary:
      'Advanced notation is useful, but only when it reduces ambiguity for the participant.',
    tags: ['set', 'graph', 'matrix', 'vector', 'advanced'],
    bullets: [
      'Use \\in, \\notin, \\subseteq, \\cup, and \\cap for set notation.',
      'Define graph notation such as V, E, degree, path, tree, and connected component before using it.',
      'Use matrices only when the problem truly needs a grid or linear-algebra view.',
      'For grids, state row and column order and whether movement is 4-directional or 8-directional.',
    ],
    examples: [
      {
        label: 'Matrix',
        code: String.raw`\[
A =
\begin{bmatrix}
1 & 2\\
3 & 4
\end{bmatrix}
\]`,
      },
      {
        label: 'Set notation',
        code: String.raw`For every \(x \in S\), choose \(y \notin S\).`,
      },
    ],
  },
  {
    level: 'Advanced',
    title: 'Avoiding Ambiguity',
    summary:
      'Most wrong submissions caused by unclear statements are preventable before the contest starts.',
    tags: ['ambiguity', 'precision', 'validation', 'judge data'],
    bullets: [
      'Say exactly what to print when there is no solution.',
      'Say whether any valid answer is accepted when multiple answers exist.',
      'Use deterministic language for tie-breaking rules.',
      'Check that hidden tests include boundary values, smallest inputs, largest inputs, and adversarial shapes.',
      'Ask another judge to solve from the statement alone before publishing.',
    ],
  },
  {
    level: 'Advanced',
    title: 'Final Publishing Checklist',
    summary:
      'Before assigning a problem to a contest, verify statement clarity and judge-data consistency together.',
    tags: ['checklist', 'publish', 'quality', 'review'],
    bullets: [
      'Title is concise and does not reveal the intended algorithm.',
      'Statement, input, output, constraints, and samples agree with each other.',
      'Time and memory limits match the intended language mix.',
      'Sample tests are public and hidden tests are uploaded as input/output files.',
      'Preview the statement once in participant view before saving.',
    ],
  },
];

const resources = [
  {
    title: 'KaTeX Supported Functions',
    href: 'https://katex.org/docs/supported',
    description: 'Check which LaTeX commands are supported by the renderer.',
  },
  {
    title: 'Overleaf Mathematical Expressions',
    href: 'https://www.overleaf.com/learn/latex/Mathematical_expressions',
    description: 'A clear introduction to inline and display math.',
  },
  {
    title: 'Overleaf Symbol Guide',
    href: 'https://docs.overleaf.com/writing-and-editing/inserting-symbols',
    description: 'Useful when you need the command for a specific symbol.',
  },
  {
    title: 'LaTeX Wikibook: Mathematics',
    href: 'https://en.wikibooks.org/wiki/LaTeX/Mathematics',
    description: 'A deeper reference for math environments and notation.',
  },
  {
    title: 'TeX Stack Exchange',
    href: 'https://tex.stackexchange.com/',
    description: 'Search real questions and answers when a formula does not render as expected.',
  },
];

function sectionText(section: GuideSection) {
  return [
    section.level,
    section.title,
    section.summary,
    ...section.tags,
    ...section.bullets,
    ...(section.examples ?? []).flatMap((example) => [example.label, example.code]),
  ]
    .join(' ')
    .toLowerCase();
}

export function JudgeLatexGuide() {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return guideSections;
    return guideSections.filter((section) =>
      sectionText(section).includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  return (
    <AppShell fullWidth mainClassName="bg-slate-100/70">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <Link
              to="/problems/new"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 hover:border-teal-300 hover:text-teal-700"
            >
              <ArrowLeft size={16} />
              Problem Form
            </Link>
            <span className="rounded-md bg-teal-50 px-3 py-1.5 text-xs font-extrabold uppercase text-teal-800">
              Static Guide
            </span>
          </div>

          <div className="bg-slate-950 px-5 py-7 text-white">
            <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase text-teal-200">
              <BookOpenCheck size={16} />
              Judge Reference
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              LaTeX and Problem Statement Guide
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              Write clear KUETOJ statements with precise math, readable samples,
              and fewer participant misunderstandings.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="relative block">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notation, constraints, samples, matrix, modulo..."
              className="oj-input !pl-11"
            />
          </label>
          <p className="mt-3 text-sm font-semibold text-slate-500">
            Showing {filteredSections.length} of {guideSections.length} sections
          </p>
        </section>

        <div className="grid gap-4">
          {filteredSections.map((section) => (
            <article
              key={section.title}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase text-teal-700">
                    {section.level}
                  </p>
                  <h2 className="mt-1 text-xl font-extrabold text-slate-950">
                    {section.title}
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    {section.summary}
                  </p>
                </div>
                <div className="flex max-w-full flex-wrap gap-2">
                  {section.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <ul className="mt-4 grid gap-2">
                {section.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-2 text-sm font-semibold leading-6 text-slate-700"
                  >
                    <CheckCircle2
                      size={16}
                      className="mt-1 shrink-0 text-teal-700"
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              {section.examples?.length ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {section.examples.map((example) => (
                    <div
                      key={example.label}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs font-extrabold uppercase text-slate-600">
                        <FileText size={14} />
                        {example.label}
                      </div>
                      <pre className="overflow-auto whitespace-pre-wrap p-3 text-sm leading-6 text-slate-800">{example.code}</pre>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}

          {!filteredSections.length && (
            <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-lg font-extrabold text-slate-900">
                No guide sections found
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Try searching for math, sample, constraint, matrix, or modulo.
              </p>
            </section>
          )}
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-extrabold uppercase text-teal-700">
            Learn More
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-slate-950">
            Resource Links
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {resources.map((resource) => (
              <a
                key={resource.href}
                href={resource.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-200 bg-slate-50 p-4 hover:border-teal-300 hover:bg-teal-50"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-extrabold text-slate-950">
                    {resource.title}
                  </span>
                  <ExternalLink size={16} className="shrink-0 text-teal-700" />
                </span>
                <span className="mt-2 block text-sm font-semibold leading-6 text-slate-600">
                  {resource.description}
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
