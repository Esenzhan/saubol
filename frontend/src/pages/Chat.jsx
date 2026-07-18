import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api/client.js";

// Assistant replies come back as GFM markdown (headings, bold, tables) — the
// AI writes them assuming they'll be rendered, not read as raw text. Maps
// each markdown element to the app's own type scale/tokens instead of
// react-markdown's unstyled defaults.
const MARKDOWN_COMPONENTS = {
  h1: ({ children }) => <p className="font-display text-base font-semibold mt-3 mb-1.5 first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="font-display text-base font-semibold mt-3 mb-1.5 first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="font-medium mt-2.5 mb-1 first:mt-0">{children}</p>,
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  hr: () => <hr className="border-ink/10 my-3" />,
  code: ({ children }) => <code className="bg-ink/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2 rounded border border-ink/10">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-ink/5">{children}</thead>,
  th: ({ children }) => <th className="px-2 py-1.5 text-left font-medium border-b border-ink/10 whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1.5 border-b border-ink/5 last:border-0 whitespace-nowrap">{children}</td>,
};

function MessageContent({ role, content }) {
  if (role === "user") return <p className="whitespace-pre-wrap">{content}</p>;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}

export default function Chat() {
  const { data, mutate } = useSWR("chatHistory", () => api.getChatHistory());
  const messages = data?.messages ?? [];
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const question = input;
    setInput("");
    const withQuestion = [...messages, { role: "user", content: question }];
    mutate({ messages: withQuestion }, false);
    setSending(true);
    try {
      const res = await api.sendChatMessage(question);
      mutate({ messages: [...withQuestion, { role: "assistant", content: res.answer }] }, false);
    } catch (err) {
      mutate({ messages: [...withQuestion, { role: "assistant", content: `Ошибка: ${err.message}` }] }, false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <p className="font-display font-light tracking-tight text-3xl mb-1">Ассистент</p>
      <p className="text-ink/60 mb-6">Задайте вопрос по своим анализам и медкарте</p>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${
            m.role === "user" ? "ml-auto bg-moss text-onaccent" : "bg-surface border border-ink/10"
          }`}>
            <MessageContent role={m.role} content={m.content} />
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-sm text-ink/50">
            Например: «Как менялся мой гемоглобин за последний год?»
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Спросите о своих анализах…"
          className="flex-1 rounded-md border border-ink/15 bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-moss"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-moss text-onaccent px-5 text-sm font-medium hover:bg-moss/90 transition-colors disabled:opacity-60"
        >
          {sending ? "…" : "Отправить"}
        </button>
      </form>
    </div>
  );
}
