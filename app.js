/* ===========================================================
   减脂 Tracker - 全部本地存储 (localStorage)
   =========================================================== */

const STORAGE_KEY = 'fatloss-tracker-v1';

const defaultState = {
  profile: {
    sex: 'male',
    age: 25,
    height: 176,
    activity: 1.725,
  },
  goal: {
    startWeight: null,
    goalWeight: null,
    goalDate: null,
    kcalTarget: null,
    proteinTarget: null,
    carbsTarget: null,
    fatTarget: null,
  },
  weights: [],          // [{date, kg}]
  foods: [],            // [{date, name, meal, kcal, p, c, f}]
  exercises: [],        // [{date, type, duration, kcal, note, source}]
  bodyMeasurements: [], // [{date, waist, hip, chest, arm, thigh, bodyfat}]
  photos: [],           // [{date, dataUrl, note}]
  weightRange: 30,
  exerciseRange: 30,
  onboarded: false,
};

let state = loadState();

/* ============== Persistence ============== */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(defaultState), parsed);
  } catch (e) {
    console.error('loadState failed', e);
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('保存失败：存储空间不足');
    console.error(e);
  }
}

/* ============== Date helpers ============== */

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${m}/${d}`;
}
function fmtFullDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${wd}`;
}
function daysBetween(a, b) {
  const ms = new Date(b) - new Date(a);
  return Math.round(ms / 86400000);
}

/* ============== Calculations ============== */

function calcBMR({ sex, age, height, weight }) {
  // Mifflin-St Jeor
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}
function calcTDEE(profile, weight) {
  const bmr = calcBMR({ ...profile, weight });
  return Math.round(bmr * profile.activity);
}
function currentWeight() {
  if (state.weights.length === 0) return null;
  // most recent
  const sorted = [...state.weights].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0].kg;
}
function recommendedKcal(tdee) {
  // 850 kcal deficit but not below ~1500 for men, ~1200 for women
  const min = state.profile.sex === 'male' ? 1500 : 1200;
  return Math.max(tdee - 850, min);
}
function recommendedMacros(weight, kcalTarget) {
  // Protein 2g/kg of body weight
  // Fat 25% of kcal
  // Carbs = remainder
  const protein = Math.round(weight * 2);
  const fatKcal = kcalTarget * 0.25;
  const fat = Math.round(fatKcal / 9);
  const carbsKcal = kcalTarget - protein * 4 - fat * 9;
  const carbs = Math.max(Math.round(carbsKcal / 4), 0);
  return { protein, carbs, fat };
}

/* ============== Aggregations ============== */

function todaysFoods() {
  const t = todayISO();
  return state.foods.filter(f => f.date === t);
}
function todaysExercises() {
  const t = todayISO();
  return state.exercises.filter(e => e.date === t);
}
function sumFoods(foods) {
  return foods.reduce((a, f) => ({
    kcal: a.kcal + (f.kcal || 0),
    p: a.p + (f.p || 0),
    c: a.c + (f.c || 0),
    f: a.f + (f.f || 0),
  }), { kcal: 0, p: 0, c: 0, f: 0 });
}
function sumExercises(exs) {
  return exs.reduce((a, e) => a + (e.kcal || 0), 0);
}

/* ============== Toast ============== */

function toast(msg, ms = 1800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

/* ============== Tab navigation ============== */

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('hidden', t.dataset.tab !== name);
  });
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.nav === name);
  });
  // some tabs not in bottom nav (settings) — keep all unchecked then
  if (!document.querySelector(`.nav-item[data-nav="${name}"]`)) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  }
  renderForTab(name);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderForTab(name) {
  switch (name) {
    case 'today': renderToday(); break;
    case 'weight': renderWeight(); break;
    case 'food': renderFood(); break;
    case 'exercise': renderExercise(); break;
    case 'body': renderBody(); break;
    case 'settings': renderSettings(); break;
  }
}

/* ============== Onboarding ============== */

function startOnboarding() {
  document.getElementById('onboarding').classList.remove('hidden');
  // Pre-fill defaults
  const prefDate = new Date();
  prefDate.setMonth(prefDate.getMonth() + 3);
  document.getElementById('ob-goal-date').value = prefDate.toISOString().slice(0, 10);
}

function finishOnboarding() {
  const sex = document.getElementById('ob-sex').value;
  const age = +document.getElementById('ob-age').value;
  const height = +document.getElementById('ob-height').value;
  const weight = +document.getElementById('ob-weight').value;
  const startWeight = +document.getElementById('ob-start-weight').value || weight;
  const goalWeight = +document.getElementById('ob-goal-weight').value;
  const goalDate = document.getElementById('ob-goal-date').value;
  const activity = +document.getElementById('ob-activity').value;

  if (!age || !height || !weight || !goalWeight || !goalDate) {
    toast('请填完所有必填项');
    return;
  }

  state.profile = { sex, age, height, activity };
  state.goal.startWeight = startWeight;
  state.goal.goalWeight = goalWeight;
  state.goal.goalDate = goalDate;

  // Initial weight entry
  if (!state.weights.find(w => w.date === todayISO())) {
    state.weights.push({ date: todayISO(), kg: weight });
  }

  // Calc kcal & macro targets
  const tdee = calcTDEE(state.profile, weight);
  state.goal.kcalTarget = recommendedKcal(tdee);
  const macros = recommendedMacros(weight, state.goal.kcalTarget);
  state.goal.proteinTarget = macros.protein;
  state.goal.carbsTarget = macros.carbs;
  state.goal.fatTarget = macros.fat;

  state.onboarded = true;
  saveState();
  document.getElementById('onboarding').classList.add('hidden');
  showTab('today');
  toast('设置完成，开始追踪 💪');
}

/* ============== TODAY tab ============== */

