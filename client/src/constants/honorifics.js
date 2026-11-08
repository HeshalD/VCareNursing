// The one honorific list for every form. Abbreviations keep their dot (Mr., Mrs., Ms., Dr., Prof.,
// Rev.); Miss is a full word and has none. The server and database enforce the same list
// (backend/utils/honorific.js), so never type a variant like "Mr" or "Doc" here.
export const HONORIFICS = ['Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.', 'Prof.', 'Rev.'];

// Honorifics that imply the person's gender (the gender field is then pre-filled and locked).
export const genderForHonorific = (honorific) => {
  if (honorific === 'Mr.') return 'MALE';
  if (['Mrs.', 'Miss', 'Ms.'].includes(honorific)) return 'FEMALE';
  return null;
};
export const isGenderImplied = (honorific) => genderForHonorific(honorific) !== null;

// Applies a honorific to a form object and, when it implies a gender (Mr. / Mrs. / Miss / Ms.),
// sets that gender too. The form's gender field is then locked via isGenderImplied(form.honorific).
export const withHonorificGender = (form, honorific) => {
  const gender = genderForHonorific(honorific);
  return { ...form, honorific, ...(gender ? { gender } : {}) };
};
