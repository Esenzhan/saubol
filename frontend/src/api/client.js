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
  me: () => request("/auth/me"),

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
  // XHR instead of fetch specifically for `upload.onprogress` — fetch has no
  // cross-browser way to observe request-body upload progress, only
  // response download progress, which is useless for an upload.
  uploadDocument: (file, folder, onProgress) =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE_URL}/documents`);
      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // no-op — an empty/non-JSON body falls through to the status check below
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || "Не удалось загрузить документ"));
      };
      xhr.onerror = () => reject(new Error("Не удалось загрузить документ"));
      xhr.send(formData);
    }),
  reviewDocument: (id, body) => request(`/documents/${id}/review`, { method: "POST", body: JSON.stringify(body) }),
  moveDocument: (id, folder) => request(`/documents/${id}/folder`, { method: "PATCH", body: JSON.stringify({ folder }) }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: "DELETE" }),

  listBiomarkers: (name) => request(`/records/biomarkers${name ? `?name=${encodeURIComponent(name)}` : ""}`),
  listBiomarkerNames: () => request("/records/biomarkers/names"),
  listBiomarkerCatalog: () => request("/records/biomarkers/catalog"),
  listMedcard: (section) => request(`/records/medcard${section ? `?section=${encodeURIComponent(section)}` : ""}`),
  addMedcardEntry: (body) => request("/records/medcard", { method: "POST", body: JSON.stringify(body) }),

  listMedications: (name) => request(`/records/medications${name ? `?name=${encodeURIComponent(name)}` : ""}`),
  listMedicationNames: () => request("/records/medications/names"),
  listMedicationCatalog: () => request("/records/medications/catalog"),
  addMedicationDose: (body) => request("/records/medications", { method: "POST", body: JSON.stringify(body) }),
  deleteMedicationDose: (id) => request(`/records/medications/${id}`, { method: "DELETE" }),

  getChatHistory: () => request("/chat"),
  sendChatMessage: (message) => request("/chat", { method: "POST", body: JSON.stringify({ message }) }),

  listAdminUsers: () => request("/admin/users"),

  listCalendarEvents: () => request("/calendar/events"),
  addCalendarEvent: (body) => request("/calendar/events", { method: "POST", body: JSON.stringify(body) }),
  deleteCalendarEvent: (id) => request(`/calendar/events/${id}`, { method: "DELETE" }),
  subscribePush: (subscription) => request("/calendar/push/subscribe", { method: "POST", body: JSON.stringify(subscription) }),
  unsubscribePush: (endpoint) => request("/calendar/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
};

export { getToken };