function renderToday() {
  document.getElementById('today-date').textContent = fmtFullDate(todayISO());

  const cw = currentWeight();
  const goal = state.goal;

  // Goal card
  if (cw != null && goal.goalWeight != null) {
    const remaining = (cw - goal.goalWeight).toFixed(1);
    document.getElementById('goal-remaining').textContent = remaining > 0 ? remaining : '🎉';
    document.getElementById('goal-start').textContent = goal.startWeight ? `${goal.startWeight} kg` : '—';
    document.getElementById('goal-target').textContent = `${goal.goalWeight} kg`;
    document.getElementById('goal-date').textContent = goal.goalDate ? fmtFullDate(goal.goalDate).replace(/周./, '') : '—';

    if (goal.startWeight && goal.startWeight > goal.goalWeight) {
      const totalToLose = goal.startWeight - goal.goalWeight;
      const lostSoFar = goal.startWeight - cw;
      const pct = Math.max(0, Math.min(100, (lostSoFar / totalToLose) * 100));
      document.getElementById('goal-progress-fill').style.width = pct + '%';
      document.getElementById('goal-progress-text').textContent = `已完成 ${pct.toFixed(0)}% (-${lostSoFar.toFixed(1)} kg)`;
    }

    if (goal.goalDate) {
      const days = daysBetween(todayISO(), goal.goalDate);
      const need = cw - goal.goalWeight;
      if (days > 0 && need > 0) {
        const perWeek = (need / (days / 7)).toFixed(2);
        document.getElementById('goal-pace').textContent = `还剩 ${days} 天 · 需 ${perWeek} kg/周`;
      } else if (days <= 0) {
        document.getElementById('goal-pace').textContent = `已超过目标日期`;
      } else {
        document.getElementById('goal-pace').textContent = `已达成 🎉`;
      }
    }
  }

  // Stat cards
  const yest = yesterdaysWeight();
  document.getElementById('stat-weight').textContent = cw != null ? cw.toFixed(1) : '—';
  if (cw != null && yest != null) {
    const d = (cw - yest).toFixed(1);
    document.getElementById('stat-weight-delta').textContent = `${d > 0 ? '+' : ''}${d} kg vs 上次`;
  } else {
    document.getElementById('stat-weight-delta').textContent = '点击记录';
  }

  const fSum = sumFoods(todaysFoods());
  document.getElementById('stat-calories').textContent = Math.round(fSum.kcal);
  document.getElementById('stat-calories-target').textContent = `目标 ${goal.kcalTarget || '—'}`;

  const exKcal = sumExercises(todaysExercises());
  document.getElementById('stat-exercise').textContent = exKcal;
  document.getElementById('stat-exercise-meta').textContent = `${todaysExercises().length} 项`;

  if (cw != null && goal.kcalTarget) {
    const tdee = calcTDEE(state.profile, cw);
    if (fSum.kcal === 0 && exKcal === 0) {
      document.getElementById('stat-deficit').textContent = '—';
      document.getElementById('stat-deficit-meta').textContent = `TDEE ${tdee}`;
    } else {
      const deficit = tdee + exKcal - fSum.kcal;
      const sign = deficit >= 0 ? '+' : '';
      document.getElementById('stat-deficit').textContent = sign + Math.round(deficit);
      document.getElementById('stat-deficit-meta').textContent = `TDEE ${tdee} · ${deficit >= 0 ? '缺口' : '盈余'}`;
    }
  } else {
    document.getElementById('stat-deficit').textContent = '—';
  }

  // Macros
  renderMacros(fSum);

  // Remaining budget for recommendation card
  const rb = document.getElementById('remaining-budget');
  if (rb && goal.kcalTarget) {
    const remKcal = Math.max(0, goal.kcalTarget - fSum.kcal + exKcal);
    const remP = Math.max(0, (goal.proteinTarget || 0) - fSum.p);
    rb.textContent = `剩余 · ${Math.round(remKcal)} kcal · 蛋白 ${Math.round(remP)} g`;
  }

  // Tip
  document.getElementById('tip-text').textContent = generateTip(cw, fSum, exKcal);
}

function yesterdaysWeight() {
  if (state.weights.length < 2) return null;
  const sorted = [...state.weights].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[1].kg;
}

function renderMacros(sum) {
  const g = state.goal;
  setMacroBar('p', sum.p, g.proteinTarget);
  setMacroBar('c', sum.c, g.carbsTarget);
  setMacroBar('f', sum.f, g.fatTarget);
}
function setMacroBar(key, val, target) {
  document.getElementById(`macro-${key}-text`).textContent = `${val.toFixed(0)} / ${target || 0} g`;
  const pct = target ? Math.min(100, (val / target) * 100) : 0;
  document.getElementById(`macro-${key}-fill`).style.width = pct + '%';
}

function generateTip(cw, fSum, exKcal) {
  const goal = state.goal;
  if (!cw) return '今天还没记体重，去「体重」页加一条。';
  if (!goal.kcalTarget) return '在「更多」里设个目标，今天就有缺口数据可看了。';

  const tdee = calcTDEE(state.profile, cw);
  const deficit = tdee + exKcal - fSum.kcal;

  if (fSum.kcal === 0) return '今天还没记饮食，去「饮食」页加一餐 🍽';
  if (deficit < 0) return `今天热量超了 ${Math.abs(Math.round(deficit))} kcal，明天补回来。`;
  if (deficit < 300) return `缺口偏小 (${Math.round(deficit)} kcal)，可以加点低强度有氧。`;
  if (deficit > 1200) return `缺口偏大 (${Math.round(deficit)} kcal)，注意别长期这样，容易代谢适应。`;
  if (goal.proteinTarget && fSum.p < goal.proteinTarget * 0.8) return `蛋白吃得有点少，距目标还差 ${Math.round(goal.proteinTarget - fSum.p)} g。`;
  return `今天缺口 ${Math.round(deficit)} kcal，节奏不错，继续。`;
}

/* ============== WEIGHT tab ============== */

function renderWeight() {
  // history list
  const list = document.getElementById('weight-history');
  const sorted = [...state.weights].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.length === 0
    ? '<div class="muted small">暂无记录</div>'
    : sorted.slice(0, 60).map((w, i) => {
        const prev = sorted[i + 1];
        const delta = prev ? (w.kg - prev.kg).toFixed(1) : null;
        return `<div class="list-item">
          <div class="left">
            <div class="name">${fmtFullDate(w.date)}</div>
            ${delta != null ? `<div class="sub">${delta > 0 ? '+' : ''}${delta} kg</div>` : ''}
          </div>
          <div class="right">${w.kg.toFixed(1)} kg</div>
          <button class="delete-btn" onclick="deleteWeight('${w.date}')">×</button>
        </div>`;
      }).join('');

  // chart
  drawWeightChart();
}

