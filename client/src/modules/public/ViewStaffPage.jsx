import { useState, useMemo, useEffect } from "react";
import { Search, SlidersHorizontal, Star, MapPin, Clock, ChevronDown, X, ArrowLeft, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/layout/Navbar";

const PAGE_SIZE = 20;

// Same roles a staff account can hold (see WorkerRegistrationPage APPLIED_ROLES)
const ROLE_FILTERS = [
  { label: "All", role: "" },
  { label: "Caretaker", role: "CARETAKER" },
  { label: "Nursing Assistant", role: "NURSING_ASSISTANT" },
  { label: "Professional Nurse", role: "NURSE" },
  { label: "Physiotherapist", role: "PHYSIOTHERAPIST" },
  { label: "Nanny", role: "NANNY" },
  { label: "Counsellor", role: "COUNSELLOR" },
];
const SPECIALTIES = ROLE_FILTERS.map(r => r.label);
const ROLE_LABELS = Object.fromEntries(ROLE_FILTERS.filter(r => r.role).map(r => [r.role, r.label]));

// Handles '{NURSE,NANNY}', ['NURSE'], 'NURSE'
const normalizeRoles = (role) => {
  const list = Array.isArray(role) ? role : typeof role === "string" ? role.replace(/[{}]/g, "").split(",") : [];
  return list.map(r => r.trim()).filter(Boolean);
};

const STATUSES   = ["All", "Available", "On Shift", "Off Duty"];

const statusStyle = {
  "Available": { dot: "#22c55e", bg: "#f0fdf4", text: "#166534" },
  "On Shift":  { dot: "#f59e0b", bg: "#fffbeb", text: "#92400e" },
  "Off Duty":  { dot: "#94a3b8", bg: "#f8fafc", text: "#475569" },
};

export default function StaffDirectory() {
  const navigate = useNavigate();
  const [query,       setQuery]       = useState("");
  const [specialty,   setSpecialty]   = useState("All");
  const [status,      setStatus]      = useState("All");
  const [sortBy,      setSortBy]      = useState("rating");
  const [sortOpen,    setSortOpen]    = useState(false);
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [staff,       setStaff]       = useState([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page,        setPage]        = useState(1);
  const [pagination,  setPagination]  = useState({ total_count: 0, total_pages: 1 });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  const sortLabels = { rating: "Top Rated", name: "Name A-Z" };

  // ─── Sub-components ──────────────────────────────────────────────────────────
  function StaffCard({ member, index }) {
    const avatarColors = ["#2563eb", "#0891b2", "#7c3aed", "#059669", "#dc2626", "#d97706", "#be185d", "#0d9488", "#4f46e5", "#7c3aed"];
    const color = avatarColors[index % avatarColors.length];
    const statusText = member.current_status?.replace('_', ' ') || 'Unknown';
    const st = statusStyle[statusText] || statusStyle["Available"];

    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid #e9ecef",
          borderRadius: 20,
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          cursor: "pointer",
          transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s",
          animation: `fadeUp 0.35s ease both`,
          animationDelay: `${index * 40}ms`,
          position: "relative",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.08)";
          e.currentTarget.style.borderColor = "#c7d9ff";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.borderColor = "#e9ecef";
        }}
      >
        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Status badge — absolute top-right */}
        <span style={{
          position: "absolute", top: 16, right: 16,
          display: "flex", alignItems: "center", gap: 5,
          background: st.bg, color: st.text,
          fontSize: 11, fontWeight: 600,
          padding: "4px 10px", borderRadius: 999,
          letterSpacing: "0.02em",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
          {statusText}
        </span>

        {/* Avatar — centered */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8 }}>
          {member.profile_picture_url ? (
            <img
              src={member.profile_picture_url}
              alt={member.full_name}
              style={{
                width: 150, height: 150, borderRadius: 16,
                objectFit: "cover",
                border: "3px solid #f1f5f9",
              }}
            />
          ) : (
            <div style={{
              width: 150, height: 150, borderRadius: 16,
              background: color + "18",
              border: `3px solid ${color}22`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 40, fontWeight: 700,
              color: color,
              letterSpacing: "0.5px",
            }}>
              {member.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'ST'}
            </div>
          )}
        </div>

        {/* Name + Role — centered */}
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
            {member.full_name || 'Unknown'}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            {member.designation || normalizeRoles(member.role).map(r => ROLE_LABELS[r]).filter(Boolean).join(', ') || 'Staff Member'}
          </p>
          {member.staff_code && (
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#94a3b8" }}>
              {member.staff_code}
            </p>
          )}
        </div>

        {/* Meta */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
            <MapPin size={12} color="#94a3b8" />
            {member.location || 'Location not specified'}
          </div>
          {member.specialization && (
            <div style={{
              display: "inline-flex", alignItems: "center",
              background: color + "12",
              color: color,
              fontSize: 11, fontWeight: 600,
              padding: "3px 10px", borderRadius: 999,
              letterSpacing: "0.02em",
            }}>
              {member.specialization}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: "1px solid #f1f5f9",
          paddingTop: 14,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Star size={13} color="#f59e0b" fill="#f59e0b" />
            {member.average_rating > 0 ? (
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{member.average_rating.toFixed(1)}</span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>({member.total_reviews || 0})</span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: "#94a3b8" }}>No ratings yet</span>
            )}
          </div>
          <button
            onClick={() => navigate(`/services/staff-profile/${member.staff_profile_id}`)}
            style={{
              padding: "7px 16px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#1d4ed8"}
            onMouseLeave={e => e.currentTarget.style.background = "#2563eb"}
          >
            View Profile
          </button>
        </div>
      </div>
    );
  }

  // Debounce the search box so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Any filter/search/sort change goes back to the first page
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, specialty, status, sortBy]);

  // Fetch one page of staff from the server (search + filters run server-side)
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({ page, limit: PAGE_SIZE, sort: sortBy });
        const role = ROLE_FILTERS.find(r => r.label === specialty)?.role;
        if (role) params.set("role", role);
        if (status !== "All") params.set("status", status);
        if (debouncedQuery) params.set("search", debouncedQuery);

        const response = await fetch(`/api/staff/public-directory?${params}`);
        const contentType = response.headers.get("content-type") || "";

        if (!response.ok || !contentType.includes("application/json")) {
          throw new Error(`Failed to fetch staff: ${response.status}`);
        }

        const result = await response.json();
        if (cancelled) return;

        setStaff(result.data || []);
        setAvailableCount(result.available_count || 0);
        setPagination(result.pagination || { total_count: 0, total_pages: 1 });
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching staff:", err);
        setStaff([]);
        setError("Failed to load staff data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [page, debouncedQuery, specialty, status, sortBy]);

  const activeFilters = [
    specialty !== "All" && specialty,
    status    !== "All" && status,
  ].filter(Boolean);

  // Compact page list: 1 … 4 5 6 … 12
  const pageNumbers = useMemo(() => {
    const total = pagination.total_pages;
    const nums = [];
    for (let n = 1; n <= total; n++) {
      if (n === 1 || n === total || Math.abs(n - page) <= 1) nums.push(n);
      else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    return nums;
  }, [page, pagination.total_pages]);

  const pageBtnStyle = (active, disabled) => ({
    minWidth: 38, padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
    border: active ? "1px solid #2563eb" : "1px solid #e2e8f0",
    background: active ? "#2563eb" : "#fff",
    color: active ? "#fff" : "#334155",
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8f9fc",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    }}>
        
      {/* Google Font */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      {/* Top Bar */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e9ecef",
        padding: "0 clamp(1rem, 4vw, 2rem)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, height: 64 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", textDecoration: "none", fontSize: 14 }}>
            <ArrowLeft size={16} /> Back
          </a>
          <div style={{ width: 1, height: 20, background: "#e2e8f0" }} />
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#0f172a", letterSpacing: "-0.3px" }}>
            VCare <span style={{ color: "#2563eb" }}>Staff</span>
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              background: "#f0fdf4", color: "#166534",
              fontSize: 12, fontWeight: 500,
              padding: "4px 12px", borderRadius: 999,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              {availableCount} available now
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "2.5rem clamp(1rem, 4vw, 2rem)" }}>

        {/* Page Title */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: "clamp(2rem, 4vw, 3rem)",
            color: "#0f172a",
            margin: "0 0 0.4rem",
            letterSpacing: "-0.5px",
            lineHeight: 1.1,
          }}>
            Our Care Team
          </h1>
          <p style={{ color: "#64748b", fontSize: 16, margin: 0 }}>
            {pagination.total_count} verified professionals · book instantly
          </p>
        </div>

        {/* Search + Controls Row */}
        <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>

          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 280px", minWidth: 200 }}>
            <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, mobile number, or EMP code…"
              style={{
                width: "100%",
                padding: "11px 14px 11px 40px",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                fontSize: 14,
                background: "#fff",
                color: "#0f172a",
                outline: "none",
                boxSizing: "border-box",
                transition: "border 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "#2563eb"}
              onBlur={e => e.target.style.borderColor = "#e2e8f0"}
            />
            {query && (
              <button onClick={() => setQuery("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", padding: 2 }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setFilterOpen(p => !p)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "11px 18px",
              border: filterOpen ? "1px solid #2563eb" : "1px solid #e2e8f0",
              borderRadius: 12,
              background: filterOpen ? "#eff6ff" : "#fff",
              color: filterOpen ? "#2563eb" : "#334155",
              fontSize: 14, fontWeight: 500,
              cursor: "pointer",
              position: "relative",
            }}
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilters.length > 0 && (
              <span style={{
                background: "#2563eb", color: "#fff",
                fontSize: 11, fontWeight: 600,
                width: 18, height: 18, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>{activeFilters.length}</span>
            )}
          </button>

          {/* Sort Dropdown */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setSortOpen(p => !p)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "11px 18px",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                background: "#fff",
                color: "#334155",
                fontSize: 14, fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {sortLabels[sortBy]} <ChevronDown size={14} style={{ transition: "transform 0.15s", transform: sortOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {sortOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                background: "#fff", border: "1px solid #e2e8f0",
                borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
                padding: 6, zIndex: 99, minWidth: 160,
              }}>
                {Object.entries(sortLabels).map(([key, label]) => (
                  <button key={key} onClick={() => { setSortBy(key); setSortOpen(false); }} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "9px 14px",
                    background: sortBy === key ? "#eff6ff" : "transparent",
                    color: sortBy === key ? "#2563eb" : "#334155",
                    border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, textAlign: "left",
                  }}>
                    {sortBy === key && <CheckCircle size={14} />}
                    {sortBy !== key && <span style={{ width: 14 }} />}
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filter Panel */}
        {filterOpen && (
          <div style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
            display: "flex", gap: "2.5rem", flexWrap: "wrap",
          }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>Role</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SPECIALTIES.map(s => (
                  <button key={s} onClick={() => setSpecialty(s)} style={{
                    padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                    border: specialty === s ? "1px solid #2563eb" : "1px solid #e2e8f0",
                    background: specialty === s ? "#2563eb" : "#fff",
                    color: specialty === s ? "#fff" : "#475569",
                    cursor: "pointer", transition: "all 0.12s",
                  }}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>Availability</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STATUSES.map(s => (
                  <button key={s} onClick={() => setStatus(s)} style={{
                    padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                    border: status === s ? "1px solid #2563eb" : "1px solid #e2e8f0",
                    background: status === s ? "#2563eb" : "#fff",
                    color: status === s ? "#fff" : "#475569",
                    cursor: "pointer", transition: "all 0.12s",
                  }}>
                    {s !== "All" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusStyle[s]?.dot ?? "#94a3b8", display: "inline-block", marginRight: 6 }} />}
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {activeFilters.length > 0 && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}>
                <button onClick={() => { setSpecialty("All"); setStatus("All"); }} style={{
                  fontSize: 13, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontWeight: 500,
                }}>
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active Filter Tags */}
        {activeFilters.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
            {activeFilters.map(f => (
              <span key={f} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#eff6ff", color: "#1d4ed8",
                fontSize: 13, fontWeight: 500,
                padding: "5px 12px", borderRadius: 999,
              }}>
                {f}
                <button onClick={() => {
                  if (SPECIALTIES.includes(f)) setSpecialty("All");
                  if (STATUSES.includes(f))    setStatus("All");
                }} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", display: "flex", padding: 0 }}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem 0" }}>
            <div style={{ fontSize: 16, color: "#64748b", marginBottom: "1rem" }}>Loading staff profiles...</div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 20,
            }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
                  padding: "1.5rem", 
                  animation: "pulse 2s infinite"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#e2e8f0" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 16, background: "#e2e8f0", borderRadius: 4, marginBottom: 8, width: "80%" }} />
                      <div style={{ height: 12, background: "#e2e8f0", borderRadius: 4, width: "60%" }} />
                    </div>
                  </div>
                  <div style={{ height: 12, background: "#e2e8f0", borderRadius: 4, marginBottom: 8, width: "40%" }} />
                  <div style={{ height: 12, background: "#e2e8f0", borderRadius: 4, width: "60%" }} />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "3rem 0" }}>
            <div style={{ fontSize: 16, color: "#ef4444", marginBottom: "1rem" }}>{error}</div>
            <button onClick={() => window.location.reload()} style={{
              background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer"
            }}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* Grid */}
            {staff.length > 0 ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 20,
              }}>
                {staff.map((member, i) => (
                  <StaffCard key={member.staff_profile_id} member={member} index={i} />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "5rem 0", color: "#94a3b8" }}>
                <p style={{ fontSize: 18, fontWeight: 500, color: "#334155", margin: "0 0 6px" }}>No staff found</p>
                <p style={{ fontSize: 14, margin: "0 0 20px" }}>Try adjusting your search or filters</p>
                <button onClick={() => { setQuery(""); setSpecialty("All"); setStatus("All"); }} style={{
                  padding: "10px 24px", background: "#2563eb", color: "#fff",
                  border: "none", borderRadius: 999, fontSize: 14, fontWeight: 500, cursor: "pointer",
                }}>Reset filters</button>
              </div>
            )}

            {pagination.total_pages > 1 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: "2rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                  <button
                    disabled={page <= 1}
                    onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    style={pageBtnStyle(false, page <= 1)}
                  >
                    Previous
                  </button>
                  {pageNumbers.map((n, i) => n === "…" ? (
                    <span key={`gap-${i}`} style={{ padding: "0 4px", color: "#94a3b8" }}>…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => { setPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      style={pageBtnStyle(n === page, false)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    disabled={page >= pagination.total_pages}
                    onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    style={pageBtnStyle(false, page >= pagination.total_pages)}
                  >
                    Next
                  </button>
                </div>
                <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pagination.total_count)} of {pagination.total_count} staff
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

