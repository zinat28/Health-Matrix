(function () {
  var form = document.getElementById('riskForm');
  var scoreEl = document.getElementById('riskScore');
  var markerEl = document.getElementById('riskMarker');
  var levelEl = document.getElementById('riskLevel');
  var summaryEl = document.getElementById('riskSummary');
  var recList = document.getElementById('riskRecommendations');
  var factorsEl = document.getElementById('riskFactors');
  var savedEl = document.getElementById('lastSavedRisk');

  function toNum(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function scoreRisk(values) {
    var score = 0;
    var factors = [];

    if (values.age >= 65) {
      score += 7;
      factors.push({ name: 'Age', detail: '65+ adds 7 points' });
    } else if (values.age >= 55) {
      score += 5;
      factors.push({ name: 'Age', detail: '55-64 adds 5 points' });
    } else if (values.age >= 45) {
      score += 3;
      factors.push({ name: 'Age', detail: '45-54 adds 3 points' });
    }

    if (values.sex === 'male') {
      score += 2;
      factors.push({ name: 'Sex', detail: 'Male baseline adds 2 points' });
    }

    if (values.smoker === 'yes') {
      score += 6;
      factors.push({ name: 'Smoking', detail: 'Current smoking adds 6 points' });
    }

    if (values.diabetes === 'yes') {
      score += 7;
      factors.push({ name: 'Diabetes', detail: 'Diabetes adds 7 points' });
    }

    if (values.familyHistory === 'yes') {
      score += 4;
      factors.push({ name: 'Family history', detail: 'Early heart disease in family adds 4 points' });
    }

    if (values.sys >= 160) {
      score += 8;
      factors.push({ name: 'Systolic BP', detail: '160+ mmHg adds 8 points' });
    } else if (values.sys >= 140) {
      score += 5;
      factors.push({ name: 'Systolic BP', detail: '140-159 mmHg adds 5 points' });
    } else if (values.sys >= 130) {
      score += 3;
      factors.push({ name: 'Systolic BP', detail: '130-139 mmHg adds 3 points' });
    }

    if (values.ldl >= 190) {
      score += 7;
      factors.push({ name: 'LDL', detail: 'LDL 190+ adds 7 points' });
    } else if (values.ldl >= 160) {
      score += 4;
      factors.push({ name: 'LDL', detail: 'LDL 160-189 adds 4 points' });
    } else if (values.ldl >= 130) {
      score += 2;
      factors.push({ name: 'LDL', detail: 'LDL 130-159 adds 2 points' });
    }

    if (values.hdl < 40) {
      score += 3;
      factors.push({ name: 'HDL', detail: 'HDL under 40 adds 3 points' });
    } else if (values.hdl >= 60) {
      score -= 2;
      factors.push({ name: 'HDL', detail: 'HDL 60+ subtracts 2 points' });
    }

    if (values.activity === 'low') {
      score += 4;
      factors.push({ name: 'Activity', detail: 'Low activity adds 4 points' });
    } else if (values.activity === 'moderate') {
      score += 1;
      factors.push({ name: 'Activity', detail: 'Moderate activity adds 1 point' });
    } else {
      score -= 1;
      factors.push({ name: 'Activity', detail: 'High activity subtracts 1 point' });
    }

    if (values.bmi >= 35) {
      score += 5;
      factors.push({ name: 'BMI', detail: 'BMI 35+ adds 5 points' });
    } else if (values.bmi >= 30) {
      score += 3;
      factors.push({ name: 'BMI', detail: 'BMI 30-34.9 adds 3 points' });
    } else if (values.bmi >= 25) {
      score += 1;
      factors.push({ name: 'BMI', detail: 'BMI 25-29.9 adds 1 point' });
    }

    if (score < 0) score = 0;
    return { score: score, factors: factors };
  }

  function levelFromScore(score) {
    if (score >= 33) {
      return {
        label: 'Critical risk',
        className: 'danger',
        summary: 'High probability of cardiovascular event in coming years. Seek clinician assessment soon.',
        recommendations: [
          'Book a cardiology consultation this week.',
          'Track blood pressure morning and evening.',
          'Avoid smoking and high-sodium food immediately.',
          'Discuss statin and blood pressure medication adherence with your clinician.'
        ]
      };
    }
    if (score >= 24) {
      return {
        label: 'High risk',
        className: 'danger',
        summary: 'Risk factors stack is significant. A structured intervention plan is needed.',
        recommendations: [
          'Schedule full lipid and glucose labs.',
          'Target 150 minutes of weekly low-intensity activity.',
          'Limit sodium to less than 1500 mg/day and reduce processed food.',
          'Re-check score after 4-6 weeks of changes.'
        ]
      };
    }
    if (score >= 15) {
      return {
        label: 'Moderate risk',
        className: 'warn',
        summary: 'Some factors are concerning but manageable with consistent habits.',
        recommendations: [
          'Increase aerobic activity to at least 30 minutes on most days.',
          'Focus on fiber-rich, low-saturated-fat meals.',
          'Monitor resting heart rate and blood pressure weekly.',
          'Review family history and labs with your doctor.'
        ]
      };
    }
    return {
      label: 'Low risk',
      className: 'good',
      summary: 'Current profile appears favorable. Continue prevention-focused habits.',
      recommendations: [
        'Maintain regular exercise and sleep routine.',
        'Keep annual screening labs up to date.',
        'Avoid smoking and maintain healthy body weight.',
        'Repeat this check every 3 months.'
      ]
    };
  }

  function renderResult(rawScore, factors) {
    var state = levelFromScore(rawScore);
    if (scoreEl) scoreEl.textContent = String(rawScore);

    if (markerEl) {
      var maxScore = 40;
      var pct = Math.max(0, Math.min(100, (rawScore / maxScore) * 100));
      markerEl.style.left = pct + '%';
    }

    if (levelEl) {
      levelEl.className = 'status ' + state.className;
      levelEl.textContent = state.label;
    }

    if (summaryEl) {
      summaryEl.textContent = state.summary;
    }

    if (recList) {
      recList.innerHTML = '';
      state.recommendations.forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item;
        recList.appendChild(li);
      });
    }

    if (factorsEl) {
      factorsEl.innerHTML = '';
      factors.forEach(function (factor) {
        var div = document.createElement('div');
        div.className = 'factor';
        div.innerHTML = '<strong>' + factor.name + '</strong><span>' + factor.detail + '</span>';
        factorsEl.appendChild(div);
      });

      if (!factors.length) {
        var empty = document.createElement('div');
        empty.className = 'notice';
        empty.textContent = 'No major risk contributor detected from the current values.';
        factorsEl.appendChild(empty);
      }
    }

    return state;
  }

  function buildValues() {
    return {
      age: toNum(form.age.value),
      sex: form.sex.value,
      smoker: form.smoker.value,
      diabetes: form.diabetes.value,
      familyHistory: form.familyHistory.value,
      sys: toNum(form.sys.value),
      ldl: toNum(form.ldl.value),
      hdl: toNum(form.hdl.value),
      bmi: toNum(form.bmi.value),
      activity: form.activity.value
    };
  }

  async function loadLastSaved() {
    try {
      var response = await window.HealthApi.risk.getLatest();
      if (response && response.result && savedEl) {
        savedEl.textContent = 'Last saved result: ' + new Date(response.result.timestamp).toLocaleString();
      }
    } catch (_err) {
      if (savedEl) {
        savedEl.textContent = 'No prior saved result';
      }
    }
  }

  if (form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var values = buildValues();
      var result = scoreRisk(values);
      var state = renderResult(result.score, result.factors);

      try {
        var saveResult = await window.HealthApi.risk.save({
          score: result.score,
          label: state.label,
          summary: state.summary,
          factors: result.factors,
          inputs: values
        });

        if (savedEl) {
          savedEl.textContent = 'Saved ' + new Date(saveResult.timestamp).toLocaleString();
        }
      } catch (error) {
        if (savedEl) {
          savedEl.textContent = 'Save failed: ' + error.message;
        }
      }
    });

    loadLastSaved();
    form.dispatchEvent(new Event('submit'));
  }
})();
