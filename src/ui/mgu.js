/**
 * MGU overlay renderer.
 *
 * Hybrid values can arrive as 0..1 fractions or 0..100 percentages. The helper
 * below accepts both and gives the visual bars one consistent representation.
 */

let settings;
let telemetry;
// Compare consecutive frames to colour the border as charging or draining.
let lastBattery = null;

const $ = id => document.getElementById(id);
const percentage = value => Math.max(
  0,
  Math.min(100, (Number(value) || 0) * (Number(value) <= 1 ? 100 : 1))
);

/** Apply appearance settings and update both energy bars from the latest frame. */
function render() {
  if (!settings) return;

  const options = settings.mgu;
  const rootStyle = document.documentElement.style;
  const variables = {
    battery: options.batteryColor,
    deploy: options.deployColor,
    charge: options.chargeColor,
    drain: options.drainColor,
    bg: options.background,
    scale: options.scale / 100,
    'font-scale': options.fontSize / 100
  };

  for (const [key, value] of Object.entries(variables)) {
    rootStyle.setProperty(`--${key}`, value);
  }

  $('mgu').style.width = `${Math.max(1, (innerWidth - 12) / (options.scale / 100))}px`;
  $('mgu').style.height = `${Math.max(1, (innerHeight - 12) / (options.scale / 100))}px`;
  $('mgu').classList.toggle('editing', settings.mguEditMode);
  if (!telemetry) return;

  $('mgu').style.visibility = settings.mguEditMode || telemetry.demo || telemetry.mguAvailable
    ? 'visible'
    : 'hidden';

  // Normalize values before updating widths and formatted text.
  const battery = percentage(telemetry.mguBattery);
  const deploy = percentage(telemetry.mguDeploy);
  const digits = options.precision ? 1 : 0;

  $('battery').querySelector('.fill').style.width = `${battery}%`;
  $('battery').querySelector('strong').textContent = `${battery.toFixed(digits)}%`;
  $('deploy').querySelector('.fill').style.width = `${deploy}%`;
  $('deploy').querySelector('strong').textContent = `${deploy.toFixed(digits)}%`;
  $('deploy').style.display = options.showDeployBar ? 'block' : 'none';

  // The comparison uses a small dead zone to avoid flickering from telemetry noise.
  $('battery').classList.remove('charging', 'draining');
  if (options.batteryBorder && lastBattery !== null) {
    if (battery > lastBattery + 0.02) $('battery').classList.add('charging');
    if (battery < lastBattery - 0.02) $('battery').classList.add('draining');
  }
  lastBattery = battery;
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
