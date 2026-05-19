import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL
const API_KEY = import.meta.env.VITE_PRESTASHOP_API_KEY

// Configuration du client HTTP pour l'API PrestaShop
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/xml'
  },
  params: {
    ws_key: API_KEY
  }
})

// Intercepteur pour gérer les erreurs globales
apiClient.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response?.data || error.message)
    throw error
  }
)