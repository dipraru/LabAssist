import type { ProblemContentFormat } from './ProblemContent';

type ProblemContentFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  format: ProblemContentFormat;
  onFormatChange: (format: ProblemContentFormat) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
};

export function ProblemContentField({
  label,
  value,
  onChange,
  format,
  onFormatChange,
  rows = 4,
  placeholder,
  className = '',
  textareaClassName = '',
}: ProblemContentFieldProps) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(['text', 'latex'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onFormatChange(item)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-extrabold transition-colors ${
                format === item
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white hover:text-teal-700'
              }`}
            >
              {item === 'text' ? 'Text' : 'LaTeX'}
            </button>
          ))}
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 ${textareaClassName}`}
      />
    </div>
  );
}
