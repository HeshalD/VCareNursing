import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// Drop-in replacement for `useState('')` on a list page's search box that also honours a `?search=`
// URL param, so global-search results can deep-link to a pre-filtered list. The page stays mounted
// when global search navigates between two `?search=` values on the same route, so the param is
// re-applied on change (React's "adjust state while rendering" pattern, not an effect).
export default function useUrlSearchState() {
  const [params] = useSearchParams();
  const urlValue = params.get('search') || '';
  const [value, setValue] = useState(urlValue);
  const [seenUrlValue, setSeenUrlValue] = useState(urlValue);
  if (urlValue !== seenUrlValue) {
    setSeenUrlValue(urlValue);
    setValue(urlValue);
  }
  return [value, setValue];
}
