// VITE_API_URL is the backend's origin (e.g. https://saubol-backend.onrender.com),
// not the full API path — /api is always appended here so the env var can't
// be set with or without a trailing /api and silently break requests.
const BASE_URL = `${import.meta.env.VITE_API_URL || ""}/api`;

function getToken() {
  return localStorage.getItem("token");
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Что-то пошло не так");
  return data;
}

export const api = {
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  listDocuments: () => request("/documents"),
  getDocument: (id) => request(`/documents/${id}`),
  openDocumentFile: async (id) => {
    // Mobile browsers (Safari in particular) only allow window.open() to
    // succeed as a direct, synchronous result of the user's click — once
    // we're past an `await fetch(...)`, it's no longer considered a trusted
    // gesture and gets silently blocked. Open the tab synchronously first
    // (before any await), then point it at the file once it's downloaded.
    const newTab = window.open("", "_blank");
    try {
      const token = getToken();
      const res = await fetch(`${BASE_URL}/documents/${id}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Не удалось открыть файл");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (newTab) newTab.location.href = url;
      else window.open(url, "_blank");
    } catch (err) {
      if (newTab) newTab.close();
      throw err;
    }
  },
  uploadDocument: async (file, documentType) => {
    const formData = new FormData();
    formData.append("file", file);
    if (documentType) formData.append("documentType", documentType);
    const token = getToken();
    const res = await fetch(`${BASE_URL}/documents`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Не удалось загрузить документ");
    return data;
  },

  listBiomarkers: (name) => request(`/records/biomarkers${name ? `?name=${encodeURIComponent(name)}` : ""}`),
  listBiomarkerNames: () => request("/records/biomarkers/names"),
  listMedcard: (section) => request(`/records/medcard${section ? `?section=${encodeURIComponent(section)}` : ""}`),
  addMedcardEntry: (body) => request("/records/medcard", { method: "POST", body: JSON.stringify(body) }),

  getChatHistory: () => request("/chat"),
  sendChatMessage: (message) => request("/chat", { method: "POST", body: JSON.stringify({ message }) }),

  listAdminUsers: () => request("/admin/users"),
};

export { getToken };
