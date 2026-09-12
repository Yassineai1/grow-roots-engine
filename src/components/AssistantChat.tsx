import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { askBusinessAssistant } from "@/lib/assistant.functions";

type ChatMessage = { role: "user" | "assistant"; content: string };

const WELCOME =
  "Hi! 👋 I can help you understand our services, prices, durations, and booking options. What would you like to know?";

const ERROR_TEXT: Record<string, string> = {
  busy: "The assistant is a bit busy right now. Please try again in a moment.",
  credits: "Sorry, the assistant is temporarily unavailable. You can still browse the services and book directly.",
  unavailable:
    "Sorry, the assistant is temporarily unavailable. You can still browse the services and book directly.",
  not_found:
    "Sorry, the assistant is temporarily unavailable. You can still browse the services and book directly.",
};

const SUGGESTIONS = [
  "What services do you offer?",
  "Which one do you recommend for a beginner?",
  "How much does it cost?",
];

export function AssistantChat({
  businessSlug,
  businessName,
  onBookNow,
}: {
  businessSlug: string;
  businessName?: string | null | undefined;
  onBookNow?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(askBusinessAssistant);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await ask({ data: { slug: businessSlug, messages: next.slice(-12) } });
      setMessages([
        ...next,
        {
          role: "assistant",
          content: res.ok && res.reply ? res.reply : (ERROR_TEXT[res.error ?? "unavailable"] ?? ERROR_TEXT["unavailable"]!),
        },
      ]);
    } catch {
      setMessages([...next, { role: "assistant", content: ERROR_TEXT["unavailable"]! }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="ui-btn fixed bottom-4 left-4 z-40 shadow-lg sm:bottom-6 sm:left-6"
          aria-label="Ask our AI Assistant"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Assistant
        </button>
      )}

      {open && (
        <div className="fixed inset-x-3 bottom-3 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:bottom-6 sm:left-6 sm:h-[560px] sm:w-[380px]">
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">AI Assistant</p>
              <p className="truncate text-xs text-muted-foreground">
                {businessName ?? "Services, prices & booking"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Clear conversation"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <p className="max-w-[85%] text-sm leading-relaxed text-foreground">{WELCOME}</p>
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="ui-btn-secondary text-xs">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {m.content}
                  </p>
                </div>
              ) : (
                <p key={i} className="max-w-[92%] whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {m.content}
                </p>
              ),
            )}
            {busy && <p className="text-sm text-muted-foreground">Thinking…</p>}
            {messages.length > 0 && onBookNow && (
              <button
                onClick={() => {
                  onBookNow();
                  setOpen(false);
                }}
                className="ui-btn-secondary w-full text-xs"
              >
                Book a service
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about services, prices…"
              className="ui-input"
              aria-label="Message"
            />
            <button type="submit" disabled={busy || !input.trim()} className="ui-btn shrink-0" aria-label="Send">
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
