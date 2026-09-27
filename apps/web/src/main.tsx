import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import "./index.css";
import { startOfflineSync } from "./offline/syncManager.js";

// Inicia o gerenciador de sincronização da fila offline (IndexedDB -> API)
// assim que o app carrega e sempre que a conectividade voltar (critério de
// PWA offline-first do módulo de Gerenciamento de Risco).
startOfflineSync();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
