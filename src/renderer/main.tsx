import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// @ts-ignore: Allow importing CSS without type declarations
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
// main.tsx (ponto de entrada do React)
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Configuração CRUCIAL para usar a versão local
loader.config({ monaco })