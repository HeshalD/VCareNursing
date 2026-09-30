// Maps a staff API row to the shape FeaturedCaregivers renders, using real data only.
// Fields with no real value are left null so the card hides them instead of faking them.

const EXPERIENCE_LABELS = {
  BEGINNER: 'Beginner',
  '1_YEAR': '1 Year',
  '2_YEARS': '2 Years',
  '3_YEARS': '3 Years',
  '4_YEARS': '4 Years',
  '5_YEARS': '5 Years',
};

const calcAge = (dob) => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// qualifications is a free-text column; split on commas / new lines for badges.
const toBadges = (qualifications) => {
  const list = Array.isArray(qualifications)
    ? qualifications
    : String(qualifications || '').split(/[,\n]/);
  return list.map(q => String(q).trim()).filter(Boolean).slice(0, 2);
};

export const toCaregiverCard = (staff, roleLabel, staffType) => ({
  id: staff.staff_profile_id,
  name: staff.full_name,
  age: calcAge(staff.date_of_birth),
  role: roleLabel,
  experience: EXPERIENCE_LABELS[staff.experience_level] || null,
  location: staff.location || null,
  rating: staff.average_rating ? parseFloat(staff.average_rating).toFixed(1) : null,
  reviews: staff.total_reviews || 0,
  isVerified: staff.verification_status === 'VERIFIED',
  image: staff.profile_picture_url || null,
  languages: Array.isArray(staff.languages) ? staff.languages.filter(Boolean) : [],
  badges: toBadges(staff.qualifications),
  staffType,
});
