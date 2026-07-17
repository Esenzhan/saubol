import { useEffect, useState } from "react";
import { api } from "../api/client.js";

export default function Admin() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listAdminUsers().then((res) => setUsers(res.users)).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <p className="font-display font-light tracking-tight text-3xl mb-1">Админ</p>
      <p className="text-ink/60 mb-8">Все зарегистрированные аккаунты</p>

      {error && <p className="text-sm text-danger">{error}</p>}

      {users && (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-md border border-ink/10 bg-surface px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {u.email}
                  {u.is_admin && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-moss/10 text-moss">админ</span>}
                </p>
                <p className="text-xs text-ink/50 mt-0.5">
                  {u.full_name || "Без имени"} · зарегистрирован {new Date(u.created_at).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <span className="text-xs text-ink/40">{u.document_count} документов</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
