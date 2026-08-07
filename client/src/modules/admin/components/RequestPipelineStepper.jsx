import { FileText, Send, CircleDollarSign, BadgeCheck, UserCheck, Check } from 'lucide-react';

const PIPELINE_STEPS = [
  { key: 'new_lead',        label: 'New Lead',         icon: FileText,         description: 'Request was received and logged as a new lead.' },
  { key: 'quotation_sent',  label: 'Quotation Sent',   icon: Send,             description: 'A quotation was sent to the client for review.' },
  { key: 'payment_made',    label: 'Payment Made',     icon: CircleDollarSign, description: 'At least one payment has been recorded against a quotation.' },
  { key: 'booking_created', label: 'Booking Created',  icon: BadgeCheck,       description: 'A booking has been created from an accepted quotation.' },
  { key: 'staff_assigned',  label: 'Staff Assigned',   icon: UserCheck,        description: 'Staff have been assigned to fulfil this booking.' },
];

// Horizontal 5-phase pipeline tracker — shared by ServiceRequestSummaryPage and
// BookingStaffRosterPage so a request's progress reads identically everywhere.
// `completedCount` is how many of PIPELINE_STEPS are done (in order) — the step
// right after the last completed one is treated as "current" (in progress).
const RequestPipelineStepper = ({ completedCount }) => (
  <div className="bg-white rounded-xl border border-gray-200 px-5 py-5 mb-4">
    <div className="flex items-start">
      {PIPELINE_STEPS.map((step, i) => {
        const StepIcon = step.icon;
        const done = i < completedCount;
        const isCurrent = i === completedCount;
        const isLast = i === PIPELINE_STEPS.length - 1;
        return (
          <div key={step.key} className="relative flex-1">
            {!isLast && (
              <div className={`absolute top-[18px] left-1/2 h-0.5 w-full ${done ? 'bg-emerald-500' : 'bg-gray-200'}`} />
            )}
            <div className="group relative flex flex-col items-center">
              <div
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : isCurrent
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-gray-200 bg-white text-gray-300'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
              </div>
              <p className={`mt-1.5 whitespace-nowrap text-[11px] font-semibold ${
                done ? 'text-emerald-700' : isCurrent ? 'text-blue-700' : 'text-gray-400'
              }`}>
                Phase 0{i + 1}
              </p>
              <p className={`whitespace-nowrap text-[11px] ${
                done || isCurrent ? 'text-gray-600' : 'text-gray-400'
              }`}>
                {step.label}
              </p>

              {/* Hover tooltip with description */}
              <div className="pointer-events-none absolute top-full z-10 mt-1.5 w-48 -translate-x-1/2 left-1/2 rounded-lg bg-gray-900 px-3 py-2 text-center text-[11px] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                {step.description}
                <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default RequestPipelineStepper;
