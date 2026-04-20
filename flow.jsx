// Services, Configure, Quote, Details, Booking screens

// ─── MailerLite helpers ──────────────────────────────────────
// Public embedded-form endpoint. No API key on the client.
// Two forms, one per purpose — each form is tied to a MailerLite group.
const ML_ACCOUNT = '1508707';
const ML_FORM_NEWSLETTER = 'GanUq8'; // TODO: get numeric form ID from HTML embed action URL
const ML_FORM_QUOTE     = '185180964760061679'; // "Quote submitted" — from HTML embed action URL

function _postMlForm(formId, fields) {
  if (!fields.email || !/@/.test(fields.email)) return Promise.resolve({ skipped: true });
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') body.append(`fields[${k}]`, String(v));
  });
  body.append('ml-submit', '1');
  body.append('anticsrf', 'true');
  return fetch(
    `https://assets.mailerlite.com/jsonp/${ML_ACCOUNT}/forms/${formId}/subscribe`,
    { method: 'POST', body, mode: 'no-cors' }
  ).catch(() => ({ error: true }));
}

// Newsletter opt-in only (ticked box on DetailsStep)
function subscribeToNewsletter({ email, name, business, quote_monthly }) {
  return _postMlForm(ML_FORM_NEWSLETTER, {
    email, name, company: business, quote_monthly,
  });
}

// Quote completion — fires whether or not they consented to the newsletter.
// Routes into "Quote submitted" group → triggers the thank-you automation
// to the client + admin notification to Libby.
//
// NOTE: MailerLite's "Quote submitted" form only has an email field defined.
// We therefore submit email + name only — the full quote details (phone,
// business, pricing, service list) are captured via the Formspree admin
// email, which is the source of truth for Libby's action queue.
function submitQuoteToMailerLite({ email, name }) {
  return _postMlForm(ML_FORM_QUOTE, {
    email,
    name,
  });
}

// ─── Screen 3 — Pick services ────────────────────────────────
function ServicesStep({ state, setState, onNext, onBack }) {
  const { selected = {} } = state;
  const [pensionModal, setPensionModal] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(null); // service title string

  // Auto-select any locked/_defaultOn services once
  React.useEffect(() => {
    const next = { ...selected };
    let changed = false;
    (window.PRICING || []).forEach(s => {
      if (s._defaultOn && !next[s.title]) { next[s.title] = {}; changed = true; }
    });
    if (changed) setState({ selected: next });
    // eslint-disable-next-line
  }, []);

  const toggle = (svc) => {
    if (svc._locked) return; // can't untick non-negotiable
    const next = { ...selected };
    const turningOn = !next[svc.title];
    if (next[svc.title]) delete next[svc.title]; else next[svc.title] = {};

    // Self Assessment add-ons require the Base return
    const SA_BASE = 'Self Assessment Tax Return - Base';
    const SA_ADDONS = [
      'Self Assessment Tax Return - Additional Sections',
      'Tax Investigation Protection for your personal tax affairs',
    ];
    if (turningOn && SA_ADDONS.includes(svc.title) && !next[SA_BASE]) {
      // User ticked an add-on but hasn't ticked the base — auto-tick the base
      next[SA_BASE] = {};
    }
    if (!turningOn && svc.title === SA_BASE) {
      // User unticked the base — clear any add-ons that depend on it
      SA_ADDONS.forEach(t => { delete next[t]; });
    }

    setState({ selected: next });
    // Pop-up for Auto Enrolment Pension — regulator duties flagged on select
    if (turningOn && svc.title === 'Auto Enrolment Pension') setPensionModal(true);
  };

  // Group services by section
  const grouped = {};
  (window.PRICING || []).forEach(s => {
    if (s.section === 'UN Global Goals - What should we support on your behalf?') return;
    // Only show AML from the Onboarding Process section (it's required by law)
    if (s.section === 'Onboarding Process' && !/anti money laundering/i.test(s.title)) return;
    (grouped[s.section] ||= []).push(s);
  });

  const estimate = () => {
    let total = 0;
    Object.entries(selected).forEach(([title, cfg]) => {
      const svc = (window.PRICING || []).find(s => s.title === title);
      if (!svc) return;
      // Inject default software + turnover from state into unset drivers
      const merged = { 'Software Type': state.software || 'Xero', 'Annual Revenue Range': state.turnover, ...cfg };
      total += priceService(svc, merged);
    });
    return total;
  };
  const count = Object.keys(selected).length;
  const est = estimate();

  return (
    <Shell footer={
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, fontFamily: SANS }}>
          <div style={{ fontSize: 11, color: TEB.inkSoft, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>Running total</div>
          <div style={{ fontFamily: SERIF, fontSize: 22, color: TEB.ink }}>
            {count ? `${gbp(est)} / mo` : '—'}
          </div>
          {count > 0 && (
            <div style={{ fontSize: 10.5, color: TEB.muted, marginTop: 1, letterSpacing: 0.2 }}>ex VAT</div>
          )}
        </div>
        <div style={{ flex: 1.2 }}>
          <PrimaryButton label={`Tailor my quote · ${count}`} onClick={onNext} disabled={!count}/>
        </div>
      </div>
    }>
      <ScreenHeader eyebrow="Step 2 of 5" step={2} total={5} onBack={onBack}
        title="What do you need a hand with?"
        sub="Tick anything that sounds useful. We'll fine-tune the numbers next."/>
      <div style={{ padding: '20px 24px 20px' }}>
        {Object.entries(grouped).map(([sec, items]) => (
          <div key={sec} style={{ marginBottom: 22 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: TEB.inkSoft,
              textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10,
            }}>{sec}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(svc => {
                const active = !!selected[svc.title];
                const locked = !!svc._locked;
                return (
                  <button key={svc.title} onClick={() => toggle(svc)} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', textAlign: 'left', fontFamily: SANS,
                    background: active ? `${TEB.primary}0C` : TEB.surface,
                    border: `1.5px solid ${active ? TEB.primary : TEB.border}`,
                    borderRadius: 12, cursor: locked ? 'default' : 'pointer',
                    opacity: 1,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: `1.5px solid ${active ? TEB.primary : TEB.border}`,
                      background: active ? TEB.primary : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && (
                        <svg width="12" height="9" viewBox="0 0 12 9">
                          <path d="M1 4.5L4.5 8L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, letterSpacing: -0.2, color: TEB.ink }}>{svc.title}</span>
                        {(window.SERVICE_DESCRIPTIONS || {})[svc.title] && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); setInfoOpen(svc.title); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setInfoOpen(svc.title); } }}
                            aria-label={`What's ${svc.title}?`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 18, height: 18, borderRadius: '50%', cursor: 'pointer',
                              background: TEB.surfaceAlt, border: `1px solid ${TEB.border}`,
                              color: TEB.inkSoft, fontSize: 11, fontFamily: SERIF, fontStyle: 'italic', fontWeight: 600,
                              lineHeight: 1, userSelect: 'none', flexShrink: 0,
                            }}
                          >i</span>
                        )}
                        {locked && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                            textTransform: 'uppercase', color: TEB.primary,
                            background: `${TEB.primary}14`, padding: '2px 7px', borderRadius: 4,
                          }}>Included</span>
                        )}
                      </div>
                      {svc.subtitle && (
                        <div style={{ fontSize: 12, color: TEB.muted, marginTop: 3, letterSpacing: -0.1 }}>{svc.subtitle}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: TEB.inkSoft, whiteSpace: 'nowrap' }}>
                      from {gbp(priceFrom(svc))}{svc.billing === 'monthly' ? '/mo' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{
          padding: 14, borderRadius: 12, marginTop: 8,
          background: `${TEB.amber}14`, border: `1px dashed ${TEB.amber}`,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 14, background: TEB.primary,
            color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
            fontFamily: SERIF, fontSize: 14,
          }}>L</div>
          <div style={{ fontSize: 13, color: TEB.inkSoft, lineHeight: 1.5 }}>
            <b style={{ color: TEB.ink }}>Not sure yet?</b> Pick what sounds right — we'll talk it through on your free discovery call.
          </div>
        </div>
      </div>
      {pensionModal && <PensionRegulatorModal onClose={() => setPensionModal(false)}/>}
      {infoOpen && (window.SERVICE_DESCRIPTIONS || {})[infoOpen] && (
        <HelperSheet
          title={infoOpen}
          body={(window.SERVICE_DESCRIPTIONS[infoOpen]).body}
          onClose={() => setInfoOpen(null)}
        />
      )}
    </Shell>
  );
}

