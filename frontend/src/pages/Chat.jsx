import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    api.getChatHistory().then((res) => setMessages(res.messages));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const question = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setSending(true);
    try {
      const res = await api.sendChatMessage(question);
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Ошибка: ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <p className="font-display text-3xl mb-1">Ассистент</p>
      <p className="text-ink/60 mb-6">Задайте вопрос по своим анализам и медкарте</p>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
            m.role === "user" ? "ml-auto bg-moss text-white" : "bg-white border border-ink/10"
          }`}>
            {m.content}
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
          className="flex-1 rounded-md border border-ink/15 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-moss"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-moss text-white px-5 text-sm font-medium hover:bg-moss/90 transition-colors disabled:opacity-60"
        >
          {sending ? "…" : "Отправить"}
        </button>
      </form>
    </div>
  );
}
