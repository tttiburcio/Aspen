import toast from 'react-hot-toast'

/**
 * Wraps an async function with a default .catch() that shows a toast error.
 * Use in useEffect or event handlers where you want silent fail-safe behavior.
 *
 * @param {() => Promise<any>} fn - The async function to wrap
 * @param {string} [message]     - Optional custom error message
 * @returns {Promise<any>}
 */
export function withErrorToast(fn, message = 'Erro ao carregar dados') {
  return fn().catch(err => {
    const detail = err?.response?.data?.detail
    toast.error(detail || message)
  })
}
