import { useState, useMemo, useEffect } from "react";
import { Search, SlidersHorizontal, Star, MapPin, Clock, ChevronDown, X, ArrowLeft, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/layout/Navbar";

const SPECIALTIES = ["All", "Hospital", "Baby Care", "Home Nursing", "Elderly Care"];
const STATUSES    = ["All", "Available", "On Shift", "Off Duty"];

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
  const [availableStaff, setAvailableStaff] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  const sortLabels = { rating: "Top Rated", shifts: "Most Shifts", name: "Name A-Z" };

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
            {member.designation || (member.role && Array.isArray(member.role) ? member.role.join(', ') : member.role) || 'Staff Member'}
          </p>
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

  // Fetch staff data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        console.log('Fetching staff data from multiple endpoints');
        // Fetch all staff and available staff in parallel
        const [staffResponse, availableResponse] = await Promise.all([
          fetch('/api/staff'),
          fetch('/api/staff/available-staff')
        ]);
        
        console.log('Staff response status:', staffResponse.status, staffResponse.statusText);
        console.log('Available staff response status:', availableResponse.status, availableResponse.statusText);
        
        if (!staffResponse.ok) {
          const errorText = await staffResponse.text();
          console.error('Staff API error response:', errorText.substring(0, 500));
          throw new Error(`Failed to fetch staff: ${staffResponse.status}`);
        }
        if (!availableResponse.ok) {
          const errorText = await availableResponse.text();
          console.error('Available staff API error response:', errorText.substring(0, 500));
          throw new Error(`Failed to fetch available staff: ${availableResponse.status}`);
        }
        
        // Check content-type before parsing JSON
        const staffContentType = staffResponse.headers.get('content-type');
        const availableContentType = availableResponse.headers.get('content-type');
        
        if (!staffContentType || !staffContentType.includes('application/json')) {
          const text = await staffResponse.text();
          console.error('Staff API non-JSON response:', text.substring(0, 500));
          
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('Staff API returned HTML error page - check backend deployment');
            setStaff([]);
            setAvailableStaff([]);
            setError('Service temporarily unavailable');
            return;
          }
          
          throw new Error('Staff API returned non-JSON response');
        }
        
        if (!availableContentType || !availableContentType.includes('application/json')) {
          const text = await availableResponse.text();
          console.error('Available staff API non-JSON response:', text.substring(0, 500));
          
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('Available staff API returned HTML error page - check backend deployment');
            setStaff([]);
            setAvailableStaff([]);
            setError('Service temporarily unavailable');
            return;
          }
          
          throw new Error('Available staff API returned non-JSON response');
        }
        
        const staffData = await staffResponse.json();
        const availableData = await availableResponse.json();
        
        console.log('Staff data received:', staffData);
        console.log('Available staff data received:', availableData);
        
        setStaff(staffData.data || []);
        setAvailableStaff(availableData.data || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load staff data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filtered = useMemo(() => {
    return staff
      .filter(s => {
        const q = query.toLowerCase();
        const matchQ = !q || 
          s.full_name?.toLowerCase().includes(q) || 
          (s.role && Array.isArray(s.role) ? s.role.some(r => r.toLowerCase().includes(q)) : s.role?.toLowerCase().includes(q)) ||
          s.location?.toLowerCase().includes(q);
        
        // Map specialty filter to role
        const specialtyRoleMap = {
          "Baby Care": "NANNY",
          "Elderly Care": "CAREGIVER", 
          "Home Nursing": "NURSE",
          "Hospital": "NURSE"
        };
        const targetRole = specialtyRoleMap[specialty];
        const matchS = specialty === "All" || (s.role && Array.isArray(s.role) ? s.role.includes(targetRole) : s.role === targetRole);
        
        const matchSt = status === "All" || s.current_status?.toLowerCase().replace('_', ' ') === status.toLowerCase();
        return matchQ && matchS && matchSt;
      })
      .sort((a, b) => {
        if (sortBy === "name")   return (a.full_name || '').localeCompare(b.full_name || '');
        if (sortBy === "shifts") return (b.total_bookings || 0) - (a.total_bookings || 0);
        return (b.average_rating || 0) - (a.average_rating || 0);
      });
  }, [staff, query, specialty, status, sortBy]);

  const activeFilters = [
    specialty !== "All" && specialty,
    status    !== "All" && status,
  ].filter(Boolean);

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
        padding: "0 2rem",
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
              {availableStaff.length} available now
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "2.5rem 2rem" }}>

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
            {filtered.length} verified professionals · book instantly
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
              placeholder="Search by name, role, or location…"
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
              <p style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>Specialty</p>
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
              gridTemplateColumns: "repeat(4, 1fr)",
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
            {filtered.length > 0 ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 20,
              }}>
                {filtered.slice(0, 12).map((member, i) => (
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

            {filtered.length > 12 && (
              <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 14, marginTop: "1.5rem" }}>
                Showing 12 of {filtered.length} results
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

