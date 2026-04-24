import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from "recharts";
import socket from "../socket";

const BAR_COLORS = [
  "#2563eb", "#0d9488", "#d97706", "#dc2626",
  "#7c3aed", "#059669", "#e11d48", "#6366f1", "#ca8a04"
];

const PIE_COLORS = ["#16a34a", "#eab308", "#dc2626", "#2563eb", "#6b7280"];

export default function Home() {
  const navigate = useNavigate();

  const [notLoggingSummary, setNotLoggingSummary] = useState(null);
  const [reprogramsSummary, setReprogramsSummary] = useState(null);
  const [reprogramRows, setReprogramRows] = useState([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [uploadType, setUploadType] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  function getToken() {
    return localStorage.getItem("token");
  }

  function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
  }

  async function loadSummary() {
    try {
      const [nlRes, rpSumRes, rpAllRes] = await Promise.all([
        fetch("/api/meters-not-logging-summary", { headers: authHeaders() }),
        fetch("/api/reprograms-summary", { headers: authHeaders() }),
        fetch("/api/reprograms", { headers: authHeaders() })
      ]);

      if (!nlRes.ok || !rpSumRes.ok || !rpAllRes.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const nlData = await nlRes.json();
      const rpSumData = await rpSumRes.json();
      const rpAllData = await rpAllRes.json();

      setNotLoggingSummary(nlData);
      setReprogramsSummary(rpSumData);
      setReprogramRows(Array.isArray(rpAllData) ? rpAllData : []);
    } catch (error) {
      console.error("Failed to load home summary:", error);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    setUploadStatus("");
    setUploadError("");

    if (!uploadType) { setUploadError("Please choose a data type."); return; }
    if (!selectedFile) { setUploadError("Please choose a CSV file."); return; }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("uploadType", uploadType);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: authHeaders(),
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed");

      setUploadStatus(data.message || "Upload successful.");
      setSelectedFile(null);
      setUploadType("");

      const fileInput = document.getElementById("csvFileInput");
      if (fileInput) fileInput.value = "";

      await loadSummary();
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadError(error.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  useEffect(() => {
    loadSummary();

    function handleDataUpdated(payload) {
      setLiveMessage(`Live update: ${payload.message}`);
      loadSummary();
      setTimeout(() => setLiveMessage(""), 4000);
    }

    socket.on("dataUpdated", handleDataUpdated);
    return () => socket.off("dataUpdated", handleDataUpdated);
  }, []);

  const notLoggingTotal = Number(notLoggingSummary?.total_not_logging || 0);
  const reprogramsActive = Number(reprogramsSummary?.active_reprograms || 0);
  const reprogramsTotal = Number(reprogramsSummary?.total_reprograms || 0);

  const notLoggingChartData = notLoggingSummary
    ? [
        { name: "Research", value: Number(notLoggingSummary.research || 0) },
        { name: "Self Check", value: Number(notLoggingSummary.self_check || 0) },
        { name: "Known", value: Number(notLoggingSummary.known || 0) },
        { name: "Inventory", value: Number(notLoggingSummary.inv || 0) },
        { name: "Bad Range", value: Number(notLoggingSummary.badrng || 0) },
        { name: "Bad Range 2", value: Number(notLoggingSummary.badrng2 || 0) },
        { name: "Solar", value: Number(notLoggingSummary.solar || 0) },
        { name: "Add Status", value: Number(notLoggingSummary.addstatusgrp || 0) },
        { name: "In MIF", value: Number(notLoggingSummary.in_mif || 0) }
      ].filter((d) => d.value > 0)
    : [];

  function buildReprogramPieData() {
    if (!reprogramRows.length) return [];
    const counts = {};
    reprogramRows.forEach((row) => {
      const status = (row.status || "").trim() || "Unknown";
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }

  const reprogramPieData = buildReprogramPieData();

  return (
    <div>
      <h2 className="text-2xl font-bold mt-0 mb-5">Dashboard Summary</h2>

      {liveMessage && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-800 font-bold text-sm">
          {liveMessage}
        </div>
      )}
      {uploadStatus && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 text-blue-800 font-bold text-sm">
          {uploadStatus}
        </div>
      )}
      {uploadError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 font-bold text-sm">
          {uploadError}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div
          onClick={() => navigate("/not-logging")}
          className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-blue-600 cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            Not Logging Total
          </div>
          <div className="text-4xl font-bold text-gray-900 mb-1">{notLoggingTotal}</div>
          <div className="text-xs text-slate-500">Meters in the not-logging workflow</div>
        </div>

        <div
          onClick={() => navigate("/reprograms")}
          className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-blue-600 cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            Reprograms Needing Review
          </div>
          <div className="text-4xl font-bold text-gray-900 mb-1">{reprogramsActive}</div>
          <div className="text-xs text-slate-500">Excludes Completed and Same Rate</div>
        </div>

        <div
          onClick={() => navigate("/reprograms")}
          className="bg-white rounded-xl p-5 shadow-sm border-l-4 border-blue-600 cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            Total Reprograms
          </div>
          <div className="text-4xl font-bold text-gray-900 mb-1">{reprogramsTotal}</div>
          <div className="text-xs text-slate-500">All records in the reprogram dataset</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold mt-0 mb-1">Not Logging — Issue Breakdown</h3>
          <p className="text-slate-500 text-sm mt-0 mb-4">Count of meters flagged in each category</p>
          {notLoggingChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={notLoggingChartData} margin={{ top: 10, right: 20, bottom: 40, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {notLoggingChartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-center py-10">No category data available yet.</p>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold mt-0 mb-1">Reprograms — Status Distribution</h3>
          <p className="text-slate-500 text-sm mt-0 mb-4">Breakdown of all reprogram records by status</p>
          {reprogramPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={reprogramPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {reprogramPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-center py-10">No reprogram data available yet.</p>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold mt-0 mb-1">Dashboards</h3>
          <p className="text-slate-500 text-sm mt-0 mb-4">Jump directly into the operational views.</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate("/not-logging")}
              className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold border-none cursor-pointer text-left transition-colors"
            >
              <span>Open Not Logging Dashboard</span>
              <span className="bg-white/20 px-3 py-1.5 rounded-full text-xs min-w-[40px] text-center">
                {notLoggingTotal}
              </span>
            </button>
            <button
              onClick={() => navigate("/reprograms")}
              className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold border-none cursor-pointer text-left transition-colors"
            >
              <span>Open Reprograms Dashboard</span>
              <span className="bg-white/20 px-3 py-1.5 rounded-full text-xs min-w-[40px] text-center">
                {reprogramsActive}
              </span>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3.5 mb-0 leading-relaxed">
            Home page counts are a quick summary. The Reprograms dashboard shows all records
            including Completed and Same Rate.
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-lg font-bold mt-0 mb-1">Import CSV File</h3>
          <p className="text-slate-500 text-sm mt-0 mb-4">
            Select a file and choose which dataset it belongs to.
          </p>
          <form onSubmit={handleUpload}>
            <label className="block text-sm font-bold text-slate-600 mb-1.5 mt-3">Data Type</label>
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 text-sm bg-white text-gray-900 mb-2.5"
            >
              <option value="">Select where this file should go</option>
              <option value="not_logging">Not Logging</option>
              <option value="reprograms">Reprograms</option>
            </select>

            <label className="block text-sm font-bold text-slate-600 mb-1.5 mt-3">CSV File</label>
            <input
              id="csvFileInput"
              type="file"
              accept=".csv"
              onChange={(e) => setSelectedFile(e.target.files[0] || null)}
              className="w-full p-2.5 rounded-lg border border-slate-300 text-sm bg-white mb-2.5"
            />

            <button
              type="submit"
              disabled={isUploading}
              className="w-full p-3 mt-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold border-none cursor-pointer transition-colors disabled:opacity-60"
            >
              {isUploading ? "Uploading..." : "Upload and Import"}
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-3.5 mb-0 leading-relaxed">
            Importing replaces the current data in the selected table with the contents of the uploaded CSV.
          </p>
        </div>
      </div>
    </div>
  );
}
