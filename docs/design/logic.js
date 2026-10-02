/*
  Logic and data behind the five reference screens (from App Screens.dc.html).
  renderVals() returns every {{ name }} used in the markup files; v2() and v3() hold most of the screen logic.
  Treat the data arrays as sample content. Treat the behaviour (state changes, labels, formatting, sorting, ranking, toasts, timings) as the spec.
  Key places:
  - v3(): cards3 (in-place edit, delete + undo), stars3 / rating3Text (ratings), mySets / sets3 (SetRow meta, filter and sort),
          capture() (dock), G / sorter (Discover ranking with Bayesian weighting, C = 20, m = 4.2), R / stBars (Stats chart).
  - v2(): M / modes (study modes: labels, meta, icons), week / fading (Home).
*/
class Component extends DCLogic {
  state = { tab: 'cards', open: 0, exam: !!this.props.examSet, sheet: false,
    chip: 'All', query: '', open2: -1, mode: 'flash', modes: false, removed: [], lastRemoved: null,
    c3: null, o3: 1, e3: -1, dq: '', da: '', r3: 0, g3: false, menu3: false, confirm3: false, toast3: null,
    chip3: 'All', cap: null, capToast: null, dTab: 'for', dq3: '', pv: -1, added: [], range: 'week' };
  toast(key, text) {
    clearTimeout(this['t_' + key]);
    this.setState({ [key]: text });
    this['t_' + key] = setTimeout(() => this.setState({ [key]: null }), 3000);
  }
  v3() {
    const s = this.state;
    const SRC = { 'AI Studio': ['AI', '#133a35', '#5fd3c5'], YouTube: ['YT', '#27322f', '#e7eeec'], ChatGPT: ['GPT', '#1f2a28', '#cfd9d6'], Quizlet: ['Q', '#1c2540', '#8fa8f0'] };
    const star = on => ({ fill: on ? '#cfd9d6' : 'none', stroke: on ? '#cfd9d6' : '#6d7c78' });
    const kfmt = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
    const base = s.c3 || [
      ['What does PAN stand for and what is its typical range?', 'Personal Area Network — roughly 10 m, the devices around one person.'],
      ['What are common examples of a PAN?', 'Bluetooth earbuds paired to a phone, a smartwatch, USB tethering.'],
      ['What does LAN stand for and what area does it cover?', 'Local Area Network — a single home, office, building or campus.'],
      ['How do LANs typically connect devices?', 'Ethernet cables through switches, and Wi‑Fi through access points.'],
      ['What does MAN stand for and what is its typical geographic scope?', 'Metropolitan Area Network — a city or large town, roughly 5–50 km.'],
      ['Who typically owns a MAN?', 'A city government, utility or large ISP rather than a single organisation.'],
      ['What does WAN stand for and what does it span?', 'Wide Area Network — regions, countries or continents.'],
      ['What is the largest WAN in the world?', 'The internet.']
    ];
    const editing = s.e3 >= 0;
    const rows = (t, per) => Math.max(2, Math.ceil(t.length / per));
    const cards3 = base.map(([q, a], i) => {
      const isE = s.e3 === i, invalid = !s.dq.trim() || !s.da.trim();
      const done = () => {
        if (!s.dq.trim() || !s.da.trim()) return;
        const next = base.map((c, j) => j === i ? [s.dq.trim(), s.da.trim()] : c);
        this.setState({ c3: next, e3: -1 }); this.toast('toast3', 'Card saved');
      };
      const cancel = () => this.setState({ e3: -1 });
      return {
        q, a, viewing: !isE, editing: isE, open: s.o3 === i, rot: s.o3 === i ? 180 : 0,
        dim: editing && !isE ? 0.4 : 1, pe: editing && !isE ? 'none' : 'auto',
        toggle: () => this.setState({ o3: s.o3 === i ? -1 : i }),
        edit: () => this.setState({ e3: i, dq: q, da: a }),
        dq: s.dq, da: s.da, qRows: rows(s.dq, 34), aRows: rows(s.da, 38),
        setQ: e => this.setState({ dq: e.target.value }), setA: e => this.setState({ da: e.target.value }),
        keys: e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) done(); },
        invalid, doneOpacity: invalid ? 0.45 : 1,
        hint: invalid ? 'Both fields are required' : '⌘ Enter to save',
        done, cancel,
        remove: () => { const next = base.filter((_, j) => j !== i); this.setState({ c3: next, o3: -1, undo3: { card: base[i], i } }); this.toast('toast3', 'Card deleted'); }
      };
    });
    const r = s.r3;
    const stars3 = [1, 2, 3, 4, 5].map(n => ({ ...star(n <= r), label: `${n} star${n > 1 ? 's' : ''}`, set: () => this.setState({ r3: n === r ? 0 : n }) }));
    const rating3Text = s.g3 ? (r ? `Avg ${r.toFixed(1)} · 1 rating` : 'No ratings yet') : (r ? `Your rating · ${r}` : 'Tap to rate');

    const mySets = [
      ['Just 78', 'Quizlet', 40, 0, 0, false], ['How to Speak', 'YouTube', 17, 4.8, 212, true], ['Part 2 Java OCJP', 'Quizlet', 15, 0, 0, false],
      ['Xiaomi 18 Pro Max: They’ve Done It Again!', 'YouTube', 13, 3, 0, false], ['Java OOP Overview', 'ChatGPT', 12, 4.5, 64, true],
      ['WAN, LAN, PAN & MAN', 'AI Studio', 10, r, s.g3 && r ? 1 : 0, s.g3], ['Java versions overview', 'ChatGPT', 5, 4, 0, false]
    ].map(([title, source, due, avg, n, global]) => ({
      title, source, due, global, hasRating: avg > 0, avg: avg ? avg.toFixed(1) : '',
      countText: global ? (n ? ` (${kfmt(n)})` : '') : ' yours',
      abbr: SRC[source][0], tileBg: SRC[source][1], tileFg: SRC[source][2]
    }));
    const f3 = s.f3 || 'all', sort3 = s.sort3 || 'due';
    const SHOW = { all: ['All sets', () => true], due: ['Due now', x => x.due > 0], global: ['Global', x => x.global], private: ['Private', x => !x.global] };
    const recentOrder = ['WAN, LAN, PAN & MAN', 'How to Speak', 'Xiaomi 18 Pro Max: They’ve Done It Again!', 'Java OOP Overview', 'Just 78', 'Part 2 Java OCJP', 'Java versions overview'];
    const newOrder = ['WAN, LAN, PAN & MAN', 'Xiaomi 18 Pro Max: They’ve Done It Again!', 'How to Speak', 'Java versions overview', 'Java OOP Overview', 'Part 2 Java OCJP', 'Just 78'];
    const SORT = { due: ['Most due', (a, b) => b.due - a.due], recent: ['Recently opened', (a, b) => recentOrder.indexOf(a.title) - recentOrder.indexOf(b.title)],
      az: ['A–Z', (a, b) => a.title.localeCompare(b.title)], new: ['Newest', (a, b) => newOrder.indexOf(a.title) - newOrder.indexOf(b.title)] };
    const sets3 = mySets.filter(SHOW[f3][1]).sort(SORT[sort3][1]);
    const opt = (sel, select) => ({ sel, select, bg: sel ? '#1c2826' : 'transparent', border: sel ? '#34514c' : 'transparent' });
    const showOpts3 = Object.keys(SHOW).map(k => ({ label: SHOW[k][0], count: mySets.filter(SHOW[k][1]).length, ...opt(f3 === k, () => this.setState({ f3: k })) }));
    const sortOpts3 = Object.keys(SORT).map(k => ({ label: SORT[k][0], ...opt(sort3 === k, () => this.setState({ sort3: k })) }));
    const filterActive3 = f3 !== 'all';
    const capture = kind => {
      if (s.cap) return;
      this.setState({ cap: kind });
      setTimeout(() => { this.setState({ cap: null }); this.toast('capToast', kind === 'page' ? 'New set from page · 12 cards' : 'New set from answer · 8 cards'); }, 1300);
    };

    const G = [
      ['OSI model, layer by layer', 'Daniyar S.', 32, 4.9, 1204, 'AI Studio', .95, 40, 'WAN, LAN, PAN & MAN', ['What does the transport layer guarantee?', 'Which layer do routers operate on?', 'What is encapsulation?']],
      ['Subnetting in 20 cards', 'Lena W.', 20, 4.8, 864, 'ChatGPT', .9, 12, 'WAN, LAN, PAN & MAN', ['How many hosts fit in a /26?', 'What is a subnet mask for?', 'What does CIDR notation describe?']],
      ['Java Streams API essentials', 'Marco P.', 28, 4.8, 530, 'ChatGPT', .85, 5, 'Java OOP Overview', ['What is a terminal operation?', 'map vs flatMap: what’s the difference?', 'Why are streams lazy?']],
      ['TCP vs UDP', 'Aigerim T.', 14, 4.7, 402, 'YouTube', .9, 2, 'WAN, LAN, PAN & MAN', ['Which protocol guarantees delivery order?', 'Why does video streaming often use UDP?', 'What is a three-way handshake?']],
      ['Structure a talk in three parts', 'Priya N.', 18, 4.6, 311, 'YouTube', .7, 20, 'How to Speak', ['What belongs in the opening 30 seconds?', 'How do you signal a transition?', 'What makes a strong close?']],
      ['OCJP 17: tricky questions', 'Timur A.', 45, 4.4, 96, 'Quizlet', .8, 1, 'Part 2 Java OCJP', ['Does a switch on String use equals()?', 'Can a record declare instance fields?', 'What does var infer for a lambda?']]
    ].map(([title, author, cards, avg, n, source, fit, days, related, samples], i) => {
      const bayes = (20 * 4.2 + avg * n) / (20 + n);
      return { i, title, author, cards, avg: avg.toFixed(1), n, nText: kfmt(n), nFull: n.toLocaleString('en-US'), fit, days, related, samples, bayes,
        abbr: SRC[source][0], tileBg: SRC[source][1], tileFg: SRC[source][2],
        stars: [1, 2, 3, 4, 5].map(k => star(k <= Math.round(avg))),
        added: s.added.includes(i), notAdded: !s.added.includes(i),
        meta: s.dTab === 'new' ? `by ${author} · ${days === 1 ? '1 day' : days + ' days'} ago` : `by ${author} · ${cards} cards`,
        open: () => this.setState({ pv: i }) };
    });
    const dq = s.dq3.trim().toLowerCase();
    const sorter = { for: (a, b) => b.fit * b.bayes - a.fit * a.bayes, top: (a, b) => b.bayes - a.bayes, new: (a, b) => a.days - b.days }[s.dTab];
    const discList = G.filter(g => !dq || g.title.toLowerCase().includes(dq)).sort(sorter);
    const discTabs = [['for', 'For you'], ['top', 'Top rated'], ['new', 'New']].map(([k, label]) => ({ label,
      bg: s.dTab === k ? '#243230' : 'transparent', color: s.dTab === k ? '#e7eeec' : '#8b9a96', select: () => this.setState({ dTab: k }) }));

    const R = {
      week: { label: 'Last 7 days', fig: [['312', 'Reviews'], ['86%', 'Retention'], ['2h 40m', 'Studied']], title: 'Reviews per day',
        bars: [['W', 38], ['T', 52], ['F', 0], ['S', 44], ['S', 61], ['M', 70], ['Today', 47]] },
      month: { label: 'Last 30 days', fig: [['1,184', 'Reviews'], ['84%', 'Retention'], ['9h 55m', 'Studied']], title: 'Reviews per week',
        bars: [['Sep 1', 210], ['Sep 8', 260], ['Sep 15', 402], ['This wk', 312]] },
      all: { label: 'Since June 12', fig: [['2,406', 'Reviews'], ['83%', 'Retention'], ['20h 10m', 'Studied']], title: 'Reviews per month',
        bars: [['Jun', 120], ['Jul', 480], ['Aug', 620], ['Sep', 1186]] }
    }[s.range];
    const max = Math.max(...R.bars.map(b => b[1]));
    const stBars = R.bars.map(([l, v], i) => {
      const last = i === R.bars.length - 1;
      return { l, v: v || '', h: Math.max(4, Math.round(v / max * 84)), bg: last ? '#34bcad' : (v ? '#2c4a46' : '#3b4845'),
        valColor: last ? '#5fd3c5' : '#9aa9a4', labColor: last ? '#5fd3c5' : '#8b9a96', labWeight: last ? 700 : 500 };
    });

    return {
      cards3, dock3: !editing,
      recentSets3: [mySets[5], mySets[1], mySets[3]],
      toast3Undo: s.toast3 === 'Card deleted' && !!s.undo3,
      undoCard3: () => { const u = s.undo3; if (!u) return; const next = [...base]; next.splice(u.i, 0, u.card); clearTimeout(this.t_toast3); this.setState({ c3: next, undo3: null, toast3: null }); },
      tabs4: [['cards', 'Cards'], ['summary', 'Summary']].map(([k, label]) => ({ label, bg: (s.tab === k || (k === 'cards' && s.tab === 'quiz')) ? '#243230' : 'transparent', color: (s.tab === k || (k === 'cards' && s.tab === 'quiz')) ? '#e7eeec' : '#8b9a96', select: () => this.setState({ tab: k }) })), stars3, rating3Text, global3: s.g3,
      openMenu3: () => this.setState({ menu3: true }), closeMenu3: () => this.setState({ menu3: false }),
      globalLabel3: s.g3 ? 'Make private' : 'Make it global',
      globalDesc3: s.g3 ? 'Remove from Discover. Existing copies stay.' : 'Share this set in Discover',
      globalAction3: () => {
        if (s.g3) { this.setState({ g3: false, menu3: false }); this.toast('toast3', 'Set is private again'); }
        else this.setState({ menu3: false, confirm3: true });
      },
      confirm3: s.confirm3, closeConfirm3: () => this.setState({ confirm3: false }),
      confirmGlobal3: () => { this.setState({ g3: true, confirm3: false }); this.toast('toast3', 'Now in Discover'); },
      toast3On: !!s.toast3, toast3: s.toast3,
      showOpts3, sortOpts3, filterActive3, filterLabel3: SHOW[f3][0], sortLabel3: SORT[sort3][0],
      filterBorder3: filterActive3 ? '#34514c' : '#222c2a', filterColor3: filterActive3 ? '#5fd3c5' : '#cfd9d6',
      filterOpen3: !!s.fs3, openFilter3: () => this.setState({ fs3: true }), closeFilter3: () => this.setState({ fs3: false }),
      clearFilter3: () => this.setState({ f3: 'all' }),
      applyLabel3: `Show ${sets3.length} ${sets3.length === 1 ? 'set' : 'sets'}`,
      sets3, sets3Count: `${sets3.length} ${sets3.length === 1 ? 'set' : 'sets'}`,
      capPage: () => capture('page'), capAnswer: () => capture('answer'),
      capPageLabel: s.cap === 'page' ? 'Capturing…' : 'Capture page',
      capAnswerLabel: s.cap === 'answer' ? 'Capturing…' : 'Capture answer',
      capToastOn: !!s.capToast, capToast: s.capToast,
      discQuery: s.dq3, setDiscQuery: e => this.setState({ dq3: e.target.value }),
      discTabs, discList, discEmpty: discList.length === 0,
      previewOn: s.pv >= 0, pv: G[Math.max(0, s.pv)], closePreview: () => this.setState({ pv: -1 }),
      addPreview: () => this.setState({ added: [...s.added, s.pv] }),
      stTabs: [['week', 'Week'], ['month', 'Month'], ['all', 'All time']].map(([k, label]) => ({ label,
        bg: s.range === k ? '#243230' : 'transparent', color: s.range === k ? '#e7eeec' : '#8b9a96', select: () => this.setState({ range: k }) })),
      stRangeLabel: R.label, stFigures: R.fig.map(([v, l], i) => ({ v, l, border: i ? '#222c2a' : 'transparent' })),
      stChartTitle: R.title, stBars
    };
  }
  componentWillUnmount() { clearTimeout(this.t); }
  v2() {
    const s = this.state;
    const src = {
      'AI Studio': ['AI', '#133a35', '#5fd3c5'], YouTube: ['YT', '#27322f', '#e7eeec'],
      ChatGPT: ['GPT', '#1f2a28', '#cfd9d6'], Quizlet: ['Q', '#1c2540', '#8fa8f0']
    };
    const sets = [
      ['Just 78', 'Quizlet', 40], ['How to Speak', 'YouTube', 17], ['Part 2 Java OCJP', 'Quizlet', 15],
      ['Xiaomi 18 Pro Max: They’ve Done It Again!', 'YouTube', 13], ['Java OOP Overview', 'ChatGPT', 12],
      ['WAN, LAN, PAN & MAN', 'AI Studio', 10], ['Java versions overview', 'ChatGPT', 5]
    ].map(([title, source, due]) => ({ title, source, due, abbr: src[source][0], tileBg: src[source][1], tileFg: src[source][2] }));
    const q = s.query.trim().toLowerCase();
    const filteredSets = sets.filter(x => (s.chip === 'All' || x.source === s.chip) && (!q || x.title.toLowerCase().includes(q)));
    const chips = ['All', 'AI Studio', 'YouTube', 'ChatGPT', 'Quizlet'].map(label => {
      const on = s.chip === label;
      return { label, bg: on ? '#e7eeec' : 'transparent', color: on ? '#0e1513' : '#cfd9d6', border: on ? '#e7eeec' : '#27322f',
        select: () => this.setState({ chip: label }) };
    });
    const days = ['W', 'T', 'F', 'S', 'S', 'M', 'Today'];
    const week = days.map((l, i) => {
      const today = i === 6;
      return { l, ring: today ? '#34bcad' : '#27322f', fill: 'transparent', color: today ? '#5fd3c5' : '#8b9a96', weight: today ? 700 : 500 };
    });
    const fq = ['Does cold weather directly cause colds?', 'What factors increase exposure to cold viruses?', 'What is the primary cause of influenza?'];
    const fading = fq.map((q, i) => ({ q, border: i === fq.length - 1 ? 'transparent' : '#1e2826' }));
    const all = [
      ['What does PAN stand for and what is its typical range?', 'Personal Area Network — roughly 10 m, the devices around one person.'],
      ['What are common examples of a PAN?', 'Bluetooth earbuds paired to a phone, a smartwatch, USB tethering.'],
      ['What does LAN stand for and what area does it cover?', 'Local Area Network — a single home, office, building or campus.'],
      ['How do LANs typically connect devices?', 'Ethernet cables through switches, and Wi‑Fi through access points.'],
      ['What does MAN stand for and what is its typical geographic scope?', 'Metropolitan Area Network — a city or large town, roughly 5–50 km.'],
      ['Who typically owns a MAN?', 'A city government, utility or large ISP rather than a single organisation.'],
      ['What does WAN stand for and what does it span?', 'Wide Area Network — regions, countries or continents.'],
      ['What is the largest WAN in the world?', 'The internet.'],
      ['How do WANs connect across large distances?', 'Leased lines, fibre backbones, MPLS and satellite links.'],
      ['Which network type generally has the highest data speed and lowest setup cost?', 'LAN — short distances, cheap hardware, gigabit speeds.']
    ];
    const d2cards = all.map((c, i) => ({ c, i })).filter(x => !s.removed.includes(x.i)).map(({ c, i }) => ({
      q: c[0], a: c[1], open: s.open2 === i, rot: s.open2 === i ? 180 : 0,
      toggle: () => this.setState({ open2: s.open2 === i ? -1 : i }),
      remove: () => {
        clearTimeout(this.t);
        this.setState({ removed: [...s.removed, i], lastRemoved: i, open2: -1 });
        this.t = setTimeout(() => this.setState({ lastRemoved: null }), 4000);
      }
    }));
    const n = d2cards.length;
    const M = {
      flash: ['Flashcards', 'Flip and grade yourself', `Review ${n} cards`, '~5 min'],
      type: ['Type answers', 'Write from memory, checked for you', `Type ${n} answers`, '~8 min'],
      teach: ['Teach it back', 'Explain the topic in your own words', 'Teach it back', '~5 min'],
      quiz: ['Quiz', `${n} multiple-choice questions`, 'Start quiz', `${n} questions`]
    };
    const ICON = {
      flash: 'M8 4h11a1 1 0 011 1v12M4 8h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z',
      type: 'M3 7a1 1 0 011-1h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1zM7 10h.01M11 10h.01M15 10h.01M8 14h8',
      teach: 'M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4',
      quiz: 'M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17'
    };
    const modes = Object.keys(M).map(k => ({ name: M[k][0], desc: M[k][1], sel: s.mode === k, icon: ICON[k],
      tileBg: s.mode === k ? '#34bcad' : '#1c2826', tileFg: s.mode === k ? '#04211d' : '#5fd3c5',
      bg: s.mode === k ? '#1c2826' : 'transparent', border: s.mode === k ? '#34514c' : 'transparent',
      select: () => this.setState({ mode: k, modes: false }) }));
    return {
      week, fading, recentSets: [sets[5], sets[1], sets[3]],
      query: s.query, setQuery: e => this.setState({ query: e.target.value }),
      chips, filteredSets, noSets: filteredSets.length === 0,
      setsCountLabel: `${filteredSets.length} ${filteredSets.length === 1 ? 'set' : 'sets'}`,
      d2cards, d2count: n, d2cta: M[s.mode][2], d2meta: M[s.mode][3], d2modeName: M[s.mode][0],
      modes, modesOpen: s.modes, toggleModes: () => this.setState({ modes: !s.modes }), popZ: s.modes ? 6 : 1, popRot: s.modes ? 180 : 0, chevBg: s.modes ? '#2aa396' : '#34bcad', openModes: () => this.setState({ modes: true }), closeModes: () => this.setState({ modes: false }),
      toastOn: s.lastRemoved !== null,
      undoDelete: () => { clearTimeout(this.t); this.setState({ removed: s.removed.filter(x => x !== s.lastRemoved), lastRemoved: null }); },
      homeMarkers: [{ n: 1, x: 306, y: 22 }, { n: 2, x: 352, y: 82 }, { n: 3, x: 352, y: 262 }, { n: 4, x: 352, y: 393 }, { n: 5, x: 352, y: 522 }, { n: 6, x: 352, y: 642 }],
      setsMarkers: [{ n: 1, x: -13, y: 72 }, { n: 2, x: -13, y: 245 }, { n: 3, x: 190, y: 15 }, { n: 4, x: -13, y: 480 }, { n: 5, x: 372, y: 178 }],
      detailMarkers: [{ n: 1, x: 282, y: 269 }, { n: 2, x: -13, y: 690 }, { n: 3, x: -13, y: 790 }],
      homeNotes: [
        { n: 1, t: 'A zero streak shown as a badge', p: 'The flame reads as an achievement even at 0, and the week grid below repeats it.', f: 'One week strip that carries the streak and marks today.' },
        { n: 2, t: '201 cards · ~80 min is overwhelming', p: 'Nobody does 80 minutes, and the number doesn’t say what’s enough for today.', f: 'The hero shows today’s goal from the exam plan (40 cards · ~15 min). The full backlog is a secondary “Review all”.' },
        { n: 3, t: 'Exam prep is half form, half link', p: 'A raw ISO date field, a chevron, and “Set a date…” copy even after the date is set.', f: 'Once set, it’s a status: date, days left, readiness. Edit opens the form.' },
        { n: 4, t: 'Week grid without meaning', p: 'Seven empty boxes, an unlabeled amber “today”, and “0 of 7 days”.', f: 'Day circles with today labelled; studied days fill in.' },
        { n: 5, t: 'Stats with no signal', p: '0 mastered and 0% progress say the same thing; “19 sets” is navigation.', f: 'Removed. Readiness lives on the exam card.' },
        { n: 6, t: 'Truncated “Needs work” rows', p: 'Questions are cut mid-word and every row repeats the same “Forget soon” pill.', f: '“Fading soon” header with one “Review 3” action; questions wrap to two lines.' },
        { n: 7, t: 'Home repeats the Sets tab', p: 'Full set cards with raw titles and empty progress bars, then “View all 19 sets”.', f: 'Three compact “Continue” rows and a link to all sets.' }
      ],
      setsNotes: [
        { n: 1, t: 'Raw chat title', p: 'The same “User 9:59 AM…” leak as the set page.', f: 'Clean titles generated at import.' },
        { n: 2, t: 'Empty bars on every card', p: '“0% mastered” and an empty bar, repeated on every set, carry no information.', f: '“Not started” in the meta line; a bar appears only once there’s progress.' },
        { n: 3, t: 'No way to find a set', p: '19 sets with no search, filter or sort.', f: 'Search, source filter chips, sorted by most due. Try them.' },
        { n: 4, t: 'Low density', p: '~105 px per card, so only 7 sets fit; the source is tucked in a corner.', f: '68 px rows with a source tile; the due count is right-aligned so it’s easy to scan.' },
        { n: 5, t: 'Unexplained teal outline', p: '“How to Speak” is highlighted with no visible reason (focus? last opened?).', f: 'No persistent highlight. Recency lives in Home’s “Continue”.' }
      ],
      detailNotes: [
        { n: 1, t: 'Hover-only edit and delete', p: 'The icons only show on hover, so touch users never see them, and delete sits next to edit with no confirmation.', f: 'Open a card to Edit or Delete; delete shows Undo. Try it.' },
        { n: 2, t: 'Four equal-weight buttons', p: 'Study modes (Teach it back, Type answers) are mixed with editing (+ Card), all with emoji.', f: 'Modes move into a split menu on the primary button; “Add card” moves to the list header.' },
        { n: 3, t: 'Main action at the very end', p: '“Review 10 due” only appears after scrolling past every card, while the tab bar has a second play button.', f: 'Primary button near the top that remembers the last mode used.' }
      ]
    };
  }
  renderVals() {
    const s = this.state;
    const cards = [
      ['What does PAN stand for and what is its typical range?', 'Personal Area Network — roughly 10 m, the devices around one person.'],
      ['What are common examples of a PAN?', 'Bluetooth earbuds paired to a phone, a smartwatch, USB tethering.'],
      ['What does LAN stand for and what area does it cover?', 'Local Area Network — a single home, office, building or campus.'],
      ['How do LANs typically connect devices?', 'Ethernet cables through switches, and Wi‑Fi through access points.'],
      ['What does MAN stand for and what is its typical geographic scope?', 'Metropolitan Area Network — a city or large town, roughly 5–50 km.'],
      ['What is a common example of a MAN?', 'A city fibre ring linking university campuses or municipal offices.'],
      ['What does WAN stand for?', 'Wide Area Network — spans regions, countries or continents.'],
      ['What is the largest example of a WAN?', 'The internet.'],
      ['Which technologies are used to build WANs?', 'Leased lines, MPLS, fibre backbones, satellite links, SD‑WAN.'],
      ['Order the four types from smallest to largest range.', 'PAN → LAN → MAN → WAN.']
    ].map(([q, a], i) => ({ q, a, open: s.open === i, rot: s.open === i ? 180 : 0,
      toggle: () => this.setState({ open: s.open === i ? -1 : i }) }));
    const tabs = [['cards', 'Cards'], ['quiz', 'Quiz'], ['summary', 'Summary']].map(([k, label]) => ({
      label, bg: s.tab === k ? '#243230' : 'transparent', color: s.tab === k ? '#e7eeec' : '#8b9a96',
      select: () => this.setState({ tab: k }) }));
    const cta = { cards: ['Review 10 cards', '~5 min'], quiz: ['Start quiz', '10 questions'], summary: ['Review 10 cards', '~5 min'] }[s.tab];
    return {
      ...this.v2(),
      ...this.v3(),
      cards, tabs,
      isCards: s.tab === 'cards', isQuiz: s.tab === 'quiz', isSummary: s.tab === 'summary',
      ctaLabel: cta[0], ctaMeta: cta[1],
      examTitle: s.exam ? 'Exam · Mon, Oct 12' : 'Add an exam date',
      examSub: s.exam ? '13 days left · 1 new card a day' : 'Get a countdown and a daily target',
      examAction: s.exam ? 'Edit' : 'Add',
      toggleExam: () => this.setState({ exam: !s.exam }),
      sheetOpen: s.sheet,
      openSheet: () => this.setState({ sheet: true }),
      closeSheet: () => this.setState({ sheet: false }),
      stop: e => e.stopPropagation(),
      showMarkers: this.props.showMarkers ?? true,
      summary: [
        { k: 'PAN', range: '~10 m · one person', eg: 'Bluetooth earbuds, smartwatch' },
        { k: 'LAN', range: 'Building or campus', eg: 'Office Ethernet, home Wi‑Fi' },
        { k: 'MAN', range: 'City · 5–50 km', eg: 'Municipal fibre ring' },
        { k: 'WAN', range: 'Countries, continents', eg: 'The internet, corporate MPLS' }
      ],
      markers: [
        { n: 1, x: 350, y: 86 }, { n: 2, x: 350, y: 166 }, { n: 3, x: 350, y: 292 },
        { n: 4, x: 350, y: 452 }, { n: 5, x: 240, y: 818 }, { n: 6, x: 350, y: 585 }, { n: 7, x: 350, y: 233 }
      ],
      notes: [
        { n: 1, t: 'Title is raw chat metadata', p: '"User 9:59 AM" is part of the heading; the prompt is the title.', f: 'Short set name, one-line description, source and date in a meta row.' },
        { n: 2, t: 'Progress shown twice', p: '"0% mastered · 0 of 10" and three stat tiles describe the same 10 cards in two big blocks.', f: 'One segmented bar with New / Learning / Mastered counts in the legend.' },
        { n: 3, t: 'Tip sends you elsewhere', p: '"Set an exam date on Home…" is a paragraph of navigation instructions.', f: 'An inline "Add an exam date" row that works here, then shows the countdown.' },
        { n: 4, t: 'Permanent help text', p: 'The learning-state rules take up space on every visit, though you only need them once.', f: 'Moved to a "How it works" sheet next to the progress bar.' },
        { n: 5, t: 'No labelled primary action', p: 'Starting a review depends on an unlabelled play button in the tab bar.', f: 'A full-width "Review 10 cards · ~5 min" button above the fold. The nav slot becomes a labelled global Review tab.' },
        { n: 6, t: 'Repetitive, low-contrast rows', p: '"Due now" repeats on all 10 rows in grey that\'s hard to read; rows lead nowhere.', f: 'One "Due now · 10" group header. Tapping a row shows the answer.' },
        { n: 7, t: 'Tabs split related content', p: 'The mode switch sits between progress and its own stats, so it\'s unclear what it controls.', f: 'Tabs sit directly above the content they switch; the CTA follows the active tab.' }
      ]
    };
  }
}
