import { getWebserviceEnv } from '../config/runtimeEnv'

const { apiBaseUrl, apiKey } = getWebserviceEnv()
const API_BASE_URL = apiBaseUrl
const API_KEY = apiKey

const buildAuthHeader = () => {
	if (!API_KEY) {
		return {}
	}

	return { Authorization: `Basic ${btoa(`${API_KEY}:`)}` }
}

const fetchXml = async (path) => {
	const base = API_BASE_URL.replace(/\/$/, '')
	const cleanPath = path.replace(/^\//, '')
	const url = `${base}/${cleanPath}`

	const response = await fetch(url, {
		headers: {
			Accept: 'application/xml',
			...buildAuthHeader(),
		},
	})

	if (!response.ok) {
		const body = await response.text()
		const detail = body || response.statusText
		throw new Error(`HTTP ${response.status}: ${detail}`)
	}

	return response.text()
}

export { API_BASE_URL, API_KEY, fetchXml }
