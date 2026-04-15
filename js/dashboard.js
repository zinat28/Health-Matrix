(function () {
  var hrSlider = document.getElementById('simHr');
  var sysSlider = document.getElementById('simSys');
  var hrValue = document.getElementById('simHrValue');
  var sysValue = document.getElementById('simSysValue');
  var riskBadge = document.getElementById('simRiskBadge');
  var riskText = document.getElementById('simRiskText');
  var barsWrap = document.getElementById('trendBars');

  function classifyRisk(hr, sys) {
    var score = 0;
    if (hr >= 100) score += 6;
    else if (hr >= 85) score += 3;

    if (sys >= 160) score += 7;
    else if (sys >= 140) score += 4;
    else if (sys >= 130) score += 2;

    if (score >= 9) {
      return {
        label: 'High concern',
        className: 'danger',
        message: 'Schedule clinician review and avoid intense exertion until cleared.'
      };
    }
    if (score >= 5) {
      return {
        label: 'Needs attention',
        className: 'warn',
        message: 'Review medication adherence and monitor vitals twice today.'
      };
    }
    return {
      label: 'Stable',
      className: 'good',
      message: "Continue current routine and log tonight's readings."
    };
  }

  function updateTrendBars(hr) {
    if (!barsWrap) return;
    barsWrap.innerHTML = '';
    for (var i = 0; i < 12; i += 1) {
      var wave = Math.sin((i / 12) * Math.PI * 2) * 8;
      var random = Math.round(Math.random() * 18);
      var height = Math.max(20, Math.min(100, hr - 45 + wave + random));
      var bar = document.createElement('span');
      bar.className = 'chart-bar' + (i % 4 === 0 ? ' accent' : '');
      bar.style.height = height + '%';
      barsWrap.appendChild(bar);
    }
  }

  function updateSimulation() {
    if (!hrSlider || !sysSlider) return;
    var hr = Number(hrSlider.value);
    var sys = Number(sysSlider.value);
    if (hrValue) hrValue.textContent = String(hr) + ' bpm';
    if (sysValue) sysValue.textContent = String(sys) + ' mmHg';

    var state = classifyRisk(hr, sys);
    if (riskBadge) {
      riskBadge.className = 'status ' + state.className;
      riskBadge.textContent = state.label;
    }
    if (riskText) {
      riskText.textContent = state.message;
    }
    updateTrendBars(hr);
  }

  async function hydrateFromTracker() {
    try {
      var vitals = await window.HealthApi.vitals.list();
      if (!vitals.length) {
        return;
      }

      var latest = vitals[vitals.length - 1];
      var hrStat = document.getElementById('statHr');
      var bpStat = document.getElementById('statBp');
      var oxygenStat = document.getElementById('statOxygen');
      var activityStat = document.getElementById('statActivity');
      var latestStamp = document.getElementById('latestStamp');

      if (hrStat && latest.hr) hrStat.textContent = String(latest.hr);
      if (bpStat && latest.sys && latest.dia) bpStat.textContent = String(latest.sys) + '/' + String(latest.dia);
      if (oxygenStat && latest.oxygen) oxygenStat.textContent = String(latest.oxygen) + '%';
      if (activityStat && latest.steps !== undefined) activityStat.textContent = Number(latest.steps || 0).toLocaleString();

      if (latestStamp && latest.timestamp) {
        latestStamp.textContent = 'Latest tracker sync: ' + new Date(latest.timestamp).toLocaleString();
      }

      if (hrSlider && latest.hr) hrSlider.value = String(latest.hr);
      if (sysSlider && latest.sys) sysSlider.value = String(latest.sys);
    } catch (_err) {
    }
  }

  hydrateFromTracker().then(updateSimulation);

  if (hrSlider) hrSlider.addEventListener('input', updateSimulation);
  if (sysSlider) sysSlider.addEventListener('input', updateSimulation);
})();
