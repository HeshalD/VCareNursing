import { useState, useEffect } from "react";
import { ArrowLeft, MapPin, Clock, Star, Shield, Award, ChevronRight, Calendar, Heart, CheckCircle, Quote, Phone, MessageSquare, Sparkles, BadgeCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import apiClient from "../../api/api";
import { formatPhoneNumberIntl } from 'react-phone-number-input';

const statusStyle = {
  "Available": { dot: "#34d399", bg: "rgba(52,211,153,0.12)", text: "#059669" },
  "On Shift":  { dot: "#fbbf24", bg: "rgba(251,191,36,0.12)", text: "#b45309" },
  "Off Duty":  { dot: "#94a3b8", bg: "rgba(148,163,184,0.12)", text: "#475569" },
};

// StaffCard component from ViewStaffPage
function StaffCard({ member, index }) {
  const navigate = useNavigate();
  const avatarColors = ["#6366f1", "#0891b2", "#7c3aed", "#059669", "#dc2626", "#d97706", "#be185d", "#0d9488", "#4f46e5", "#7c3aed"];
  const color = avatarColors[index % avatarColors.length];
  const statusText = member.current_status?.replace('_', ' ') || 'Unknown';
  const st = statusStyle[statusText] || statusStyle["Available"];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e9ecf5",
        borderRadius: 22,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        cursor: "pointer",
        transition: "transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s, border-color 0.25s",
        animation: `fadeUp 0.45s ease both`,
        animationDelay: `${index * 60}ms`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-6px)";
        e.currentTarget.style.boxShadow = "0 24px 48px -16px rgba(79,70,229,0.25)";
        e.currentTarget.style.borderColor = "#c7d2fe";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,0.04)";
        e.currentTarget.style.borderColor = "#e9ecf5";
      }}
    >
      {/* Top: Avatar + Status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {member.profile_picture_url ? (
          <img
            src={member.profile_picture_url}
            alt={member.full_name}
            style={{
              width: 56, height: 56, borderRadius: 18,
              objectFit: "cover",
              boxShadow: `0 8px 20px -6px ${color}66`,
            }}
          />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: 18,
            background: `linear-gradient(135deg, ${color}22, ${color}0d)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 700,
            color: color,
            letterSpacing: "0.5px",
          }}>
            {member.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'ST'}
          </div>
        )}
        <span style={{
          display: "flex", alignItems: "center", gap: 5,
          background: st.bg, color: st.text,
          fontSize: 11, fontWeight: 600,
          padding: "4px 10px", borderRadius: 999,
          letterSpacing: "0.02em",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
          {statusText}
        </span>
      </div>

      {/* Name + Role */}
      <div>
        <p style={{ margin: "0 0 3px", fontSize: 15.5, fontWeight: 600, color: "#0f172a", lineHeight: 1.3 }}>
          {member.full_name || 'Unknown'}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
          {member.designation || (member.role && Array.isArray(member.role) ? member.role.join(', ') : member.role) || 'Staff Member'}
        </p>
      </div>

      {/* Meta */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
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
            alignSelf: "flex-start",
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
              <span style={{ fontSize: 12, color: "#94a3b8" }}>({member.total_reviews || 0} reviews)</span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "#94a3b8" }}>No ratings yet</span>
          )}
        </div>
        <button
          onClick={() => navigate(`/services/staff-profile/${member.staff_profile_id}`)}
          style={{
            padding: "7px 16px",
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            transition: "filter 0.15s, transform 0.15s",
            letterSpacing: "0.01em",
            boxShadow: "0 4px 14px -4px rgba(79,70,229,0.5)",
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = "brightness(1.1)"; e.currentTarget.style.transform = "scale(1.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.filter = "none"; e.currentTarget.style.transform = "scale(1)"; }}
        >
          View Profile
        </button>
      </div>
    </div>
  );
}

