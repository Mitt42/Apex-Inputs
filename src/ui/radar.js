/**
 * Renders contextual side-by-side warnings and keeps multiple cars on the same
 * side visually separated.
 */

let settings;
let telemetry;

const $ = id => document.getElementById(id);

/** Convert longitudinal offsets into vertical positions inside one radar rail. */
function segmentPositions(count, options) {
  // Two cars use fixed separated positions so their segments never overlap.
  if (count === 2) return [28, 72];

  const offsets = (telemetry.radarOffsets || []).slice(0, count);
  while (offsets.length < count) offsets.push(0);

  return offsets.map(offset => Math.max(
    8,
    Math.min(
      92,
      (offset + options.distanceAhead)
        / (options.distanceAhead + options.distanceBehind)
        * 100
    )
  ));
}

/** Replace the segments for one side of the radar. */
function renderSegments(side, count, options) {
  $(side).innerHTML = segmentPositions(count, options)
    .map(top => `<i class="segment" style="top:${top}%"></i>`)
    .join('');
}

/** Apply settings and map iRacing's CarLeftRight state to left/right segments. */
function render() {
  if (!settings) return;

  const options = settings.radar;
  const rootStyle = document.documentElement.style;
  const backgroundCap = options.capStyle === 'round'
    ? `${options.backgroundWidth / 2}px`
    : options.capStyle === 'square' ? '2px' : '0';
  const variables = {
    bg: options.background,
    line: options.lineColor,
    'bg-width': `${options.backgroundWidth}px`,
    'line-width': `${options.lineWidth}px`,
    'line-opacity': options.lineOpacity / 100,
    scale: options.scale / 100,
    transition: options.transition ? '.14s' : '0s',
    'background-cap': backgroundCap
  };

  for (const [key, value] of Object.entries(variables)) {
    rootStyle.setProperty(`--${key}`, value);
  }

  $('radar').style.width = `${Math.max(1, (innerWidth - 16) / (options.scale / 100))}px`;
  $('radar').style.height = `${Math.max(1, (innerHeight - 16) / (options.scale / 100))}px`;
  $('radar').classList.toggle('editing', settings.radarEditMode);
  if (!telemetry) return;

  const state = Number(telemetry.carLeftRight) || 0;
  const demo = Boolean(telemetry.demo);
  $('radar').style.visibility = settings.radarEditMode || state > 1 || demo
    ? 'visible'
    : 'hidden';

  let left = 0;
  let right = 0;
  if (state === 2) left = 1;
  if (state === 3) right = 1;
  if (state === 4) {
    left = 1;
    right = 1;
  }
  if (state === 5) left = 2;
  if (state === 6) right = 2;
  if (demo && state < 2) {
    left = 1;
    right = 1;
  }

  renderSegments('left', left, options);
  renderSegments('right', right, options);
}

window.apex.getSettings().then(value => {
  settings = value;
  render();
});
window.apex.onSettings(value => {
  settings = value;
  render();
});
window.apex.onTelemetry(value => {
  telemetry = value;
  render();
});
window.addEventListener('resize', render);
