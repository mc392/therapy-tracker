# GroundWork — Improvements To-Do

## High Priority

### 1. Enhanced DNA & Cancellation Logic
**Goal**: Implement customizable Did Not Attend (DNA) and cancellation fee rules as part of practice settings.

- Automated tracking of late cancellations with configurable fee structures
- Support multiple fee rules (e.g., 50% charge vs. 100% charge for different cancellation windows)
- Project revenue impact of DNA rates in reports and forecasting
- Make this a settings section so practitioners can configure how their practice handles cancellations
- Apply configured rules consistently across sessions and revenue calculations

### 2. Remove Default Rates from Setup
**Goal**: Don't suggest or default client rate, room rate, or pension contribution values during setup.

- Remove any pre-filled values for `clientRate`, `roomRate`, `pensionContribution`
- Require explicit user entry or allow "not applicable" options
- Ensures practitioners set their own rates based on their actual business model

### 3. Tax Disclaimer & Explicit Acceptance
**Goal**: Make it clear that tax info is for reference only and require explicit acknowledgement.

- Add prominent disclaimer: tax calculations are for information only, not professional advice
- Include explicit acceptance checkbox during setup (setup wizard step)
- Add disclaimer to Settings › help or About section
- Include in terms of service / legal section

### 4. Clarify Note-Taking Limitations
**Goal**: Onboard users to the fact that this app tracks whether notes are done, not the notes themselves.

- Add onboarding step explaining: "This app tracks session completion and notes status only. Maintain your actual client notes securely elsewhere."
- Include in setup wizard
- Optionally add to Settings › help
- Make clear in any receipts or exports that notes field is metadata only

### 5. Gradual Feature Revealing
**Goal**: Don't overwhelm new users; reveal advanced features as they use the app, with opt-in for "show everything" during setup.

- Add setup question: "Show all features now, or gradually reveal as you use the app?"
- Implement feature gate logic based on user preference and usage patterns
- Progressive disclosure: core tabs first (Home, Clients, Sessions, Revenue), then advanced (Reports, Finances, Accreditation, Peer Supervision)
- Existing feature flags (`feat()`) provide the foundation; add reveal/usage tracking logic
- Option to toggle "advanced mode" in Settings at any time

### 6. Better tax-year picker for use-of-home costs
**Goal**: Make it obvious which tax year's costs you are entering, and easy to move between them.

Use of home is now stored per tax year (`settings.useOfHome.years`), with a method locked in per year and household costs held separately for each. The current control is a plain `<select>` at the top of Tax › Allowances, which is easy to miss and easy to mistake — someone can type last year's bills into this year's record without noticing which year is selected.

- The selected year needs to be unmissable while entering costs, not just a dropdown at the top — consider carrying it into the field labels, or a sticky header on the card
- Moving between years should be one tap (prev/next arrows), not a dropdown hunt
- Show at a glance which years already have a method applied and which are only carrying forward — a small year strip with status, rather than discovering it after selecting
- Offer "copy last year's costs into this year" as an explicit action, since bills usually change by a percentage rather than wholesale
- Consider warning when entering costs for a year that is already filed/closed
- Related: the same year-selection problem will apply to any future per-year setting (mileage, capital allowances)

---

## Notes
- These are prompted by user feedback and security/compliance considerations
- Work through these in priority order or as part of larger refactor cycles
- Each item should maintain backwards compatibility where possible