const API_URL = import.meta.env.VITE_API_URL;
const STATUS_STYLE = {
  "Available": { dot: "#10b981", bg: "rgba(16,185,129,0.1)", text: "#047857", label: "Available now" },
  "On Shift":  { dot: "#f59e0b", bg: "rgba(245,158,11,0.1)", text: "#b45309", label: "On shift" },
  "Off Duty":  { dot: "#94a3b8", bg: "rgba(148,163,184,0.12)", text: "#475569", label: "Off duty" },
  "AVAILABLE": { dot: "#10b981", bg: "rgba(16,185,129,0.1)", text: "#047857", label: "Available now" },
  "ON_SHIFT": { dot: "#f59e0b", bg: "rgba(245,158,11,0.1)", text: "#b45309", label: "On shift" },
  "OFF_DUTY": { dot: "#94a3b8", bg: "rgba(148,163,184,0.12)", text: "#475569", label: "Off duty" },
};

// ─── Sub-components ──────────────────────────────────────────────────────────
function StarRow({ rating, size = 14 }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          fill={i <= Math.round(rating) ? "#f59e0b" : "#e2e8f0"}
          stroke={i <= Math.round(rating) ? "#f59e0b" : "#e2e8f0"}
          strokeWidth="1">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </span>
  );
}

