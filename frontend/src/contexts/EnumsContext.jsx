import { createContext, useContext, useState, useEffect } from 'react'
import { getEnums } from '../utils/api'

const EnumsContext = createContext({})

export function EnumsProvider({ children }) {
  const [enums, setEnums] = useState({})

  useEffect(() => {
    getEnums().then(setEnums).catch(() => {})
  }, [])

  return <EnumsContext.Provider value={enums}>{children}</EnumsContext.Provider>
}

export function useEnums() {
  return useContext(EnumsContext)
}
