import axios from 'axios'

// Auto-detect API URL: empty for production (same domain), localhost for development
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:8000' : ''

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: Add JWT token to all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor: Handle 401 errors (expired/invalid token)
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired
      localStorage.removeItem('auth_token')

      // Only redirect to login if we're not already on the login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Transcriptions (now using texts API)
export const transcriptionAPI = {
  uploadFile: (formData, onProgress) => {
    // Use apiClient to get automatic token injection
    // Remove Content-Type header to let axios set it with proper boundary for multipart/form-data
    const config = {
      onUploadProgress: onProgress,
      headers: {
        'Content-Type': undefined, // Let axios set the correct multipart boundary
      },
    }
    return apiClient.post('/api/texts/upload', formData, config)
  },

  transcribeYoutube: (data) => {
    // Use apiClient to get automatic token injection
    return apiClient.post('/api/texts/youtube', data)
  },

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
  sendMessageStream: async (id, data, onChunk) => {
    const token = localStorage.getItem('auth_token')
    const headers = {
      'Content-Type': 'application/json',
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE_URL}/api/chats/${id}/messages/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            return
          }
          if (data.startsWith('[ERROR]')) {
            throw new Error(data.slice(8))
          }
          onChunk(data)
        }
      }
    }
  },
}

// Settings
export const settingsAPI = {
  get: () => apiClient.get('/api/settings/'),
  update: (data) => apiClient.put('/api/settings/', data),
  getOpenAIBalance: () => apiClient.get('/api/settings/openai-balance'),
  getOpenAIKeyStatus: () => apiClient.get('/api/settings/openai-key-status'),
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

// Authentication
export const authAPI = {
  login: (credentials) => apiClient.post('/api/auth/login', credentials),
  verify: (token) => apiClient.get('/api/auth/verify', { params: { token } }),
  logout: () => {
    localStorage.removeItem('auth_token')
    window.location.href = '/login'
  },
}

export default apiClient
