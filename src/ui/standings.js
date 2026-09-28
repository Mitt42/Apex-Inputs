/**
 * Renders overall or multiclass standings, gaps, intervals, ratings, pit state,
 * and recent time gain history.
 */

let settings;
let data;

const $ = id => document.getElementById(id);
const histories = new Map();
const previousGaps = new Map();

/** Format a driver name according to the option selected in the control panel. */
function formatDriverName(value = '', style, nameCase) {
  const parts = value.trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts.at(-1) || '';
  let result = value;

  if (style === 'initial-last') result = `${first[0] || ''}. ${last}`;
  if (style === 'last-first') result = `${last} ${first[0] || ''}.`;
  if (style === 'last') result = last;
  if (style === 'initials') result = parts.map(part => `${part[0]}.`).join(' ');
  if (nameCase === 'uppercase') result = result.toUpperCase();

  return result;
}

/** Return a compact manufacturer label for the cars currently recognized. */
function manufacturerCode(car = '') {
  const manufacturers = [
    ['Porsche', 'POR'],
    ['BMW', 'BMW'],
    ['Ferrari', 'FER'],
    ['Mercedes', 'AMG'],
    ['Audi', 'AUD'],
    ['McLaren', 'MCL'],
    ['Toyota', 'TOY']
  ];

  return manufacturers.find(([name]) => car.includes(name))?.[1] || 'CAR';
}

/** Format a lap time with the precision appropriate to the session. */
function formatLapTime(value, precise) {
  if (!value) return '--';
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${seconds.toFixed(precise ? 3 : 1).padStart(precise ? 6 : 4, '0')}`;
}

/** Remove stale demonstration rows while waiting for live iRacing drivers. */
function clearStandings() {
  $('rows').innerHTML = '';
  histories.clear();
  previousGaps.clear();
}

/** Group cars by class and render the configured number of rows per group. */
function render() {
  if (!settings) return;

  const options = settings.standings;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--accent', options.accent);
  rootStyle.setProperty('--bg', options.background);
  rootStyle.setProperty('--scale', options.scale / 100);
  rootStyle.setProperty('--font-scale', options.fontSize / 100);
  rootStyle.setProperty('--name-width', `${Math.round(220 * options.driverNameWidth / 100)}px`);

  $('standings').style.width = `${Math.max(1, (innerWidth - 14) / (options.scale / 100))}px`;
  $('standings').style.height = `${Math.max(1, (innerHeight - 14) / (options.scale / 100))}px`;
  $('standings').classList.toggle('editing', settings.standingsEditMode);
  if (!data
    || (!settings.demoMode && data.demo !== false)
    || !Array.isArray(data.cars)
    || data.cars.length === 0) {
    clearStandings();
    return;
  }

  const classes = new Map();
  const orderedCars = [...data.cars].sort((a, b) => a.position - b.position);

  for (const car of orderedCars) {
    const classKey = options.multiclass ? car.classId || car.classColor : 0;
    if (!classes.has(classKey)) classes.set(classKey, []);
    classes.get(classKey).push(car);
  }

  const groups = [...classes.values()].slice(0, options.classesLimit);
  $('rows').innerHTML = groups
    .map(cars => `<section class="class-group">${cars
      .slice(0, options.rows)
      .map((car, index) => renderRow(car, index, cars, options))
      .join('')}</section>`)
    .join('');
}

/** Build one standings row and update its rolling gain/loss history. */
function renderRow(car, index, cars, options) {
  const previous = previousGaps.get(car.carIdx);
  if (previous !== undefined) {
    const history = histories.get(car.carIdx) || [];
    const delta = previous - car.gap;

    if (Math.abs(delta) > 0.005) {
      history.unshift(delta);
      history.splice(options.gainHistory);
      histories.set(car.carIdx, history);
    }
  }
  previousGaps.set(car.carIdx, car.gap);

  const precise = /race/i.test(data.sessionType)
    ? options.preciseRace
    : options.precisePracticeQualifying;
  const decimals = precise ? 3 : 1;
  const interval = index ? car.gap - cars[index - 1].gap : 0;
  const classColor = `#${(Number(car.classColor) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  const numberStyle = options.multiclassColor === 'car-number-bg'
    ? `background:${classColor};color:#111`
    : `color:${classColor}`;
  const positionChange = car.positionGain || 0;
  const multipleClasses = new Set(data.cars.map(item => item.classId || item.classColor)).size > 1;
  const showManufacturer = options.manufacturerLogo === 'always'
    || (options.manufacturerLogo === 'multiclass' && multipleClasses);
  const license = (car.license || 'R').replace(/\s+/g, '');
  const rating = options.ratingBadges
    ? `<b class="badge">${(car.irating / 1000).toFixed(1)}k</b>`
    : '';
  const ratingGain = options.iratingGain && car.iratingGain
    ? ` ${car.iratingGain > 0 ? '\u25B2' : '\u25BC'}${Math.abs(car.iratingGain)}`
    : '';
  const pitOrHistory = car.onPitRoad && options.showPit
    ? `<b class="pit">PIT${options.showPitTime && car.pitTime ? ` ${car.pitTime.toFixed(1)}` : ''}</b>`
    : (histories.get(car.carIdx) || [])
      .map(value => `<i class="${value >= 0 ? 'gain' : 'loss'}">${Math.abs(value).toFixed(1)}</i>`)
      .join(' ');

  return `<div class="standing-row ${car.isPlayer ? 'player' : ''}">
    <span class="position">${car.position}</span>
    <span class="change ${positionChange > 0 ? 'up' : positionChange < 0 ? 'down' : ''}">${positionChange > 0 ? '\u2303' : positionChange < 0 ? '\u2304' : '\u2013'}${Math.abs(positionChange) || ''}</span>
    <span class="number" style="${numberStyle}">${options.showCarNumbers ? `#${car.number}` : ''}</span>
    <span class="driver">${formatDriverName(car.name, options.driverNameStyle, options.nameCase)}</span>
    <span class="maker">${showManufacturer ? manufacturerCode(car.car) : ''}</span>
    <span>${options.ratingBadges ? `<b class="badge license">${license}</b>` : ''}</span>
    <span>${rating}${ratingGain}</span>
    <span class="gap">${options.showGap ? (index ? car.gap.toFixed(decimals) : `Laps ${car.lapsCompleted}`) : ''}</span>
    <span class="interval">${options.showInterval && index ? interval.toFixed(decimals) : ''}</span>
    <span class="lap">${options.showLastLap ? formatLapTime(car.lastLap, precise) : ''}</span>
    <span class="history">${pitOrHistory}</span>
  </div>`;
}

window.apex.getSettings().then(value => {
  settings = value;
  render();
});

window.apex.onSettings(value => {
  settings = value;
  render();
});

window.apex.onRelative(value => {
  data = value;
  render();
});

window.addEventListener('resize', render);