function addWeight() {
  const v = parseFloat(document.getElementById('weight-input').value);
  if (!v || v < 30 || v > 300) { toast('请输入合理体重'); return; }
  const date = todayISO();
  const idx = state.weights.findIndex(w => w.date === date);
  if (idx >= 0) state.weights[idx].kg = v;
  else state.weights.push({ date, kg: v });
  saveState();
  document.getElementById('weight-input').value = '';
  renderWeight();
  toast('已记录 ✓');
}

function deleteWeight(date) {
  if (!confirm('删除这条记录？')) return;
  state.weights = state.weights.filter(w => w.date !== date);
  saveState();
  renderWeight();
}

function setWeightRange(range, ev) {
  state.weightRange = range;
  document.querySelectorAll('.chart-tabs .chip').forEach(c => c.classList.remove('active'));
  if (ev && ev.target) ev.target.classList.add('active');
  saveState();
  drawWeightChart();
}

function drawWeightChart() {
  const container = document.getElementById('weight-chart');
  const meta = document.getElementById('weight-chart-meta');
  let data = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  if (state.weightRange !== 'all') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - state.weightRange);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    data = data.filter(d => d.date >= cutoffISO);
  }
  if (data.length === 0) {
    container.innerHTML = '<div class="muted small" style="padding:60px 0;text-align:center">没有数据</div>';
    meta.innerHTML = '';
    return;
  }

  const W = container.clientWidth || 320;
  const H = 200;
  const pad = { l: 36, r: 12, t: 16, b: 22 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const kgs = data.map(d => d.kg);
  const minKg = Math.min(...kgs);
  const maxKg = Math.max(...kgs);
  const yMin = Math.floor((minKg - 0.5) * 2) / 2;
  const yMax = Math.ceil((maxKg + 0.5) * 2) / 2;
  const yRange = yMax - yMin || 1;

  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: pad.l + i * xStep,
    y: pad.t + (1 - (d.kg - yMin) / yRange) * innerH,
    date: d.date,
    kg: d.kg,
  }));

  // 7-day moving average for smoothness
  const avg = data.map((_, i) => {
    const start = Math.max(0, i - 3);
    const end = Math.min(data.length, i + 4);
    const slice = data.slice(start, end);
    const m = slice.reduce((a, b) => a + b.kg, 0) / slice.length;
    return {
      x: pad.l + i * xStep,
      y: pad.t + (1 - (m - yMin) / yRange) * innerH,
    };
  });

  // y-axis labels
  const yTicks = 4;
  const yLabels = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + (yRange * i / yTicks);
    const y = pad.t + (1 - i / yTicks) * innerH;
    yLabels.push(`<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>
      <text x="${pad.l - 6}" y="${y + 3}" font-size="10" fill="#9ca3af" text-anchor="end">${v.toFixed(1)}</text>`);
  }

  // Goal line
  let goalLine = '';
  if (state.goal.goalWeight && state.goal.goalWeight >= yMin && state.goal.goalWeight <= yMax) {
    const gy = pad.t + (1 - (state.goal.goalWeight - yMin) / yRange) * innerH;
    goalLine = `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="#10b981" stroke-width="1" stroke-dasharray="4 4" opacity="0.6"/>
      <text x="${W - pad.r}" y="${gy - 4}" font-size="10" fill="#10b981" text-anchor="end">目标 ${state.goal.goalWeight}</text>`;
  }

  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const avgPath = avg.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');

  // Area fill
  const areaPath = linePath + ` L${points[points.length - 1].x.toFixed(1)},${pad.t + innerH} L${points[0].x.toFixed(1)},${pad.t + innerH} Z`;

  // X-axis labels (first/middle/last)
  const xLabels = [];
  if (points.length === 1) {
    xLabels.push(`<text x="${points[0].x}" y="${H - 4}" font-size="10" fill="#9ca3af" text-anchor="middle">${fmtDate(points[0].date)}</text>`);
  } else if (points.length > 1) {
    xLabels.push(`<text x="${points[0].x}" y="${H - 4}" font-size="10" fill="#9ca3af" text-anchor="start">${fmtDate(points[0].date)}</text>`);
    if (points.length > 2) {
      const mid = points[Math.floor(points.length / 2)];
      xLabels.push(`<text x="${mid.x}" y="${H - 4}" font-size="10" fill="#9ca3af" text-anchor="middle">${fmtDate(mid.date)}</text>`);
    }
    xLabels.push(`<text x="${points[points.length - 1].x}" y="${H - 4}" font-size="10" fill="#9ca3af" text-anchor="end">${fmtDate(points[points.length - 1].date)}</text>`);
  }

  const dotMarkers = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#3b82f6"/>`).join('');

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${yLabels.join('')}
    ${goalLine}
    <path d="${areaPath}" fill="url(#areaGrad)"/>
    <path d="${linePath}" fill="none" stroke="#3b82f6" stroke-width="1.5" opacity="0.5"/>
    <path d="${avgPath}" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linejoin="round"/>
    ${dotMarkers}
    ${xLabels.join('')}
  </svg>`;

  const first = data[0];
  const last = data[data.length - 1];
  const change = (last.kg - first.kg).toFixed(1);
  meta.innerHTML = `<span>${data.length} 条记录</span><span>${change > 0 ? '+' : ''}${change} kg · ${data.length > 1 ? ((last.kg - first.kg) / (daysBetween(first.date, last.date) / 7 || 1)).toFixed(2) + ' kg/周' : ''}</span>`;
}

/* ============== FOOD tab ============== */

function renderFood() {
  const list = document.getElementById('food-list');
  const today = todaysFoods();
  const grouped = {
    breakfast: [], lunch: [], dinner: [], snack: [],
  };
  today.forEach(f => grouped[f.meal || 'snack'].push(f));
  const labels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

  const html = Object.entries(grouped).map(([meal, items]) => {
    if (items.length === 0) return '';
    return `<div class="muted small" style="margin:8px 4px 4px;font-weight:600">${labels[meal]}</div>` +
      items.map(f => `<div class="list-item">
        <div class="left">
          <div class="name">${escapeHtml(f.name)}</div>
          <div class="sub">P ${f.p || 0} · C ${f.c || 0} · F ${f.f || 0}</div>
        </div>
        <div class="right">${Math.round(f.kcal || 0)} kcal</div>
        <button class="delete-btn" onclick="deleteFood('${f.id}')">×</button>
      </div>`).join('');
  }).join('');

  list.innerHTML = html || '<div class="muted small">今天还没有饮食记录</div>';

  const sum = sumFoods(today);
  document.getElementById('food-totals').innerHTML = `
    <span>总计</span>
    <span>${Math.round(sum.kcal)} kcal · P${sum.p.toFixed(0)} C${sum.c.toFixed(0)} F${sum.f.toFixed(0)}</span>`;
}

function addFood() {
  const name = document.getElementById('food-name').value.trim();
  const kcal = parseFloat(document.getElementById('food-kcal').value) || 0;
  const p = parseFloat(document.getElementById('food-protein').value) || 0;
  const c = parseFloat(document.getElementById('food-carbs').value) || 0;
  const f = parseFloat(document.getElementById('food-fat').value) || 0;
  const meal = document.getElementById('food-meal').value;
  if (!name) { toast('填一下食物名称'); return; }
  if (!kcal && !p && !c && !f) { toast('至少填一项营养数据'); return; }
  state.foods.push({
    id: Math.random().toString(36).slice(2, 10),
    date: todayISO(), name, meal, kcal, p, c, f,
  });
  saveState();
  document.getElementById('food-name').value = '';
  document.getElementById('food-kcal').value = '';
  document.getElementById('food-protein').value = '';
  document.getElementById('food-carbs').value = '';
  document.getElementById('food-fat').value = '';
  renderFood();
  toast('已记录 ✓');
}

function deleteFood(id) {
  state.foods = state.foods.filter(f => f.id !== id);
  saveState();
  renderFood();
}

/* ============== EXERCISE tab ============== */

function setExerciseRange(range, ev) {
  state.exerciseRange = range;
  document.querySelectorAll('.chart-tabs [data-exrange]').forEach(c => c.classList.remove('active'));
  if (ev?.target) ev.target.classList.add('active');
  saveState();
  drawExerciseChart();
}

function drawExerciseChart() {
  const container = document.getElementById('exercise-chart');
  const meta = document.getElementById('exercise-chart-meta');
  if (!container) return;

  // Aggregate exercise kcal by date
  const byDate = {};
  state.exercises.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = 0;
    byDate[e.date] += e.kcal || 0;
  });

  let data = Object.entries(byDate)
    .map(([date, kcal]) => ({ date, kcal }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (state.exerciseRange !== 'all') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - state.exerciseRange);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    data = data.filter(d => d.date >= cutoffISO);
  }

  if (data.length === 0) {
    container.innerHTML = '<div class="muted small" style="padding:60px 0;text-align:center">没有数据</div>';
    meta.innerHTML = '';
    return;
  }

  const W = container.clientWidth || 320;
  const H = 200;
  const pad = { l: 40, r: 12, t: 16, b: 22 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const kcals = data.map(d => d.kcal);
  const maxKcal = Math.max(...kcals, 1);
  const yMax = Math.ceil(maxKcal / 100) * 100;

  const barW = Math.max(2, innerW / data.length - 2);
  const xStep = innerW / data.length;

  // Y-axis labels
  const yTicks = 4;
  const yLabels = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = Math.round(yMax * i / yTicks);
    const y = pad.t + (1 - i / yTicks) * innerH;
    yLabels.push(`<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>
      <text x="${pad.l - 6}" y="${y + 3}" font-size="10" fill="#9ca3af" text-anchor="end">${v}</text>`);
  }

  // Bars
  const bars = data.map((d, i) => {
    const x = pad.l + i * xStep + (xStep - barW) / 2;
    const h = (d.kcal / yMax) * innerH;
    const y = pad.t + innerH - h;
    const isToday = d.date === todayISO();
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
      rx="2" fill="${isToday ? '#f97316' : '#fed7aa'}" opacity="${isToday ? '1' : '0.8'}"/>`;
  });

  // 7-day moving average line
  const avgPoints = data.map((d, i) => {
    const start = Math.max(0, i - 3);
    const end = Math.min(data.length, i + 4);
    const avg = data.slice(start, end).reduce((a, b) => a + b.kcal, 0) / (end - start);
    const x = pad.l + i * xStep + xStep / 2;
    const y = pad.t + (1 - avg / yMax) * innerH;
    return { x, y };
  });
  const avgPath = avgPoints.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');

  // X labels
  const xLabels = [];
  if (data.length === 1) {
    xLabels.push(`<text x="${pad.l + xStep / 2}" y="${H - 4}" font-size="10" fill="#9ca3af" text-anchor="middle">${fmtDate(data[0].date)}</text>`);
  } else {
    xLabels.push(`<text x="${pad.l + xStep / 2}" y="${H - 4}" font-size="10" fill="#9ca3af" text-anchor="start">${fmtDate(data[0].date)}</text>`);
    if (data.length > 2) {
      const mi = Math.floor(data.length / 2);
      xLabels.push(`<text x="${pad.l + mi * xStep + xStep / 2}" y="${H - 4}" font-size="10" fill="#9ca3af" text-anchor="middle">${fmtDate(data[mi].date)}</text>`);
    }
    xLabels.push(`<text x="${pad.l + (data.length - 1) * xStep + xStep / 2}" y="${H - 4}" font-size="10" fill="#9ca3af" text-anchor="end">${fmtDate(data[data.length - 1].date)}</text>`);
  }

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${yLabels.join('')}
    ${bars.join('')}
    <path d="${avgPath}" fill="none" stroke="#f97316" stroke-width="2" stroke-linejoin="round" stroke-dasharray="4 2" opacity="0.9"/>
    ${xLabels.join('')}
  </svg>`;

  const totalDays = data.length;
  const avgKcal = Math.round(kcals.reduce((a, b) => a + b, 0) / totalDays);
  const maxDay = data.reduce((a, b) => b.kcal > a.kcal ? b : a);
  meta.innerHTML = `<span>${totalDays} 天 · 日均 ${avgKcal} kcal</span><span>最高 ${Math.round(maxDay.kcal)} kcal (${fmtDate(maxDay.date)})</span>`;
}

function renderExercise() {
  drawExerciseChart();
  const list = document.getElementById('exercise-list');
  const today = todaysExercises();
  list.innerHTML = today.length === 0
    ? '<div class="muted small">今天还没有运动记录</div>'
    : today.map(e => `<div class="list-item">
        <div class="left">
          <div class="name">${escapeHtml(e.type)}${e.source === 'health' ? ' 📲' : ''}</div>
          <div class="sub">${e.duration ? e.duration + ' 分钟 · ' : ''}${e.note ? escapeHtml(e.note) : ''}</div>
        </div>
        <div class="right">${e.kcal} kcal</div>
        <button class="delete-btn" onclick="deleteExercise('${e.id}')">×</button>
      </div>`).join('');

  document.getElementById('exercise-totals').innerHTML = `
    <span>总消耗</span>
    <span>${sumExercises(today)} kcal</span>`;
}

function addExercise() {
  const type = document.getElementById('ex-type').value.trim();
  const duration = parseInt(document.getElementById('ex-duration').value) || 0;
  const kcal = parseInt(document.getElementById('ex-kcal').value) || 0;
  const note = document.getElementById('ex-note').value.trim();
  if (!type) { toast('填一下类型'); return; }
  if (!kcal) { toast('填一下消耗 kcal'); return; }
  state.exercises.push({
    id: Math.random().toString(36).slice(2, 10),
    date: todayISO(), type, duration, kcal, note, source: 'manual',
  });
  saveState();
  document.getElementById('ex-type').value = '';
  document.getElementById('ex-duration').value = '';
  document.getElementById('ex-kcal').value = '';
  document.getElementById('ex-note').value = '';
  renderExercise();
  toast('已记录 ✓');
}

function deleteExercise(id) {
  state.exercises = state.exercises.filter(e => e.id !== id);
  saveState();
  renderExercise();
}

async function pasteHealthData() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      toast('当前浏览器不支持读剪贴板');
      return;
    }
    const text = await navigator.clipboard.readText();
    const trimmed = text.trim();

    // Accept plain number (e.g. "523.4" directly from Shortcut Sum)
    const num = parseFloat(trimmed);
    if (!isNaN(num) && trimmed === String(num) || /^\d+(\.\d+)?$/.test(trimmed)) {
      importHealthData({ kcal: num, date: todayISO() });
      return;
    }

    // Accept JSON format
    const parsed = JSON.parse(trimmed);
    importHealthData(parsed);
  } catch (e) {
    toast('剪贴板里不是有效数据');
    console.error(e);
  }
}

function importHealthData(data) {
  // Accept either { kcal: number, date: ISOstring } or { entries: [...] }
  let added = 0;
  const handle = (obj) => {
    const kcal = +obj.kcal || +obj.activeEnergy || 0;
    const date = (obj.date || todayISO()).slice(0, 10);
    if (kcal <= 0) return;
    // remove any previous health entry for this date to avoid duplicates
    state.exercises = state.exercises.filter(e => !(e.source === 'health' && e.date === date));
    state.exercises.push({
      id: Math.random().toString(36).slice(2, 10),
      date, type: 'Apple Health 活动', duration: obj.duration || 0,
      kcal: Math.round(kcal), note: '从 Health 导入', source: 'health',
    });
    added++;
  };
  if (Array.isArray(data)) data.forEach(handle);
  else if (Array.isArray(data.entries)) data.entries.forEach(handle);
  else handle(data);
  saveState();
  renderExercise();
  toast(`已导入 ${added} 条 ✓`);
}

/* ============== BODY tab ============== */

function renderBody() {
  const list = document.getElementById('body-history');
  const sorted = [...state.bodyMeasurements].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.length === 0
    ? '<div class="muted small">暂无记录</div>'
    : sorted.slice(0, 30).map(b => {
        const parts = [];
        if (b.waist) parts.push(`腰 ${b.waist}`);
        if (b.hip) parts.push(`臀 ${b.hip}`);
        if (b.chest) parts.push(`胸 ${b.chest}`);
        if (b.arm) parts.push(`臂 ${b.arm}`);
        if (b.thigh) parts.push(`腿 ${b.thigh}`);
        return `<div class="list-item">
          <div class="left">
            <div class="name">${fmtFullDate(b.date)}</div>
            <div class="sub">${parts.join(' · ')}</div>
          </div>
          <div class="right">${b.bodyfat ? b.bodyfat + '%' : '—'}</div>
          <button class="delete-btn" onclick="deleteBody('${b.date}')">×</button>
        </div>`;
      }).join('');

  // Photo grid
  const grid = document.getElementById('photo-grid');
  grid.innerHTML = state.photos.map((p, i) => `
    <div class="photo-item">
      <img src="${p.dataUrl}" alt="">
      <span class="photo-date">${fmtDate(p.date)}</span>
      <span class="photo-del" onclick="deletePhoto(${i})">×</span>
    </div>`).join('');
}

function addBody() {
  const date = todayISO();
  const entry = {
    date,
    waist: parseFloat(document.getElementById('body-waist').value) || null,
    hip: parseFloat(document.getElementById('body-hip').value) || null,
    chest: parseFloat(document.getElementById('body-chest').value) || null,
    arm: parseFloat(document.getElementById('body-arm').value) || null,
    thigh: parseFloat(document.getElementById('body-thigh').value) || null,
    bodyfat: parseFloat(document.getElementById('body-bodyfat').value) || null,
  };
  if (!entry.waist && !entry.hip && !entry.chest && !entry.arm && !entry.thigh && !entry.bodyfat) {
    toast('至少填一项');
    return;
  }
  const idx = state.bodyMeasurements.findIndex(b => b.date === date);
  if (idx >= 0) state.bodyMeasurements[idx] = entry;
  else state.bodyMeasurements.push(entry);
  saveState();
  ['waist', 'hip', 'chest', 'arm', 'thigh', 'bodyfat'].forEach(k => {
    document.getElementById('body-' + k).value = '';
  });
  renderBody();
  toast('已保存 ✓');
}

function deleteBody(date) {
  if (!confirm('删除这条记录？')) return;
  state.bodyMeasurements = state.bodyMeasurements.filter(b => b.date !== date);
  saveState();
  renderBody();
}

function addPhoto(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    // Resize to max 800px to keep storage small
    resizeImage(e.target.result, 800).then(small => {
      state.photos.unshift({ date: todayISO(), dataUrl: small });
      saveState();
      renderBody();
      toast('已保存 ✓');
    });
  };
  reader.readAsDataURL(file);
  ev.target.value = '';
}

function resizeImage(dataUrl, maxSize) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = height * (maxSize / width);
        width = maxSize;
      } else if (height > maxSize) {
        width = width * (maxSize / height);
        height = maxSize;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = dataUrl;
  });
}

function deletePhoto(i) {
  if (!confirm('删除这张照片？')) return;
  state.photos.splice(i, 1);
  saveState();
  renderBody();
}

/* ============== SETTINGS tab ============== */

function renderSettings() {
  const p = state.profile, g = state.goal;
  document.getElementById('set-sex').value = p.sex;
  document.getElementById('set-age').value = p.age || '';
  document.getElementById('set-height').value = p.height || '';
  document.getElementById('set-activity').value = p.activity;
  document.getElementById('set-start').value = g.startWeight || '';
  document.getElementById('set-goal').value = g.goalWeight || '';
  document.getElementById('set-goal-date').value = g.goalDate || '';
  document.getElementById('set-kcal-target').value = g.kcalTarget || '';
  document.getElementById('set-p-target').value = g.proteinTarget || '';
  document.getElementById('set-c-target').value = g.carbsTarget || '';
  document.getElementById('set-f-target').value = g.fatTarget || '';
  // API key field shows masked indicator if already set
  const apiKey = getApiKey();
  const keyInput = document.getElementById('set-api-key');
  if (keyInput) {
    keyInput.value = '';
    keyInput.placeholder = apiKey ? '已设置 (••••' + apiKey.slice(-4) + ')，留空则保留旧值' : 'sk-...';
    document.getElementById('set-api-model').value = getApiModel();
  }
}

function saveSettings() {
  state.profile.sex = document.getElementById('set-sex').value;
  state.profile.age = parseInt(document.getElementById('set-age').value) || state.profile.age;
  state.profile.height = parseFloat(document.getElementById('set-height').value) || state.profile.height;
  state.profile.activity = parseFloat(document.getElementById('set-activity').value) || state.profile.activity;
  state.goal.startWeight = parseFloat(document.getElementById('set-start').value) || state.goal.startWeight;
  state.goal.goalWeight = parseFloat(document.getElementById('set-goal').value) || state.goal.goalWeight;
  state.goal.goalDate = document.getElementById('set-goal-date').value || state.goal.goalDate;
  state.goal.kcalTarget = parseInt(document.getElementById('set-kcal-target').value) || state.goal.kcalTarget;
  state.goal.proteinTarget = parseInt(document.getElementById('set-p-target').value) || state.goal.proteinTarget;
  state.goal.carbsTarget = parseInt(document.getElementById('set-c-target').value) || state.goal.carbsTarget;
  state.goal.fatTarget = parseInt(document.getElementById('set-f-target').value) || state.goal.fatTarget;
  saveState();
  toast('已保存 ✓');
}

function recalcCalorieTarget() {
  const cw = currentWeight();
  if (!cw) { toast('先记一条体重'); return; }
  const tdee = calcTDEE(state.profile, cw);
  const target = recommendedKcal(tdee);
  document.getElementById('set-kcal-target').value = target;
  toast(`TDEE ${tdee}，建议摄入 ${target}`);
}

function recalcMacroTargets() {
  const cw = currentWeight();
  const target = parseInt(document.getElementById('set-kcal-target').value) || state.goal.kcalTarget;
  if (!cw || !target) { toast('需要当前体重和热量目标'); return; }
  const m = recommendedMacros(cw, target);
  document.getElementById('set-p-target').value = m.protein;
  document.getElementById('set-c-target').value = m.carbs;
  document.getElementById('set-f-target').value = m.fat;
  toast('已按推荐重算');
}

/* ============== Import / Export / Reset ============== */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fatloss-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('已导出 ✓');
}

function importHealthFile(ev, preparsed) {
  if (preparsed) {
    _processHealthImport(preparsed);
    return;
  }
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      _processHealthImport(parsed);
    } catch (err) {
      toast('文件解析失败');
      console.error(err);
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

function _processHealthImport(parsed) {
      const days = parsed.daily || parsed.entries || (Array.isArray(parsed) ? parsed : null);
      if (!days) { toast('文件格式不识别'); return; }

      let exAdded = 0;
      let weightAdded = 0;
      let weightSum = 0, weightCount = 0;
      let activitySum = 0, activityDays = 0;

      days.forEach(d => {
        const date = (d.date || '').slice(0, 10);
        if (!date) return;

        const kcal = d.active_energy_kcal != null ? +d.active_energy_kcal : (+d.kcal || 0);
        if (kcal > 5) {
          state.exercises = state.exercises.filter(e => !(e.source === 'health' && e.date === date));
          state.exercises.push({
            id: Math.random().toString(36).slice(2, 10),
            date,
            type: 'Apple Health 活动',
            duration: 0,
            kcal: Math.round(kcal),
            note: d.steps ? `${d.steps} 步` : '',
            source: 'health',
          });
          exAdded++;
          activitySum += kcal;
          activityDays++;
        }

        if (d.weight_kg != null && d.weight_kg > 0) {
          if (!state.weights.find(w => w.date === date)) {
            state.weights.push({ date, kg: +d.weight_kg });
            weightAdded++;
          }
          weightSum += +d.weight_kg;
          weightCount++;
        }
      });

      // Auto-calibrate activity factor based on real data
      const avgActive = activityDays > 0 ? activitySum / activityDays : 0;
      if (avgActive > 0 && state.weights.length > 0) {
        const cw = currentWeight();
        const bmr = calcBMR({ ...state.profile, weight: cw });
        // Real TDEE estimate = BMR + active energy + ~10% TEF (assume on target intake)
        const realTDEE = bmr + avgActive + (state.goal.kcalTarget || 2200) * 0.1;
        const realFactor = realTDEE / bmr;
        if (Math.abs(realFactor - state.profile.activity) > 0.1) {
          state.profile.activity = Math.round(realFactor * 1000) / 1000;
          toast(`已根据真实活动数据校准活动系数为 ${state.profile.activity.toFixed(2)}`, 3500);
        }
      }

      saveState();
      renderForTab('settings');
      alert(`✓ 导入完成\n\n运动记录：${exAdded} 条\n体重记录：${weightAdded} 条\n\n活动能量平均：${avgActive.toFixed(0)} kcal/天 (基于 ${activityDays} 天数据)\n\n建议去「今日」页查看新的 TDEE 和热量目标。`);
}

function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);

      // Auto-detect Health JSON and route to the right importer
      if (parsed.daily || parsed.metadata?.source === 'Apple HealthKit') {
        importHealthFile(ev, parsed);
        return;
      }

      if (!parsed.profile || !parsed.weights) throw new Error('格式不对');
      if (!confirm('覆盖当前所有数据？')) return;
      state = Object.assign(structuredClone(defaultState), parsed);
      saveState();
      renderForTab('today');
      showTab('today');
      toast('已导入 ✓');
    } catch (err) {
      toast('文件格式错误：' + err.message);
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

function resetAll() {
  if (!confirm('确定清空所有数据？此操作不可撤销。')) return;
  if (!confirm('再确认一次：所有体重、饮食、运动、照片都会消失。')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  startOnboarding();
}

/* ============== Util ============== */

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ============== OpenAI integration ============== */

const API_KEY_STORAGE = 'openai_api_key';
const API_MODEL_STORAGE = 'openai_model';

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}
function getApiModel() {
  return localStorage.getItem(API_MODEL_STORAGE) || 'gpt-4o-mini';
}
function saveApiKey() {
  const key = document.getElementById('set-api-key').value.trim();
  const model = document.getElementById('set-api-model').value;
  if (key) {
    if (!key.startsWith('sk-')) {
      if (!confirm('Key 看起来不像 OpenAI 格式（应该 sk- 开头）。仍然保存？')) return;
    }
    localStorage.setItem(API_KEY_STORAGE, key);
  }
  localStorage.setItem(API_MODEL_STORAGE, model);
  document.getElementById('set-api-key').value = '';
  renderSettings();
  toast('API 设置已保存 ✓');
}

async function callOpenAI({ messages, json = false, model }) {
  const key = getApiKey();
  if (!key) {
    toast('请先到设置页填 API key');
    showTab('settings');
    return null;
  }
  const body = {
    model: model || getApiModel(),
    messages,
    temperature: 0.3,
    max_tokens: 800,
  };
  if (json) body.response_format = { type: 'json_object' };

  let resp;
  try {
    resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    toast('网络错误');
    console.error(e);
    return null;
  }

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('OpenAI error', resp.status, errText);
    if (resp.status === 401) toast('API key 无效');
    else if (resp.status === 429) toast('请求过快或额度不足');
    else toast(`API 错误 ${resp.status}`);
    return null;
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || null;
}

function voiceFoodInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast('当前浏览器不支持语音输入，请用 Safari');
    return;
  }

  const btn = document.getElementById('btn-voice');
  const isListening = btn.dataset.listening === '1';

  if (isListening) {
    btn._recognition?.stop();
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  btn._recognition = recognition;

  recognition.onstart = () => {
    btn.dataset.listening = '1';
    btn.textContent = '⏹ 停止';
    btn.style.background = '#ef4444';
    toast('正在听，说你吃了什么…', 15000);
  };

  recognition.onresult = async (e) => {
    const text = e.results[0][0].transcript;
    document.getElementById('food-name').value = text;
    toast(`识别到：${text}`, 2000);
    await aiEstimateFood();
  };

  recognition.onerror = (e) => {
    const msg = { 'not-allowed': '麦克风权限被拒绝', 'no-speech': '没有检测到声音', 'network': '网络错误' };
    toast(msg[e.error] || `语音识别出错：${e.error}`);
  };

  recognition.onend = () => {
    btn.dataset.listening = '0';
    btn.textContent = '🎤 语音';
    btn.style.background = '';
  };

  recognition.start();
}

async function aiEstimateFood() {
  const name = document.getElementById('food-name').value.trim();
  if (!name) { toast('先填食物名称和分量'); return; }

  const btns = document.querySelectorAll('.ai-row .btn-ai');
  btns.forEach(b => b.disabled = true);
  const btn = btns[0];
  const orig = btn.textContent;
  btn.textContent = '估算中…';

  try {
    const result = await callOpenAI({
      messages: [
        { role: 'system', content: '你是专业营养师。用户给出食物描述（中文、英文、菜名、外卖菜品都可能），你估算其营养成分。如果分量不明确，按合理常见份量假设并在 note 里说明。返回严格 JSON：{"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"high|medium|low","note":"分量假设"}。所有数字保留整数。不要解释，只输出 JSON。' },
        { role: 'user', content: name },
      ],
      json: true,
    });
    if (result) {
      const p = JSON.parse(result);
      document.getElementById('food-kcal').value = p.kcal;
      document.getElementById('food-protein').value = p.protein_g;
      document.getElementById('food-carbs').value = p.carbs_g;
      document.getElementById('food-fat').value = p.fat_g;
      toast(`估算完成 · ${p.confidence === 'high' ? '高' : p.confidence === 'low' ? '低' : '中'}置信度`, 2500);
      if (p.note) console.log('AI 估算说明:', p.note);
    }
  } catch (e) {
    toast('解析失败');
    console.error(e);
  } finally {
    btns.forEach(b => b.disabled = false);
    btn.textContent = orig;
  }
}

async function aiPhotoFood() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await new Promise(r => {
      const reader = new FileReader();
      reader.onload = () => r(reader.result);
      reader.readAsDataURL(file);
    });
    const small = await resizeImage(dataUrl, 800);

    const btns = document.querySelectorAll('.ai-row .btn-ai');
    btns.forEach(b => b.disabled = true);
    const btn = btns[1];
    const orig = btn.textContent;
    btn.textContent = '识别中…';

    try {
      const result = await callOpenAI({
        messages: [
          { role: 'system', content: '你是营养师。看食物照片估算营养成分。返回严格 JSON：{"name":"食物名+大致分量","kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":"high|medium|low","note":"识别假设"}。整数。只输出 JSON。' },
          {
            role: 'user',
            content: [
              { type: 'text', text: '识别这张图里的食物，估算总营养成分。' },
              { type: 'image_url', image_url: { url: small, detail: 'low' } },
            ],
          },
        ],
        json: true,
      });
      if (result) {
        const p = JSON.parse(result);
        if (p.name) document.getElementById('food-name').value = p.name;
        document.getElementById('food-kcal').value = p.kcal;
        document.getElementById('food-protein').value = p.protein_g;
        document.getElementById('food-carbs').value = p.carbs_g;
        document.getElementById('food-fat').value = p.fat_g;
        toast(`识别: ${p.name}`, 3000);
      }
    } catch (err) {
      toast('解析失败');
      console.error(err);
    } finally {
      btns.forEach(b => b.disabled = false);
      btn.textContent = orig;
    }
  };
  input.click();
}

async function aiSuggestMeal() {
  if (!getApiKey()) {
    toast('先到设置页填 API key');
    showTab('settings');
    return;
  }

  const fSum = sumFoods(todaysFoods());
  const exKcal = sumExercises(todaysExercises());
  const g = state.goal;
  const remaining = {
    kcal: Math.max(0, (g.kcalTarget || 2000) - fSum.kcal + exKcal),
    protein: Math.max(0, (g.proteinTarget || 0) - fSum.p),
    carbs: Math.max(0, (g.carbsTarget || 0) - fSum.c),
    fat: Math.max(0, (g.fatTarget || 0) - fSum.f),
  };

  // Ask: delivery or cook at home?
  const mode = confirm('想点外卖 / 出去吃？\n\n确定 = 搜附近真实餐厅\n取消 = 给在家做饭的建议');

  if (mode) {
    await aiSuggestNearby(remaining);
  } else {
    await aiSuggestHome(remaining);
  }
}

async function aiSuggestNearby(remaining) {
  openAiModal('📍 附近餐厅推荐', '正在获取位置…');

  let locationDesc = '';
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
    );
    const { latitude: lat, longitude: lng } = pos.coords;
    locationDesc = `我当前的 GPS 坐标是纬度 ${lat.toFixed(4)}，经度 ${lng.toFixed(4)}。`;
    document.getElementById('ai-modal-context').textContent =
      `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)} · 剩余 ${Math.round(remaining.kcal)} kcal · 蛋白 ${Math.round(remaining.protein)}g`;
  } catch (e) {
    // Geolocation denied or failed — ask user to type location
    const loc = prompt('获取 GPS 失败。请输入你的位置（如：Flushing Queens NY）：');
    if (!loc) { closeAiModal(); return; }
    locationDesc = `我在 ${loc}。`;
    document.getElementById('ai-modal-context').textContent =
      `📍 ${loc} · 剩余 ${Math.round(remaining.kcal)} kcal · 蛋白 ${Math.round(remaining.protein)}g`;
  }

  document.getElementById('ai-modal-body').innerHTML = '<div class="modal-loading">正在搜索附近餐厅…</div>';

  const result = await callOpenAI({
    messages: [
      {
        role: 'system',
        content: '你是减脂饮食顾问。用户给你他的位置和今日剩余宏量预算，请在网上搜索他附近真实存在的餐厅，给出 3 个具体建议。每个建议要包含：① 餐厅真实名称和地址或交叉路口 ② 具体点哪道菜或怎么定制（比如少油、少酱、不加XX）③ 大致热量/蛋白估算。优先推荐有外卖的餐厅。直接给建议，不要废话，中文回复。',
      },
      {
        role: 'user',
        content: `${locationDesc}

