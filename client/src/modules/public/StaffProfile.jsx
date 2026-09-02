import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Clock, Star, Shield, Award, ChevronRight, Calendar, Heart, CheckCircle, Quote, Sparkles, BadgeCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/layout/Navbar";
import { formatPhoneNumberIntl } from 'react-phone-number-input';

const statusStyle = {
  "Available": { dot: "#22c55e", bg: "#f0fdf4", text: "#166534" },
  "On Shift":  { dot: "#f59e0b", bg: "#fffbeb", text: "#92400e" },
  "Off Duty":  { dot: "#94a3b8", bg: "#f8fafc", text: "#475569" },
};

// StaffCard component from ViewStaffPage
function StaffCard({ member, index }) {
  const navigate = useNavigate();
  const avatarColors = ["#2563eb", "#0891b2", "#7c3aed", "#059669", "#dc2626", "#d97706", "#be185d", "#0d9488", "#4f46e5", "#7c3aed"];
  const color = avatarColors[index % avatarColors.length];
  const statusText = member.current_status?.replace('_', ' ') || 'Unknown';
  const st = statusStyle[statusText] || statusStyle["Available"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className="relative bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-3.5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg hover:border-blue-200"
    >
      <span
        className="absolute top-4 right-4 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: st.bg, color: st.text }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
        {statusText}
      </span>

      <div className="flex flex-col items-center pt-2">
        {member.profile_picture_url ? (
          <img
            src={member.profile_picture_url}
            alt={member.full_name}
            className="w-24 h-24 rounded-xl object-cover border-2 border-slate-100"
          />
        ) : (
          <div
            className="w-24 h-24 rounded-xl flex items-center justify-center text-2xl font-bold"
            style={{ background: color + "18", border: `2px solid ${color}22`, color }}
          >
            {member.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'ST'}
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="mb-0.5 text-[15px] font-bold text-slate-900 leading-tight">
          {member.full_name || 'Unknown'}
        </p>
        <p className="text-xs text-slate-500">
          {member.designation || (member.role && Array.isArray(member.role) ? member.role.join(', ') : member.role) || 'Staff Member'}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin size={12} className="text-slate-400" />
          {member.location || 'Location not specified'}
        </div>
        {member.specialization && (
          <div
            className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: color + "12", color }}
          >
            {member.specialization}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-3.5 flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <Star size={13} className="text-amber-500 fill-amber-500" />
          {member.average_rating > 0 ? (
            <>
              <span className="text-[13px] font-semibold text-slate-900">{member.average_rating.toFixed(1)}</span>
              <span className="text-xs text-slate-400">({member.total_reviews || 0})</span>
            </>
          ) : (
            <span className="text-xs text-slate-400">No ratings yet</span>
          )}
        </div>
        <button
          onClick={() => navigate(`/services/staff-profile/${member.staff_profile_id}`)}
          className="px-4 py-1.5 bg-blue-600 text-white rounded-full text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
          View Profile
        </button>
      </div>
    </motion.div>
  );
}

const getYoutubeId = (url) => {
  const match = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/.exec(url || '');
  return match ? match[1] : null;
};

const API_URL = import.meta.env.VITE_API_URL;
const STATUS_STYLE = {
  "Available": { dot: "#22c55e", bg: "#f0fdf4", text: "#166534", label: "Available now" },
  "On Shift":  { dot: "#f59e0b", bg: "#fffbeb", text: "#92400e", label: "On shift" },
  "Off Duty":  { dot: "#94a3b8", bg: "#f8fafc", text: "#475569", label: "Off duty" },
  "AVAILABLE": { dot: "#22c55e", bg: "#f0fdf4", text: "#166534", label: "Available now" },
  "ON_SHIFT": { dot: "#f59e0b", bg: "#fffbeb", text: "#92400e", label: "On shift" },
  "OFF_DUTY": { dot: "#94a3b8", bg: "#f8fafc", text: "#475569", label: "Off duty" },
};

// ─── Sub-components ──────────────────────────────────────────────────────────
function StarRow({ rating, size = 14 }) {
  return (
    <span className="inline-flex gap-0.5">
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
    <div className="flex items-center gap-2.5 mb-1.5">
      <span className="text-xs text-slate-500 w-3.5 text-right font-semibold">{stars}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-5">{count}</span>
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
        <div className="text-sm text-slate-500">Loading profile…</div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-base text-red-500">{error || 'Staff profile not found'}</div>
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
    bio: staff.qualifications || 'Experienced healthcare professional',
    certifications: staff.role && Array.isArray(staff.role) ? staff.role : [staff.role || 'Healthcare Professional'],
    languages: Array.isArray(staff.languages) && staff.languages.length > 0 ? staff.languages : ["English"],
    youtubeLinks: Array.isArray(staff.youtube_links) ? staff.youtube_links : [],
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      <Navbar />

      {/* ══════════════ HERO ══════════════ */}
      <div className="relative overflow-hidden bg-white border-b border-slate-200 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Link
            to="/services/view-staff"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Our Team
          </Link>

          <div className="grid md:grid-cols-[auto_1fr_auto] gap-8 md:gap-10 items-center">
            {/* Avatar */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative flex justify-center">
              <div className="relative w-44 h-44 rounded-2xl overflow-hidden border-4 border-slate-100 bg-slate-100 flex items-center justify-center">
                {s.avatar ? (
                  <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-5xl font-bold text-blue-600">{initials}</span>
                )}
              </div>
              <div
                className="absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-white"
                style={{ background: st.dot }}
              />
            </motion.div>

            {/* Identity */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="min-w-0 text-center md:text-left">
              <div className="flex items-center gap-2 mb-3 flex-wrap justify-center md:justify-start">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full"
                  style={{ background: st.bg, color: st.text }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                  {st.label || s.status}
                </span>
                <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                  {s.specialty}
                </span>
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full">
                  <BadgeCheck size={13} /> VCare Verified
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-2">
                {s.name}
              </h1>

              <p className="text-slate-500 text-sm sm:text-base mb-4 max-w-lg mx-auto md:mx-0">
                Compassionate care, delivered with excellence — trusted by families across the community.
              </p>

              <div className="flex gap-5 flex-wrap justify-center md:justify-start text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-blue-500" /> {s.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-500" /> With VCare since {s.joinedYear}
                </span>
              </div>
            </motion.div>

            {/* Quick Stats */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="flex md:flex-col gap-3 justify-center">
              {[
                { value: s.rating > 0 ? s.rating.toFixed(1) : "New", sub: s.totalReviews > 0 ? `${s.totalReviews} client reviews` : "Awaiting first review", icon: <Star size={17} className="text-amber-500 fill-amber-500" /> },
                { value: s.exp.replace(" years", ""), sub: "Years of age", icon: <Clock size={17} className="text-blue-500" /> },
              ].map(stat => (
                <div key={stat.sub} className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 min-w-[180px] flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                    {stat.icon}
                  </div>
                  <div>
                    <div className="text-xl font-bold text-slate-900 leading-none">{stat.value}</div>
                    <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      {/* ══════════════ BODY ══════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">

          {/* ── LEFT COLUMN ── */}
          <div className="flex flex-col gap-6">

            {/* Bio */}
            <Section title="About">
              <div className="relative pl-7">
                <Quote size={20} className="absolute left-0 top-0.5 text-blue-300 scale-x-[-1]" />
                <p className="text-[15px] text-slate-600 leading-relaxed m-0">{s.bio}</p>
              </div>
            </Section>

            {/* Languages */}
            <Section title="Languages Spoken">
              <div className="flex gap-2.5 flex-wrap">
                {s.languages.map((lang) => (
                  <span key={lang} className="inline-flex items-center bg-emerald-50 text-emerald-700 text-sm font-semibold px-4 py-1.5 rounded-full">
                    {lang}
                  </span>
                ))}
              </div>
            </Section>

            {/* Videos */}
            {s.youtubeLinks.length > 0 && (
              <Section title="Videos">
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                  {s.youtubeLinks.map((url) => {
                    const videoId = getYoutubeId(url);
                    return (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 block aspect-video">
                        {videoId ? (
                          <img
                            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                            alt="Video thumbnail"
                            className="w-full h-full object-cover opacity-85"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white text-xs">
                            Watch video
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-11 h-11 rounded-full bg-red-500/90 flex items-center justify-center">
                            <div className="w-0 h-0 border-t-8 border-b-8 border-t-transparent border-b-transparent border-l-[13px] border-l-white ml-1" />
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Qualifications */}
            <Section title="Qualifications">
              {staff.qualifications ? (
                <div className="flex items-start gap-3">
                  <Award size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[15px] text-slate-600 leading-relaxed m-0 whitespace-pre-line">{staff.qualifications}</p>
                </div>
              ) : (
                <div className="w-full text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No qualifications listed yet
                </div>
              )}
            </Section>

            {/* Reviews */}
            <Section title={`Client Reviews (${s.totalReviews})`}>
              {/* Rating Summary */}
              <div className="flex gap-10 items-center mb-7 flex-wrap">
                <div className="text-center bg-amber-50 border border-amber-100 rounded-2xl px-8 py-5">
                  <div className="text-5xl font-bold text-amber-700 leading-none">{s.rating.toFixed(1)}</div>
                  <div className="mt-1.5"><StarRow rating={s.rating} size={16} /></div>
                  <div className="text-xs text-amber-600 mt-1.5 font-medium">{s.totalReviews} reviews</div>
                </div>
                <div className="flex-1 min-w-[200px]">
                  {[5,4,3,2,1].map(n => (
                    <RatingBar key={n} stars={n} count={s.ratingBreakdown[n]} total={s.totalReviews} />
                  ))}
                </div>
              </div>

              {/* Review Cards - Show only 3 */}
              <div className="flex flex-col gap-3.5">
                {reviews.slice(0, 3).map((r, i) => (
                  <motion.div
                    key={r.review_id || i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: i * 0.08 }}
                    className="bg-slate-50 border border-slate-100 rounded-xl px-6 py-5"
                  >
                    <div className="flex items-center gap-3 mb-2.5">
                      <div className="w-9 h-9 rounded-lg flex-shrink-0 bg-blue-50 flex items-center justify-center text-[13px] font-bold text-blue-600">
                        {r.client_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-slate-900">{r.client_name}</span>
                          <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                        </div>
                        <StarRow rating={r.rating} size={12} />
                      </div>
                    </div>
                    <div className="relative pl-5">
                      <Quote size={14} className="absolute left-0 top-0.5 text-blue-300 scale-x-[-1]" />
                      <p className="text-sm text-slate-600 leading-relaxed m-0">{r.review_text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {reviews.length > 3 && (
                <div className="text-center pt-4 text-slate-400 text-sm italic">
                  Showing 3 of {reviews.length} reviews
                </div>
              )}
            </Section>
          </div>

          {/* ── RIGHT COLUMN (sticky) ── */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-24">

            {/* Book Card */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"
            >
              <p className="text-xs text-blue-600 mb-1.5 uppercase tracking-wide font-bold">
                Book this nurse
              </p>
              <p className="text-2xl font-bold text-slate-900 mb-5 leading-tight">
                {s.name.split(" ")[0]}
              </p>

              <div className="flex flex-col gap-3 mb-6">
                {[
                  { label: "Specialty", value: s.specialty },
                  { label: "Location",  value: s.location },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="text-slate-700 font-semibold text-right">{row.value}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setBookClicked(true)}
                className={`w-full py-3.5 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-colors text-white ${
                  bookClicked ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {bookClicked ? <><CheckCircle size={17} /> Requested!</> : <><Calendar size={17} /> Book Now</>}
              </button>
              <button className="w-full mt-2.5 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
                <Heart size={14} /> Save Profile
              </button>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3.5">
                Verified by VCare
              </p>
              {[
                { icon: <Shield size={15} />, label: "Identity Verified", note: "Government ID confirmed" },
                { icon: <Award size={15} />, label: "Certifications Checked", note: "Credentials manually reviewed" },
                { icon: <CheckCircle size={15} />, label: "Background Cleared", note: "Full screening completed" },
              ].map(b => (
                <div key={b.label} className="flex items-start gap-3 mb-3.5 last:mb-0">
                  <span className="w-8 h-8 rounded-lg flex-shrink-0 bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    {b.icon}
                  </span>
                  <div>
                    <div className="text-[13.5px] text-slate-900 font-semibold">{b.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{b.note}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* ── Marketing CTA banner ── */}
        <div className="relative overflow-hidden mt-12 rounded-3xl bg-blue-600 px-6 sm:px-12 py-12 text-center text-white shadow-lg">
          <p className="text-xs font-bold tracking-wide uppercase text-blue-200 mb-3">
            VCare Nursing
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 leading-tight">
            Bring world-class care home.
          </h2>
          <p className="text-sm sm:text-base text-blue-100 max-w-lg mx-auto mb-7 leading-relaxed">
            Every VCare professional is identity-verified, credential-checked, and background-cleared — so your loved ones are always in safe hands.
          </p>
          <button
            onClick={() => setBookClicked(true)}
            className="px-8 py-3.5 bg-white text-blue-700 rounded-full text-[15px] font-bold hover:bg-blue-50 transition-colors inline-flex items-center gap-2"
          >
            <Calendar size={16} /> Book {s.name.split(" ")[0]} today
          </button>
        </div>
      </div>

      {/* ── Related Staff ── */}
      {relatedStaff.length > 0 && (
        <div className="border-t border-slate-200 bg-white py-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-baseline mb-7 flex-wrap gap-3">
              <div>
                <p className="text-xs font-bold tracking-wide uppercase text-blue-600 mb-1.5">
                  Meet the team
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  Other Top Staff
                </h2>
              </div>
              <Link to="/services/view-staff" className="text-blue-600 text-sm font-semibold flex items-center gap-1.5 hover:text-blue-700">
                View all <ChevronRight size={16} />
              </Link>
            </div>
            {relatedLoading ? (
              <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-slate-200" />
                      <div className="flex-1">
                        <div className="h-4 bg-slate-200 rounded mb-2 w-4/5" />
                        <div className="h-3 bg-slate-200 rounded w-3/5" />
                      </div>
                    </div>
                    <div className="h-3 bg-slate-200 rounded mb-2 w-2/5" />
                    <div className="h-3 bg-slate-200 rounded w-3/5" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
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

function Section({ title, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-sm"
    >
      <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />
        {title}
      </h3>
      {children}
    </motion.div>
  );
}
