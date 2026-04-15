(function () {
  var form = document.getElementById('symptomForm');
  var levelEl = document.getElementById('urgencyLevel');
  var badgeEl = document.getElementById('urgencyBadge');
  var guidanceEl = document.getElementById('urgencyGuidance');
  var saveBtn = document.getElementById('saveSymptomEvent');
  var logWrap = document.getElementById('symptomLog');
  var timerEl = document.getElementById('monitorTimer');
  var timerBtn = document.getElementById('startTimer');
  var clearBtn = document.getElementById('clearSymptomLog');

  var timerId = null;
  var timerRemaining = 0;
  var symptomLog = [];

  var symptomWeights = {
    chest_pressure: 10,
    radiating_pain: 9,
    short_breath: 8,
    cold_sweat: 5,
    nausea: 4,
    dizziness: 4,
    fainting: 9,
    palpitations: 4,
    leg_swelling: 3,
    fatigue: 2
  };

  function selectedSymptoms() {
    var checks = form.querySelectorAll("input[name='symptom']:checked");
    return Array.prototype.map.call(checks, function (node) {
      return node.value;
    });
  }

  function evaluate() {
    if (!form) return null;
    var selected = selectedSymptoms();
    var score = selected.reduce(function (sum, key) {
      return sum + (symptomWeights[key] || 0);
    }, 0);

    var duration = form.duration.value;
    var intensity = form.intensity.value;

    if (duration === 'over_20') score += 5;
    if (duration === 'hours') score += 2;

    if (intensity === 'severe') score += 6;
    else if (intensity === 'moderate') score += 3;

    var emergencyCombo =
      selected.includes('chest_pressure') &&
      (selected.includes('short_breath') || selected.includes('radiating_pain'));

    var result = {
      score: score,
      selected: selected,
      level: 'Monitor',
      className: 'good',
      guidance: 'Continue observing. Re-check if symptoms persist or worsen.',
      action: 'Log symptoms and check again in 30 minutes.'
    };

    if (emergencyCombo || score >= 20 || selected.includes('fainting')) {
      result.level = 'Emergency';
      result.className = 'danger';
      result.guidance = 'Possible acute cardiac event. Contact emergency services immediately.';
      result.action = 'Do not drive yourself. Seek emergency care now.';
    } else if (score >= 13) {
      result.level = 'Urgent';
      result.className = 'danger';
      result.guidance = 'High concern symptoms. Seek urgent medical evaluation within 1 hour.';
      result.action = 'Call urgent care or emergency triage line now.';
    } else if (score >= 8) {
      result.level = 'Same-day review';
      result.className = 'warn';
      result.guidance = 'Symptoms need same-day professional assessment.';
      result.action = 'Contact your doctor today and monitor closely.';
    }

    return result;
  }

  function render(result) {
    if (!result) return;
    if (badgeEl) {
      badgeEl.className = 'status ' + result.className;
      badgeEl.textContent = 'Score ' + result.score;
    }
    if (levelEl) {
      levelEl.textContent = result.level;
      levelEl.style.color =
        result.className === 'danger' ? '#b22034' : result.className === 'warn' ? '#8b6000' : '#10734f';
    }
    if (guidanceEl) {
      guidanceEl.textContent = result.guidance + ' ' + result.action;
    }
  }

  function renderLog() {
    if (!logWrap) return;
    logWrap.innerHTML = '';

    if (!symptomLog.length) {
      var empty = document.createElement('div');
      empty.className = 'notice';
      empty.textContent = 'No symptom events saved yet.';
      logWrap.appendChild(empty);
      return;
    }

    symptomLog
      .slice()
      .reverse()
      .forEach(function (entry) {
        var item = document.createElement('div');
        item.className = 'list-item';
        var left = document.createElement('div');
        var right = document.createElement('div');
        right.className = 'legend';
        left.innerHTML =
          '<strong>' + entry.level + '</strong><br><span class=\'legend\'>' + entry.summary + '</span>';
        right.textContent = new Date(entry.timestamp).toLocaleString();
        item.appendChild(left);
        item.appendChild(right);
        logWrap.appendChild(item);
      });
  }

  async function loadLog() {
    try {
      var response = await window.HealthApi.symptoms.list();
      symptomLog = (response && response.logs) || [];
      renderLog();
    } catch (error) {
      symptomLog = [];
      renderLog();
      window.alert(error.message);
    }
  }

  async function saveCurrentResult(result) {
    await window.HealthApi.symptoms.add({
      level: result.level,
      score: result.score,
      summary: result.selected.length
        ? result.selected.join(', ').replace(/_/g, ' ')
        : 'no symptoms selected',
      timestamp: new Date().toISOString()
    });

    await loadLog();
  }

  function renderTimer() {
    if (!timerEl) return;
    var min = Math.floor(timerRemaining / 60);
    var sec = timerRemaining % 60;
    timerEl.textContent = String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  function startFiveMinuteTimer() {
    timerRemaining = 5 * 60;
    renderTimer();
    if (timerId) {
      window.clearInterval(timerId);
    }
    timerId = window.setInterval(function () {
      timerRemaining -= 1;
      renderTimer();
      if (timerRemaining <= 0) {
        window.clearInterval(timerId);
        timerId = null;
        if (guidanceEl) {
          guidanceEl.textContent = 'Monitoring window finished. Re-evaluate symptoms now.';
        }
      }
    }, 1000);
  }

  if (form) {
    form.addEventListener('input', function () {
      var result = evaluate();
      render(result);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var result = evaluate();
      render(result);
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var result = evaluate();
        if (!result) return;

        try {
          await saveCurrentResult(result);
        } catch (error) {
          window.alert(error.message);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', async function () {
        try {
          await window.HealthApi.symptoms.clear();
          await loadLog();
        } catch (error) {
          window.alert(error.message);
        }
      });
    }

    if (timerBtn) {
      timerBtn.addEventListener('click', startFiveMinuteTimer);
    }

    render(evaluate());
    loadLog();
    renderTimer();
  }
})();
