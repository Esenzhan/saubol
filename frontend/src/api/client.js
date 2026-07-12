const BASE_URL = "/api";

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
};

export { getToken };
