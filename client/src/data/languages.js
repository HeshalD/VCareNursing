// Static list of languages selectable for a staff member's profile.
// No external API call — bundled locally so the picker works offline and instantly.
export const DEFAULT_LANGUAGES = ['Sinhala', 'English', 'Tamil'];

export const LANGUAGES = [
  'Sinhala', 'English', 'Tamil',
  'Arabic', 'Bengali', 'Burmese', 'Cantonese', 'Chinese (Mandarin)', 'Dutch',
  'Filipino (Tagalog)', 'French', 'German', 'Gujarati', 'Hebrew', 'Hindi',
  'Indonesian', 'Italian', 'Japanese', 'Kannada', 'Khmer', 'Korean', 'Malay',
  'Malayalam', 'Marathi', 'Nepali', 'Pashto', 'Persian (Farsi)', 'Polish',
  'Portuguese', 'Punjabi', 'Russian', 'Spanish', 'Swahili', 'Swedish',
  'Tagalog', 'Telugu', 'Thai', 'Turkish', 'Urdu', 'Vietnamese',
].sort((a, b) => a.localeCompare(b));