// ─── Pension regulator note ─────────────────────────────────
// Fires when a client ticks Auto Enrolment Pension — surfaces the fact
// that TPR duties exist (declaration of compliance, re-enrolment every 3 yrs,
// ongoing assessments) without bogging down the quote flow. Soft-inform only.
function PensionRegulatorModal({ onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(15, 25, 35, 0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#fff',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '22px 22px 26px', fontFamily: SANS,
        animation: 'tebSheetIn 0.22s ease-out',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: TEB.border, margin: '0 auto 18px',
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `${TEB.primary}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" stroke={TEB.primary} strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M7.5 10l2 2 3.5-4" stroke={TEB.primary} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{
            fontFamily: SERIF, fontSize: 22, color: TEB.ink, letterSpacing: -0.3,
          }}>A note on pension duties</div>
        </div>

        <div style={{
          fontSize: 14.5, color: TEB.inkSoft, lineHeight: 1.6, marginBottom: 16,
        }}>
          As an employer you've got ongoing responsibilities to <b style={{ color: TEB.ink }}>The Pensions Regulator</b> — declaration of compliance, re-enrolment every 3 years, record-keeping, and regular assessments.
        </div>

        <div style={{
          padding: 14, borderRadius: 12,
          background: TEB.surfaceAlt, border: `1px solid ${TEB.border}`,
          fontSize: 13.5, color: TEB.ink, lineHeight: 1.55, marginBottom: 18,
        }}>
          <b>We'll talk through exactly what falls to you vs. what we handle</b> on your free discovery call — nothing to sort right now.
        </div>

        <button onClick={onClose} style={{
          width: '100%', padding: '13px', borderRadius: 10,
          background: TEB.primary, border: 'none', color: '#fff',
          fontFamily: SANS, fontSize: 14.5, fontWeight: 500, cursor: 'pointer',
        }}>Got it — carry on</button>
      </div>
    </div>
  );
}

// ─── Essential software bundle explainer ────────────────────
// Inline disclosure on the locked "Essential software bundle" card — expands
// to show what each tool does. Not a modal: the client can't opt out, so we're
// not interrupting a decision, just helping them understand value for the £15.
function EssentialBundleCard() {
  const [open, setOpen] = React.useState(false);
  const tools = [
    { name: 'Streem',  sub: 'Pulls bank statements from 300+ UK banks, automatically.', href: 'https://streemconnect.com/' },
    { name: 'Apron',   sub: 'Our document hub. Snap photos of receipts and paperwork from your phone and it all flows straight to us — optional customer payment links available if you\'d like to get paid through it too.', href: 'https://getapron.com/' },
    { name: 'Xenon',   sub: 'Monthly health checks on your books — catches issues early.', href: 'https://www.xenonconnect.com/' },
    { name: 'Adsum',   sub: 'Secure HMRC tax portal for filings and correspondence.', href: 'https://www.adsum-works.com/' },
    { name: 'Engager', sub: 'Your client portal: e-signing, secure documents, task updates.', href: 'https://engager.app/' },
  ];
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        fontSize: 13, color: TEB.inkSoft, lineHeight: 1.55, marginBottom: 10,
      }}>
        The Ethical Bookkeeper uses the latest secure software and portals to streamline your services and make your life easier.
      </div>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: TEB.primary,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
        {open ? '− Hide what\'s included' : '+ What\'s included?'}
      </button>
      {open && (
        <div style={{
          marginTop: 12,
          border: `1px solid ${TEB.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          {tools.map((t, i) => (
            <div key={t.name} style={{
              padding: '11px 12px',
              borderTop: i === 0 ? 'none' : `1px solid ${TEB.border}`,
              background: TEB.surfaceAlt,
            }}>
              <div style={{ fontSize: 13.5, fontFamily: SANS, color: TEB.ink, fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 12.5, color: TEB.inkSoft, marginTop: 2, lineHeight: 1.45 }}>{t.sub}</div>
              {t.href && (
                <a href={t.href} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  marginTop: 6, fontSize: 12, fontFamily: SANS, fontWeight: 600,
                  color: TEB.primary, textDecoration: 'none',
                }}>
                  Haven't heard of {t.name}? Take a look
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                    <path d="M6 3h7v7M13 3L5 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reusable bottom-sheet for tiny explainers ─────────────
// Lightweight cousin of PensionRegulatorModal — plain text, one CTA.
// Used for inline "Not sure?" helpers against specific driver labels.
function HelperSheet({ title, body, link, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(15, 25, 35, 0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#fff',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '22px 22px 26px', fontFamily: SANS,
        animation: 'tebSheetIn 0.22s ease-out',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: TEB.border, margin: '0 auto 18px',
        }}/>
        <div style={{
          fontFamily: SERIF, fontSize: 22, color: TEB.ink,
          letterSpacing: -0.3, marginBottom: 12,
        }}>{title}</div>
        <div style={{
          fontSize: 14.5, color: TEB.inkSoft, lineHeight: 1.6, marginBottom: 14,
        }}>{body}</div>
        {link && (
          <a href={link.href} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '12px 14px', marginBottom: 14,
            borderRadius: 10, textDecoration: 'none',
            background: TEB.surfaceAlt, border: `1px solid ${TEB.border}`,
            fontFamily: SANS, color: TEB.ink,
          }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{link.label}</div>
              {link.sub && <div style={{ fontSize: 12, color: TEB.muted, marginTop: 2 }}>{link.sub}</div>}
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3h7v7M13 3L5 11M3 7v6h6" stroke={TEB.primary} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        )}
        <button onClick={onClose} style={{
          width: '100%', padding: '13px', borderRadius: 10,
          background: TEB.primary, border: 'none', color: '#fff',
          fontFamily: SANS, fontSize: 14.5, fontWeight: 500, cursor: 'pointer',
        }}>Got it</button>
      </div>
    </div>
  );
}

// Driver row — renders one driver (range/select/numeric/frequency/boolean/select_count)
function DriverRow({ svc, name, d, cfg, setCfg }) {
  const [expanded, setExpanded] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const LIMIT = 8;

  // Inline "Not sure?" helper surface — attached to specific driver labels we
  // know folks commonly don't remember (confirmation statement due month, etc).
  // Keeps the quote moving without dragging them into Companies House.
  const helperLabel =
    /^Month confirmation statement is due$/i.test(name) ? 'Not sure when?' :
    null;
  const helperBody =
    /^Month confirmation statement is due$/i.test(name) ? {
      title: "Don't know the month?",
      body: "Your confirmation statement is due yearly, around the anniversary of incorporation — this is a director's responsibility. You can check the exact date at Companies House using your company name. If it's wrong now, no drama — we'll correct it on the discovery call, though note it may affect any catch-up calculation.",
      link: {
        href: 'https://find-and-update.company-information.service.gov.uk/',
        label: 'Check on Companies House',
        sub: 'Free — search by your company name',
      },
    } : null;

  // Build option list based on type
  let opts = d.options || [];
  if (d.type === 'frequency' && opts.length === 0) {
    opts = [
      { label: 'Monthly', value: 1 },
      { label: 'Weekly',  value: 1.1 },
      { label: 'Daily',   value: 1.3 },
    ];
  } else if (d.type === 'boolean' && opts.length === 0) {
    opts = [
      { label: 'No', value: 1 },
      { label: 'Yes', value: 1.15 },
    ];
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: 8, marginBottom: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEB.inkSoft, textTransform: 'uppercase', letterSpacing: 1 }}>{name}</div>
        {helperLabel && (
          <button onClick={() => setHelpOpen(true)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            fontFamily: SANS, fontSize: 12, color: TEB.primary, fontWeight: 500,
            textDecoration: 'underline', textUnderlineOffset: 2,
          }}>{helperLabel}</button>
        )}
      </div>

      {helpOpen && helperBody && (
        <HelperSheet
          title={helperBody.title}
          body={helperBody.body}
          link={helperBody.link}
          onClose={() => setHelpOpen(false)}
        />
      )}

      {d.type === 'numeric' ? (() => {
        const choices = [1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,40,50,75,100,150,200];
        const cur = +cfg[name] || 1;
        return (
          <select
            value={choices.includes(cur) ? cur : 1}
            onChange={e => setCfg(svc.title, name, +e.target.value || 1)}
            style={{
              width: '100%', height: 44, borderRadius: 10,
              border: `1.5px solid ${TEB.border}`, padding: '0 12px',
              fontFamily: SANS, fontSize: 15, color: TEB.ink, outline: 'none',
              background: '#fff', boxSizing: 'border-box', appearance: 'menulist',
            }}>
            {choices.map(n => <option key={n} value={n}>{n}{n === 200 ? '+' : ''}</option>)}
          </select>
        );
      })() : (d.type === 'select_count' || (d.type === 'select' && opts.length > 6)) ? (
        <select
          value={cfg[name] || opts[0].label}
          onChange={e => setCfg(svc.title, name, e.target.value)}
          style={{
            width: '100%', height: 44, borderRadius: 10,
            border: `1.5px solid ${TEB.border}`, padding: '0 12px',
            fontFamily: SANS, fontSize: 15, color: TEB.ink, outline: 'none',
            background: '#fff', boxSizing: 'border-box', appearance: 'menulist',
          }}>
          {opts.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
        </select>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(expanded ? opts : opts.slice(0, LIMIT)).map(opt => {
            const active = (cfg[name] || opts[0]?.label) === opt.label;
            return (
              <button key={opt.label} onClick={() => setCfg(svc.title, name, opt.label)} style={{
                padding: '7px 11px', borderRadius: 8,
                background: active ? TEB.primary : TEB.surfaceAlt,
                color: active ? '#fff' : TEB.ink,
                border: `1px solid ${active ? TEB.primary : TEB.border}`,
                fontFamily: SANS, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>{opt.label}</button>
            );
          })}
          {opts.length > LIMIT && (
            <button onClick={() => setExpanded(x => !x)} style={{
              padding: '7px 11px', borderRadius: 8,
              background: 'transparent', color: TEB.primary,
              border: `1px dashed ${TEB.border}`,
              fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>{expanded ? '− Show less' : `+ ${opts.length - LIMIT} more`}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Screen 4 — Configure drivers ────────────────────────────
function ConfigureStep({ state, setState, onNext, onBack }) {
  const selected = state.selected || {};
  const svcs = (window.PRICING || []).filter(s => selected[s.title]);

  const setCfg = (title, key, value) => {
    const nextSel = { ...selected, [title]: { ...selected[title], [key]: value } };
    setState({ selected: nextSel });
  };

  let monthly = 0, oneoff = 0;
  svcs.forEach(svc => {
    const cfg = {
      'Software Type': state.software || 'Xero',
      'Annual Revenue Range': state.turnover,
      ...selected[svc.title],
    };
    const p = priceService(svc, cfg);
    const isFullYearCatchup = /^Catch Up: Previous Years/i.test(svc.title || '');
    // For "Catch Up: Previous Years…" services the displayed price is the monthly rate
    // (shown in the row), but the actual billable is a one-off of 12× that — handled by catchupFor.
    // Do NOT add p to totals here, or we'll double-count.
    if (!isFullYearCatchup) {
      if (svc.billing === 'monthly') monthly += p; else oneoff += p;
    }
    // Universal catch-up (confirmation statement, annual accounts, VAT, SA, bank rec)
    if (window.catchupFor) oneoff += window.catchupFor(svc, state, cfg);
    // SA "also need previous year" — adds one full annual fee as one-off
    if (cfg['Also need previous tax year?'] && /yes/i.test(cfg['Also need previous tax year?'])) {
      oneoff += svc.billing === 'monthly' ? p * 12 : p;
    }
  });

  return (
    <Shell footer={
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, fontFamily: SANS, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: TEB.inkSoft, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }}>Monthly</div>
          <div style={{ fontFamily: SERIF, fontSize: 20, color: TEB.ink, lineHeight: 1.1 }}>{gbp(monthly)}</div>
          <div style={{ fontSize: 10, color: TEB.muted, marginTop: 1, letterSpacing: 0.2 }}>ex VAT</div>
        </div>
        {oneoff > 0 && (
          <div style={{ flex: 1, fontFamily: SANS, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: TEB.inkSoft, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: 700 }}>One-off</div>
            <div style={{ fontFamily: SERIF, fontSize: 20, color: TEB.ink, lineHeight: 1.1 }}>{gbp(oneoff)}</div>
            <div style={{ fontSize: 10, color: TEB.muted, marginTop: 1, letterSpacing: 0.2 }}>ex VAT</div>
          </div>
        )}
        <div style={{ flex: 1.2 }}>
          <PrimaryButton label="See my quote" onClick={onNext}/>
        </div>
      </div>
    }>
      <ScreenHeader eyebrow="Step 3 of 5" step={3} total={5} onBack={onBack}
        title="Fine-tune your numbers"
        sub="Tell us a bit about your volume. These are estimates — we'll confirm on the call."/>
      <div style={{ padding: '22px 24px' }}>
        {svcs.map(svc => {
          const cfg = selected[svc.title] || {};
          const driverEntries = Object.entries(svc.drivers || {})
            .filter(([n]) => n !== 'Software Type' && n !== 'Annual Revenue Range'); // software & turnover set globally
          const rowCfg = { 'Software Type': state.software || 'Xero', 'Annual Revenue Range': state.turnover, ...cfg };
          const rowPrice = priceService(svc, rowCfg);
          const rowCatchup = window.catchupFor ? window.catchupFor(svc, state, rowCfg) : 0;
          const rowCatchupN = window.catchupMonths ? window.catchupMonths(svc, state, rowCfg) : 0;
          const isFullYearCatchupRow = /^Catch Up: Previous Years/i.test(svc.title || '');
          // "Catch-up capable" = any service where a catch-up one-off could apply:
          // explicit "catch up" titles, services with a months driver, or services with
          // an implicit reset month (annual accounts, corp tax, VAT, self assessment, confirmation statement).
          const hasMonthsDriver = Object.keys(svc.drivers || {}).some(k =>
            /months? behind|months? catch.?up|number of months/i.test(k));
          const hasImplicitReset = /annual accounts|corporation tax|vat returns|self assessment|confirmation statement/i.test(svc.title || '');
          // Full-year catch-ups (Previous Years...) show a single one-off only — no pro-rata box.
          const isCatchUp = !isFullYearCatchupRow && (hasMonthsDriver || hasImplicitReset);
          const isVariance = /variance/i.test(svc.title);
          // Self Assessment "previous year" opt-in adds one full annual fee as one-off
          const prevYearKey = 'Also need previous tax year?';
          const wantsPrevYear = cfg[prevYearKey] && /yes/i.test(cfg[prevYearKey]);
          // Annual fee = monthly × 12 for monthly-billed; = base once for one-off
          const prevYearOneOff = wantsPrevYear
            ? (svc.billing === 'monthly' ? rowPrice * 12 : rowPrice)
            : 0;
          return (
            <div key={svc.title} style={{
              border: `1px solid ${TEB.border}`, borderRadius: 14,
              padding: 16, marginBottom: 12, background: TEB.surface,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: TEB.ink, letterSpacing: -0.2 }}>{svc.title}</div>
                {!isFullYearCatchupRow && (
                  <div style={{ fontFamily: SERIF, fontSize: 18, color: TEB.primary, whiteSpace: 'nowrap' }}>{gbp(rowPrice)}<span style={{ fontSize: 12, color: TEB.muted, fontFamily: SANS }}>{billingSuffix(svc)}</span></div>
                )}
              </div>
              {!svc._locked && (
                <button onClick={() => {
                  const nextSel = { ...selected };
                  delete nextSel[svc.title];
                  setState({ selected: nextSel });
                }} style={{
                  marginTop: 6,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: 0, fontFamily: SANS, fontSize: 12.5, color: TEB.muted,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  textDecoration: 'underline', textUnderlineOffset: 2,
                }}>
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  Remove from quote
                </button>
              )}
              {driverEntries.length === 0 && !svc._locked && (
                <div style={{ fontSize: 13, color: TEB.inkSoft, marginTop: 8 }}>Fixed fee · no options</div>
              )}
              {svc._locked && svc.title === 'Essential software bundle' ? (
                <EssentialBundleCard/>
              ) : svc._locked && /anti money laundering/i.test(svc.title) ? (
                <div style={{ fontSize: 12.5, color: TEB.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
                  Required by law (MLR 2017) for every new client — verifies each beneficial owner (&gt;25% ownership), anyone with significant control, and the signatory. One-off charge, done via our secure digital portal in minutes.
                </div>
              ) : svc._locked ? (
                <div style={{ fontSize: 12.5, color: TEB.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
                  Non-negotiable — covers document capture, bank feeds, tax portal & secure client portal.
                </div>
              ) : null}
              {isCatchUp && (
                <div style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: 10,
                  background: `${TEB.amber}14`, border: `1px dashed ${TEB.amber}`,
                  fontSize: 12.5, color: TEB.inkSoft, lineHeight: 1.5,
                }}>
                  <b style={{ color: TEB.ink }}>Pro-rata applies.</b> If you onboard part-way through the year, you're charged for the months already passed. E.g. joining in month 7 means months 1–7 are billed in your first month.
                </div>
              )}
              {isVariance && (
                <div style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: 10,
                  background: TEB.surfaceAlt, fontSize: 12.5, color: TEB.inkSoft, lineHeight: 1.5,
                }}>
                  Final price depends on complexity — we'll confirm on your free discovery call.
                </div>
              )}
              {svc._note && (
                <div style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: 10,
                  background: TEB.surfaceAlt, fontSize: 12.5, color: TEB.inkSoft, lineHeight: 1.5,
                }}>
                  {svc._note}
                </div>
              )}
              {driverEntries.map(([name, d]) => (
                <DriverRow key={name} svc={svc} name={name} d={d} cfg={cfg} setCfg={setCfg}/>
              ))}
              {/^vat returns/i.test(svc.title) && rowCatchupN > 3 && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', borderRadius: 10,
                  background: `${TEB.pinkHot}14`, border: `1px solid ${TEB.pinkHot}`,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <div style={{
                    flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                    background: TEB.pinkHot, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: SERIF, fontSize: 13, fontWeight: 600, lineHeight: 1,
                  }}>!</div>
                  <div style={{ fontSize: 12.5, color: TEB.ink, lineHeight: 1.5 }}>
                    <b>More than 3 months behind on VAT.</b> HMRC penalties are likely, and this work will be urgent and more involved — <b>additional charges may apply.</b> We'll confirm the final fee on your free discovery call.
                  </div>
                </div>
              )}
              {rowCatchup > 0 && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', borderRadius: 10,
                  background: `${TEB.amber}14`, border: `1px dashed ${TEB.amber}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ fontSize: 12, color: TEB.inkSoft, lineHeight: 1.4 }}>
                    <b style={{ color: TEB.ink }}>{isFullYearCatchupRow ? 'One-off fee' : 'Catch-up fee'}</b>
                    {!isFullYearCatchupRow && <> · {rowCatchupN} {rowCatchupN === 1 ? 'month' : 'months'} × {gbp(rowPrice)}</>}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 14, color: TEB.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {gbp(rowCatchup)} <span style={{ color: TEB.muted, fontWeight: 400, fontSize: 11 }}>one-off</span>
                  </div>
                </div>
              )}
              {prevYearOneOff > 0 && (
                <div style={{
                  marginTop: 8, padding: '10px 12px', borderRadius: 10,
                  background: `${TEB.amber}14`, border: `1px dashed ${TEB.amber}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ fontSize: 12, color: TEB.inkSoft, lineHeight: 1.4 }}>
                    <b style={{ color: TEB.ink }}>Previous tax year</b> · one full year of {svc.title.replace(/^Self Assessment Tax Return - /,'SA ')}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 14, color: TEB.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {gbp(prevYearOneOff)} <span style={{ color: TEB.muted, fontWeight: 400, fontSize: 11 }}>one-off</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

// ─── Subscription addon panel (shown on QuoteStep) ───────────
function SubscriptionAddonPanel({ state, setState }) {
  const swKey = state.software || 'Xero';
  const sw = (window.SOFTWARE_TIERS || {})[swKey];
  if (!sw) return null;
  const recId = window.recommendTier ? window.recommendTier(swKey, state.turnover) : sw.tiers[0].id;
  const wants = !!state.buySoftwareViaTEB;
  const selectedTier = state.softwareTier || recId;

  const toggleWants = () => setState({
    buySoftwareViaTEB: !wants,
    softwareTier: !wants ? recId : undefined,
  });

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: TEB.inkSoft,
        textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8,
      }}>Optional add-on</div>

      <label style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
        padding: '14px 14px', borderRadius: 14,
        border: `1.5px solid ${wants ? TEB.primary : TEB.border}`,
        background: wants ? `${TEB.primary}0A` : TEB.surface,
      }} onClick={toggleWants}>
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
          border: `1.5px solid ${wants ? TEB.primary : TEB.border}`,
          background: wants ? TEB.primary : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {wants && <svg width="12" height="9" viewBox="0 0 12 9"><path d="M1 4.5L4.5 8L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: TEB.ink, fontFamily: SANS, fontWeight: 500 }}>
            Add a {sw.label} subscription through TEB
          </div>
          <div style={{ fontSize: 12.5, color: TEB.inkSoft, marginTop: 3, lineHeight: 1.5, fontFamily: SANS }}>
            We'll buy & manage your licence — billed alongside your bookkeeping fees. Or skip this and buy it yourself direct from {swKey.startsWith('Sage') ? 'Sage' : 'Xero'}.
          </div>
        </div>
      </label>

      {wants && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: TEB.inkSoft, marginBottom: 8, fontFamily: SANS, lineHeight: 1.5 }}>
            <b style={{ color: TEB.ink }}>Based on your turnover, {sw.tiers.find(t => t.id === recId)?.name} looks about right.</b> You can change on the discovery call.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sw.tiers.map(t => {
              const active = selectedTier === t.id;
              const recommended = t.id === recId;
              return (
                <button key={t.id}
                  onClick={() => setState({ softwareTier: t.id })}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', textAlign: 'left', fontFamily: SANS,
                    background: active ? `${TEB.primary}0C` : TEB.surface,
                    border: `1.5px solid ${active ? TEB.primary : TEB.border}`,
                    borderRadius: 12, cursor: 'pointer',
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                    border: `1.5px solid ${active ? TEB.primary : TEB.border}`,
                    background: active ? TEB.primary : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }}/>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, color: TEB.ink, fontWeight: 500 }}>{t.name}</span>
                      {recommended && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
                          textTransform: 'uppercase', color: TEB.primary,
                          background: `${TEB.primary}14`, padding: '2px 7px', borderRadius: 4,
                        }}>Recommended</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: TEB.muted, marginTop: 3, lineHeight: 1.45 }}>
                      {t.summary}
                    </div>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 14, color: TEB.ink, whiteSpace: 'nowrap' }}>
                    {gbp(t.price)}<span style={{ color: TEB.muted, fontSize: 12 }}>/mo</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: TEB.muted, marginTop: 10, lineHeight: 1.5, fontFamily: SANS }}>
            Prices ex-VAT. We'll confirm the right fit on your discovery call.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Screen 5 — Quote summary ────────────────────────────────
function QuoteStep({ state, setState, onNext, onBack }) {
  const selected = state.selected || {};
  const svcs = (window.PRICING || []).filter(s => selected[s.title]);
  let monthly = 0, oneoff = 0;
  const lines = svcs.map(svc => {
    const cfg = { 'Software Type': state.software || 'Xero', 'Annual Revenue Range': state.turnover, ...selected[svc.title] };
    const p = priceService(svc, cfg);
    const isFullYearCatchup = /^Catch Up: Previous Years/i.test(svc.title || '');
    if (!isFullYearCatchup) {
      if (svc.billing === 'monthly') monthly += p; else oneoff += p;
    }
    const catchup = window.catchupFor ? window.catchupFor(svc, state, cfg) : 0;
    const catchupN = window.catchupMonths ? window.catchupMonths(svc, state, cfg) : 0;
    if (catchup) oneoff += catchup;
    const wantsPrev = cfg['Also need previous tax year?'] && /yes/i.test(cfg['Also need previous tax year?']);
    const prevYr = wantsPrev ? (svc.billing === 'monthly' ? p * 12 : p) : 0;
    if (prevYr) oneoff += prevYr;
    return { svc, p, catchup, catchupN, prevYr };
  });

  const quoteDetails = () => {
    const rows = lines.map(({ svc, p, catchup, catchupN, prevYr }) => {
      const isFYC = /^Catch Up: Previous Years/i.test(svc.title || '');
      const suffix = svc.billing === 'monthly' ? '/mo' : ' once';
      let line = isFYC ? `• ${svc.title}: ${gbp(catchup)} one-off` : `• ${svc.title}: ${gbp(p)}${suffix}`;
      if (catchup > 0 && !isFYC) line += ` (+ ${gbp(catchup)} catch-up one-off)`;
      if (prevYr > 0) line += ` (+ ${gbp(prevYr)} previous year one-off)`;
      return line;
    }).join('\n');
    return rows;
  };

  const emailMeThisQuote = () => {
    const body =
      `Hi,\n\nHere's my quote from The Ethical Bookkeeper:\n\n`
      + `Business: ${state.businessName || '—'}\n`
      + `Software: ${state.software || '—'}\n`
      + `Turnover: ${state.turnover || '—'}\n\n`
      + `SERVICES\n${quoteDetails()}\n\n`
      + `—\n`
      + `MONTHLY TOTAL: ${gbp(monthly)}/month (ex VAT)\n`
      + (oneoff > 0 ? `ONE-OFF TOTAL: ${gbp(oneoff)} (billed once on first invoice, ex VAT)\n` : '')
      + `\n`
      + `Generated at theethicalbookkeeper.co.uk — no obligation, adjustable on the discovery call.\n`;
    const subject = `My TEB quote — ${gbp(monthly)}/mo`
      + (state.businessName ? ` · ${state.businessName}` : '');
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Shell footer={
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrimaryButton label="Looks good — continue" onClick={onNext}/>
        <PrimaryButton label="Email me this quote" variant="ghost" onClick={emailMeThisQuote}/>
      </div>
    }>
      <ScreenHeader eyebrow="Step 4 of 5" step={4} total={5} onBack={onBack}
        title="Your transparent quote"
        sub="Based on what you've told us so far — we'll confirm it together on the call."/>

      <div style={{ padding: '18px 24px 10px' }}>
        <div style={{
          borderRadius: 18, background: TEB.primary, color: '#fff',
          padding: 20, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', width: 170, height: 170, borderRadius: '50%',
            background: TEB.amber, opacity: 0.95, top: -80, right: -50 }}/>
          <div style={{ position: 'absolute', width: 60, height: 60, borderRadius: '50%',
            background: TEB.pinkHot, top: 46, right: -15 }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 }}>{state.businessName || 'Your quote'}</div>
            <div style={{ fontFamily: SERIF, fontSize: 40, marginTop: 6, letterSpacing: -0.8, lineHeight: 1 }}>
              {gbp(monthly)}<span style={{ fontSize: 15, fontFamily: SANS, opacity: 0.85 }}> / month</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4, fontFamily: SANS }}>
              ongoing · billed monthly · ex VAT
            </div>
            {oneoff > 0 && (
              <div style={{
                marginTop: 12, paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.22)',
              }}>
                <div style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: -0.4, lineHeight: 1 }}>
                  {gbp(oneoff)}<span style={{ fontSize: 14, fontFamily: SANS, opacity: 0.85 }}> one-off</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, fontFamily: SANS }}>
                  catch-up charges · billed once on your first invoice · ex VAT
                </div>
              </div>
            )}
            <div style={{
              marginTop: 14, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.15)',
              fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center',
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6l3 3 5-6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Transparent pricing · no hidden extras
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10, lineHeight: 1.5, fontFamily: SANS }}>
              This is an indicative quote — final pricing is always confirmed on the discovery call, once we've understood your business properly.
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '6px 24px 20px' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: TEB.inkSoft,
          textTransform: 'uppercase', letterSpacing: 1.2, margin: '18px 0 8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span>Monthly services</span>
          <span style={{ color: TEB.primary, fontSize: 12 }}>{gbp(monthly)}/mo</span>
        </div>
        <div style={{ border: `1px solid ${TEB.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {lines.map(({ svc, p }, i) => {
            if (/^Catch Up: Previous Years/i.test(svc.title || '')) return null;
            return (
            <div key={svc.title} style={{
              padding: '13px 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${TEB.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            }}>
              <div>
                <div style={{ fontSize: 14, fontFamily: SANS, color: TEB.ink, fontWeight: 500 }}>{svc.title}</div>
                <div style={{ fontSize: 12, color: TEB.muted, marginTop: 2 }}>{svc.section}</div>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 14, color: TEB.ink, whiteSpace: 'nowrap' }}>
                {gbp(p)}<span style={{ color: TEB.muted, fontSize: 12 }}>{billingSuffix(svc)}</span>
              </div>
            </div>
          );})}
          {lines.filter(l => !/^Catch Up: Previous Years/i.test(l.svc.title || '')).length === 0 && (
            <div style={{ padding: 14, fontSize: 14, color: TEB.inkSoft, textAlign: 'center' }}>No services selected</div>
          )}
        </div>

        {lines.some(l => l.catchup > 0) && (
          <>
            <div style={{
              fontSize: 11, fontWeight: 700, color: TEB.inkSoft,
              textTransform: 'uppercase', letterSpacing: 1.2, margin: '22px 0 8px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <span>One-off catch-up charges</span>
              <span style={{ color: TEB.amber, fontSize: 12 }}>{gbp(oneoff)} total</span>
            </div>
            <div style={{ fontSize: 12, color: TEB.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
              Billed <b style={{ color: TEB.ink }}>once</b> on your first invoice — covers work to bring you up to date. Not a recurring fee.
            </div>
            <div style={{ border: `1px dashed ${TEB.amber}`, borderRadius: 14, overflow: 'hidden', background: `${TEB.amber}0A` }}>
              {lines.filter(l => l.catchup > 0).map(({ svc, p, catchup, catchupN }, i) => (
                <div key={svc.title} style={{
                  padding: '13px 14px',
                  borderTop: i === 0 ? 'none' : `1px dashed ${TEB.amber}60`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontFamily: SANS, color: TEB.ink, fontWeight: 500 }}>{svc.title}</div>
                    <div style={{ fontSize: 12, color: TEB.inkSoft, marginTop: 2 }}>
                      {/^Catch Up: Previous Years/i.test(svc.title || '')
                        ? 'One-off · full year'
                        : <>{catchupN} {catchupN === 1 ? 'month' : 'months'} × {gbp(p)}/mo</>}
                    </div>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 14, color: TEB.ink, whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {gbp(catchup)}<span style={{ color: TEB.muted, fontSize: 11, fontWeight: 400 }}> one-off</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {[
            { l: 'AAT licensed', c: TEB.primary },
            { l: 'Gold Fair Payment', c: TEB.amber },
            { l: 'GBC member', c: TEB.pink },
          ].map((b,i) => (
            <div key={i} style={{
              flex: 1, padding: '10px 10px', borderRadius: 10,
              border: `1px solid ${TEB.border}`,
              fontSize: 12, color: TEB.inkSoft, textAlign: 'center',
              fontFamily: SANS,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: b.c, margin: '0 auto 6px' }}/>
              {b.l}
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

// ─── Screen 6 — Your details ────────────────────────────────
function DetailsStep({ state, setState, onNext, onBack }) {
  const valid = state.name && state.email && /@/.test(state.email);
  // Default newsletter consent on (user can un-tick).
  const newsletter = state.newsletter !== false;
  const canContinue = valid && newsletter;

  // Compute monthly total for richer MailerLite field
  const svcs = (window.PRICING || []).filter(s => (state.selected || {})[s.title]);
  const monthly = svcs.reduce((sum, svc) => {
    if (svc.billing !== 'monthly') return sum;
    if (/^Catch Up: Previous Years/i.test(svc.title || '')) return sum;
    const cfg = { 'Software Type': state.software || 'Xero', 'Annual Revenue Range': state.turnover, ...(state.selected[svc.title] || {}) };
    return sum + priceService(svc, cfg);
  }, 0);

  const handleContinue = () => {
    if (newsletter) {
      subscribeToNewsletter({
        email: state.email, name: state.name, business: state.business,
        quote_monthly: Math.round(monthly),
      });
    }
    onNext();
  };

  return (
    <Shell footer={
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrimaryButton label={newsletter ? 'Subscribe & continue' : 'Email us instead'}
          onClick={newsletter
            ? handleContinue
            : () => { window.location.href = 'mailto:hello@theethicalbookkeeper.co.uk?subject=My TEB quote'; }}
          disabled={!valid}/>
      </div>
    }>
      <ScreenHeader eyebrow="Step 5 of 5" step={5} total={5} onBack={onBack}
        title="A little about you"
        sub="So Libby knows who's coming to the call and where to send your quote."/>
      <div style={{ padding: '24px 24px' }}>
        <Field label="Full name" value={state.name} onChange={v => setState({ name: v })} placeholder="Sam Appleford"/>
        <Field label="Email" type="email" value={state.email} onChange={v => setState({ email: v })} placeholder="you@business.co.uk"/>
        <Field label="Mobile" value={state.phone} onChange={v => setState({ phone: v })} placeholder="07700 900 321"/>

        <div style={{
          marginTop: 6, padding: 14, borderRadius: 12,
          background: TEB.surfaceAlt, border: `1px solid ${TEB.border}`,
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginTop: 2, flexShrink: 0 }}>
            <rect x="3" y="8" width="14" height="10" rx="2" stroke={TEB.primary} strokeWidth="1.6"/>
            <path d="M6 8V6a4 4 0 018 0v2" stroke={TEB.primary} strokeWidth="1.6"/>
          </svg>
          <div style={{ fontSize: 13, color: TEB.inkSoft, lineHeight: 1.5, fontFamily: SANS }}>
            Your data is encrypted and handled under our AAT licence. Two-factor authentication by default.
          </div>
        </div>

        {/* Newsletter consent — pre-ticked, value-exchange wording */}
        <div style={{
          marginTop: 18, padding: 16, borderRadius: 14,
          background: newsletter ? `${TEB.primary}0a` : TEB.surfaceAlt,
          border: `1.5px solid ${newsletter ? TEB.primary : TEB.border}`,
          transition: 'all 0.2s',
        }}>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: TEB.ink, marginBottom: 8, lineHeight: 1.3 }}>
            One small ask before we send your quote.
          </div>
          <div style={{ fontSize: 13, color: TEB.inkSoft, lineHeight: 1.55, marginBottom: 12 }}>
            To email your quote and book a free discovery call, you'll also join our monthly newsletter — one honest, practical email a month from Libby. No sales spam, unsubscribe any time with one click. Fair trade?
          </div>
          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              border: `1.5px solid ${TEB.primary}`,
              background: newsletter ? TEB.primary : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
            }}>
              {newsletter && <svg width="12" height="9" viewBox="0 0 12 9"><path d="M1 4.5L4.5 8L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
            </div>
            <input type="checkbox" checked={newsletter} onChange={e => setState({ newsletter: e.target.checked })}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}/>
            <div style={{ fontSize: 13, color: TEB.ink, lineHeight: 1.5, fontWeight: 500 }}>
              Yes — subscribe me to the monthly newsletter and continue to my quote.
            </div>
          </label>
          {!newsletter && (
            <div style={{ fontSize: 12, color: TEB.muted, marginTop: 10, paddingLeft: 34, lineHeight: 1.5 }}>
              If you'd rather not subscribe, we'll open your email app so you can get in touch directly at <b style={{ color: TEB.ink }}>hello@theethicalbookkeeper.co.uk</b>.
            </div>
          )}
        </div>

        <div style={{
          marginTop: 14, padding: 12, borderRadius: 10,
          background: TEB.surfaceAlt, border: `1px solid ${TEB.border}`,
          fontSize: 12, color: TEB.inkSoft, lineHeight: 1.55, fontFamily: SANS,
        }}>
          A full Letter of Engagement will be provided before any work begins. Your data is handled in line with our <a href="https://theethicalbookkeeper.co.uk/privacy-policy/" target="_blank" rel="noopener noreferrer" style={{ color: TEB.primary, fontWeight: 500 }}>Privacy Policy</a>.
        </div>
      </div>
    </Shell>
  );
}

// ─── Screen 7 — Book discovery call via Microsoft Bookings ─────
function BookStep({ state, onBack, onConfirm }) {
  // The live Bookings page. If this ever 404s, it's because the mailbox isn't
  // published as a Bookings page — not something a query string will fix.
  const BOOKINGS_URL = 'https://outlook.office.com/book/hellotheethicalbookkeepercouk@theethicalbookkeeper.co.uk/s/GYvclrec20uTOUNpcjZ95w2?ismsaljsauthenabled';
  // Old personal-booking URL (kept as comment in case we ever need to revert):
  // 'https://outlook.office.com/bookwithme/user/...k';

  const svcs = (window.PRICING || []).filter(s => (state.selected || {})[s.title]);
  let monthly = 0;
  svcs.forEach(svc => {
    const cfg = { 'Software Type': state.software || 'Xero', 'Annual Revenue Range': state.turnover, ...(state.selected[svc.title]) };
    if (svc.billing === 'monthly' && !/^Catch Up: Previous Years/i.test(svc.title || '')) monthly += priceService(svc, cfg);
  });

  // Newsletter consent already collected on DetailsStep — default true if not set.
  const consented = state.newsletter !== false;

  // Fires once — whichever path the user takes. Routes to "Quote submitted" group,
  // which triggers both the client thank-you email and the admin notification to Libby.
  const sendQuoteToMailerLite = () => {
    submitQuoteToMailerLite({
      email: state.email, name: state.name, business: state.business,
      phone: state.phone, quote_monthly: Math.round(monthly),
    });
    // If they ALSO opted into the newsletter, add to that group too.
    if (consented) {
      subscribeToNewsletter({
        email: state.email, name: state.name, business: state.business,
        quote_monthly: Math.round(monthly),
      });
    }
  };

  // Microsoft Bookings does not accept arbitrary name/email URL params, so just open the page.
  const openBooking = () => {
    sendQuoteToMailerLite();
    window.open(BOOKINGS_URL, '_blank', 'noopener');
    if (onConfirm) onConfirm('booked');
  };

  // "I'll book later" — the KEY path. We want Libby to know a quote happened
  // even if the client doesn't book. This fires the MailerLite group add too.
  const bookLater = () => {
    sendQuoteToMailerLite();
    if (onConfirm) onConfirm('later');
  };

  const emailInstead = () => {
    sendQuoteToMailerLite();
    const subject = encodeURIComponent(`Discovery call request — ${state.business || state.name || 'new client'}`);
    const body = encodeURIComponent(
      `Hi Libby,\n\nI'd like to book a discovery call.\n\n`
      + `Name: ${state.name || ''}\n`
      + `Business: ${state.business || ''}\n`
      + `My quote: ${gbp(monthly)}/mo\n\n`
      + `Thanks!`
    );
    window.location.href = `mailto:hello@theethicalbookkeeper.co.uk?subject=${subject}&body=${body}`;
    if (onConfirm) onConfirm('emailed');
  };

  return (
    <Shell footer={
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrimaryButton
          label={consented ? 'Book your discovery call' : 'Email Libby instead'}
          onClick={consented ? openBooking : emailInstead}/>
        <PrimaryButton label="I'll book later" variant="ghost" onClick={bookLater}/>
      </div>
    }>
      <ScreenHeader eyebrow="Final step" onBack={onBack}
        title="Book your discovery call."
        sub={`Pick a slot that suits you — you'll see Libby's live availability. We'll walk through your ${gbp(monthly)}/mo quote together.`}/>

      <div style={{ padding: '22px 24px' }}>
        <div style={{
          padding: 16, borderRadius: 14, background: TEB.surfaceAlt,
          border: `1px solid ${TEB.border}`, fontFamily: SANS,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="5" width="14" height="12" rx="2" stroke={TEB.primary} strokeWidth="1.6"/>
              <path d="M3 8h14M7 3v4M13 3v4" stroke={TEB.primary} strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <div style={{ fontSize: 14, fontWeight: 500, color: TEB.ink }}>Free discovery call · on Microsoft Teams</div>
          </div>
          <div style={{ fontSize: 13, color: TEB.inkSoft, lineHeight: 1.5 }}>
            Tap the button below and you'll see Libby's real Outlook availability. Pick a slot — you'll get a confirmation email with a Teams link straight away, and it'll land in your calendar.
          </div>
        </div>

        <div style={{
          marginTop: 16, padding: 14, borderRadius: 12,
          background: TEB.surface, border: `1px solid ${TEB.border}`, fontFamily: SANS,
        }}>
          <div style={{ fontSize: 12, color: TEB.inkSoft, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>Your quote summary</div>
          <div style={{ fontSize: 14, color: TEB.ink }}>{state.name || '—'} · {state.businessName || '—'}</div>
          <div style={{ fontSize: 13, color: TEB.inkSoft, marginTop: 4 }}>
            {Object.keys(state.selected || {}).length} services · {gbp(monthly)} / month
          </div>
        </div>

        <div style={{
          marginTop: 14, fontSize: 13, color: TEB.inkSoft,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="6" stroke={TEB.primary} strokeWidth="1.4" fill="none"/>
            <path d="M7 4v3.5l2 1.5" stroke={TEB.primary} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
          </svg>
          No obligation · reschedule anytime
        </div>
      </div>
    </Shell>
  );
}

// ─── Screen 7 — Thanks / post-booking ────────────────────────────────
function ThanksStep({ state, path, onRestart }) {
  // path: 'booked' | 'later' | 'emailed'
  const title = path === 'booked' ? "You're booked in." :
                path === 'emailed' ? 'Email on its way.' :
                "Thanks — we'll be in touch.";
  const sub = path === 'booked'
    ? "Libby will see you at your chosen slot. A calendar invite and confirmation email are on their way."
    : path === 'emailed'
    ? "Your email client should have opened with a pre-filled message to Libby. Hit send when you're ready."
    : "Libby's been notified of your quote. She'll reach out within 1 business day to help you book a slot.";

  return (
    <Shell footer={
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrimaryButton label="Back to start" variant="ghost" onClick={onRestart}/>
      </div>
    }>
      <div style={{ padding: '48px 24px 20px', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `${TEB.primary}14`, border: `2px solid ${TEB.primary}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path d="M9 18.5l5.5 5.5L27 11" stroke={TEB.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 30, color: TEB.ink, letterSpacing: -0.6, lineHeight: 1.1, marginBottom: 12 }}>
          {title}
        </div>
        <div style={{ fontFamily: SANS, fontSize: 15, color: TEB.inkSoft, lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
          {sub}
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>
        <div style={{
          padding: 16, borderRadius: 14, background: TEB.surfaceAlt,
          border: `1px solid ${TEB.border}`, fontFamily: SANS,
        }}>
          <div style={{ fontSize: 11, color: TEB.inkSoft, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>What happens next</div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {[
              path === 'booked'
                ? 'Check your inbox for the calendar invite (plus a reminder the day before).'
                : "Libby will be in touch to find a time that works for you.",
              'On the call, we\'ll walk through your quote and answer any questions.',
              'If you\'re happy, we\'ll send you a welcome pack and get you onboarded.',
            ].map((text, i) => (
              <li key={i} style={{
                display: 'flex', gap: 12, alignItems: 'flex-start',
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${TEB.border}`,
              }}>
                <div style={{
                  flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                  background: TEB.primary, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600, fontFamily: SANS,
                }}>{i + 1}</div>
                <div style={{ fontSize: 13.5, color: TEB.ink, lineHeight: 1.5, paddingTop: 2 }}>{text}</div>
              </li>
            ))}
          </ol>
        </div>

        <div style={{
          marginTop: 14, fontSize: 12.5, color: TEB.inkSoft, textAlign: 'center', lineHeight: 1.5,
        }}>
          Questions in the meantime? Email <a href="mailto:hello@theethicalbookkeeper.co.uk" style={{ color: TEB.primary, textDecoration: 'none' }}>hello@theethicalbookkeeper.co.uk</a>
        </div>
      </div>
    </Shell>
  );
}

Object.assign(window, { ServicesStep, ConfigureStep, QuoteStep, DetailsStep, BookStep, ThanksStep, HelperSheet });