今日剩余宏量预算：
- 热量：${Math.round(remaining.kcal)} kcal
- 蛋白：${Math.round(remaining.protein)} g
- 碳水：${Math.round(remaining.carbs)} g
- 脂肪：${Math.round(remaining.fat)} g

帮我搜一下附近真实存在的餐厅，推荐 3 家 + 每家具体点什么。`,
      },
    ],
    model: 'gpt-4o-search-preview',
  });

  setAiModalBody(result || '没有找到结果，请检查网络或手动输入位置。');
}

async function aiSuggestHome(remaining) {
  const context = prompt('冰箱里有什么食材？（可以不填）', '') ?? '';
  openAiModal('🍳 在家吃什么', `剩余 ${Math.round(remaining.kcal)} kcal · 蛋白 ${Math.round(remaining.protein)}g`);

  const result = await callOpenAI({
    messages: [
      { role: 'system', content: '你是减脂教练。给出 2-3 个具体在家做的方案。每个方案写：菜名、关键食材和克重、简单做法、估算 kcal/P/C/F。简短直接，中文。' },
      {
        role: 'user',
        content: `剩余预算：${Math.round(remaining.kcal)} kcal · 蛋白 ${Math.round(remaining.protein)}g · 碳水 ${Math.round(remaining.carbs)}g · 脂肪 ${Math.round(remaining.fat)}g\n食材：${context || '常见食材'}`,
      },
    ],
  });

  setAiModalBody(result || '（AI 没返回内容）');
}

function openAiModal(title, contextText) {
  document.getElementById('ai-modal-title').textContent = title;
  document.getElementById('ai-modal-context').textContent = contextText;
  document.getElementById('ai-modal-body').innerHTML = '<div class="modal-loading">正在生成…</div>';
  document.getElementById('ai-modal').classList.remove('hidden');
}
function setAiModalBody(text) {
  // Minimal markdown: **bold**, newlines
  const html = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  document.getElementById('ai-modal-body').innerHTML = html;
}
function closeAiModal() {
  document.getElementById('ai-modal').classList.add('hidden');
}

/* ============== Boot ============== */

window.addEventListener('DOMContentLoaded', () => {
  if (!state.onboarded) {
    startOnboarding();
  } else {
    showTab('today');
  }
  // Re-draw chart on resize
  window.addEventListener('resize', () => {
    if (!document.querySelector('.tab[data-tab="weight"]').classList.contains('hidden')) {
      drawWeightChart();
    }
  });
});

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Expose for inline handlers
window.showTab = showTab;
window.finishOnboarding = finishOnboarding;
window.addWeight = addWeight;
window.deleteWeight = deleteWeight;
window.setWeightRange = setWeightRange;
window.setExerciseRange = setExerciseRange;
window.addFood = addFood;
window.deleteFood = deleteFood;
window.addExercise = addExercise;
window.deleteExercise = deleteExercise;
window.pasteHealthData = pasteHealthData;
window.addBody = addBody;
window.deleteBody = deleteBody;
window.addPhoto = addPhoto;
window.deletePhoto = deletePhoto;
window.saveSettings = saveSettings;
window.recalcCalorieTarget = recalcCalorieTarget;
window.recalcMacroTargets = recalcMacroTargets;
window.exportData = exportData;
window.importData = importData;
window.importHealthFile = importHealthFile;
window.resetAll = resetAll;
window.saveApiKey = saveApiKey;
window.voiceFoodInput = voiceFoodInput;
window.aiEstimateFood = aiEstimateFood;
window.aiPhotoFood = aiPhotoFood;
window.aiSuggestMeal = aiSuggestMeal;
window.closeAiModal = closeAiModal;
