const express = require('express');
const db = require('./db');

const router = express.Router();

// Paleta de cores usada para identificar cada matéria de forma consistente
// (mesma paleta do design system em public/styles.css).
const SUBJECT_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#a855f7', '#38bdf8', '#f43f5e', '#84cc16', '#eab308'];
function subjectColor(id) {
  const n = Number(id) || 0;
  return SUBJECT_PALETTE[Math.abs(n) % SUBJECT_PALETTE.length];
}

// Helpers de data
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(decimalHours) {
  const h = Math.floor(decimalHours || 0);
  const m = Math.round(((decimalHours || 0) - h) * 60);
  return `${h}h ${m}m`;
}

function formatSessions(sessions) {
  return sessions.map(s => {
    s.formatted_time = formatTime(s.hours);
    s.accuracy = s.questions > 0 ? Math.round((s.correct / s.questions) * 100) + '%' : '-';
    s.color = subjectColor(s.subject_id);
    return s;
  });
}

function weekdayLabel(d) {
  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

// Middleware para calcular a ofensiva (streak)
router.use((req, res, next) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (err, row) => {
    const defaultDailyGoal = row ? parseFloat(row.value) : 1;
    // O cálculo da meta passa a considerar o `daily_goal` configurado NAQUELE DIA.
    db.all('SELECT date, SUM(hours) as total_hours, MAX(daily_goal) as day_goal FROM study_sessions GROUP BY date', (err, rows) => {
      let streak = 0;
      let isTodayMet = false;
      if (rows && !err) {
        const dailyDataMap = {};
        rows.forEach(s => {
          dailyDataMap[s.date] = {
            hours: s.total_hours,
            goal: s.day_goal || defaultDailyGoal
          };
        });

        let checkDate = new Date();
        const todayStr = formatDate(checkDate);
        const todayData = dailyDataMap[todayStr] || { hours: 0, goal: defaultDailyGoal };
        isTodayMet = todayData.hours >= todayData.goal;

        checkDate.setDate(checkDate.getDate() - 1);

        while (true) {
          let dateStr = formatDate(checkDate);
          let dayData = dailyDataMap[dateStr] || { hours: 0, goal: defaultDailyGoal };
          if (dayData.hours >= dayData.goal) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }

        if (isTodayMet) streak++;
      }
      res.locals.streak = streak;
      res.locals.goalMetToday = isTodayMet;
      next();
    });
  });
});

// Middleware para forçar a definição da meta diária
router.use((req, res, next) => {
  // Ignorar rotas de definição de meta para evitar loop infinito
  if (req.path === '/set-goal') return next();

  const todayStr = formatDate(new Date());

  db.get('SELECT value FROM settings WHERE key = ?', ['last_goal_date'], (errDate, rowDate) => {
    const lastGoalDate = rowDate ? rowDate.value : null;

    if (lastGoalDate !== todayStr) {
      return res.redirect('/set-goal');
    }
    next();
  });
});

// Rota GET para renderizar a página de meta
router.get('/set-goal', (req, res) => {
  const todayStr = formatDate(new Date());
  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (errGoal, rowGoal) => {
    const currentGoal = rowGoal ? parseFloat(rowGoal.value) : 4;
    res.render('set_goal', { pageTitle: 'Meta do dia', todayStr, currentGoal });
  });
});

router.post('/set-goal', (req, res) => {
  const { goal } = req.body;
  const todayStr = formatDate(new Date());

  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['daily_goal', goal], () => {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['last_goal_date', todayStr], () => {
      res.redirect('/dashboard');
    });
  });
});

