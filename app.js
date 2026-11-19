(() => {
  // Fixed goals the team chose. Change them here and every figure, line and sentence follows.
  const goalOf = (k, fallback) => { const g = (window.VG_GOALS || {})[k]; return g && g.target != null ? +g.target : fallback; };
  const GOAL_MEMBERS = () => goalOf('members', 150);
  const GOAL_CONV = () => goalOf('conversion', 40); // percent of new clients who join a membership or package

  const parseMonth = d3.utcParse('%Y-%m-%d');
  const mon = d3.utcFormat('%b');
  const monthYear = d3.utcFormat('%B %Y');
  const money = d3.format('$,.0f');
  const int = d3.format(',.0f');
  const thousands = (v) => '$' + d3.format(',.0f')(v / 1000) + 'k';
  const STREAMS = [
    ['revenue_services', 'Services'],
    ['revenue_products', 'Products'],
    ['revenue_memberships', 'Memberships'],
    ['revenue_packages', 'Packages'],
    ['revenue_giftcards', 'Gift cards'],
  ];
  const MUTED = 'var(--cds-chart-muted)';

  // ---------- calculations (readers can open each one in Sources) ----------

  dash.calc('kpis', {
    title: 'Headline numbers',
    description: 'The latest month compared with the month before.',
    inputs: ['monthly'],
    fn: (monthly) => {
      if (!monthly.length) return [];
      const m = monthly[monthly.length - 1];
      const p = monthly[monthly.length - 2] || null; // no month before the first one
      const div = (a, b) => (b ? a / b : 0);
      const has = (r) => r && r.active_members != null;
      const joined = (r) => +r.new_to_membership + +r.new_to_package;
      const conv = (r) => div(joined(r), +r.new_clients) * 100;
      const rebook = (r) => div(+r.visits_rebooked, +r.visits) * 100;
      const revenue = (r) => +r.revenue_services + +r.revenue_products + +r.revenue_memberships + +r.revenue_packages + +r.revenue_giftcards;
      const g = window.VG_GOALS || {};
      const GOAL_MEMBERS = g.members && g.members.target != null ? +g.members.target : 150;
      const cancelled = +m.appts_cancelled || 0;
      return [{
        month_label: d3.utcFormat('%B %Y')(d3.utcParse('%Y-%m-%d')(m.month)),
        prev_month_label: p ? d3.utcFormat('%B')(d3.utcParse('%Y-%m-%d')(p.month)) : null,
        new_clients: +m.new_clients,
        new_clients_change: p ? +m.new_clients - +p.new_clients : null,
        joined: joined(m),
        conv_pct: Math.round(conv(m)),
        conv_change_pts: p ? Math.round(conv(m)) - Math.round(conv(p)) : null,
        members: has(m) ? +m.active_members : null,
        members_change: has(m) && has(p) ? +m.active_members - +p.active_members : null,
        members_to_goal: has(m) ? Math.max(0, GOAL_MEMBERS - +m.active_members) : null,
        rebook_pct: Math.round(rebook(m)),
        rebook_change_pts: p ? Math.round(rebook(m)) - Math.round(rebook(p)) : null,
        revenue: revenue(m),
        revenue_change_pct: p && revenue(p) ? Math.round((revenue(m) / revenue(p) - 1) * 100) : null,
        recurring_revenue: +m.revenue_memberships,
        avg_ticket: Math.round(div(+m.revenue_services + +m.revenue_products, +m.visits)),
        visits: +m.visits,
        membership_starts: +m.membership_starts,
        membership_cancels: +m.membership_cancels,
        cancel_pct: Math.round(div(cancelled, +m.visits + cancelled) * 100),
        online_pct: Math.round(div(+m.visits_booked_online || 0, +m.visits) * 100),
        discounts: Math.round(+m.discounts || 0),
      }];
    },
  });

  dash.calc('trend', {
    title: 'Monthly rates',
    description: 'New-client conversion and rebook rate for each month.',
    inputs: ['monthly'],
    fn: (monthly) => monthly.map((r) => ({
      month: r.month,
      conv_pct: +r.new_clients ? Math.round(((+r.new_to_membership + +r.new_to_package) / +r.new_clients) * 1000) / 10 : 0,
      rebook_pct: +r.visits ? Math.round((+r.visits_rebooked / +r.visits) * 1000) / 10 : 0,
    })),
  });

  dash.calc('provider_stats', {
    title: 'Provider scorecard',
    description: 'Rebook rate and new-client conversion for each provider over the last 90 days.',
    inputs: ['providers'],
    fn: (providers) => providers.map((p) => ({
      provider: p.provider,
      visits: +p.visits,
      revenue: +p.revenue,
      rebook_pct: +p.visits ? Math.round((+p.rebooked / +p.visits) * 100) : 0,
      new_clients: +p.new_clients,
      conv_pct: +p.new_clients ? Math.round((+p.new_converted / +p.new_clients) * 100) : 0,
    })).sort((a, b) => b.rebook_pct - a.rebook_pct),
  });

  dash.calc('pace', {
    title: 'Pace to the membership goal',
    description: 'When membership reaches 150 at the average net growth of the last three months, and at the 40% conversion goal.',
    inputs: ['monthly'],
    fn: (monthly) => {
      const m3 = monthly.slice(-3);
      if (!m3.length || m3[m3.length - 1].active_members == null) return [];
      const g = window.VG_GOALS || {};
      const GOAL_MEMBERS = g.members && g.members.target != null ? +g.members.target : 150;
      const GOAL_CONV = (g.conversion && g.conversion.target != null ? +g.conversion.target : 40) / 100;
      const sum = (k) => m3.reduce((a, r) => a + +r[k], 0);
      const last = m3[m3.length - 1];
      const net = (sum('membership_starts') - sum('membership_cancels')) / m3.length;
      const newPerMonth = sum('new_clients') / m3.length;
      const joined = sum('new_to_membership') + sum('new_to_package');
      const convRate = sum('new_clients') ? joined / sum('new_clients') : 0;
      const memberShare = joined ? sum('new_to_membership') / joined : 0; // share of joiners who pick a membership
      const netAtGoal = net + Math.max(0, newPerMonth * (GOAL_CONV - convRate)) * memberShare;
      const toGo = Math.max(0, GOAL_MEMBERS - +last.active_members);
      const eta = (perMonth) => {
        if (perMonth <= 0) return 'not at this pace';
        const d = d3.utcParse('%Y-%m-%d')(last.month);
        d.setUTCMonth(d.getUTCMonth() + Math.ceil(toGo / perMonth));
        return d3.utcFormat('%B %Y')(d);
      };
      return [{
        net_per_month: Math.round(net * 10) / 10,
        net_per_month_at_goal: Math.round(netAtGoal * 10) / 10,
        eta: eta(net),
        eta_at_goal: eta(netAtGoal),
      }];
    },
  });

  dash.calc('levers', {
    title: 'Growth levers, ranked',
    description: 'Estimated first-year revenue from each lever, using the last three months as the baseline. Estimates, not forecasts.',
    inputs: ['monthly', 'providers'],
    fn: (monthly, providers) => {
      const m3 = monthly.slice(-3);
      if (!m3.length || !providers.length) return [];
      const g = window.VG_GOALS || {};
      const GOAL_CONV = (g.conversion && g.conversion.target != null ? +g.conversion.target : 40) / 100; // conversion goal
      const ADD = 10;          // extra new patients a month in the "more new patients" lever
      const RAMP = 78;         // months of dues collected in year one when one member joins every month: 12+11+...+1
      const sum = (k) => m3.reduce((a, r) => a + +r[k], 0);
      const last = m3[m3.length - 1];
      const newPerMonth = sum('new_clients') / m3.length;
      const convRate = sum('new_clients') ? (sum('new_to_membership') + sum('new_to_package')) / sum('new_clients') : 0;
      const dues = +last.active_members ? +last.revenue_memberships / +last.active_members : 0;                             // average monthly dues per member
      const ticket = sum('visits') ? (sum('revenue_services') + sum('revenue_products')) / sum('visits') : 0;         // average spend per visit
      const extraJoiners = Math.max(0, newPerMonth * (GOAL_CONV - convRate));
      const pv = providers.map((p) => ({ name: p.provider, visits: +p.visits, rate: +p.visits ? +p.rebooked / +p.visits : 0 }));
      const top = pv.reduce((a, b) => (b.rate > a.rate ? b : a));
      const clinicRate = pv.reduce((a, p) => a + p.rate * p.visits, 0) / (pv.reduce((a, p) => a + p.visits, 0) || 1);
      // every provider closes half the gap to the best rebook rate; the providers source covers 90 days, so x4 for a year
      const extraVisits = pv.reduce((a, p) => a + (p.visits * (top.rate - p.rate)) / 2, 0) * 4;
      const cancels = sum('membership_cancels') / m3.length;
      const k = (v) => Math.round(v / 1000) * 1000;
      const d1 = (v) => Math.round(v * 10) / 10;
      const rows = [
        { lever: 'new_patients', name: 'Bring in more new patients', impact: k(ADD * 12 * ticket + ADD * convRate * dues * RAMP), add_per_month: ADD },
        { lever: 'rebook', name: 'Rebook before they leave', impact: k(extraVisits * ticket), extra_visits: Math.round(extraVisits), top_provider: top.name, top_pct: Math.round(top.rate * 100), clinic_pct: Math.round(clinicRate * 100) },
        { lever: 'conversion', name: 'Convert new clients to members', impact: dues ? k(extraJoiners * dues * RAMP) : null, extra_per_month: d1(extraJoiners), current_pct: Math.round(convRate * 100) },
        { lever: 'retention', name: 'Keep the members you have', impact: dues ? k((cancels / 2) * dues * RAMP) : null, cancels_per_month: d1(cancels), saved_per_month: d1(cancels / 2) },
      ].sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1)); // a lever that cannot be valued yet (no member count) goes last
      return rows.map((r, i) => ({ ...r, rank: i + 1 }));
    },
  });

  dash.calc('scorecard', {
    title: 'Goal scorecard',
    description: 'Each goal against its target. Monthly totals are judged against the share of the month that has passed.',
    inputs: ['monthly'],
    fn: (monthly) => {
      const m = monthly[monthly.length - 1];
      if (!m) return [];
      const g = window.VG_GOALS || {};
      const t = (k) => (g[k] && g[k].target != null ? +g[k].target : null);
      const div = (a, b) => (b ? a / b : 0);
      const day = (s) => new Date(s + 'T00:00:00Z');
      const start = day(m.month), today = day(window.VG_TODAY || m.month);
      const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
      const elapsed = Math.min(1, Math.max(1, (today - start) / 864e5 + 1) / daysInMonth); // share of the month gone
      const grade = (ratio) => (ratio >= 1 ? 'on' : ratio >= 0.85 ? 'risk' : 'behind');
      const revenue = +m.revenue_services + +m.revenue_products + +m.revenue_memberships + +m.revenue_packages + +m.revenue_giftcards;
      const conv = div(+m.new_to_membership + +m.new_to_package, +m.new_clients) * 100;
      const rebook = div(+m.visits_rebooked, +m.visits) * 100;
      const cancelled = +m.appts_cancelled || 0;
      const cancelRate = div(cancelled, +m.visits + cancelled) * 100;
      // a running total (new patients, revenue) is on track when it keeps up with the share of the month gone
      const running = (key, label, actual, fmt) => {
        const target = t(key);
        return { key, label, fmt, actual, target, progress: target ? Math.min(1, actual / target) : null,
          status: target ? grade(actual / (target * elapsed)) : 'none' };
      };
      const rate = (key, label, actual, fmt, hasData) => {
        const target = t(key);
        return { key, label, fmt, actual: hasData ? actual : null, target, progress: target && hasData ? Math.min(1, actual / target) : null,
          status: !hasData ? 'wait' : target ? grade(actual / target) : 'none' };
      };
      // members: with a deadline, compare the recent net pace with the pace still needed
      const members = (() => {
        const target = t('members'), actual = m.active_members == null ? null : +m.active_members;
        const row = { key: 'members', label: 'Active members', fmt: 'int', actual, target, progress: target && actual != null ? Math.min(1, actual / target) : null, status: 'none' };
        if (actual == null) { row.status = 'wait'; return row; }
        if (target && actual >= target) { row.status = 'on'; return row; }
        const by = g.members && g.members.by ? day(g.members.by) : null;
        if (!target || !by) return row;
        const monthsLeft = Math.max(1, (by - today) / 864e5 / 30.4);
        const recent = monthly.slice(-3);
        const monthsSeen = recent.length - 1 + elapsed;
        const net = recent.reduce((a, r) => a + +r.membership_starts - +r.membership_cancels, 0) / monthsSeen;
        row.status = grade(net / ((target - actual) / monthsLeft));
        return row;
      })();
      // cancellations: lower is better
      const cancel = (() => {
        const target = t('cancel_rate'), seen = +m.visits + cancelled > 0;
        return { key: 'cancel_rate', label: 'Cancellations', fmt: 'pct', lower: true, actual: seen ? cancelRate : null, target,
          progress: null, status: !seen ? 'wait' : target == null ? 'none' : cancelRate <= target ? 'on' : cancelRate <= target * 1.15 ? 'risk' : 'behind' };
      })();
      return [
        running('new_patients', 'New patients', +m.new_clients, 'int'),
        rate('conversion', 'New clients who joined', conv, 'pct', +m.new_clients > 0),
        members,
        rate('rebook', 'Rebook rate', rebook, 'pct', +m.visits > 0),
        running('revenue', 'Revenue', revenue, 'money'),
        cancel,
      ];
    },
  });

  dash.calc('week', {
    title: 'This week against last week',
    description: 'The current week so far (Monday start) beside the full week before it.',
    inputs: ['weekly'],
    fn: (weekly) => {
      const w = weekly[weekly.length - 1];
      if (!w) return [];
      const p = weekly[weekly.length - 2] || null;
      const pct = (r) => (+r.visits ? Math.round((+r.visits_rebooked / +r.visits) * 100) : 0);
      return [{
        new_clients: +w.new_clients, last_new_clients: p ? +p.new_clients : null,
        joined: +w.joined, last_joined: p ? +p.joined : null,
        rebook_pct: pct(w), last_rebook_pct: p ? pct(p) : null,
        revenue: Math.round(+w.revenue), last_revenue: p ? Math.round(+p.revenue) : null,
        members_net: +w.membership_starts - +w.membership_cancels, last_members_net: p ? +p.membership_starts - +p.membership_cancels : null,
      }];
    },
  });

  dash.calc('rev_weeks', {
    title: 'Weekly revenue',
    description: 'Revenue for each week (Saturday to Friday) with its change from the week before.',
    inputs: ['weekly'],
    fn: (weekly) => weekly.map((w, i) => {
      const prev = i ? +weekly[i - 1].revenue : 0;
      return {
        report_date: w.report_date || w.week_end,
        revenue: +w.revenue,
        done: !!window.VG_TODAY && w.week_end < window.VG_TODAY,
        growth_pct: prev > 0 ? Math.round((+w.revenue / prev - 1) * 100) : null,
      };
    }),
  });
  dash.calc('rev_headline', {
    title: 'Weekly revenue headline',
    description: 'The last finished week, its change from the week before, and how many finished weeks reached the weekly revenue goal.',
    inputs: ['weekly'],
    fn: (weekly) => {
      const goal = +(((window.VG_GOALS || {}).weekly || {}).revenue ?? 40000);
      const done = weekly.filter((w) => !!window.VG_TODAY && w.week_end < window.VG_TODAY);
      const last = done[done.length - 1], prev = done[done.length - 2];
      if (!last) return [];
      return [{
        revenue: Math.round(+last.revenue),
        growth_pct: prev && +prev.revenue > 0 ? Math.round((+last.revenue / +prev.revenue - 1) * 100) : null,
        goal,
        weeks_at_goal: done.filter((w) => +w.revenue >= goal).length,
        weeks: done.length,
      }];
    },
  });

  // ---------- small figures ----------

  const FORMATS = {
    int, money,
    pct: (v) => int(v) + '%',
    dec1: d3.format(',.1f'),
    text: (v) => String(v),
  };
  function cell(el) {
    const s = dash.data(el.dataset.source);
    if (s.status !== 'ok') return undefined;
    let row;
    if (el.dataset.where) {
      const i = el.dataset.where.indexOf('=');
      const key = el.dataset.where.slice(0, i), val = decodeURIComponent(el.dataset.where.slice(i + 1));
      row = s.data.find((r) => String(r[key]) === val);
    } else row = s.data[+el.dataset.row || 0];
    const v = row ? row[el.dataset.field] : undefined;
    return v === null ? undefined : v;
  }
  dash.draw('fig', (el) => {
    const v = cell(el);
    el.textContent = v === undefined ? '—' : (FORMATS[el.dataset.fmt] || FORMATS.int)(v);
  });
  dash.draw('delta', (el) => {
    const v = cell(el);
    el.classList.remove('vg-good', 'vg-bad');
    if (v === undefined) { el.textContent = '—'; return; }
    const unit = { pts: v === 1 || v === -1 ? ' pt' : ' pts', pct: '%' }[el.dataset.fmt] || '';
    el.textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + int(Math.abs(v)) + unit;
    if (v) el.classList.add(v > 0 ? 'vg-good' : 'vg-bad'); // on this page every tracked number is better when higher
  });
  dash.draw('goal', (el) => {
    el.textContent = el.dataset.goal === 'members' ? int(GOAL_MEMBERS()) : GOAL_CONV() + '%';
  });
  dash.draw('owner', (el) => { el.textContent = (window.VG_GOALS || {}).owner || 'Not assigned'; });

  const STATUS = { on: 'On track', risk: 'At risk', behind: 'Behind', none: 'No target set', wait: 'No data yet' };
  dash.draw('goal-rows', (el) => {
    const s = dash.data('scorecard');
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const show = (r, v) => (v == null ? '—' : r.fmt === 'pct' ? Math.round(v) + '%' : r.fmt === 'money' ? money(v) : int(v));
    // new patients, joining and revenue are judged weekly in the table above, so they are not repeated here
    const shown = (s.status === 'ok' ? s.data : []).filter((r) => ['members', 'rebook', 'cancel_rate'].includes(r.key));
    if (!shown.length) { el.textContent = s.status === 'ok' ? 'No data yet' : '—'; return; }
    el.replaceChildren(...shown.map((r) => {
      const row = node('div', 'vg-goal');
      row.dataset.status = r.status;
      row.append(node('div', 'vg-goal-name', r.label));
      row.append(node('div', 'vg-goal-now', show(r, r.actual)));
      row.append(node('div', 'vg-goal-target', r.target == null ? 'No target' : (r.lower ? 'Keep under ' : 'Goal ') + show(r, r.target)));
      const bar = node('div', 'vg-goal-bar');
      const fill = node('span');
      fill.style.width = (r.progress == null ? 0 : r.progress * 100) + '%';
      bar.append(fill);
      row.append(bar);
      row.append(node('div', 'vg-chip', STATUS[r.status]));
      return row;
    }));
  });

  // ---------- weekly KPI tables: one column per week (Saturday to Friday) ----------
  // Each KPI: how to work it out for a week, how to print it, and its benchmark.
  // how: 'above' = must be more than; 'min' = at least; 'max' = at most. Listed in order of impact.
  const pctOf = (a, b) => (+b ? (+a / +b) * 100 : null);
  const pctFmt = (v) => Math.round(v) + '%';
  const ALL_KPIS = [
    { key: 'revenue', label: 'Revenue', how: 'above', bench: 40000, basic: true, fmt: money, val: (w) => +w.revenue },
    { key: 'new_clients', label: 'New clients showed', how: 'above', bench: 4, basic: true, fmt: int, val: (w) => +w.new_clients },
    { key: 'conversion', label: 'New client membership/package sales %', how: 'above', bench: 40, basic: true, fmt: pctFmt, val: (w) => pctOf(w.joined, w.new_clients) ?? 0 }, // no new clients counts as 0%, as on the team's sheet
    { key: 'rebook', label: 'Rebook rate', how: 'min', bench: 60, fmt: pctFmt, val: (w) => pctOf(w.visits_rebooked, w.visits) },
    { key: 'net_members', label: 'Net new members', how: 'min', bench: 3, fmt: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + int(Math.abs(v)), val: (w) => +w.membership_starts - +w.membership_cancels },
    { key: 'visits', label: 'Completed visits', how: 'min', bench: 65, fmt: int, val: (w) => +w.visits },
    { key: 'avg_spend', label: 'Average spend per visit', how: 'min', bench: 300, fmt: money, val: (w) => (+w.visits ? +w.revenue_visits / +w.visits : null) },
    { key: 'next_week_booked', label: 'Next week\'s booked visits', how: 'min', bench: 55, fmt: int, val: (w) => +w.next_week_booked },
    { key: 'cancel_rate', label: 'Cancellations and no-shows', how: 'max', bench: 10, fmt: pctFmt, val: (w) => pctOf(w.appts_cancelled, +w.visits + +w.appts_cancelled) },
    { key: 'new_rebook', label: 'New-client rebook rate', how: 'min', bench: 50, fmt: pctFmt, val: (w) => pctOf(w.new_clients_rebooked, w.new_clients) },
    { key: 'member_cancels', label: 'Member cancellations', how: 'max', bench: 1, fmt: int, val: (w) => +w.membership_cancels },
    { key: 'growth', label: 'Revenue growth, week over week', how: 'min', bench: 10, basic: true, fmt: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + int(Math.abs(v)) + '%', val: (w, prev) => (weekDone(w) && prev && +prev.revenue > 0 ? (+w.revenue / +prev.revenue - 1) * 100 : null) }, // only for finished weeks: a part-week against a full week would mislead
    { key: 'lowest_rebook', label: 'Lowest provider rebook rate', how: 'min', bench: 50, fmt: pctFmt, val: (w) => (w.lowest_provider_rebook == null ? null : +w.lowest_provider_rebook * 100) },
    { key: 'rev_per_provider', label: 'Revenue per provider', how: 'min', bench: null, fmt: money, val: (w) => (+w.providers_active ? +w.revenue_visits / +w.providers_active : null) },
    { key: 'product_attach', label: 'Visits with a product sold', how: 'min', bench: 20, fmt: pctFmt, val: (w) => pctOf(w.service_sales_with_product, w.service_sales) },
    { key: 'packages', label: 'Packages sold', how: 'min', bench: 2, fmt: int, val: (w) => +w.packages_sold },
    { key: 'discount_rate', label: 'Discounts as share of sales', how: 'max', bench: 8, fmt: pctFmt, val: (w) => pctOf(w.discounts, +w.revenue + +w.discounts) },
    { key: 'source_recorded', label: 'New clients with a source recorded', how: 'min', bench: 90, fmt: pctFmt, val: (w) => pctOf(w.new_clients_with_source, w.new_clients) },
    { key: 'online', label: 'Booked online', how: 'min', bench: 40, fmt: pctFmt, val: (w) => pctOf(w.visits_booked_online, w.visits) },
  ];
  const REPORT_KEYS = ['new_clients', 'conversion', 'rebook', 'revenue']; // the rows on the KPI Report, in the team's order
  const kpiBench = (k) => { const b = ((window.VG_GOALS || {}).weekly || {})[k.key]; return b != null ? +b : k.bench; }; // a saved benchmark wins over the default
  const kpiText = (k, b) => (b == null ? '—' : k.how === 'above' ? 'Above ' + k.fmt(b) : k.fmt(b) + (k.how === 'max' ? ' or less' : ' or more'));
  const kpiHit = (k, v, b) => (k.how === 'above' ? v > b : k.how === 'max' ? v <= b : v >= b);
  // a week typed in from the old sheet only has revenue and new-client numbers; the rest is unknown, not zero
  const kpiVal = (k, w, prev) => { if (w.entered_by_hand && !k.basic) return null; const v = k.val(w, prev); return v == null || Number.isNaN(v) ? null : v; };
  const weekDone = (r) => !!window.VG_TODAY && r.week_end < window.VG_TODAY; // the week closed at midnight Friday
  const weekDay = (iso) => d3.utcFormat('%-m/%-d')(parseMonth(iso));

  function weekTable(el, kpis, ranked) {
    const s = dash.data('weekly');
    const narrow = el.clientWidth < 520; // a phone shows the last two finished weeks and this week, with the benchmark under each label
    const all = s.status === 'ok' ? s.data : [];
    const weeks = all.slice(narrow ? -3 : -6);
    if (!weeks.length) { el.textContent = s.status === 'ok' ? 'No weeks to show yet' : '—'; return; }
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const table = node('table', 'vg-wk' + (ranked ? ' vg-wk-ranked' : ''));
    const head = node('tr');
    if (ranked) head.append(node('td', 'vg-rankcol', '#'));
    head.append(node('th', null, 'KPI'));
    if (!narrow) head.append(node('th', null, 'Benchmark'));
    for (const w of weeks) head.append(node('th', weekDone(w) ? null : 'vg-now', weekDone(w) ? weekDay(w.report_date || w.week_end) : narrow ? 'Now' : 'This week'));
    const thead = node('thead'); thead.append(head);
    const tbody = node('tbody');
    kpis.forEach((k) => {
      const tr = node('tr'), bench = kpiBench(k), benchText = kpiText(k, bench);
      if (ranked) tr.append(node('td', 'vg-rankcol', String(ALL_KPIS.indexOf(k) + 1)));
      const name = node('th', null, k.label.replace('/', '/\u200b')); // lets a long label wrap after the slash
      if (narrow) name.append(node('span', 'vg-bench-under', benchText));
      tr.append(name);
      if (!narrow) tr.append(node('td', 'vg-bench', benchText));
      for (const w of weeks) {
        const v = kpiVal(k, w, all[all.indexOf(w) - 1]);
        const hit = v != null && bench != null && kpiHit(k, v, bench);
        // a finished week is a hit or a miss; the week in progress only turns green once it has already met a "more is better" benchmark
        const cls = v == null || bench == null ? '' : weekDone(w) ? (hit ? ' vg-hit' : ' vg-miss') : hit && k.how !== 'max' ? ' vg-hit' : '';
        tr.append(node('td', 'vg-val' + cls + (weekDone(w) ? '' : ' vg-now'), v == null ? '—' : k.fmt(v)));
      }
      tbody.append(tr);
    });
    table.append(thead, tbody);
    el.replaceChildren(table);
  }
  function weekSummary(el, kpis) {
    const s = dash.data('weekly');
    const all = s.status === 'ok' ? s.data : [];
    const done = all.filter(weekDone);
    const last = done[done.length - 1];
    if (!last) { el.textContent = ''; return; }
    const judged = kpis.map((k) => ({ k, v: kpiVal(k, last, all[all.indexOf(last) - 1]), b: kpiBench(k) })).filter((x) => x.v != null && x.b != null);
    el.textContent = `Reported ${weekDay(last.report_date || last.week_end)}: ${judged.filter((x) => kpiHit(x.k, x.v, x.b)).length} of ${judged.length} benchmarks hit`;
  }
  // ---------- one table per provider: their own numbers, week by week ----------
  const benchFor = (key) => kpiBench(ALL_KPIS.find((k) => k.key === key)); // providers are held to the same benchmarks as the clinic
  const PROVIDER_KPIS = [
    { label: 'Rebook rate', how: 'min', bench: () => benchFor('rebook'), fmt: pctFmt, val: (w) => pctOf(w.rebooked, w.visits) },
    { label: 'Visits with a product sold', how: 'min', bench: () => benchFor('product_attach'), fmt: pctFmt, val: (w) => pctOf(w.service_sales_with_product, w.service_sales) },
    { label: 'Product sales', how: 'min', bench: () => null, fmt: money, val: (w) => +w.product_revenue },
    { label: 'Packages sold', how: 'min', bench: () => null, fmt: int, val: (w) => +w.packages_sold },
    { label: 'New client membership/package sales %', how: 'above', bench: () => benchFor('conversion'), fmt: pctFmt, val: (w) => pctOf(w.new_joined, w.new_clients) },
    { label: 'Visits', how: 'min', bench: () => null, fmt: int, val: (w) => +w.visits },
    { label: 'Revenue', how: 'min', bench: () => null, fmt: money, val: (w) => +w.revenue },
  ];
  dash.draw('provider-weeks', (el) => {
    const s = dash.data('provider_weekly');
    const rows = s.status === 'ok' ? s.data : [];
    if (!rows.length) { el.textContent = s.status === 'ok' ? 'No provider activity yet' : '—'; return; }
    const narrow = el.clientWidth < 520;
    const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const byProvider = d3.group(rows, (r) => r.provider);
    const cards = [...byProvider.keys()].sort().map((name) => {
      const weeks = byProvider.get(name).slice().sort((a, b) => d3.ascending(a.week_start, b.week_start)).slice(narrow ? -3 : -6);
      const card = node('div', 'vg-card');
      card.append(node('h3', 'vg-h3', name));
      const scroll = node('div', 'vg-scroll'), table = node('table', 'vg-wk vg-wk-compact');
      const head = node('tr');
      head.append(node('th', null, 'KPI'));
      if (!narrow) head.append(node('th', null, 'Benchmark'));
      for (const w of weeks) head.append(node('th', weekDone(w) ? null : 'vg-now', weekDone(w) ? weekDay(w.report_date) : narrow ? 'Now' : 'This week'));
      const thead = node('thead'); thead.append(head);
      const tbody = node('tbody');
      for (const k of PROVIDER_KPIS) {
        const tr = node('tr'), bench = k.bench(), benchText = kpiText(k, bench);
        const label = node('th', null, k.label.replace('/', '/\u200b')); // lets a long label wrap after the slash
        if (narrow && bench != null) label.append(node('span', 'vg-bench-under', benchText));
        tr.append(label);
        if (!narrow) tr.append(node('td', 'vg-bench', benchText));
        for (const w of weeks) {
          const v = k.val(w);
          const hit = v != null && bench != null && kpiHit(k, v, bench);
          const cls = v == null || bench == null ? '' : weekDone(w) ? (hit ? ' vg-hit' : ' vg-miss') : hit ? ' vg-hit' : '';
          tr.append(node('td', 'vg-val' + cls + (weekDone(w) ? '' : ' vg-now'), v == null ? '—' : k.fmt(v)));
        }
        tbody.append(tr);
      }
      table.append(thead, tbody);
      scroll.append(table);
      card.append(scroll);
      return card;
    });
    el.replaceChildren(...cards);
  });

  const REPORT_KPIS = REPORT_KEYS.map((key) => ALL_KPIS.find((k) => k.key === key));
  dash.draw('week-table', (el) => weekTable(el, REPORT_KPIS, false));
  dash.draw('week-summary', (el) => weekSummary(el, REPORT_KPIS));
  dash.draw('misc-table', (el) => weekTable(el, ALL_KPIS, true));
  dash.draw('misc-summary', (el) => weekSummary(el, ALL_KPIS));
  dash.draw('week-note', (el) => {
    const s = dash.data('weekly');
    const byHand = s.status === 'ok' && s.data.slice(-6).some((w) => w.entered_by_hand);
    el.textContent = 'Weeks run Saturday to Friday and are dated by the Saturday meeting.' + (byHand ? ' Weeks before live tracking come from your earlier sheet.' : '');
  });

  dash.draw('meter', (el) => {
    const v = cell(el);
    const goal = el.dataset.goal === 'members' ? GOAL_MEMBERS() : GOAL_CONV();
    el.textContent = '';
    const bar = document.createElement('span');
    bar.style.width = (v === undefined ? 0 : Math.min(100, (v / goal) * 100)) + '%';
    bar.style.background = dash.colors[0];
    el.append(bar);
  });

  // ---------- chart helpers ----------

  function rowsOf(el, ids) {
    const out = [];
    for (const id of ids) {
      const s = dash.data(id);
      if (s.status !== 'ok') { el.textContent = s.status === 'error' ? 'Failed to load' : '—'; return null; }
      out.push(s.data);
    }
    if (!out[0].length) { el.textContent = 'No data yet'; return null; }
    return out;
  }
  function frame(el, height) {
    el.textContent = '';
    const w = Math.max(240, el.clientWidth);
    const wrap = d3.select(el).append('div').attr('class', 'vg-frame');
    const svg = wrap.append('svg').attr('viewBox', `0 0 ${w} ${height}`).attr('width', '100%').attr('height', height)
      .attr('role', 'img').attr('aria-label', el.dataset.label || 'Chart');
    const tip = wrap.append('div').attr('class', 'vg-tip').attr('hidden', '');
    const show = (event, lines) => {
      tip.attr('hidden', null).selectAll('div').data(lines).join('div')
        .attr('class', (d, i) => (i ? 'vg-tip-line' : 'vg-tip-head')).text((d) => d);
      const [x, y] = d3.pointer(event, wrap.node());
      const tw = tip.node().offsetWidth, th = tip.node().offsetHeight, bw = wrap.node().clientWidth;
      tip.style('left', Math.max(0, Math.min(bw - tw, x + 12)) + 'px').style('top', Math.max(0, y - th - 10) + 'px');
    };
    const hide = () => tip.attr('hidden', '');
    return { svg, w, h: height, show, hide };
  }
  function widest(svg, strings, cls = 'vg-tick') {
    const t = svg.append('text').attr('class', cls);
    let max = 0;
    for (const s of strings) { t.text(s); max = Math.max(max, t.node().getComputedTextLength()); }
    t.remove();
    return max;
  }
  const hover = (sel, f, lines) => sel
    .on('pointerenter pointermove', (e, d) => f.show(e, lines(d)))
    .on('pointerleave', f.hide);
  const tickStep = (w, n) => (w / n < 34 ? (w / n < 20 ? 3 : 2) : 1);

  function yGrid(f, y, x0, x1, fmt) {
    const g = f.svg.append('g');
    g.selectAll('line').data(y.ticks(4)).join('line').attr('x1', x0).attr('x2', x1)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', 'var(--cds-chart-grid)');
    g.selectAll('text').data(y.ticks(4)).join('text').attr('class', 'vg-tick').attr('x', x0 - 6)
      .attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt);
  }
  function xMonths(f, x, months, yBase) {
    const step = tickStep(f.w, months.length);
    f.svg.append('g').selectAll('text').data(months.filter((d, i) => (months.length - 1 - i) % step === 0)).join('text')
      .attr('class', 'vg-tick').attr('text-anchor', 'middle').attr('y', yBase + 16)
      .attr('x', (d) => x(d) + (x.bandwidth ? x.bandwidth() / 2 : 0)).text((d) => mon(parseMonth(d)));
  }

  function stackedBars(el, rows, series, fmtAxis, fmtVal) {
    const f = frame(el, 260);
    const total = (r) => d3.sum(series, (s) => +r[s.key]);
    const y = d3.scaleLinear().domain([0, d3.max(rows, total) || 1]).nice(4);
    const ml = widest(f.svg, y.ticks(4).map(fmtAxis)) + 12, top = 18, base = f.h - 26;
    y.range([base, top]);
    const months = rows.map((r) => r.month);
    const x = d3.scaleBand().domain(months).range([ml, f.w - 4]).padding(0.28);
    yGrid(f, y, ml, f.w - 4, fmtAxis);
    xMonths(f, x, months, base);
    const g = f.svg.append('g').selectAll('g').data(rows).join('g');
    g.each(function (r) {
      let acc = 0;
      for (const s of series) {
        const v = +r[s.key];
        d3.select(this).append('rect').attr('x', x(r.month)).attr('width', x.bandwidth())
          .attr('y', y(acc + v)).attr('height', Math.max(0, y(acc) - y(acc + v) - 1)).style('fill', s.color);
        acc += v;
      }
    });
    if (x.bandwidth() >= 24) {
      g.append('text').attr('class', 'vg-label').attr('text-anchor', 'middle')
        .attr('x', (r) => x(r.month) + x.bandwidth() / 2).attr('y', (r) => y(total(r)) - 5).text((r) => fmtAxis(total(r)));
    }
    hover(g.append('rect').attr('x', (r) => x(r.month) - x.step() * 0.14).attr('width', x.step())
      .attr('y', top).attr('height', base - top).style('fill', 'transparent'), f,
      (r) => [monthYear(parseMonth(r.month)), ...series.map((s) => `${s.label}: ${fmtVal(+r[s.key])}`), `Total: ${fmtVal(total(r))}`]);
  }

  function lineChart(el, rows, o) {
    const f = frame(el, 240);
    const lastRow = rows[rows.length - 1];
    const endLabel = o.fmt(+lastRow[o.key]);
    const y = d3.scaleLinear().domain([0, Math.max(d3.max(rows, (r) => +r[o.key]) || 1, o.goal || 0) * 1.12]).nice(4);
    const ml = widest(f.svg, y.ticks(4).map(o.fmt)) + 12, mr = widest(f.svg, [endLabel], 'vg-label') + 12, top = 14, base = f.h - 26;
    y.range([base, top]);
    const months = rows.map((r) => r.month);
    const x = d3.scalePoint().domain(months).range([ml + 8, f.w - mr]);
    yGrid(f, y, ml, f.w - mr, o.fmt);
    xMonths(f, x, months, base);
    if (o.goal) {
      f.svg.append('line').attr('x1', ml).attr('x2', f.w - mr).attr('y1', y(o.goal)).attr('y2', y(o.goal))
        .style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '5 4').style('stroke-width', 1.5);
      f.svg.append('text').attr('class', 'vg-tick').attr('x', ml + 6).attr('y', y(o.goal) - 6).text(`Goal ${o.fmt(o.goal)}`);
    }
    f.svg.append('path').datum(rows).attr('fill', 'none').style('stroke', dash.colors[0]).style('stroke-width', 2.5)
      .attr('d', d3.line().x((r) => x(r.month)).y((r) => y(+r[o.key])));
    f.svg.append('g').selectAll('circle').data(rows).join('circle').attr('r', 3.5)
      .attr('cx', (r) => x(r.month)).attr('cy', (r) => y(+r[o.key])).style('fill', dash.colors[0]);
    f.svg.append('text').attr('class', 'vg-label').attr('x', x(lastRow.month) + 8).attr('y', y(+lastRow[o.key])).attr('dy', '0.32em').text(endLabel);
    hover(f.svg.append('g').selectAll('circle').data(rows).join('circle').attr('r', 14)
      .attr('cx', (r) => x(r.month)).attr('cy', (r) => y(+r[o.key])).style('fill', 'transparent'), f,
      (r) => [monthYear(parseMonth(r.month)), `${o.name}: ${o.fmt(+r[o.key])}`, ...(o.goal ? [`Goal: ${o.fmt(o.goal)}`] : [])]);
  }

  function hBars(el, rows, o) {
    const rowH = 30, top = o.ref ? 20 : 4;
    const f = frame(el, rows.length * rowH + top + 6);
    const ml = Math.min(f.w * 0.46, widest(f.svg, rows.map((r) => r[o.label])) + 10);
    const mr = widest(f.svg, rows.map((r) => o.fmt(+r[o.key])), 'vg-label') + 10;
    const x = d3.scaleLinear().domain([0, Math.max(d3.max(rows, (r) => +r[o.key]) || 1, o.ref || 0)]).range([ml, f.w - mr]);
    const g = f.svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r, i) => `translate(0,${top + i * rowH})`);
    g.append('text').attr('class', 'vg-tick').attr('x', ml - 8).attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((r) => r[o.label]);
    g.append('rect').attr('x', ml).attr('y', 5).attr('height', rowH - 10).attr('rx', 3)
      .attr('width', (r) => Math.max(1, x(+r[o.key]) - ml)).style('fill', (r) => o.color(r));
    g.append('text').attr('class', 'vg-label').attr('x', (r) => x(+r[o.key]) + 6).attr('y', rowH / 2).attr('dy', '0.32em').text((r) => o.fmt(+r[o.key]));
    if (o.ref) {
      f.svg.append('line').attr('x1', x(o.ref)).attr('x2', x(o.ref)).attr('y1', top - 4).attr('y2', f.h - 4)
        .style('stroke', 'var(--cds-chart-reference)').style('stroke-dasharray', '5 4').style('stroke-width', 1.5);
      f.svg.append('text').attr('class', 'vg-tick').attr('x', x(o.ref)).attr('y', 10).attr('text-anchor', 'middle').text(`${o.refLabel} ${o.fmt(o.ref)}`);
    }
    hover(g.append('rect').attr('x', 0).attr('width', f.w).attr('height', rowH).style('fill', 'transparent'), f, o.tip);
  }

  // ---------- charts ----------

  dash.draw('chart-new', (el) => {
    const d = rowsOf(el, ['monthly']); if (!d) return;
    const rows = d[0].map((r) => ({ ...r, not_yet: +r.new_clients - +r.new_to_membership - +r.new_to_package }));
    stackedBars(el, rows, [
      { key: 'new_to_membership', label: 'Joined a membership', color: dash.colors[0] },
      { key: 'new_to_package', label: 'Bought a package', color: dash.colors[1] },
      { key: 'not_yet', label: 'Neither yet', color: MUTED },
    ], int, int);
  });
  dash.draw('chart-conv', (el) => {
    const d = rowsOf(el, ['trend']); if (!d) return;
    lineChart(el, d[0], { key: 'conv_pct', name: 'Joined a membership or package', fmt: (v) => d3.format('.0f')(v) + '%', goal: GOAL_CONV() });
  });
  dash.draw('chart-members', (el) => {
    const d = rowsOf(el, ['monthly']); if (!d) return;
    const known = d[0].filter((r) => r.active_members != null);
    if (!known.length) { el.textContent = 'The member count appears once the starting number is entered.'; return; }
    lineChart(el, known, { key: 'active_members', name: 'Active members', fmt: int, goal: GOAL_MEMBERS() });
  });
  dash.draw('chart-revenue', (el) => {
    const d = rowsOf(el, ['monthly']); if (!d) return;
    stackedBars(el, d[0], STREAMS.map(([key, label], i) => ({ key, label, color: dash.colors[i] })), thousands, money);
  });
  dash.draw('chart-sellers', (el) => {
    const d = rowsOf(el, ['sellers']); if (!d) return;
    const rows = [...d[0]].sort((a, b) => +b.revenue - +a.revenue).slice(0, 10);
    hBars(el, rows, {
      label: 'item', key: 'revenue', fmt: money,
      color: (r) => (r.type === 'Product' ? dash.colors[1] : dash.colors[0]),
      tip: (r) => [r.item, `${r.type}`, `Revenue: ${money(+r.revenue)}`, `Sold: ${int(+r.units)}`],
    });
  });
  dash.draw('chart-week-revenue', (el) => {
    const d = rowsOf(el, ['rev_weeks', 'rev_headline']); if (!d) return;
    const rows = d[0], goal = d[1][0] ? d[1][0].goal : 40000;
    const f = frame(el, 300);
    const y = d3.scaleLinear().domain([0, Math.max(goal * 1.15, d3.max(rows, (r) => r.revenue) * 1.12)]).nice(4);
    const ml = widest(f.svg, y.ticks(4).map(thousands)) + 12, top = 16, base = f.h - 44;
    y.range([base, top]);
    const x = d3.scaleBand().domain(rows.map((r) => r.report_date)).range([ml, f.w - 4]).padding(0.3);
    yGrid(f, y, ml, f.w - 4, thousands);
    f.svg.append('line').attr('x1', ml).attr('x2', f.w - 4).attr('y1', y(goal)).attr('y2', y(goal))
      .style('stroke', 'var(--color-ok)').style('stroke-dasharray', '5 4').style('stroke-width', 1.5);
    const g = f.svg.append('g').selectAll('g').data(rows).join('g');
    g.append('rect').attr('x', (r) => x(r.report_date)).attr('width', x.bandwidth()).attr('rx', 3)
      .attr('y', (r) => y(r.revenue)).attr('height', (r) => Math.max(1, base - y(r.revenue)))
      .style('fill', (r) => (r.revenue >= goal ? 'var(--color-ok)' : dash.colors[0])).style('opacity', (r) => (r.done ? 1 : 0.45));
    f.svg.append('text').attr('class', 'vg-tick').attr('x', ml + 6).attr('y', y(goal) - 6).style('fill', 'var(--color-ok)')
      .style('paint-order', 'stroke').style('stroke', 'var(--color-panel)').style('stroke-width', 4).style('stroke-linejoin', 'round').text(`Goal ${money(goal)}`);
    const roomy = x.bandwidth() >= 30;
    if (roomy) {
      g.append('text').attr('class', 'vg-label').attr('text-anchor', 'middle').attr('x', (r) => x(r.report_date) + x.bandwidth() / 2)
        .attr('y', (r) => y(r.revenue) - 6).text((r) => '$' + d3.format(',.1f')(r.revenue / 1000) + 'k');
    }
    const step = tickStep(f.w, rows.length);
    const ticked = rows.filter((r, i) => (rows.length - 1 - i) % step === 0);
    const tick = f.svg.append('g').selectAll('g').data(ticked).join('g')
      .attr('transform', (r) => `translate(${x(r.report_date) + x.bandwidth() / 2},${base})`);
    tick.append('text').attr('class', 'vg-tick').attr('text-anchor', 'middle').attr('y', 16).text((r) => (r.done ? weekDay(r.report_date) : 'This week'));
    // week-over-week change under each finished week
    tick.filter((r) => r.done && r.growth_pct != null).append('text').attr('class', 'vg-label').attr('text-anchor', 'middle').attr('y', 32)
      .style('fill', (r) => (r.growth_pct >= 0 ? 'var(--color-ok)' : 'var(--color-bad)'))
      .text((r) => (r.growth_pct > 0 ? '+' : r.growth_pct < 0 ? '−' : '') + int(Math.abs(r.growth_pct)) + '%');
    hover(g.append('rect').attr('x', (r) => x(r.report_date) - x.step() * 0.15).attr('width', x.step())
      .attr('y', top).attr('height', base - top).style('fill', 'transparent'), f,
      (r) => [r.done ? `Week reported ${weekDay(r.report_date)}` : 'This week so far', `Revenue: ${money(r.revenue)}`,
        ...(r.growth_pct != null ? [`Week over week: ${r.growth_pct > 0 ? '+' : ''}${r.growth_pct}%`] : []), `Goal: ${money(goal)}`]);
  });
  dash.draw('chart-sources', (el) => {
    const d = rowsOf(el, ['sources']); if (!d) return;
    hBars(el, d[0].slice(0, 8), {
      label: 'source', key: 'new_clients', fmt: int, color: () => dash.colors[0],
      tip: (r) => [r.source, `New patients: ${int(+r.new_clients)}`, `Joined: ${int(+r.joined)}`],
    });
  });
  dash.draw('chart-rebook', (el) => {
    const d = rowsOf(el, ['provider_stats', 'levers']); if (!d) return;
    const clinic = (d[1].find((r) => r.lever === 'rebook') || {}).clinic_pct;
    hBars(el, d[0], {
      label: 'provider', key: 'rebook_pct', fmt: (v) => int(v) + '%', ref: clinic, refLabel: 'Clinic',
      color: (r) => (clinic && r.rebook_pct < clinic ? MUTED : dash.colors[0]),
      tip: (r) => [r.provider, `Rebook rate: ${r.rebook_pct}%`, `Visits: ${int(r.visits)}`, `Revenue: ${money(r.revenue)}`],
    });
  });
  dash.draw('provider-rows', (tbody) => {
    const s = dash.data('provider_stats');
    const cols = [['provider', String], ['visits', int], ['revenue', money], ['rebook_pct', (v) => v + '%'], ['new_clients', int], ['conv_pct', (v) => v + '%']];
    tbody.replaceChildren(...(s.status === 'ok' ? s.data : []).map((r) => {
      const tr = document.createElement('tr');
      for (const [k, f] of cols) { const td = document.createElement('td'); td.textContent = f(r[k]); tr.append(td); }
      return tr;
    }));
  });

  dash.draw('lever-rows', (tbody) => {
    const s = dash.data('levers');
    const cols = [['rank', int], ['name', String], ['impact', money]];
    tbody.replaceChildren(...(s.status === 'ok' ? s.data : []).map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.key = r.lever;
      for (const [k, f] of cols) { const td = document.createElement('td'); td.textContent = r[k] == null ? '—' : f(r[k]); tr.append(td); }
      return tr;
    }));
  });

  // ---------- webhooks: the latest events Mangomint sent ----------

  const HOOK_NAMES = {
    AppointmentCreated: 'Appointment booked', AppointmentUpdated: 'Appointment changed', AppointmentDeleted: 'Appointment deleted',
    SaleCompleted: 'Sale completed', SaleReopened: 'Sale reopened', SaleVoided: 'Sale voided', ping: 'Connection test',
  };
  const spaced = (t) => String(t || '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  const sentence = (t) => { const x = spaced(t).toLowerCase(); return x ? x[0].toUpperCase() + x.slice(1) : ''; };
  const hookName = (r) => (r.kind === 'AppointmentDeleted' && r.cancellation ? 'Appointment cancelled' : HOOK_NAMES[r.kind] || sentence(r.kind) || 'Unknown event');
  const cents = d3.format('$,.2f');
  const stamp = (d) => (isNaN(d) ? '—' : d.toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  }));
  // appointment times arrive as clinic clock time with no zone, so they are shown exactly as written
  const clinicTime = (t) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t || ''); return m ? stamp(new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null; };

  dash.draw('hook-rows', (tbody) => {
    const s = dash.data('webhooks');
    const note = (text) => {
      const tr = document.createElement('tr'), td = document.createElement('td');
      td.colSpan = 6; td.className = 'vg-hook-empty'; td.textContent = text; tr.append(td);
      return tr;
    };
    if (s.status !== 'ok') { tbody.replaceChildren(note(s.status === 'loading' ? 'Loading…' : 'The event list could not be loaded. Press Refresh to try again.')); return; }
    if (!s.data.length) { tbody.replaceChildren(note('No events have arrived from Mangomint yet.')); return; }
    tbody.replaceChildren(...s.data.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.key = r.id;
      const cell = (text, sub) => {
        const td = document.createElement('td');
        td.textContent = text == null || text === '' ? '—' : text;
        if (sub) { const sp = document.createElement('span'); sp.className = 'vg-hook-sub'; sp.textContent = sub; td.append(sp); }
        tr.append(td);
        return td;
      };
      const when = clinicTime(r.appt_at);
      const sub = [when && 'Appointment on ' + when, r.first_visit && 'First visit', r.cancellation && sentence(r.cancellation), r.failed && 'Could not be saved cleanly']
        .filter(Boolean).join(' · ');
      cell(stamp(new Date(r.received_at)));
      cell(hookName(r));
      cell(r.client);
      cell(r.items, sub);
      cell(r.provider);
      cell(r.amount == null || isNaN(+r.amount) ? null : cents(+r.amount));
      return tr;
    }));
  });
  dash.draw('hook-summary', (el) => {
    const s = dash.data('webhooks');
    const n = s.status === 'ok' ? s.data.length : 0;
    el.textContent = n ? `Showing ${n} · latest ${stamp(new Date(s.data[0].received_at))}` : '';
  });

  // ---------- sidebar navigation: one page shows at a time ----------

  const pages = () => [...document.querySelectorAll('.vg-page')];
  let current = 'scorecard';
  function go(id, link) {
    const all = pages();
    if (!all.length) return;
    if (!all.some((p) => p.id === id)) id = all[0].id;
    current = id;
    for (const p of all) p.hidden = p.id !== id;
    document.querySelectorAll('[data-page]').forEach((b) => {
      if (b.dataset.page === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const shown = all.find((p) => p.id === id);
    new Set([...shown.querySelectorAll('[data-draw]')].map((e) => e.dataset.draw)).forEach((name) => dash.draw(name));
    if (link) dash.setLink(id);
  }
  document.querySelectorAll('[data-page], [data-go]').forEach((b) => {
    b.addEventListener('click', () => {
      go(b.dataset.page || b.dataset.go, true);
      const top = document.querySelector('.vg-main');
      if (top && b.dataset.go) top.scrollIntoView({ block: 'start' });
    });
  });
  if (location.hash.length > 1) go(decodeURIComponent(location.hash.slice(1)), false);
  // printing lays every page out, one after another
  window.addEventListener('beforeprint', () => { for (const p of pages()) p.hidden = false; });
  window.addEventListener('afterprint', () => go(current, false));

  // ---------- layout that follows the data: lever order and legend colours ----------

  dash.onData(() => {
    // hide comparisons and sentences that have nothing to say yet
    const kp = dash.data('kpis');
    const row = kp.status === 'ok' ? kp.data[0] : null;
    document.querySelectorAll('.vg-cmp').forEach((e) => { e.hidden = !(row && row.prev_month_label); });
    document.querySelectorAll('.vg-need-members').forEach((e) => { e.hidden = !(row && row.members != null); });
    document.querySelectorAll('.vg-live').forEach((e) => { e.hidden = !row; });
    document.querySelectorAll('[data-swatch]').forEach((e) => {
      e.style.background = e.dataset.swatch === 'muted' ? MUTED : dash.colors[+e.dataset.swatch];
    });
    const s = dash.data('levers');
    if (s.status !== 'ok') return;
    document.querySelectorAll('[data-lever]').forEach((card) => {
      const row = s.data.find((r) => r.lever === card.dataset.lever);
      if (row) card.style.order = row.rank;
    });
  });
})();
