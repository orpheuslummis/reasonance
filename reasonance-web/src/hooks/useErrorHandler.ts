import { useCallback } from "react";

export function useErrorHandler() {
    const handleError = useCallback((error: unknown, context: string) => {
        console.error(`${context}:`, error);
        // You can add additional error handling logic here
        // For example, showing a toast notification or updating error state
    }, []);

    return { handleError };
}