// Redirecionar raiz para o dashboard
router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Dashboard com resumo rápido
router.get('/dashboard', (req, res) => {
  const today = new Date();
  const todayStr = formatDate(today);

  const weekStart = new Date();
  weekStart.setDate(today.getDate() - 6);
  const weekStartStr = formatDate(weekStart);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthStartStr = formatDate(monthStart);

  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (errGoal, rowGoal) => {
    const globalDailyGoal = rowGoal ? parseFloat(rowGoal.value) : 4; // default 4h

    db.get(
      `SELECT COALESCE(SUM(hours), 0) as total_hours,
              COALESCE(SUM(questions), 0) as total_questions,
              COALESCE(SUM(correct), 0) as total_correct,
              MAX(daily_goal) as day_target
         FROM study_sessions
         WHERE date = ?`,
      [todayStr],
      (errToday, todayStats) => {
        if (errToday) return res.status(500).send('Erro ao carregar resumo de hoje');
        const todayGoal = todayStats.day_target || globalDailyGoal;

        db.get(
          `SELECT COALESCE(SUM(hours), 0) as total_hours
             FROM study_sessions
             WHERE date BETWEEN ? AND ?`,
          [weekStartStr, todayStr],
          (errWeek, weekStats) => {
            if (errWeek) return res.status(500).send('Erro ao carregar resumo da semana');

            db.get(
              `SELECT COALESCE(SUM(hours), 0) as total_hours
                 FROM study_sessions
                 WHERE date BETWEEN ? AND ?`,
              [monthStartStr, todayStr],
              (errMonth, monthStats) => {
                if (errMonth) return res.status(500).send('Erro ao carregar resumo do mês');

                db.get(
                  `SELECT COALESCE(SUM(hours), 0) as total_hours,
                          COALESCE(SUM(questions), 0) as total_questions,
                          COALESCE(SUM(correct), 0) as total_correct,
                          COUNT(*) as total_sessions
                     FROM study_sessions`,
                  [],
                  (errAllTime, allTimeStats) => {
                    if (errAllTime) return res.status(500).send('Erro ao carregar resumo total');

                    db.all(
                      `SELECT s.id, s.date, s.hours, s.questions, s.correct, s.subject_id, sub.name AS subject_name
                         FROM study_sessions s
                         JOIN subjects sub ON s.subject_id = sub.id
                         ORDER BY s.date DESC, s.id DESC
                         LIMIT 5`,
                      [],
                      (errSessions, sessions) => {
                        if (errSessions) return res.status(500).send('Erro ao carregar últimos estudos');

                        db.all(
                          `SELECT date, SUM(hours) as hours
                             FROM study_sessions
                             WHERE date BETWEEN ? AND ?
                             GROUP BY date`,
                          [weekStartStr, todayStr],
                          (errSeries, seriesRows) => {
                            if (errSeries) return res.status(500).send('Erro ao carregar série semanal');

                            db.all(
                              `SELECT sub.name AS subject_name, sub.id AS subject_id, SUM(s.hours) as hours
                                 FROM study_sessions s
                                 JOIN subjects sub ON s.subject_id = sub.id
                                WHERE s.date BETWEEN ? AND ?
                                GROUP BY sub.name, sub.id
                                ORDER BY hours DESC
                                LIMIT 6`,
                              [monthStartStr, todayStr],
                              (errBreak, breakdownRows) => {
                                if (errBreak) return res.status(500).send('Erro ao carregar distribuição por matéria');

                                // Monta a série dos últimos 7 dias, preenchendo com 0 os dias sem estudo
                                const seriesMap = {};
                                (seriesRows || []).forEach(r => { seriesMap[r.date] = parseFloat(r.hours) || 0; });
                                const weekSeries = [];
                                for (let i = 6; i >= 0; i--) {
                                  const d = new Date();
                                  d.setDate(today.getDate() - i);
                                  const ds = formatDate(d);
                                  weekSeries.push({ date: ds, label: weekdayLabel(d), hours: seriesMap[ds] || 0 });
                                }

                                const breakdown = (breakdownRows || []).map(r => ({
                                  name: r.subject_name,
                                  hours: parseFloat(r.hours) || 0,
                                  color: subjectColor(r.subject_id)
                                }));

                                const weekAvg = weekStats.total_hours / 7;
                                let insight = "";
                                let insightIcon = "ph-lightbulb";
                                if (todayStats.total_hours >= todayGoal) {
                                  insight = `Parabéns! Você já bateu sua meta diária de ${formatTime(todayGoal)}.`;
                                  insightIcon = "ph-rocket-launch";
                                } else if (todayStats.total_hours > weekAvg && todayStats.total_hours > 0) {
                                  insight = `Muito bom! Você já estudou mais do que sua média semanal (${formatTime(weekAvg)}).`;
                                  insightIcon = "ph-trend-up";
                                } else if (todayStats.total_hours === 0) {
                                  insight = "Comece agora! Cada minuto conta para o seu sucesso.";
                                  insightIcon = "ph-lightbulb";
                                } else {
                                  insight = "Continue focado! O importante é manter a constância.";
                                  insightIcon = "ph-flame";
                                }

                                const overallAccuracy = allTimeStats.total_questions > 0
                                  ? Math.round((allTimeStats.total_correct / allTimeStats.total_questions) * 100)
                                  : null;

                                const streak = res.locals.streak || 0;
                                const badges = [
                                  { icon: 'ph-footprints', title: 'Primeiro passo', desc: 'Registre sua primeira sessão de estudo', unlocked: allTimeStats.total_sessions >= 1 },
                                  { icon: 'ph-fire', title: 'Ofensiva de 3 dias', desc: '3 dias seguidos batendo a meta', unlocked: streak >= 3 },
                                  { icon: 'ph-flame', title: 'Ofensiva de 7 dias', desc: '7 dias seguidos batendo a meta', unlocked: streak >= 7 },
                                  { icon: 'ph-mountains', title: 'Maratonista', desc: '50 horas de estudo acumuladas', unlocked: allTimeStats.total_hours >= 50 },
                                  { icon: 'ph-list-numbers', title: 'Mestre das questões', desc: '500 questões resolvidas', unlocked: allTimeStats.total_questions >= 500 },
                                  { icon: 'ph-medal', title: 'Precisão de elite', desc: '80% de aproveitamento (mín. 20 questões)', unlocked: !!overallAccuracy && overallAccuracy >= 80 && allTimeStats.total_questions >= 20 }
                                ];

                                res.render('dashboard', {
                                  pageTitle: 'Dashboard',
                                  todayStats,
                                  todayHoursFmt: formatTime(todayStats.total_hours),
                                  weekHours: formatTime(weekStats.total_hours),
                                  monthHours: formatTime(monthStats.total_hours),
                                  allTimeHours: formatTime(allTimeStats.total_hours),
                                  allTimeStats,
                                  overallAccuracy,
                                  sessions: formatSessions(sessions),
                                  dailyGoal: todayGoal,
                                  insight,
                                  insightIcon,
                                  weekSeries,
                                  breakdown,
                                  badges
                                });
                              }
                            );
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

// Página de registro
router.get('/study', (req, res) => {
  db.all('SELECT * FROM subjects ORDER BY name', [], (err, subjects) => {
    if (err) return res.status(500).send('Erro ao carregar matérias');
    res.render('study', { pageTitle: 'Nova sessão', subjects, todayStr: formatDate(new Date()) });
  });
});

// Registrar estudo
router.post('/study', (req, res) => {
  const { date, subject_id, hours, minutes, questions, correct } = req.body;

  if (!date || !subject_id) {
    return res.status(400).send('Data e Matéria são obrigatórios');
  }

  const h = parseFloat(hours) || 0;
  const m = parseFloat(minutes) || 0;

  if (h === 0 && m === 0) {
    return res.status(400).send('Preencha as horas ou minutos estudados');
  }

  const totalHours = h + (m / 60);
  const q = parseInt(questions, 10) || 0;
  const c = parseInt(correct, 10) || 0;

  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (errGoal, rowGoal) => {
    const dailyGoal = rowGoal ? parseFloat(rowGoal.value) : 4;

    const stmt = `INSERT INTO study_sessions (date, subject_id, hours, questions, correct, daily_goal)
                  VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(stmt, [date, subject_id, totalHours, q, c, dailyGoal], (err) => {
      if (err) return res.status(500).send('Erro ao salvar estudo');
      res.redirect('/history');
    });
  });
});

// Histórico de estudos
router.get('/history', (req, res) => {
  const { subject_id } = req.query;

  db.all('SELECT * FROM subjects ORDER BY name', [], (errSubjects, subjects) => {
    if (errSubjects) return res.status(500).send('Erro ao carregar matérias');

    let totalQuery = 'SELECT COALESCE(SUM(hours), 0) as total_hours FROM study_sessions';
    let totalParams = [];
    if (subject_id) {
      totalQuery += ' WHERE subject_id = ?';
      totalParams.push(subject_id);
    }

    db.get(totalQuery, totalParams, (errTotal, totalRow) => {
      let query = `SELECT s.id, s.date, s.hours, s.questions, s.correct, s.subject_id, sub.name AS subject_name
                     FROM study_sessions s
                     JOIN subjects sub ON s.subject_id = sub.id`;
      const params = [];

      if (subject_id) {
        query += ' WHERE s.subject_id = ?';
        params.push(subject_id);
      }

      query += ' ORDER BY s.date DESC, s.id DESC LIMIT 50';

      db.all(query, params, (err, sessions) => {
        if (err) return res.status(500).send('Erro ao carregar histórico');

        res.render('history', {
          pageTitle: 'Histórico',
          subjects: subjects.map(s => ({ ...s, color: subjectColor(s.id) })),
          sessions: formatSessions(sessions),
          selectedSubjectId: subject_id || '',
          totalHoursFilter: formatTime(totalRow ? totalRow.total_hours : 0)
        });
      });
    });
  });
});

// Listar/gerenciar matérias
router.get('/subjects', (req, res) => {
  db.all('SELECT * FROM subjects ORDER BY name', [], (err, subjects) => {
    if (err) return res.status(500).send('Erro ao carregar matérias');
    db.all(
      `SELECT subject_id, COUNT(*) as sessions, COALESCE(SUM(hours),0) as hours
         FROM study_sessions GROUP BY subject_id`,
      [],
      (errStats, statRows) => {
        const statsMap = {};
        (statRows || []).forEach(r => { statsMap[r.subject_id] = r; });
        const enriched = subjects.map(s => ({
          ...s,
          color: subjectColor(s.id),
          sessions: statsMap[s.id] ? parseInt(statsMap[s.id].sessions, 10) : 0,
          hours: statsMap[s.id] ? formatTime(statsMap[s.id].hours) : formatTime(0)
        }));
        res.render('subjects', { pageTitle: 'Matérias', subjects: enriched });
      }
    );
  });
});

router.post('/subjects', (req, res) => {
  const { name } = req.body;
  if (!name) return res.redirect('/subjects');

  db.run('INSERT OR IGNORE INTO subjects(name) VALUES (?)', [name], (err) => {
    if (err) return res.status(500).send('Erro ao criar matéria');
    res.redirect('/subjects');
  });
});

// Relatório por período
router.get('/report', (req, res) => {
  const { start_date, end_date, subject_id, year, month } = req.query;

  db.all('SELECT * FROM subjects ORDER BY name', [], (err, subjects) => {
    if (err) return res.status(500).send('Erro ao carregar matérias');

    let startDate = start_date;
    let endDate = end_date;

    // Retrocompatibilidade para quem acessa usando year/month antigos
    if (!startDate && !endDate && year && month) {
      startDate = `${year}-${month.padStart(2, '0')}-01`;
      endDate = `${year}-${month.padStart(2, '0')}-31`;
    } else if (!startDate || !endDate) {
      // Padrão do mês atual se nada for passado
      const today = new Date();
      startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-31`;
    }

    let query = `SELECT date, SUM(hours) as total_hours, SUM(questions) as total_questions, SUM(correct) as total_correct
                 FROM study_sessions
                 WHERE date BETWEEN ? AND ?`;
    const params = [startDate, endDate];

    if (subject_id) {
      query += " AND subject_id = ?";
      params.push(subject_id);
    }

    query += " GROUP BY date ORDER BY date";

    db.all(query, params, (err2, rows) => {
      if (err2) return res.status(500).send("Erro ao gerar relatorio");

      const labels = rows.map(r => r.date);
      const dataHours = rows.map(r => r.total_hours);
      const dataQuestions = rows.map(r => r.total_questions);
      const dataCorrect = rows.map(r => r.total_correct);

      const displayHours = rows.map(r => formatTime(r.total_hours));
      const displayAccuracy = rows.map(r => r.total_questions > 0 ? Math.round((r.total_correct / r.total_questions) * 100) + "%" : "-");

      const totalPeriodHours = dataHours.reduce((acc, curr) => acc + (curr || 0), 0);
      const totalPeriodQuestions = dataQuestions.reduce((acc, curr) => acc + curr, 0);
      const totalPeriodCorrect = dataCorrect.reduce((acc, curr) => acc + curr, 0);
      const overallAccuracy = totalPeriodQuestions > 0
        ? Math.round((totalPeriodCorrect / totalPeriodQuestions) * 100) + "%"
        : "-";

      const chartData = {
        labels,
        dataHours,
        dataQuestions,
        dataCorrect,
        displayHours,
        displayAccuracy,
        totalPeriodHoursFmt: formatTime(totalPeriodHours),
        totalPeriodQuestions,
        totalPeriodCorrect,
        overallAccuracy
      };

      res.render('report', {
        pageTitle: 'Relatórios',
        subjects,
        chartData,
        filters: { start_date: startDate, end_date: endDate, subject_id }
      });
    });
  });
});

// Editar Sessão
router.get('/edit/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM study_sessions WHERE id = ?', [id], (err, session) => {
    if (err || !session) return res.status(404).send('Sessão não encontrada');
    db.all('SELECT * FROM subjects ORDER BY name', [], (errSub, subjects) => {
      res.render('edit', { pageTitle: 'Editar sessão', session, subjects });
    });
  });
});

router.post('/edit/:id', (req, res) => {
  const { id } = req.params;
  const { date, subject_id, hours, minutes, questions, correct } = req.body;
  const h = parseFloat(hours) || 0;
  const m = parseFloat(minutes) || 0;
  const totalHours = h + (m / 60);
  const q = parseInt(questions, 10) || 0;
  const c = parseInt(correct, 10) || 0;

  db.run(`UPDATE study_sessions SET date = ?, subject_id = ?, hours = ?, questions = ?, correct = ? WHERE id = ?`,
    [date, subject_id, totalHours, q, c, id],
    (err) => {
      if (err) return res.status(500).send('Erro ao editar sessão');
      res.redirect('/history');
    }
  );
});

// Excluir Sessão
router.post('/delete/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM study_sessions WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).send('Erro ao excluir sessão');
    res.redirect('/history');
  });
});

// Pomodoro
router.get('/pomodoro', (req, res) => {
  res.render('pomodoro', { pageTitle: 'Pomodoro' });
});

// Configurações e Metas
router.get('/settings', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (err, row) => {
    const goal = row ? row.value : 4;
    res.render('settings', { pageTitle: 'Configurações', goal });
  });
});

router.post('/settings', (req, res) => {
  const { daily_goal } = req.body;
  if (daily_goal) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['daily_goal', daily_goal], (err) => {
      res.redirect('/dashboard');
    });
  } else {
    res.redirect('/settings');
  }
});

// Calendário
router.get('/calendar', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', ['daily_goal'], (err, row) => {
    const dailyGoal = row ? parseFloat(row.value) : 4;

    db.all('SELECT date, SUM(hours) as total_hours FROM study_sessions GROUP BY date', [], (err2, rows) => {
      if (err2) return res.status(500).send('Erro ao carregar calendário');
      res.render('calendar', { pageTitle: 'Calendário', data: rows || [], dailyGoal });
    });
  });
});

// Checklist
router.get('/checklist', async (req, res) => {
  try {
    // Forçar criação da tabela
    await db._initPromise;
    db.all('SELECT * FROM checklist ORDER BY completed ASC, created_at DESC', (err, rows) => {
      if (err) return res.status(500).send('Erro ao carregar checklist: ' + (err.message || JSON.stringify(err)));
      res.render('checklist', { pageTitle: 'Checklist', tasks: rows || [] });
    });
  } catch (e) {
    res.status(500).send('Erro de INIT: ' + e.message);
  }
});

router.post('/checklist/add', (req, res) => {
  const { task } = req.body;
  if (!task) return res.redirect('/checklist');
  db.run('INSERT INTO checklist (task) VALUES (?)', [task.trim()], (err) => {
    res.redirect('/checklist');
  });
});

router.post('/checklist/toggle', (req, res) => {
  const { id } = req.body;
  if (!id) return res.redirect('/checklist');
  db.run('UPDATE checklist SET completed = NOT completed WHERE id = ?', [id], (err) => {
    res.redirect('/checklist');
  });
});

router.post('/checklist/delete', (req, res) => {
  const { id } = req.body;
  if (!id) return res.redirect('/checklist');
  db.run('DELETE FROM checklist WHERE id = ?', [id], (err) => {
    res.redirect('/checklist');
  });
});

module.exports = router;
