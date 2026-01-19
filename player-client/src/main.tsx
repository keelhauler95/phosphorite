import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AutoScrollProvider } from './components/Teletype/index.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AutoScrollProvider>
      <App />
    </AutoScrollProvider>
  </React.StrictMode>,
)
