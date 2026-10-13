import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import { Clients, ClientDetails, ClientForm } from "./pages/Clients";
import { Accounts, AccountDetails, AccountForm } from "./pages/Accounts";
import { Transactions, TransactionDetails } from "./pages/Transactions";
import "./styles.css";
function App() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark">N</span>
          <span>
            NORTHBRIDGE<small>COMMERCIAL BANK</small>
          </span>
        </Link>
        <p className="nav-label">OPERATIONS PORTAL</p>
        <nav aria-label="Main navigation">
          {[
            ["/", "Overview", "◈"],
            ["/clients", "Corporate clients", "▦"],
            ["/accounts", "Financial accounts", "▤"],
            ["/transactions", "Transaction history", "↔"],
          ].map(([url, label, icon]) => (
            <NavLink end={url === "/"} key={url} to={url}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="dot" /> Release 1 · Demo environment
          <small>FinOps Enterprise</small>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>Corporate Financial Operations</span>
          <span className="demo-tag">SIMULATED DATA</span>
        </header>
        <main id="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/new" element={<ClientForm />} />
            <Route path="/clients/:id" element={<ClientDetails />} />
            <Route path="/clients/:id/edit" element={<ClientForm />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/accounts/new" element={<AccountForm />} />
            <Route path="/accounts/:id" element={<AccountDetails />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/transactions/:id" element={<TransactionDetails />} />
            <Route
              path="*"
              element={
                <section className="state">
                  <h1>Page not found</h1>
                  <p>This page does not exist.</p>
                  <Link to="/">Return to dashboard</Link>
                </section>
              }
            />
          </Routes>
        </main>
        <footer>
          Northbridge Commercial Bank · Fictional educational application
        </footer>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
