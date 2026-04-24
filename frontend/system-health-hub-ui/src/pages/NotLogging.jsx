import { useEffect, useState, useMemo, useRef } from "react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import socket from "../socket";

ModuleRegistry.registerModules([AllCommunityModule]);

const CATEGORY_CARDS = [
  { key: "total", label: "Total", filter: null },
  { key: "research", label: "Research", filter: "research" },
  { key: "self_check", label: "Self Check", filter: "self_check" },
  { key: "known", label: "Known", filter: "known" },
  { key: "inv", label: "Inventory", filter: "inv" },
  { key: "badrng", label: "Bad Range", filter: "badrng" },
  { key: "solar", label: "Solar", filter: "solar" },
  { key: "in_mif", label: "In MIF", filter: "in_mif" }
];

function safe(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isYes(value) {
  return safe(value).toUpperCase() === "YES";
}

// AG Grid cell renderers
function FlagCellRenderer(params) {
  if (safe(params.value).toUpperCase() === "YES") {
    return <span style={{display:"inline-block",padding:"2px 8px",borderRadius:"999px",fontSize:"11px",fontWeight:"bold",background:"#dcfce7",color:"#166534"}}>YES</span>;
  }
  return <span style={{color:"#94a3b8"}}>-</span>;
}

function StatusCellRenderer(params) {
  const val = safe(params.value);
  if (val === "Normal") return <span style={{color:"green",fontWeight:"bold"}}>Normal</span>;
  if (val === "Lost") return <span style={{color:"red",fontWeight:"bold"}}>Lost</span>;
  return val || "-";
}

export default function NotLogging() {
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState("total");
  const [search, setSearch] = useState("");
  const gridRef = useRef(null);

  const columnDefs = useMemo(() => [
    { field: "cccollector",  headerName: "Collector",     minWidth: 120 },
    { field: "ccmeter",      headerName: "Meter",         minWidth: 100 },
    { field: "ccsernumber",  headerName: "Serial Number", minWidth: 130 },
    { field: "phxmap",       headerName: "PHX Map",       minWidth: 100 },
    { field: "ccstatus",     headerName: "Status",        minWidth: 100, cellRenderer: StatusCellRenderer },
    { field: "ccstatusgroup",headerName: "Status Group",  minWidth: 120 },
    { field: "ccconfiggroup",headerName: "Config Group",  minWidth: 120 },
    { field: "ccstatusdate", headerName: "Status Date",   minWidth: 110 },
    { field: "phxloc",       headerName: "Location",      minWidth: 100 },
    { field: "phxoorder",    headerName: "Open Order",    minWidth: 110 },
    { field: "phxforder",    headerName: "Field Order",   minWidth: 110 },
    { field: "phxinst",      headerName: "Install Date",  minWidth: 110 },
    { field: "phxpurch",     headerName: "Purchase Date", minWidth: 120 },
    { field: "research",     headerName: "Research",      minWidth: 95,  cellRenderer: FlagCellRenderer },
    { field: "self_check",   headerName: "Self Check",    minWidth: 95,  cellRenderer: FlagCellRenderer },
    { field: "known",        headerName: "Known",         minWidth: 85,  cellRenderer: FlagCellRenderer },
    { field: "inv",          headerName: "Inventory",     minWidth: 90,  cellRenderer: FlagCellRenderer },
    { field: "solar",        headerName: "Solar",         minWidth: 80,  cellRenderer: FlagCellRenderer },
  ], []);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    flex: 1,
    minWidth: 80,
  }), []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      const response = await fetch("/api/meters-not-logging", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load data");
      setAllRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load not-logging data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    function handleDataUpdated(payload) {
      if (payload.uploadType === "not_logging") {
        setLiveMessage(`Live update: ${payload.message}`);
        loadData();
        setTimeout(() => setLiveMessage(""), 4000);
      }
    }
    socket.on("dataUpdated", handleDataUpdated);
    return () => socket.off("dataUpdated", handleDataUpdated);
  }, []);

  const counts = useMemo(() => {
    const c = { total: 0, research: 0, self_check: 0, known: 0, inv: 0, badrng: 0, solar: 0, in_mif: 0 };
    allRows.forEach((row) => {
      if (safe(row.ccmeter) === "") return;
      const hasAny = isYes(row.research) || isYes(row.self_check) || isYes(row.known) ||
        isYes(row.inv) || isYes(row.badrng) || isYes(row.badrng2) ||
        isYes(row.solar) || isYes(row.addstatusgrp) || isYes(row.in_mif);
      if (hasAny) c.total++;
      if (isYes(row.research)) c.research++;
      if (isYes(row.self_check)) c.self_check++;
      if (isYes(row.known)) c.known++;
      if (isYes(row.inv)) c.inv++;
      if (isYes(row.badrng)) c.badrng++;
      if (isYes(row.solar)) c.solar++;
      if (isYes(row.in_mif)) c.in_mif++;
    });
    return c;
  }, [allRows]);

  const filteredRows = useMemo(() => {
    if (activeFilter === "total") return allRows;
    const card = CATEGORY_CARDS.find((c) => c.key === activeFilter);
    if (!card || !card.filter) return allRows;
    return allRows.filter((row) => isYes(row[card.filter]));
  }, [allRows, activeFilter]);

  // Update AG Grid quick filter when search changes
  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.setGridOption("quickFilterText", search);
    }
  }, [search]);

  function handleShowAll() {
    setActiveFilter("total");
    setSearch("");
  }

  function currentViewLabel() {
    const card = CATEGORY_CARDS.find((c) => c.key === activeFilter);
    const base = card ? card.label : "All";
    return search.trim() ? `${base} + Search` : base;
  }

  if (loading) return <div><h2 className="text-2xl font-bold">Not Logging Meters</h2><p className="text-slate-500">Loading...</p></div>;
  if (error) return <div><h2 className="text-2xl font-bold">Not Logging Meters</h2><div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 font-bold">{error}</div></div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mt-0 mb-4">Not Logging Meters</h2>

      {liveMessage && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 text-blue-800 font-bold text-sm">{liveMessage}</div>
      )}

      {/* Category cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-5">
        {CATEGORY_CARDS.map((card) => (
          <div
            key={card.key}
            onClick={() => setActiveFilter(card.key)}
            className={`bg-white rounded-xl p-3.5 shadow-sm cursor-pointer border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
              activeFilter === card.key
                ? "border-blue-600 bg-blue-50 shadow-[0_0_0_3px_rgba(37,99,235,0.18)] -translate-y-0.5"
                : "border-transparent"
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{card.label}</div>
            <div className="text-2xl font-bold text-gray-900">{counts[card.key] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="text"
            placeholder="Search across all columns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="p-2.5 w-[360px] max-w-full border border-slate-300 rounded-lg text-sm bg-white text-gray-900"
          />
          <button onClick={() => setSearch("")} className="px-3.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold border-none cursor-pointer">Clear</button>
          <button onClick={handleShowAll} className="px-3.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold border-none cursor-pointer">Show All</button>
        </div>
        <div className="text-sm text-slate-600 font-bold">
          Current View: {currentViewLabel()} — Rows: {filteredRows.length}
        </div>
      </div>

      {/* AG Grid */}
      <div className="ag-theme-alpine" style={{ height: 600, width: "100%" }}>
        <AgGridReact
          ref={gridRef}
          rowData={filteredRows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          pagination={true}
          paginationPageSize={50}
          paginationPageSizeSelector={[25, 50, 100, 200]}
          animateRows={true}
        />
      </div>

      <p className="mt-3.5 text-xs text-slate-500 leading-relaxed">
        Click a category card to filter. Use search to find specific meters. Columns support sorting, filtering, and resizing.
      </p>
    </div>
  );
}