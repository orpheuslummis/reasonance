export const API_CONFIG = {
    BASE_URL: import.meta.env.VITE_API_URL || "http://localhost:8000",
    USERNAME_KEY: "reasonance_username",
    SSE_CONFIG: {
        withCredentials: false,
        retryAttempts: 3,
        retryDelay: 1000,
    },
};
