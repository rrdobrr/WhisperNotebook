import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Transcriptions (now using texts API)
export const transcriptionAPI = {
  uploadFile: (formData, onProgress) =>
    apiClient.post('/api/texts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),

  transcribeYoutube: (data) =>
    apiClient.post('/api/texts/youtube', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getAll: (params) => apiClient.get('/api/texts/', { params: { ...params, status: 'processing' } }),
  getById: (id) => apiClient.get(`/api/texts/${id}`),
  delete: (id) => apiClient.delete(`/api/texts/${id}`),
  getQueueStatus: () => apiClient.get('/api/texts/stats/queue'),
}

// Texts
export const textAPI = {
  getAll: (params) => apiClient.get('/api/texts/', { params }),
  getById: (id) => apiClient.get(`/api/texts/${id}`),
  create: (data) => apiClient.post('/api/texts/', data),
  update: (id, data) => apiClient.put(`/api/texts/${id}`, data),
  delete: (id) => apiClient.delete(`/api/texts/${id}`),
  summarize: (id) => apiClient.post(`/api/texts/${id}/summarize`),
  process: (id, prompt) => apiClient.post(`/api/texts/${id}/process`, { prompt }),
}

// Chats
export const chatAPI = {
  getAll: (params) => apiClient.get('/api/chats/', { params }),
  getById: (id) => apiClient.get(`/api/chats/${id}`),
  create: (data) => apiClient.post('/api/chats/', data),
  update: (id, data) => apiClient.put(`/api/chats/${id}`, data),
  delete: (id) => apiClient.delete(`/api/chats/${id}`),
  getMessages: (id) => apiClient.get(`/api/chats/${id}/messages`),
  sendMessage: (id, data) => apiClient.post(`/api/chats/${id}/messages`, data),
  sendMessageStream: (id, data) => {
    // Return EventSource for SSE
    const params = new URLSearchParams(data)
    return new EventSource(`${API_BASE_URL}/api/chats/${id}/messages/stream?${params}`)
  },
}

// Settings
export const settingsAPI = {
  get: () => apiClient.get('/api/settings/'),
  update: (data) => apiClient.put('/api/settings/', data),
  getOpenAIBalance: () => apiClient.get('/api/settings/openai-balance'),
  testOpenAIKey: (apiKey) => apiClient.post('/api/settings/test-openai-key', { api_key: apiKey }),
  downloadModel: () => apiClient.post('/api/settings/download-model'),
  getModelStatus: () => apiClient.get('/api/settings/model-status'),
}

// Costs
export const costsAPI = {
  getSummary: (days) => apiClient.get('/api/costs/summary', { params: { days } }),
  getHistory: (params) => apiClient.get('/api/costs/history', { params }),
  getDaily: (days) => apiClient.get('/api/costs/daily', { params: { days } }),
  updateRailway: (amount, details) => apiClient.post('/api/costs/railway/update', { amount, details }),
}

export default apiClient
