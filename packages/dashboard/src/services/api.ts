import axios from 'axios';

export const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080',
});

apiClient.interceptors.request.use(config => {
    const token = localStorage.getItem('auth_token');
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const Api = {
    login: (username: string, password: string) => apiClient.post('/auth/login', { username, password }),
    getJobs: () => apiClient.get('/jobs'), // Assumes a list endpoint exists
    getJobEvents: (id: string) => apiClient.get(`/jobs/${id}/events`),
    getWorkers: () => apiClient.get('/workers'),
    cancelJob: (id: string) => apiClient.post(`/jobs/${id}/cancel`)
};
