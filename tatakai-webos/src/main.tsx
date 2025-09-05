import React from 'react'
import ReactDOM from 'react-dom/client'
import { HeroUIProvider } from '@heroui/react'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HeroUIProvider theme={{
      type: 'dark',
      theme: {
        colors: {
          primary: {
            50: '#faf5ff',
            100: '#f3e8ff',
            200: '#e9d5ff',
            300: '#d8b4fe',
            400: '#c084fc',
            500: '#a855f7',
            600: '#9333ea',
            700: '#7c3aed',
            800: '#6b21a8',
            900: '#581c87',
            DEFAULT: '#a855f7',
          },
          background: '#0a0a0a',
          foreground: '#ffffff',
        },
      },
    }}>
      <App />
    </HeroUIProvider>
  </React.StrictMode>,
)