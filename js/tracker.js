(function () {
  var form = document.getElementById('vitalForm');
  var tableBody = document.getElementById('vitalRows');
  var clearBtn = document.getElementById('clearVitals');
  var exportBtn = document.getElementById('exportVitals');
  var canvas = document.getElementById('vitalsChart');
  var avgHrEl = document.getElementById('avgHr');
  var avgBpEl = document.getElementById('avgBp');
  var avgOxygenEl = document.getElementById('avgOxygen');

  var vitalsCache = [];

  function toNum(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function summarize(list) {
    if (!list.length) {
      avgHrEl.textContent = '--';
      avgBpEl.textContent = '--/--';
      avgOxygenEl.textContent = '--%';
      return;
    }

    var hrSum = 0;
    var sysSum = 0;
    var diaSum = 0;
    var oxygenSum = 0;

    list.forEach(function (item) {
      hrSum += toNum(item.hr);
      sysSum += toNum(item.sys);
      diaSum += toNum(item.dia);
      oxygenSum += toNum(item.oxygen);
    });

    var len = list.length;
    avgHrEl.textContent = String(Math.round(hrSum / len));
    avgBpEl.textContent = String(Math.round(sysSum / len)) + '/' + String(Math.round(diaSum / len));
    avgOxygenEl.textContent = String(Math.round(oxygenSum / len)) + '%';
  }

  function renderTable(list) {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!list.length) {
      var row = document.createElement('tr');
      var cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No vitals logged yet.';
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    list
      .slice()
      .reverse()
      .forEach(function (item) {
        var row = document.createElement('tr');
        row.innerHTML =
          '<td>' +
          new Date(item.timestamp).toLocaleString() +
          '</td>' +
          '<td>' +
          item.hr +
          ' bpm</td>' +
          '<td>' +
          item.sys +
          '/' +
          item.dia +
          ' mmHg</td>' +
          '<td>' +
          item.oxygen +
          '%</td>' +
          '<td>' +
          Number(item.steps || 0).toLocaleString() +
          '</td>' +
          '<td>' +
          (item.glucose ? item.glucose + ' mg/dL' : '--') +
          '</td>' +
          '<td>' +
          (item.notes || '-') +
          '</td>';
        tableBody.appendChild(row);
      });
  }

  function drawChart(list) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth - 20 : 600;
    canvas.width = Math.max(380, parentWidth);
    canvas.height = 280;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#e3e6f4';
    ctx.lineWidth = 1;
    for (var gy = 0; gy <= 5; gy += 1) {
      var y = 20 + (gy * (canvas.height - 50)) / 5;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(canvas.width - 10, y);
      ctx.stroke();
    }

    if (!list.length) {
      ctx.fillStyle = '#6d7388';
      ctx.font = '13px Plus Jakarta Sans';
      ctx.fillText('Add vitals to draw trend lines.', 40, 40);
      return;
    }

    var recent = list.slice(-12);
    var maxY = 190;
    var minY = 40;
    var span = maxY - minY;

    function toY(value) {
      return 20 + ((maxY - value) / span) * (canvas.height - 50);
    }

    function drawSeries(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      recent.forEach(function (item, idx) {
        var x = 40 + idx * ((canvas.width - 60) / Math.max(1, recent.length - 1));
        var y = toY(toNum(item[key]));
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      recent.forEach(function (item, idx) {
        var x = 40 + idx * ((canvas.width - 60) / Math.max(1, recent.length - 1));
        var y = toY(toNum(item[key]));
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawSeries('hr', '#6e33e4');
    drawSeries('sys', '#2785d8');

    ctx.fillStyle = '#525a6f';
    ctx.font = '12px Plus Jakarta Sans';
    ctx.fillText('Purple: Resting HR', 40, canvas.height - 10);
    ctx.fillText('Blue: Systolic BP', 180, canvas.height - 10);
  }

  function refreshFromCache() {
    summarize(vitalsCache);
    renderTable(vitalsCache);
    drawChart(vitalsCache);
  }

  async function loadVitals() {
    try {
      vitalsCache = await window.HealthApi.vitals.list();
    } catch (error) {
      vitalsCache = [];
      window.alert(error.message);
    }
    refreshFromCache();
  }

  function downloadJson(filename, payload) {
    var blob = new Blob([payload], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var entry = {
        timestamp: form.timestamp.value ? new Date(form.timestamp.value).toISOString() : new Date().toISOString(),
        hr: toNum(form.hr.value),
        sys: toNum(form.sys.value),
        dia: toNum(form.dia.value),
        oxygen: toNum(form.oxygen.value),
        glucose: form.glucose.value ? toNum(form.glucose.value) : null,
        steps: toNum(form.steps.value),
        notes: form.notes.value.trim()
      };

      try {
        await window.HealthApi.vitals.add(entry);
        form.reset();

        var now = new Date();
        form.timestamp.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);

        await loadVitals();
      } catch (error) {
        window.alert(error.message);
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', async function () {
        try {
          await window.HealthApi.vitals.clear();
          await loadVitals();
        } catch (error) {
          window.alert(error.message);
        }
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        downloadJson('heartcare-vitals.json', JSON.stringify(vitalsCache, null, 2));
      });
    }

    var initial = new Date();
    form.timestamp.value = new Date(initial.getTime() - initial.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);

    loadVitals();
    window.addEventListener('resize', refreshFromCache);
  }
})();
