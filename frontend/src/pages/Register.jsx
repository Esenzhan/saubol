import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.register({ fullName, email, password });
      localStorage.setItem("token", data.token);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <p className="font-display text-3xl mb-1">Создать медкарту</p>
        <p className="text-ink/60 text-sm mb-8">Все анализы и документы — в одном месте</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-ink/50">Имя</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-ink/50">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-ink/50">Пароль</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-moss text-white py-2.5 font-medium hover:bg-moss/90 transition-colors disabled:opacity-60"
          >
            {loading ? "Создаём…" : "Зарегистрироваться"}
          </button>
        </form>
        <p className="text-sm text-ink/60 mt-6">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-moss font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
