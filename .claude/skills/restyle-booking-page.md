# restyle-booking-page

Apply the standard VCare "hero + full-page background + card selectors" restyle to a public booking page. First done on `ElderlyCareBookingPage.jsx`; meant to be repeated on `BabyCareBookingPage.jsx` and `HomeNursingBookingPage.jsx`.

## Usage

```
/restyle-booking-page <PageFile.jsx> <source_image> [overlay_opacity]
```

**Example:**
```
/restyle-booking-page BabyCareBookingPage.jsx baby_care_hero.jpg 40
/restyle-booking-page HomeNursingBookingPage.jsx home_nursing_hero.jpg 40
```

**Arguments:**
- `PageFile.jsx` — file inside `client/src/modules/public/`
- `source_image` — the original (often huge) hero image; will be converted to WebP
- `overlay_opacity` — dark overlay strength over the bg, Tailwind `/NN` value. Default `40`. Higher = darker = more readable white text.

## Reference implementation

The completed result lives in [client/src/modules/public/ElderlyCareBookingPage.jsx](client/src/modules/public/ElderlyCareBookingPage.jsx). When in doubt, copy its exact structure.

## Steps

### 1. Optimize the background image (ffmpeg, not sharp — sharp isn't installed)

Hero images in this repo are often 8K / 10+ MB and load late in production. Downscale to 1920px wide and convert to WebP (`~50 KB`):

```bash
cd client/src/assets/images
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 <source_image>   # inspect size
ffmpeg -y -i <source_image> -vf "scale=1920:-1" -quality 82 <Name>.webp
rm <source_image>   # only if nothing else references it — grep first:
```
Before deleting the original, `grep` the codebase for its filename to be sure no other page imports it.

### 2. Import the WebP at the top of the page file

```jsx
import <name>Bg from '../../assets/images/<Name>.webp';
```

### 3. Full-page fixed background + overlay + offset for the fixed navbar

The `Navbar` is `position: fixed h-16 z-50`. Wrap the page so the image is `fixed inset-0 z-0` (NOT `-z-10` — negative z-index hides it behind the page background), the overlay sits on top of it, and the content wrapper is `relative z-10` with `pt-32` so the navbar doesn't cover the header.

```jsx
return (
  <div className="relative min-h-screen">
    {/* Full-page background image, pinned to the viewport so it stays proportional */}
    <div
      className="fixed inset-0 z-0"
      style={{
        backgroundImage: `url(${<name>Bg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    />
    <div className="fixed inset-0 z-0 bg-slate-900/40" />   {/* overlay_opacity */}

    <Navbar />

    <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-12">
      {/* header + progress steps + form ... */}
    </div>

    {/* Footer must be lifted above the overlay too */}
    <div className="relative z-10">
      <Footer />
    </div>
  </div>
);
```

**Gotchas learned the hard way:**
- Use `fixed inset-0 z-0`, never `-z-10` or `absolute` sized to content. Negative z hid the image entirely (only the bluish overlay showed). `absolute` over the full tall page made `background-size: cover` zoom the wide image into a cropped sliver.
- The `Footer` is a sibling of the content wrapper, so it needs its own `relative z-10` wrapper or the overlay paints over it (footer "disappears").

### 4. Make on-image text readable

- Header `<h1>`/`<p>`: white / light text — `text-white`, `text-slate-100`.
- Progress-step labels: active `text-white`, inactive `text-slate-300`; connector lines `bg-white/30` when not yet passed.
- Form card: glassy — `bg-white/90 backdrop-blur-md ... border-white/40` instead of solid `bg-white`.

### 5. Convert Service Type / Service Model dropdowns to single-select cards

Replace the `<select>` dropdowns in the Service Details step with icon cards that show a short description. One selection each (clicking sets the single `service_type` / `service_model` value). Define options as module-level constants above the component (icons come from the existing `lucide-react` import — add any missing ones):

```jsx
const SERVICE_TYPES = [
  { value: 'CARETAKER', label: 'Caretaker', icon: HandHeart, description: '...' },
  { value: 'NURSE',     label: 'Nurse',     icon: ShieldCheck, description: '...' },
];
const SERVICE_MODELS = [
  { value: 'SHIFT_BASED', label: 'Shift Based', icon: Clock,    description: '...' },
  { value: 'LIVE_IN',     label: 'Live In',     icon: Home,     description: '...' },
  { value: 'VISITING',    label: 'Visiting',    icon: Calendar, description: '...' },
];
```

Card pattern (selected = `border-amber-500 bg-amber-50` + amber icon chip + `CheckCircle`):

```jsx
<button
  type="button"
  key={opt.value}
  onClick={() => setFormData({ ...formData, service_type: opt.value })}
  className={`text-left p-4 rounded-xl border-2 transition-all ${isSelected
      ? 'border-amber-500 bg-amber-50'
      : 'border-slate-200 bg-white hover:border-amber-300'}`}
>
  <div className="flex items-start gap-3">
    <div className={`p-2 rounded-lg ${isSelected ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
      <opt.icon className="w-5 h-5" />
    </div>
    <div className="flex-1">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-800">{opt.label}</h4>
        {isSelected && <CheckCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />}
      </div>
      <p className="text-xs text-slate-500 mt-1">{opt.description}</p>
    </div>
  </div>
</button>
```

- Service Type grid: `grid sm:grid-cols-2 gap-4`. Service Model grid: `grid sm:grid-cols-3 gap-4`. Wrap each group in `md:col-span-2`.
- `<opt.icon ... />` works in JSX because it's a member expression.
- Tailor the `value`s and copy to each page's actual service offerings (Baby Care / Home Nursing may use different service types — keep the values matching what the backend `submitServiceRequest` expects).

### 6. Verify

```bash
cd client && npx vite build --mode development
```
Confirm it builds, then reload the page and check: image visible & proportional, nothing cut off by the navbar, footer present, cards single-select.
