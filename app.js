(function () {
  'use strict';
  var DAY = 86400;
  var SITE = 'https://vtg0989-sudo.github.io/hodl-hindsight/';
  // bs: Bitstamp pair and first daily candle; cb: Coinbase product and first daily candle.
  var COINS = [
    { id: 'btc', sym: 'BTC', name: 'Bitcoin', bs: 'btcusd', bsFrom: '2011-08-18', cb: 'BTC-USD', cbFrom: '2015-07-20' },
    { id: 'xrp', sym: 'XRP', name: 'XRP', bs: 'xrpusd', bsFrom: '2016-12-16', cb: 'XRP-USD', cbFrom: '2019-02-26' },
    { id: 'eth', sym: 'ETH', name: 'Ethereum', bs: 'ethusd', bsFrom: '2017-08-16', cb: 'ETH-USD', cbFrom: '2016-05-18' },
    { id: 'sol', sym: 'SOL', name: 'Solana', bs: 'solusd', bsFrom: '2022-08-18', cb: 'SOL-USD', cbFrom: '2021-06-17' },
    { id: 'doge', sym: 'DOGE', name: 'Dogecoin', bs: 'dogeusd', bsFrom: '2022-12-21', cb: 'DOGE-USD', cbFrom: '2021-06-03' },
    { id: 'ada', sym: 'ADA', name: 'Cardano', bs: 'adausd', bsFrom: '2021-11-17', cb: 'ADA-USD', cbFrom: '2021-03-18' },
    { id: 'ltc', sym: 'LTC', name: 'Litecoin', bs: 'ltcusd', bsFrom: '2017-06-16', cb: 'LTC-USD', cbFrom: '2016-08-17' },
    { id: 'link', sym: 'LINK', name: 'Chainlink', bs: 'linkusd', bsFrom: '2020-10-19', cb: 'LINK-USD', cbFrom: '2019-06-27' },
    { id: 'xlm', sym: 'XLM', name: 'Stellar', bs: 'xlmusd', bsFrom: '2020-05-28' },
    { id: 'hbar', sym: 'HBAR', name: 'Hedera', bs: 'hbarusd', bsFrom: '2021-10-07' },
    { id: 'shib', sym: 'SHIB', name: 'Shiba Inu', bs: 'shibusd', bsFrom: '2021-12-07' },
    { id: 'avax', sym: 'AVAX', name: 'Avalanche', bs: 'avaxusd', bsFrom: '2022-03-08' },
    { id: 'sui', sym: 'SUI', name: 'Sui', bs: 'suiusd', bsFrom: '2023-05-05' },
    { id: 'pepe', sym: 'PEPE', name: 'Pepe', bs: 'pepeusd', bsFrom: '2024-02-07' }
  ];
  COINS.forEach(function (c) { c.from = c.cbFrom && c.cbFrom < c.bsFrom ? c.cbFrom : c.bsFrom; });
  var byId = {}; COINS.forEach(function (c) { byId[c.id] = c; });

  var $ = function (id) { return document.getElementById(id); };
  var el = { coin: $('coin'), amount: $('amount'), date: $('date'), freq: $('freq'), form: $('form'), status: $('status'), out: $('out') };
  var mode = 'lump';
  var cache = {};

  // ---------- dates ----------
  function toTs(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 1000; }
  function toIso(ts) { return new Date(ts * 1000).toISOString().slice(0, 10); }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function fmtDate(iso) { return new Date(toTs(iso) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
  function yearsAgo(n) { var d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); }

  // ---------- money ----------
  function usd(v) {
    var a = Math.abs(v), opts = { style: 'currency', currency: 'USD' };
    if (a >= 1e6) { opts.maximumFractionDigits = 0; }
    else if (a >= 100) { opts.maximumFractionDigits = 0; }
    else if (a >= 1) { opts.minimumFractionDigits = 2; opts.maximumFractionDigits = 2; }
    else if (a >= 0.01) { opts.maximumFractionDigits = 4; }
    else { opts.maximumSignificantDigits = 3; }
    return v.toLocaleString('en-US', opts);
  }
  function qty(v) {
    if (v >= 1000) return Math.round(v).toLocaleString('en-US');
    if (v >= 1) return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
    return v.toLocaleString('en-US', { maximumSignificantDigits: 4 });
  }
  function pct(v) { return (v >= 0 ? '+' : '') + v.toLocaleString('en-US', { maximumFractionDigits: v > 1000 || v < -1000 ? 0 : 1 }) + '%'; }

  // ---------- data ----------
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function bitstampRange(c, from, to) {
    var out = {}, start = from, reqs = [];
    while (start <= to) { reqs.push(start); start += 1000 * DAY; }
    return Promise.all(reqs.map(function (s) {
      return getJson('https://www.bitstamp.net/api/v2/ohlc/' + c.bs + '/?step=86400&limit=1000&start=' + s).then(function (j) {
        (j.data && j.data.ohlc || []).forEach(function (k) { var t = +k.timestamp; if (t >= from && t <= to) out[t] = +k.close; });
      });
    })).then(function () { return out; });
  }
  function coinbaseRange(c, from, to) {
    var out = {}, chunks = [], s = from;
    while (s <= to) { var e = Math.min(s + 299 * DAY, to); chunks.push([s, e]); s = e + DAY; }
    // Sequential to stay under Coinbase's public rate limit.
    return chunks.reduce(function (p, ch) {
      return p.then(function () {
        return getJson('https://api.exchange.coinbase.com/products/' + c.cb + '/candles?granularity=86400&start=' + toIso(ch[0]) + 'T00:00:00Z&end=' + toIso(ch[1]) + 'T00:00:00Z')
          .then(function (rows) { rows.forEach(function (k) { out[k[0]] = +k[4]; }); });
      });
    }, Promise.resolve()).then(function () { return out; });
  }
  function series(c) {
    if (cache[c.id]) return cache[c.id];
    var from = toTs(c.from), to = toTs(todayIso()), bsFrom = toTs(c.bsFrom);
    var jobs = [bitstampRange(c, bsFrom, to)];
    if (c.cb && from < bsFrom) jobs.push(coinbaseRange(c, from, bsFrom - DAY));
    cache[c.id] = Promise.all(jobs).then(function (parts) {
      var map = parts[1] || {};
      Object.keys(parts[0]).forEach(function (k) { map[k] = parts[0][k]; });
      var days = Object.keys(map).map(Number).sort(function (a, b) { return a - b; });
      if (!days.length) throw new Error('no data');
      return { days: days, close: days.map(function (d) { return map[d]; }) };
    }).catch(function (e) {
      // Bitstamp failed outright: try Coinbase for the whole range.
      if (!c.cb) throw e;
      return coinbaseRange(c, toTs(c.cbFrom), to).then(function (map) {
        var days = Object.keys(map).map(Number).sort(function (a, b) { return a - b; });
        if (!days.length) throw e;
        return { days: days, close: days.map(function (d) { return map[d]; }) };
      });
    });
    cache[c.id].catch(function () { delete cache[c.id]; });
    return cache[c.id];
  }
  function livePrice(c) {
    return getJson('https://www.bitstamp.net/api/v2/ticker/' + c.bs + '/').then(function (j) { return +j.last; })
      .catch(function () { return c.cb ? getJson('https://api.exchange.coinbase.com/products/' + c.cb + '/ticker').then(function (j) { return +j.price; }) : null; })
      .catch(function () { return null; });
  }
  function indexOnOrAfter(days, ts) {
    var lo = 0, hi = days.length - 1, ans = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (days[mid] >= ts) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
    return ans;
  }

  // ---------- calculations ----------
  function calcLump(s, amount, startTs, now) {
    var i = indexOnOrAfter(s.days, startTs);
    if (i < 0) return null;
    var buy = s.close[i], units = amount / buy;
    var pts = [], peak = { v: 0, d: 0 };
    for (var k = i; k < s.days.length; k++) {
      var v = units * s.close[k];
      pts.push([s.days[k], v, amount]);
      if (v > peak.v) peak = { v: v, d: s.days[k] };
    }
    var value = units * now;
    return { buyDay: s.days[i], buy: buy, units: units, value: value, invested: amount, pts: pts, peak: peak };
  }
  function buyDates(startTs, endTs, freq) {
    var out = [];
    if (freq === 'm') {
      var d = new Date(startTs * 1000), y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
      for (var n = 0; ; n++) {
        var mm = m + n, yy = y + Math.floor(mm / 12); mm = mm % 12;
        var last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
        var t = Date.UTC(yy, mm, Math.min(day, last)) / 1000;
        if (t > endTs) break; out.push(t);
      }
    } else {
      for (var t2 = startTs; t2 <= endTs; t2 += (+freq) * DAY) out.push(t2);
    }
    return out;
  }
  function calcDca(s, amount, startTs, freq, now) {
    var first = indexOnOrAfter(s.days, startTs);
    if (first < 0) return null;
    var dates = buyDates(s.days[first], s.days[s.days.length - 1], freq);
    var buys = {}; // day index -> dollars
    dates.forEach(function (t) { var i = indexOnOrAfter(s.days, t); if (i >= 0) buys[i] = (buys[i] || 0) + amount; });
    var units = 0, invested = 0, pts = [], n = 0;
    for (var k = first; k < s.days.length; k++) {
      if (buys[k]) { units += buys[k] / s.close[k]; invested += buys[k]; n += buys[k] / amount; }
      pts.push([s.days[k], units * s.close[k], invested]);
    }
    return { units: units, invested: invested, value: units * now, avg: invested / units, buys: n, pts: pts, firstDay: s.days[first] };
  }

  // ---------- chart ----------
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function drawChart(pts, showInvested) {
    var cv = $('chart'), ctx = cv.getContext('2d');
    var w = cv.clientWidth, h = 260, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    if (pts.length < 2) return;
    // Thin very long series for drawing speed.
    var step = Math.max(1, Math.floor(pts.length / 900)), p = [];
    for (var i = 0; i < pts.length; i += step) p.push(pts[i]);
    if (p[p.length - 1] !== pts[pts.length - 1]) p.push(pts[pts.length - 1]);
    var padL = 64, padR = 12, padT = 12, padB = 26, W = w - padL - padR, H = h - padT - padB;
    var x0 = p[0][0], x1 = p[p.length - 1][0];
    var yMax = 0; p.forEach(function (q) { yMax = Math.max(yMax, q[1], showInvested ? q[2] : 0); });
    var mag = Math.pow(10, Math.floor(Math.log10(yMax || 1))), nice = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; });
    var tick = nice.find(function (t) { return yMax / t <= 5; }) || nice[4]; var top = Math.ceil(yMax / tick) * tick || 1;
    var X = function (t) { return padL + (t - x0) / (x1 - x0 || 1) * W; }, Y = function (v) { return padT + H - v / top * H; };
    var fg = css('--muted'), line = css('--line'), acc = css('--accent');
    ctx.font = '12px ' + css('--mono'); ctx.fillStyle = fg; ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var v = 0; v <= top + 1e-9; v += tick) {
      var y = Math.round(Y(v)) + .5; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(short(v), padL - 8, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var y0 = new Date(x0 * 1000).getUTCFullYear(), y1 = new Date(x1 * 1000).getUTCFullYear(), every = Math.max(1, Math.ceil((y1 - y0 + 1) / 7));
    if (y1 - y0 >= 1) {
      for (var yr = y0 + 1; yr <= y1; yr += every) { var t = Date.UTC(yr, 0, 1) / 1000; ctx.fillText(String(yr), X(t), h - padB + 8); }
    } else { ctx.fillText(fmtDate(toIso(x0)), padL + 40, h - padB + 8); ctx.fillText(fmtDate(toIso(x1)), w - padR - 40, h - padB + 8); }
    // value area
    ctx.beginPath(); ctx.moveTo(X(p[0][0]), Y(0));
    p.forEach(function (q) { ctx.lineTo(X(q[0]), Y(q[1])); });
    ctx.lineTo(X(p[p.length - 1][0]), Y(0)); ctx.closePath();
    ctx.globalAlpha = .12; ctx.fillStyle = acc; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); p.forEach(function (q, k) { ctx[k ? 'lineTo' : 'moveTo'](X(q[0]), Y(q[1])); });
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
    // invested line
    ctx.beginPath(); p.forEach(function (q, k) { ctx[k ? 'lineTo' : 'moveTo'](X(q[0]), Y(q[2])); });
    ctx.setLineDash([5, 4]); ctx.strokeStyle = css('--fg'); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    var last = p[p.length - 1]; ctx.beginPath(); ctx.arc(X(last[0]), Y(last[1]), 4, 0, 7); ctx.fillStyle = acc; ctx.fill();
    $('legend').innerHTML = '<span><i style="background:' + acc + '"></i>Value</span><span><i style="background:' + css('--fg') + '"></i>' + (showInvested ? 'Total invested' : 'Amount invested') + '</span>';
  }
  function short(v) {
    if (v >= 1e9) return '$' + +(v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return '$' + +(v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + +(v / 1e3).toFixed(1) + 'k';
    return '$' + +v.toFixed(v < 10 ? 2 : 0);
  }

  // ---------- UI ----------
  COINS.forEach(function (c) { var o = document.createElement('option'); o.value = c.id; o.textContent = c.name + ' (' + c.sym + ')'; el.coin.appendChild(o); });
  function setLimits() {
    var c = byId[el.coin.value]; el.date.min = c.from; el.date.max = todayIso();
    $('date-hint').textContent = 'Price data for ' + c.sym + ' starts ' + fmtDate(c.from) + '.';
  }
  function setMode(m) {
    mode = m === 'dca' ? 'dca' : 'lump';
    $('tab-lump').setAttribute('aria-selected', mode === 'lump'); $('tab-dca').setAttribute('aria-selected', mode === 'dca');
    $('freq-field').hidden = mode !== 'dca';
    $('amount-label').textContent = mode === 'dca' ? 'Amount per buy (USD)' : 'Amount invested (USD)';
    $('date-label').textContent = mode === 'dca' ? 'Start buying on' : 'Date you bought';
    $('headline').textContent = mode === 'dca' ? 'If you’d stacked a little every month, where would you be now?' : 'If you’d bought back then, what would it be worth today?';
    if (mode === 'dca' && +el.amount.value === 1000) el.amount.value = 100;
    if (mode === 'lump' && +el.amount.value === 100) el.amount.value = 1000;
  }
  function stat(label, value) { return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>'; }
  var lastShare = '';

  function run() {
    var c = byId[el.coin.value], amount = parseFloat(el.amount.value), date = el.date.value;
    if (!(amount > 0)) { showErr('Enter an amount above $0.'); return; }
    if (!date) { showErr('Pick a date.'); return; }
    if (date < c.from) { date = c.from; el.date.value = date; }
    if (date > todayIso()) { showErr('Pick a date in the past.'); return; }
    el.status.className = 'status'; el.status.textContent = 'Fetching ' + c.name + ' price history…'; el.status.hidden = false;
    var state = { coin: c.id, amt: amount, date: date, mode: mode, freq: el.freq.value };
    try { history.replaceState(null, '', '?' + new URLSearchParams(state).toString() + '#' + mode); } catch (e) {}
    Promise.all([series(c), livePrice(c)]).then(function (r) {
      var s = r[0], now = r[1] || s.close[s.close.length - 1];
      if (mode === 'lump') renderLump(c, amount, calcLump(s, amount, toTs(date), now), now);
      else renderDca(c, amount, calcDca(s, amount, toTs(date), el.freq.value, now), now);
    }).catch(function () { showErr('Couldn’t load price data right now. Check your connection and try again in a minute.'); });
  }
  function showErr(msg) { el.out.hidden = true; el.status.hidden = false; el.status.className = 'status err'; el.status.textContent = msg; }
  function deltaLine(value, invested) {
    var d = value - invested, p = d / invested * 100, node = $('delta');
    node.className = 'delta ' + (d >= 0 ? 'up' : 'down');
    node.textContent = (d >= 0 ? '+' : '−') + usd(Math.abs(d)) + '  (' + pct(p) + ')';
    return p;
  }
  function renderLump(c, amount, r, now) {
    if (!r) { showErr('No price data for that date.'); return; }
    el.status.hidden = true; el.out.hidden = false;
    var day = toIso(r.buyDay);
    $('say').innerHTML = '<b>' + usd(amount) + '</b> of <b>' + c.name + '</b> bought on <b>' + fmtDate(day) + '</b> would be worth';
    $('big').textContent = usd(r.value);
    var p = deltaLine(r.value, amount), mult = r.value / amount;
    $('stats').innerHTML = stat('Coins bought', qty(r.units) + ' ' + c.sym) + stat('Price then', usd(r.buy)) + stat('Price now', usd(now)) +
      stat('Multiple', mult.toLocaleString('en-US', { maximumFractionDigits: mult < 10 ? 2 : 0 }) + 'x') +
      stat('Peak value', usd(r.peak.v) + ' on ' + fmtDate(toIso(r.peak.d)));
    drawChart(r.pts, false);
    lastShare = 'If I’d put ' + usd(amount) + ' into $' + c.sym + ' on ' + fmtDate(day) + ', it’d be worth ' + usd(r.value) + ' today (' + pct(p) + ').';
    setShare();
  }
  function renderDca(c, amount, r, now) {
    if (!r) { showErr('No price data for that date.'); return; }
    el.status.hidden = true; el.out.hidden = false;
    var f = { '1': 'every day', '7': 'every week', '14': 'every 2 weeks', 'm': 'every month' }[el.freq.value];
    $('say').innerHTML = 'Buying <b>' + usd(amount) + '</b> of <b>' + c.name + '</b> ' + f + ' since <b>' + fmtDate(toIso(r.firstDay)) + '</b> would be worth';
    $('big').textContent = usd(r.value);
    var p = deltaLine(r.value, r.invested);
    $('stats').innerHTML = stat('Total invested', usd(r.invested)) + stat('Number of buys', Math.round(r.buys).toLocaleString('en-US')) +
      stat('Coins stacked', qty(r.units) + ' ' + c.sym) + stat('Average cost', usd(r.avg)) + stat('Price now', usd(now));
    drawChart(r.pts, true);
    lastShare = 'Buying ' + usd(amount) + ' of $' + c.sym + ' ' + f + ' since ' + fmtDate(toIso(r.firstDay)) + ': ' + usd(r.invested) + ' in, ' + usd(r.value) + ' now (' + pct(p) + ').';
    setShare();
  }
  function setShare() {
    var link = SITE + location.search + '#' + mode;
    $('share-x').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(lastShare + '\n\nRun your own numbers:') + '&url=' + encodeURIComponent(link);
  }
  $('copy').addEventListener('click', function () {
    var b = this, text = lastShare + ' ' + SITE + location.search + '#' + mode;
    var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy result'; }, 1500); };
    try { navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this:', text); }); } catch (e) { window.prompt('Copy this:', text); }
  });
  document.querySelectorAll('.presets button').forEach(function (b) {
    b.addEventListener('click', function () {
      var c = byId[el.coin.value], a = b.getAttribute('data-ago');
      var d = a === 'max' ? c.from : yearsAgo(+a); el.date.value = d < c.from ? c.from : d; run();
    });
  });
  el.coin.addEventListener('change', function () { setLimits(); if (el.date.value < byId[el.coin.value].from) el.date.value = byId[el.coin.value].from; run(); });
  el.freq.addEventListener('change', run);
  el.form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
  window.addEventListener('hashchange', function () { setMode(location.hash.slice(1)); run(); });
  var resizeT, lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return; lastW = window.innerWidth;
    clearTimeout(resizeT); resizeT = setTimeout(function () { if (!el.out.hidden) run(); }, 250);
  });

  // Start in a filled-in state, honoring a shared link.
  var q = new URLSearchParams(location.search);
  el.coin.value = byId[q.get('coin')] ? q.get('coin') : 'xrp';
  setLimits();
  setMode(location.hash.slice(1) || q.get('mode') || 'lump');
  if (q.get('amt')) el.amount.value = q.get('amt');
  if (q.get('freq')) el.freq.value = q.get('freq');
  el.date.value = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : (mode === 'dca' ? yearsAgo(3) : '2020-01-01');
  run();
})();
