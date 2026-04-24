import { useEffect, useState, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import socket from "../socket";

ModuleRegistry.registerModules([AllCommunityModule]);

const STATUS_FILTERS = {
  total_reprograms: "Total Reprograms",
  completed: "Completed",
  same_rate: "Same Rate",
  refer: "Refer",
  attempt_zap_erase: "Attempt Zap/Erase"
};

function safe(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

// AG Grid cell renderer for status pills
function StatusCellRenderer(params) {
  const val = safe(params.value);
  const styles = {
    "Completed":        {background:"#dcfce7",color:"#166534"},
    "Same Rate":        {background:"#fef3c7",color:"#92400e"},
    "Refer":            {background:"#fee2e2",color:"#991b1b"},
    "Attempt Zap/Erase":{background:"#dbeafe",color:"#1d4ed8"},
  };
  const pillStyle = styles[val] || {background:"#e5e7eb",color:"#374151"};
  return <span style={{display:"inline-block",padding:"3px 8px",borderRadius:"999px",fontSize:"11px",fontWeight:"bold",whiteSpace:"nowrap",...pillStyle}}>{val || "-"}</span>;
}

export default function Reprograms() {
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [activeFilter, setActiveFilter] = useState("total_reprograms");
  const [search, setSearch] = useState("");
  const gridRef = useRef(null);

  const columnDefs = useMemo(() => [
    { field: "meternumber",         headerName: "Meter Number",  minWidth: 130 },
    { field: "newratecode",         headerName: "New Rate Code", minWidth: 120 },
    { field: "ccrate",              headerName: "CC Rate",       minWidth: 100 },
    { field: "firmwareversion",     headerName: "Firmware",      minWidth: 120 },
    { field: "dcw",                 headerName: "DCW",           minWidth: 80 },
    { field: "model",               headerName: "Model",         minWidth: 110 },
    { field: "rundate",             headerName: "Run Date",      minWidth: 110 },
    { field: "status",              headerName: "Status",        minWidth: 150, cellRenderer: StatusCellRenderer },
    { field: "reason",              headerName: "Reason",        minWidth: 200 },
    { field: "lastupdateddatetime", headerName: "Last Updated",  minWidth: 150 },
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
      const response = await fetch("/api/reprograms", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load data");
      setAllRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load reprograms:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    function handleDataUpdated(payload) {
      if (payload.uploadType === "reprograms") {
        setLiveMessage(`Live update: ${payload.message}`);
        loadData();
        setTimeout(() => setLiveMessage(""), 4000);
      }
    }
    socket.on("dataUpdated", handleDataUpdated);
    return () => socket.off("dataUpdated", handleDataUpdated);
  }, []);

  const counts = useMemo(() => {
    const c = { total_reprograms: 0, completed: 0, same_rate: 0, refer: 0, attempt_zap_erase: 0 };
    allRows.forEach((row) => {
      if (!safe(row.meternumber)) return;
      c.total_reprograms++;
      const status = safe(row.status);
      if (status === "Completed") c.completed++;
      else if (status === "Same Rate") c.same_rate++;
      else if (status === "Refer") c.refer++;
      else if (status === "Attempt Zap/Erase") c.attempt_zap_erase++;
    });
    return c;
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let result = allRows.filter((r) => safe(r.meternumber) !== "");
    if (activeFilter === "completed") result = result.filter((r) => safe(r.status) === "Completed");
    else if (activeFilter === "same_rate") result = result.filter((r) => safe(r.status) === "Same Rate");
    else if (activeFilter === "refer") result = result.filter((r) => safe(r.status) === "Refer");
    else if (activeFilter === "attempt_zap_erase") result = result.filter((r) => safe(r.status) === "Attempt Zap/Erase");
    return result;
  }, [allRows, activeFilter]);

  // Update AG Grid quick filter when search changes
  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.setGridOption("quickFilterText", search);
    }
  }, [search]);

  function handleShowAll() {
    setActiveFilter("total_reprograms");
    setSearch("");
  }

  function currentViewLabel() {
    const base = STATUS_FILTERS[activeFilter] || "All Reprograms";
    return search.trim() ? `${base} + Search` : base;
  }

  if (loading) return <div><h2 className="text-2xl font-bold">Reprograms</h2><p className="text-slate-500">Loading...</p></div>;
  if (error) return <div><h2 className="text-2xl font-bold">Reprograms</h2><div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 font-bold">{error}</div></div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mt-0 mb-4">Reprograms</h2>

      {liveMessage && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 text-blue-800 font-bold text-sm">{liveMessage}</div>
      )}

      {/* Status filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {Object.entries(STATUS_FILTERS).map(([key, label]) => (
          <div
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`bg-white rounded-xl p-4 shadow-sm cursor-pointer border-2 transition-all hover:-translate-y-0.5 hover:shadow-md ${
              activeFilter === key
                ? "border-blue-600 bg-blue-50 shadow-[0_0_0_3px_rgba(37,99,235,0.18)] -translate-y-0.5"
                : "border-transparent"
            }`}
          >
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{label}</div>
            <div className="text-3xl font-bold text-gray-900">{counts[key]}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="text"
            placeholder="Search by meter, status, model, firmware, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="p-2.5 w-[340px] max-w-full border border-slate-300 rounded-lg text-sm bg-white text-gray-900"
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
        Click a summary card to filter. Columns support sorting, filtering, and resizing. Use the page size selector to show more rows.
      </p>
    </div>
  );
}