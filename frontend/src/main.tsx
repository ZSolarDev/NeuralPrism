import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App, { InitApp } from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
    <App />
)