import { useRef, useState, type ChangeEvent } from "react";
import { Check, ChevronDown, FileUp, Loader2 } from "lucide-react";
import { uploadDocument } from "../services/upload.service";

interface ContextPanelProps {
  connected: boolean;
  saved: boolean;
  onEdited: () => void;
  onSave: (resumeText: string, jobDescription: string) => void;
  onError: (message: string) => void;
}

type Field = "resume" | "jd";

export function ContextPanel({
  connected,
  saved,
  onEdited,
  onSave,
  onError,
}: ContextPanelProps) {
  const [open, setOpen] = useState(true);
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [uploading, setUploading] = useState<Field | null>(null);

  const resumeInput = useRef<HTMLInputElement>(null);
  const jdInput = useRef<HTMLInputElement>(null);

  const handleUpload = async (
    field: Field,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(field);
    try {
      const result = await uploadDocument(file);
      if (field === "resume") setResumeText(result.text);
      else setJobDescription(result.text);
      onEdited();
    } catch (error) {
      onError(
        error instanceof Error
          ? `Upload failed: ${error.message}`
          : "Upload failed"
      );
    } finally {
      setUploading(null);
    }
  };

  const hasContext = resumeText.trim() || jobDescription.trim();

  const fields: {
    id: Field;
    label: string;
    value: string;
    set: (v: string) => void;
    input: typeof resumeInput;
    placeholder: string;
  }[] = [
    {
      id: "resume",
      label: "Resume / summary",
      value: resumeText,
      set: setResumeText,
      input: resumeInput,
      placeholder: "Paste your resume or a short summary of your experience…",
    },
    {
      id: "jd",
      label: "Job description",
      value: jobDescription,
      set: setJobDescription,
      input: jdInput,
      placeholder: "Paste the job description…",
    },
  ];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            Candidate context
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {saved
              ? "Saved — answers use your resume and JD"
              : "Answers are personalised from this"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-800 px-5 pt-4 pb-5">
          {fields.map((f) => (
            <div key={f.id}>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor={`ctx-${f.id}`}
                  className="text-xs font-medium text-zinc-400"
                >
                  {f.label}
                </label>
                <button
                  type="button"
                  onClick={() => f.input.current?.click()}
                  disabled={uploading !== null}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
                >
                  {uploading === f.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <FileUp className="h-3 w-3" />
                  )}
                  Upload PDF/DOCX
                </button>
                <input
                  ref={f.input}
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={(e) => handleUpload(f.id, e)}
                />
              </div>
              <textarea
                id={`ctx-${f.id}`}
                value={f.value}
                onChange={(e) => {
                  f.set(e.target.value);
                  onEdited();
                }}
                placeholder={f.placeholder}
                rows={5}
                className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              />
              <p className="mt-1 text-right text-[11px] text-zinc-600">
                {f.value.length.toLocaleString()} chars
              </p>
            </div>
          ))}

          <button
            type="button"
            onClick={() => onSave(resumeText, jobDescription)}
            disabled={!connected || !hasContext}
            className="w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saved ? "Update context" : "Save context"}
          </button>
        </div>
      )}
    </section>
  );
}