function RatingBar({ stars, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
      <span style={{ fontSize: 12, color: "#64748b", width: 14, textAlign: "right", fontWeight: 600 }}>{stars}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <div style={{ flex: 1, height: 7, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #fbbf24, #f59e0b)", borderRadius: 999, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ fontSize: 12, color: "#94a3b8", width: 20 }}>{count}</span>
    </div>
  );
}

function StarSelector({ rating, setRating, size = 24 }) {
  return (
    <div style={{ display: "flex", gap: 4, cursor: "pointer" }}>
      {[1, 2, 3, 4, 5].map(star => (
        <svg
          key={star}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={star <= rating ? "#f59e0b" : "#e2e8f0"}
          stroke={star <= rating ? "#f59e0b" : "#e2e8f0"}
          strokeWidth="1"
          style={{ transition: "all 0.2s ease" }}
          onMouseEnter={() => setRating(star)}
          onMouseLeave={() => setRating(rating)}
          onClick={() => setRating(star)}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function StaffProfile() {
  const { id: staffId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [staff, setStaff] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookClicked, setBookClicked] = useState(false);
  const [relatedStaff, setRelatedStaff] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Fetch staff data and reviews
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch staff profile
        const staffUrl = `${API_URL}/staff/${staffId}`;
        const staffResponse = await fetch(staffUrl);
        if (!staffResponse.ok) throw new Error('Failed to fetch staff profile');
        const staffData = await staffResponse.json();

        // Fetch staff reviews
        const reviewsUrl = `${API_URL}/staff-reviews/staff/${staffId}`;
        const reviewsResponse = await fetch(reviewsUrl);
        const reviewsData = reviewsResponse.ok ? await reviewsResponse.json() : { reviews: [] };

        setStaff(staffData.data);
        setReviews(reviewsData.reviews || []);
      } catch (err) {
        console.error('Error fetching staff data:', err);
        setError('Failed to load staff profile');
      } finally {
        setLoading(false);
      }
    };

    if (staffId) {
      fetchData();
    }
  }, [staffId]);

  // Fetch related staff by role
  useEffect(() => {
    const fetchRelatedStaff = async () => {
      if (!staff || !staff.role) return;

      try {
        setRelatedLoading(true);

        // Get the primary role from the staff member and clean it
        let primaryRole = Array.isArray(staff.role) ? staff.role[0] : staff.role;
        if (!primaryRole) return;

        // Remove curly braces if present
        primaryRole = primaryRole.replace(/[{}]/g, '');

        // Fetch staff by role (limit to 4 related staff, excluding current staff)
        const response = await fetch(`${API_URL}/staff/role/${primaryRole}?limit=5`);
        if (response.ok) {
          const data = await response.json();
          // Filter out the current staff member and take first 4
          const filtered = data.data?.filter(s => s.staff_profile_id !== parseInt(staffId)).slice(0, 4) || [];
          setRelatedStaff(filtered);
        }
      } catch (err) {
        console.error('Error fetching related staff:', err);
      } finally {
        setRelatedLoading(false);
      }
    };

    if (staff) {
      fetchRelatedStaff();
    }
  }, [staff, staffId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: "linear-gradient(160deg, #eef2ff 0%, #f6f7fc 60%, #e0f2fe 100%)" }}>
        <div style={{
          width: 54, height: 54, borderRadius: "50%",
          border: "3px solid rgba(99,102,241,0.18)",
          borderTopColor: "#6366f1",
          animation: "spin 0.9s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 15, color: "#6366f1", letterSpacing: "0.04em" }}>Loading profile…</div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #eef2ff 0%, #f6f7fc 100%)" }}>
        <div style={{ fontSize: 16, color: "#ef4444" }}>{error || 'Staff profile not found'}</div>
      </div>
    );
  }

  // Prepare data for display
  const s = {
    ...staff,
    name: staff.full_name,
    avatar: staff.profile_picture_url,
    status: staff.current_status?.replace('_', ' ') || 'Available',
    rating: staff.average_rating || 0,
    totalReviews: staff.total_reviews || 0,
    shifts: staff.total_bookings || 0,
    exp: staff.date_of_birth ? `${Math.floor((new Date() - new Date(staff.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))} years` : 'Experience not specified',
    location: staff.location || 'Location not specified',
    phone: (staff.mobile_number && formatPhoneNumberIntl(staff.mobile_number)) || staff.mobile_number || 'Not available',
    joinedYear: new Date(staff.created_at).getFullYear(),
    color: "#4f46e5", // Default color
    bio: staff.qualifications || 'Experienced healthcare professional',
    certifications: staff.role && Array.isArray(staff.role) ? staff.role : [staff.role || 'Healthcare Professional'],
    languages: ["English"], // Default, can be enhanced later
    specialty: staff.designation || 'Healthcare',
    availability: staff.availability || [
      { day: "Mon", avail: true },
      { day: "Tue", avail: true },
      { day: "Wed", avail: true },
      { day: "Thu", avail: true },
      { day: "Fri", avail: true },
      { day: "Sat", avail: false },
      { day: "Sun", avail: false },
    ],
    ratingBreakdown: (() => {
      const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      reviews.filter(review =>
        review && typeof review === 'object' && review.rating && !isNaN(parseInt(review.rating))
      ).forEach(review => {
        const rating = parseInt(review.rating);
        if (rating >= 1 && rating <= 5) {
          breakdown[rating] = (breakdown[rating] || 0) + 1;
        }
      });
      return breakdown;
    })(),
  };

  const st = STATUS_STYLE[staff.current_status] || STATUS_STYLE["Available"];
  const initials = s.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'ST';

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fc", fontFamily: "'Instrument Sans', 'Helvetica Neue', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(30px, -24px) scale(1.08); }
        }
        @keyframes floatOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-24px, 20px) scale(1.05); }
        }
        @keyframes shimmerRing {
          to { transform: rotate(360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.5; }
        }
        .sp-hero-grid {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: clamp(1.5rem, 4vw, 3.5rem);
          align-items: center;
        }
        @media (max-width: 900px) {
          .sp-hero-grid { grid-template-columns: 1fr; text-align: center; justify-items: center; }
        }
        .sp-body-grid {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 2rem;
          align-items: start;
        }
        @media (max-width: 1000px) {
          .sp-body-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ══════════════ HERO ══════════════ */}
      <div style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(155deg, #eef2ff 0%, #fdf4ff 40%, #eff6ff 75%, #ecfeff 100%)",
        color: "#0f172a",
      }}>
        {/* dotted texture */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(rgba(99,102,241,0.12) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          pointerEvents: "none",
        }} />
        {/* glowing pastel orbs */}
        <div style={{
          position: "absolute", top: "-160px", right: "-120px",
          width: 520, height: 520, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(129,140,248,0.28) 0%, transparent 65%)",
          animation: "floatOrb 11s ease-in-out infinite",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-200px", left: "10%",
          width: 560, height: 560, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,189,248,0.22) 0%, transparent 65%)",
          animation: "floatOrb2 14s ease-in-out infinite",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: "20%", left: "42%",
          width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(232,121,249,0.18) 0%, transparent 65%)",
          animation: "floatOrb 16s ease-in-out infinite reverse",
          pointerEvents: "none",
        }} />

        {/* ── Topbar ── */}
        <div style={{
          position: "relative", zIndex: 5,
          padding: "0 clamp(1rem, 4vw, 2.5rem)", height: 66,
          display: "flex", alignItems: "center", gap: 16,
          borderBottom: "1px solid rgba(99,102,241,0.12)",
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(8px)",
        }}>
          <button onClick={() => navigate("/services/view-staff")} style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#fff",
            border: "1px solid #e0e7ff",
            color: "#4f46e5", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            padding: "8px 16px", borderRadius: 999,
            transition: "background 0.2s, box-shadow 0.2s",
            boxShadow: "0 1px 4px rgba(79,70,229,0.08)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#eef2ff"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(79,70,229,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(79,70,229,0.08)"; }}>
            <ArrowLeft size={14} /> Our Team
          </button>
          <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 21, color: "#0f172a", marginLeft: 4 }}>
            VCare <span style={{ color: "#4f46e5" }}>Staff</span>
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "linear-gradient(135deg, #eef2ff, #fae8ff)",
              border: "1px solid #e0e7ff",
              color: "#6d28d9", fontSize: 12, fontWeight: 600,
              padding: "7px 14px", borderRadius: 999,
            }}>
              <Sparkles size={12} /> Premium Care Professional
            </span>
          </div>
        </div>

        {/* ── Hero content ── */}
        <div style={{ position: "relative", zIndex: 5, maxWidth: 1150, margin: "0 auto", padding: "clamp(2.5rem, 6vw, 4.5rem) clamp(1rem, 4vw, 2.5rem) clamp(2.5rem, 5vw, 4rem)" }}>
          <div className="sp-hero-grid">

            {/* ── Avatar with gradient ring ── */}
            <div style={{ position: "relative", flexShrink: 0, animation: "fadeUp 0.6s ease both" }}>
              {/* rotating conic glow ring */}
              <div style={{
                position: "absolute", inset: -14,
                borderRadius: "50%",
                background: "conic-gradient(from 0deg, #818cf8, #38bdf8, #e879f9, #fbbf24, #818cf8)",
                filter: "blur(22px)",
                opacity: 0.4,
                animation: "shimmerRing 9s linear infinite, pulseGlow 4s ease-in-out infinite",
              }} />
              <div style={{
                position: "relative",
                width: 208, height: 208,
                borderRadius: "50%",
                padding: 5,
                background: "conic-gradient(from 40deg, #818cf8, #38bdf8, #e879f9, #818cf8)",
              }}>
                <div style={{
                  width: "100%", height: "100%",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "4px solid #fff",
                  background: "linear-gradient(135deg, #eef2ff, #e0e7ff)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {s.avatar ? (
                    <img src={s.avatar} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 64, color: "#6366f1" }}>{initials}</span>
                  )}
                </div>
              </div>
              {/* Status dot */}
              <div style={{
                position: "absolute", bottom: 14, right: 14,
                width: 26, height: 26, borderRadius: "50%",
                background: st.dot,
                border: "4px solid #fff",
                boxShadow: `0 0 14px ${st.dot}88`,
                zIndex: 2,
              }} />
            </div>

            {/* ── Identity ── */}
            <div style={{ minWidth: 240, animation: "fadeUp 0.6s ease 0.12s both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap", justifyContent: "inherit" }}>
                <span style={{ background: st.bg, color: st.text, fontSize: 11.5, fontWeight: 600, padding: "5px 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${st.dot}44`, letterSpacing: "0.03em" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot, boxShadow: `0 0 8px ${st.dot}` }} />
                  {st.label || s.status}
                </span>
                <span style={{ background: "rgba(99,102,241,0.1)", color: "#4f46e5", fontSize: 11.5, fontWeight: 600, padding: "5px 14px", borderRadius: 999, border: "1px solid rgba(99,102,241,0.25)", letterSpacing: "0.03em" }}>
                  {s.specialty}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(16,185,129,0.1)", color: "#047857", fontSize: 11.5, fontWeight: 600, padding: "5px 14px", borderRadius: 999, border: "1px solid rgba(16,185,129,0.25)", letterSpacing: "0.03em" }}>
                  <BadgeCheck size={13} /> VCare Verified
                </span>
              </div>

              <h1 style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: "clamp(2.4rem, 5.5vw, 4rem)",
                margin: "0 0 10px", lineHeight: 1.06, letterSpacing: "-0.02em",
                background: "linear-gradient(120deg, #0f172a 30%, #4338ca 70%, #7c3aed 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                {s.name}
              </h1>

              <p style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: "clamp(1rem, 2vw, 1.25rem)", color: "#6b7280", margin: "0 0 18px", lineHeight: 1.5, maxWidth: 560 }}>
                Compassionate care, delivered with excellence — trusted by families across the community.
              </p>

              <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "inherit" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "#64748b" }}>
                  <MapPin size={14} color="#6366f1" /> {s.location}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "#64748b" }}>
                  <Calendar size={14} color="#6366f1" /> With VCare since {s.joinedYear}
                </span>
              </div>
            </div>

            {/* ── Quick Stats (glass) ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeUp 0.6s ease 0.24s both" }}>
              {[
                { value: s.rating > 0 ? s.rating.toFixed(1) : "New", sub: s.totalReviews > 0 ? `${s.totalReviews} client reviews` : "Awaiting first review", icon: <Star size={17} color="#fbbf24" fill="#fbbf24" /> },
                { value: s.exp.replace(" years", ""), sub: "Years of age", icon: <Clock size={17} color="#38bdf8" /> },
              ].map(stat => (
                <div key={stat.sub} style={{
                  background: "rgba(255,255,255,0.75)",
                  border: "1px solid rgba(255,255,255,0.9)",
                  backdropFilter: "blur(12px)",
                  borderRadius: 20,
                  padding: "1.1rem 1.6rem",
                  minWidth: 190,
                  display: "flex", alignItems: "center", gap: 14,
                  boxShadow: "0 12px 36px -12px rgba(79,70,229,0.25)",
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 13,
                    background: "linear-gradient(135deg, #eef2ff, #e0f2fe)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {stat.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a", lineHeight: 1, fontFamily: "'Instrument Serif', serif" }}>{stat.value}</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 4, letterSpacing: "0.02em" }}>{stat.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* bottom curve into body */}
        <svg viewBox="0 0 1440 70" preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 56, position: "relative", zIndex: 4 }}>
          <path d="M0,70 L0,40 Q720,-30 1440,40 L1440,70 Z" fill="#f6f7fc" />
        </svg>
      </div>

      {/* ══════════════ BODY ══════════════ */}
      <div style={{ maxWidth: 1150, margin: "0 auto", padding: "1rem clamp(1rem, 4vw, 2.5rem) 3.5rem", position: "relative" }}>
        <div className="sp-body-grid">

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>

            {/* Bio */}
            <Section title="About" accent="#6366f1" delay={0}>
              <div style={{ position: "relative", paddingLeft: 28 }}>
                <Quote size={20} style={{ position: "absolute", left: 0, top: 2, color: "#6366f1", opacity: 0.35, transform: "scaleX(-1)" }} />
                <p style={{ fontSize: 15.5, color: "#475569", lineHeight: 1.85, margin: 0 }}>{s.bio}</p>
              </div>
            </Section>

            {/* Certifications */}
            <Section title="Certifications & Credentials" accent="#0ea5e9" delay={1}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {staff.document_urls && staff.document_urls.length > 0 ? (
                  staff.document_urls.map((doc, index) => (
                    <div key={index} style={{
                      position: "relative",
                      width: 128,
                      height: 168,
                      borderRadius: 16,
                      overflow: "hidden",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                      cursor: "pointer",
                      transition: "transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s",
                      boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
                    }}
                    onClick={() => window.open(doc, '_blank')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-5px) scale(1.03)";
                      e.currentTarget.style.boxShadow = "0 20px 40px -12px rgba(14,165,233,0.35)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0) scale(1)";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(15,23,42,0.06)";
                    }}>
                      {doc.toLowerCase().includes('.pdf') ? (
                        <div style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "linear-gradient(150deg, #f43f5e 0%, #be123c 100%)",
                          color: "#fff",
                        }}>
                          <div style={{ fontSize: 34, marginBottom: 8 }}>📄</div>
                          <div style={{ fontSize: 11, textAlign: "center", padding: "0 8px", fontWeight: 500 }}>
                            Document {index + 1}
                          </div>
                        </div>
                      ) : (
                        <img
                          src={doc}
                          alt={`Certification ${index + 1}`}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.nextSibling.style.display = "flex";
                          }}
                        />
                      )}
                      <div style={{
                        display: "none",
                        width: "100%",
                        height: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#f1f5f9",
                        color: "#64748b",
                        fontSize: 12,
                        textAlign: "center",
                        padding: "8px",
                      }}>
                        Document {index + 1}
                      </div>
                      <div style={{
                        position: "absolute",
                        bottom: 8,
                        right: 8,
                        background: "#fff",
                        borderRadius: "50%",
                        width: 26,
                        height: 26,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                      }}>
                        <CheckCircle size={13} color="#0ea5e9" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{
                    width: "100%",
                    textAlign: "center",
                    padding: "2rem",
                    color: "#94a3b8",
                    fontSize: 14,
                    background: "#f8fafc",
                    borderRadius: 14,
                    border: "1px dashed #e2e8f0",
                  }}>
                    No certifications uploaded yet
                  </div>
                )}
              </div>
            </Section>

            {/* Reviews */}
            <Section title={`Client Reviews (${s.totalReviews})`} accent="#f59e0b" delay={2}>
              {/* Rating Summary */}
              <div style={{ display: "flex", gap: "2.5rem", alignItems: "center", marginBottom: "1.75rem", flexWrap: "wrap" }}>
                <div style={{
                  textAlign: "center",
                  background: "linear-gradient(150deg, #fffbeb, #fef3c7)",
                  border: "1px solid #fde68a",
                  borderRadius: 20,
                  padding: "1.25rem 2rem",
                }}>
                  <div style={{ fontSize: 54, fontFamily: "'Instrument Serif', serif", color: "#92400e", lineHeight: 1 }}>{s.rating.toFixed(1)}</div>
                  <div style={{ marginTop: 6 }}><StarRow rating={s.rating} size={16} /></div>
                  <div style={{ fontSize: 12, color: "#b45309", marginTop: 6, fontWeight: 500 }}>{s.totalReviews} reviews</div>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  {[5,4,3,2,1].map(n => (
                    <RatingBar key={n} stars={n} count={s.ratingBreakdown[n]} total={s.totalReviews} />
                  ))}
                </div>
              </div>

              {/* Review Cards - Show only 3 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {reviews.slice(0, 3).map((r, i) => (
                  <div key={r.review_id || i} style={{
                    background: "linear-gradient(150deg, #ffffff, #fafbff)",
                    border: "1px solid #eef0f8",
                    borderRadius: 18,
                    padding: "1.25rem 1.5rem",
                    animation: `fadeUp 0.5s ease both`,
                    animationDelay: `${i * 90}ms`,
                    boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                        background: "linear-gradient(135deg, #eef2ff, #e0e7ff)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 700, color: "#4f46e5",
                      }}>
                        {r.client_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{r.client_name}</span>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                        </div>
                        <StarRow rating={r.rating} size={12} />
                      </div>
                    </div>
                    <div style={{ position: "relative", paddingLeft: 22 }}>
                      <Quote size={14} style={{ position: "absolute", left: 0, top: 2, color: "#6366f1", opacity: 0.45, transform: "scaleX(-1)" }} />
                      <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.75, margin: 0 }}>{r.review_text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Show more reviews indicator if there are more than 3 */}
              {reviews.length > 3 && (
                <div style={{
                  textAlign: "center",
                  padding: "1rem 1rem 0",
                  color: "#64748b",
                  fontSize: 13,
                  fontStyle: "italic",
                }}>
                  Showing 3 of {reviews.length} reviews
                </div>
              )}
            </Section>
          </div>

          {/* ── RIGHT COLUMN (sticky) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", position: "sticky", top: 24 }}>

            {/* Book Card */}
            <div style={{
              position: "relative",
              overflow: "hidden",
              background: "linear-gradient(160deg, #ffffff 0%, #f5f6ff 60%, #eef2ff 100%)",
              border: "1px solid #e0e7ff",
              borderRadius: 24,
              padding: "1.75rem",
              color: "#0f172a",
              boxShadow: "0 24px 60px -24px rgba(79,70,229,0.35)",
              animation: "fadeUp 0.55s ease 0.15s both",
            }}>
              {/* subtle orb */}
              <div style={{
                position: "absolute", top: -70, right: -70,
                width: 220, height: 220, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(129,140,248,0.22) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", bottom: -80, left: -60,
                width: 200, height: 200, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(56,189,248,0.16) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />

              <div style={{ position: "relative" }}>
                <p style={{ fontSize: 11, color: "#6366f1", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700 }}>
                  Book this nurse
                </p>
                <p style={{ fontSize: 30, fontFamily: "'Instrument Serif', serif", color: "#0f172a", margin: "0 0 1.4rem", lineHeight: 1.1 }}>
                  {s.name.split(" ")[0]}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.5rem" }}>
                  {[
                    { label: "Specialty", value: s.specialty },
                    { label: "Location",  value: s.location },
                  ].map(row => (
                    <div key={row.label} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      fontSize: 13,
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.8)",
                      border: "1px solid #e5e9fb",
                      borderRadius: 12,
                    }}>
                      <span style={{ color: "#94a3b8" }}>{row.label}</span>
                      <span style={{ color: "#334155", fontWeight: 600, textAlign: "right" }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setBookClicked(true)}
                  style={{
                    width: "100%",
                    padding: "15px",
                    background: bookClicked
                      ? "linear-gradient(135deg, #22c55e, #16a34a)"
                      : "linear-gradient(135deg, #818cf8, #6366f1 50%, #4f46e5)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 14,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "transform 0.15s, box-shadow 0.2s",
                    boxShadow: bookClicked
                      ? "0 10px 30px -8px rgba(34,197,94,0.6)"
                      : "0 10px 30px -8px rgba(99,102,241,0.7)",
                    letterSpacing: "0.01em",
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                >
                  {bookClicked ? <><CheckCircle size={17} /> Requested!</> : <><Calendar size={17} /> Book Now</>}
                </button>
                <button style={{
                  width: "100%", marginTop: 10,
                  padding: "13px",
                  background: "#fff",
                  color: "#334155",
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "background 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                  <Heart size={14} /> Save Profile
                </button>
              </div>
            </div>

            {/* Trust badges */}
            <div style={{
              background: "#fff",
              border: "1px solid #e9ecf5",
              borderRadius: 22,
              padding: "1.4rem 1.6rem",
              boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
              animation: "fadeUp 0.55s ease 0.28s both",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 14px" }}>
                Verified by VCare
              </p>
              {[
                { icon: <Shield size={15} />, label: "Identity Verified", note: "Government ID confirmed" },
                { icon: <Award size={15} />, label: "Certifications Checked", note: "Credentials manually reviewed" },
                { icon: <CheckCircle size={15} />, label: "Background Cleared", note: "Full screening completed" },
              ].map(b => (
                <div key={b.label} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 13 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
                    color: "#059669",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{b.icon}</span>
                  <div>
                    <div style={{ fontSize: 13.5, color: "#0f172a", fontWeight: 600 }}>{b.label}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{b.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Marketing CTA banner ── */}
        <div style={{
          position: "relative",
          overflow: "hidden",
          marginTop: "3rem",
          borderRadius: 28,
          background: "linear-gradient(120deg, #4f46e5 0%, #6d28d9 55%, #0ea5e9 130%)",
          padding: "clamp(2rem, 5vw, 3.5rem)",
          textAlign: "center",
          color: "#fff",
          boxShadow: "0 30px 70px -25px rgba(79,70,229,0.55)",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)",
            width: 480, height: 300, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)", margin: "0 0 12px" }}>
              VCare Nursing
            </p>
            <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", margin: "0 0 12px", lineHeight: 1.15 }}>
              Bring world-class care <em style={{ fontStyle: "italic" }}>home</em>.
            </h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", maxWidth: 520, margin: "0 auto 1.75rem", lineHeight: 1.7 }}>
              Every VCare professional is identity-verified, credential-checked, and background-cleared — so your loved ones are always in safe hands.
            </p>
            <button
              onClick={() => setBookClicked(true)}
              style={{
                padding: "14px 36px",
                background: "#fff",
                color: "#4f46e5",
                border: "none",
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 12px 30px -8px rgba(0,0,0,0.35)",
                transition: "transform 0.15s",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px) scale(1.02)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0) scale(1)"}
            >
              <Calendar size={16} /> Book {s.name.split(" ")[0]} today
            </button>
          </div>
        </div>
      </div>

      {/* ── Related Staff ── */}
      {relatedStaff.length > 0 && (
        <div style={{ borderTop: "1px solid #e9ecf5", background: "linear-gradient(180deg, #ffffff 0%, #f6f7fc 100%)", padding: "3.5rem clamp(1rem, 4vw, 2.5rem)" }}>
          <div style={{ maxWidth: 1150, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.75rem", flexWrap: "wrap", gap: 12 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6366f1", margin: "0 0 6px" }}>
                  Meet the team
                </p>
                <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "#0f172a", margin: 0, letterSpacing: "-0.5px" }}>
                  Other Top Staff
                </h2>
              </div>
              <Link to="/services/view-staff" style={{ color: "#4f46e5", textDecoration: "none", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                View all <ChevronRight size={16} />
              </Link>
            </div>
            {relatedLoading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 20,
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
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
                {relatedStaff.map((member, index) => (
                  <StaffCard key={member.staff_profile_id} member={member} index={index} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, accent = "#6366f1", delay = 0 }) {
  return (
    <div style={{
      position: "relative",
      background: "#fff",
      border: "1px solid #e9ecf5",
      borderRadius: 22,
      padding: "1.75rem 2rem",
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
      animation: `fadeUp 0.55s ease both`,
      animationDelay: `${delay * 120}ms`,
    }}>
      {/* accent top border */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accent}, ${accent}00 70%)`,
      }} />
      <h3 style={{
        fontFamily: "'Instrument Serif', serif",
        fontSize: "1.35rem",
        color: "#0f172a",
        margin: "0 0 1.2rem",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, boxShadow: `0 0 10px ${accent}88`, flexShrink: 0 }} />
        {title}
      </h3>
      {children}
    </div>
  );
}
