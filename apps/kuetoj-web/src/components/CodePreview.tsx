import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-text';
import 'ace-builds/src-noconflict/theme-github';

const LANGUAGE_MODES: Record<string, string> = {
  c: 'c_cpp',
  cpp: 'c_cpp',
  java: 'java',
  python: 'python',
  python3: 'python',
  javascript: 'javascript',
  js: 'javascript',
};

type CodePreviewProps = {
  code: string;
  language?: string | null;
  height?: string;
  name: string;
};

export function CodePreview({ code, language, height = '360px', name }: CodePreviewProps) {
  const mode = LANGUAGE_MODES[String(language ?? '').toLowerCase()] ?? 'text';

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
      <AceEditor
        mode={mode}
        theme="github"
        value={code}
        readOnly
        name={name}
        width="100%"
        height={height}
        fontSize={13}
        showGutter
        highlightActiveLine={false}
        setOptions={{
          useWorker: false,
          showPrintMargin: false,
          tabSize: 2,
          wrap: true,
        }}
        editorProps={{ $blockScrolling: true }}
      />
    </div>
  );
}
