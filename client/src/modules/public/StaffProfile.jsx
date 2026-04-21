import { useState, useEffect } from "react";
import { ArrowLeft, MapPin, Clock, Star, Shield, Award, ChevronRight, Calendar, Heart, CheckCircle, Quote, Phone, MessageSquare } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL;
const STATUS_STYLE = {
  "Available": { dot: "#22c55e", bg: "#f0fdf4", text: "#166534" },
  "On Shift":  { dot: "#f59e0b", bg: "#fffbeb", text: "#92400e" },
  "Off Duty":  { dot: "#94a3b8", bg: "#f8fafc", text: "#475569" },
  "AVAILABLE": { dot: "#22c55e", bg: "#f0fdf4", text: "#166534" },
  "ON_SHIFT": { dot: "#f59e0b", bg: "#fffbeb", text: "#92400e" },
  "OFF_DUTY": { dot: "#94a3b8", bg: "#f8fafc", text: "#475569" },
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
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "#64748b", width: 14, textAlign: "right" }}>{stars}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <div style={{ flex: 1, height: 6, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#f59e0b", borderRadius: 999, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ fontSize: 12, color: "#94a3b8", width: 20 }}>{count}</span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function StaffProfile() {
  const { id: staffId } = useParams();
  const navigate = useNavigate();
  const [staff, setStaff] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookClicked, setBookClicked] = useState(false);

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

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fc" }}>
        <div style={{ fontSize: 16, color: "#64748b" }}>Loading staff profile...</div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fc" }}>
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
    phone: staff.mobile_number || 'Not available',
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

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: "'Instrument Sans', 'Helvetica Neue', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />

      {/* ── Topbar ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e9ecef", padding: "0 2rem", height: 60, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 50 }}>
        <button onClick={() => navigate("/staff")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          <ArrowLeft size={15} /> Our Team
        </button>
        <div style={{ width: 1, height: 18, background: "#e2e8f0" }} />
        <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, color: "#0f172a" }}>
          VCare <span style={{ color: "#2563eb" }}>Staff</span>
        </span>
        {/*<div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", color: "#334155", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <Phone size={13} /> Call
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", color: "#334155", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <MessageSquare size={13} /> Message
          </button>
        </div>*/}
      </div>

      {/* ── Hero Banner ── */}
      <div style={{
        background: `linear-gradient(135deg, ${s.color}18 0%, #eff6ff 60%, #f8f9fc 100%)`,
        borderBottom: "1px solid #e9ecef",
        padding: "3rem 2rem 0",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -60, right: -60, width: 280, height: 280, borderRadius: "50%", background: s.color + "0a", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 20, left: "30%", width: 160, height: 160, borderRadius: "50%", background: s.color + "06", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: "3rem", alignItems: "flex-end", flexWrap: "wrap" }}>

            {/* ── Avatar ── */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                width: 180, height: 180,
                borderRadius: "50%",
                border: `5px solid #fff`,
                boxShadow: `0 0 0 3px ${s.color}30, 0 20px 60px rgba(0,0,0,0.12)`,
                overflow: "hidden",
                background: s.color + "18",
              }}>
                <img src={s.avatar} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              {/* Status dot */}
              <div style={{
                position: "absolute", bottom: 10, right: 8,
                width: 22, height: 22, borderRadius: "50%",
                background: st.dot,
                border: "3px solid #fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }} />
            </div>

            {/* ── Identity ── */}
            <div style={{ paddingBottom: "1.5rem", flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ background: st.bg, color: st.text, fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot }} />
                  {s.status}
                </span>
                <span style={{ background: s.color + "18", color: s.color, fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 999 }}>
                  {s.specialty}
                </span>
              </div>

              <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", color: "#0f172a", margin: "0 0 4px", lineHeight: 1.15 }}>
                {s.name}
              </h1>

              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#64748b" }}>
                  <MapPin size={13} color="#94a3b8" /> {s.location}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#64748b" }}>
                  <Calendar size={13} color="#94a3b8" /> Joined {s.joinedYear}
                </span>
              </div>
            </div>

            {/* ── Quick Stats ── */}
            <div style={{ display: "flex", gap: 16, paddingBottom: "1.5rem", flexWrap: "wrap" }}>
              {[
                { label: "Rating", value: s.rating.toFixed(1), sub: `${s.totalReviews} reviews`, icon: "★" },
                { label: "Age", value: s.exp.replace(" years",""), sub: "Age", icon: "◈" },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: "#fff",
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: "1rem 1.25rem",
                  minWidth: 90,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 20, color: s.color, marginBottom: 2 }}>{stat.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: "#0f172a", lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2.5rem 2rem", display: "grid", gridTemplateColumns: "1fr 340px", gap: "2rem", alignItems: "start" }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

          {/* Bio */}
          <Section title="About">
            <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.75, margin: 0 }}>{s.bio}</p>
          </Section>

          {/* Certifications */}
          <Section title="Certifications">
            <div style={{ display: "flex", gap: 15, flexWrap: "wrap" }}>
              {staff.document_urls && staff.document_urls.length > 0 ? (
                staff.document_urls.map((doc, index) => (
                  <div key={index} style={{
                    position: "relative",
                    width: 120,
                    height: 160,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    cursor: "pointer",
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  onClick={() => window.open(doc, '_blank')}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)";
                    e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}>
                    {doc.toLowerCase().includes('.pdf') ? (
                      <div style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                        color: "#fff",
                      }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                        <div style={{ fontSize: 11, textAlign: "center", padding: "0 8px" }}>
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
                      width: 24,
                      height: 24,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}>
                      <CheckCircle size={12} color={s.color} />
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
                }}>
                  No certifications uploaded yet
                </div>
              )}
            </div>
          </Section>

          {/* Availability 
          <Section title="Weekly Availability">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {s.availability.map(d => (
                <div key={d.day} style={{
                  width: 52, height: 64,
                  borderRadius: 14,
                  border: d.avail ? `1.5px solid ${s.color}40` : "1px solid #e2e8f0",
                  background: d.avail ? s.color + "10" : "#f8fafc",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: d.avail ? s.color : "#94a3b8", letterSpacing: "0.04em" }}>{d.day}</span>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.avail ? s.color : "#e2e8f0" }} />
                </div>
              ))}
            </div>
          </Section>*/}

          {/* Reviews */}
          <Section title={`Reviews (${s.totalReviews})`}>
            {/* Rating Summary */}
            <div style={{ display: "flex", gap: "2.5rem", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 52, fontFamily: "'Instrument Serif', serif", color: "#0f172a", lineHeight: 1 }}>{s.rating.toFixed(1)}</div>
                <StarRow rating={s.rating} size={16} />
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{s.totalReviews} reviews</div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {[5,4,3,2,1].map(n => (
                  <RatingBar key={n} stars={n} count={s.ratingBreakdown[n]} total={s.totalReviews} />
                ))}
              </div>
            </div>

            {/* Review Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {reviews.map((r, i) => (
                <div key={r.review_id || i} style={{
                  background: "#fff",
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: "1.25rem 1.5rem",
                  animation: `fadeUp 0.4s ease both`,
                  animationDelay: `${i * 80}ms`,
                }}>
                  <style>{`@keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }`}</style>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{r.client_name}</span>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                      </div>
                      <StarRow rating={r.rating} size={12} />
                    </div>
                  </div>
                  <div style={{ position: "relative", paddingLeft: 20 }}>
                    <Quote size={14} style={{ position: "absolute", left: 0, top: 2, color: s.color, opacity: 0.5 }} />
                    <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7, margin: 0 }}>{r.review_text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Book Card */}
          <div style={{
            background: "#fff",
            border: "1px solid #e9ecef",
            borderRadius: 20,
            padding: "1.5rem",
            position: "sticky",
            top: 76,
          }}>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Book this nurse</p>
            <p style={{ fontSize: 22, fontFamily: "'Instrument Serif', serif", color: "#0f172a", margin: "0 0 1.25rem" }}>{s.name.split(" ")[0]}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.25rem" }}>
              {[
                { label: "Specialty", value: s.specialty },
                { label: "Location",  value: s.location },
                {/*{ label: "Languages", value: s.languages.join(", ") },*/}
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "#94a3b8" }}>{row.label}</span>
                  <span style={{ color: "#334155", fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setBookClicked(true)}
              style={{
                width: "100%",
                padding: "13px",
                background: bookClicked ? "#16a34a" : s.color,
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "background 0.2s",
              }}
            >
              {bookClicked ? <><CheckCircle size={16} /> Requested!</> : <><Calendar size={16} /> Book Now</>}
            </button>
            <button style={{
              width: "100%", marginTop: 10,
              padding: "12px",
              background: "#f8fafc",
              color: "#334155",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}>
              <Heart size={14} /> Save Profile
            </button>
          </div>

          {/* Trust badges */}
          <div style={{ background: "#fff", border: "1px solid #e9ecef", borderRadius: 20, padding: "1.25rem 1.5rem" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Verified by VCare</p>
            {[
              { icon: <Shield size={14} />, label: "Identity Verified" },
              { icon: <Award size={14} />, label: "Certifications Checked" },
              { icon: <CheckCircle size={14} />, label: "Background Cleared" },
            ].map(b => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                <span style={{ color: "#16a34a" }}>{b.icon}</span>
                <span style={{ fontSize: 13, color: "#334155" }}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Other Staff ── */}
      <div style={{ borderTop: "1px solid #e9ecef", background: "#fff", padding: "3rem 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
            <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "1.6rem", color: "#0f172a", margin: 0 }}>Other Top Staff</h2>
            <Link to="/staff" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              View all <ChevronRight size={14} />
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {/* This would need to fetch other staff data, for now showing placeholder */}
            <div style={{
              border: "1px solid #e9ecef",
              borderRadius: 18,
              padding: "1.25rem",
              textAlign: "center",
              color: "#94a3b8",
              background: "#fff",
            }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>More staff profiles coming soon...</div>
              <Link to="/staff" style={{
                display: "inline-block",
                marginTop: 12,
                padding: "8px 16px",
                background: "#2563eb",
                color: "#fff",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 500,
              }}>
                Browse All Staff
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e9ecef", borderRadius: 20, padding: "1.5rem 1.75rem" }}>
      <h3 style={{ fontFamily: "'Instrument Serif', serif", fontSize: "1.15rem", color: "#0f172a", margin: "0 0 1.1rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "0.75rem" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}