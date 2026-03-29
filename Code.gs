/**
 * 自堕落な人向けタスク管理 - Google Apps Script Backend
 * スプレッドシートをデータベースとして使用するWebAPI
 */

// ============================================================
// 初期設定
// ============================================================

/**
 * スプレッドシートの初期セットアップ（1回だけ実行）
 * メニューから「初期セットアップ」を実行するか、手動で呼び出す
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // タスクシート
  let taskSheet = ss.getSheetByName('タスク');
  if (!taskSheet) {
    taskSheet = ss.insertSheet('タスク');
    taskSheet.appendRow([
      'タスクID', 'タスク名', '締め切り', 'ペナルティID', '完了', '作成日', '完了日'
    ]);
    taskSheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  // ペナルティシート
  let penaltySheet = ss.getSheetByName('ペナルティ');
  if (!penaltySheet) {
    penaltySheet = ss.insertSheet('ペナルティ');
    penaltySheet.appendRow([
      'ペナルティID', 'ペナルティ名', '詳細'
    ]);
    penaltySheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  // ペナルティ履歴シート
  let historySheet = ss.getSheetByName('ペナルティ履歴');
  if (!historySheet) {
    historySheet = ss.insertSheet('ペナルティ履歴');
    historySheet.appendRow([
      '履歴ID', 'タスクID', 'タスク名', 'ペナルティID', 'ペナルティ名', '発動日', '実行済み'
    ]);
    historySheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  // デフォルトの Sheet1 を削除（存在すれば）
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('シート1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
}

/**
 * スプレッドシートを開いたときにカスタムメニューを追加
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('タスク管理')
    .addItem('初期セットアップ', 'setupSheets')
    .addToUi();
}

// ============================================================
// Web API エンドポイント
// ============================================================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const params = e.parameter;
  const action = params.action || '';

  let result;

  try {
    switch (action) {
      // タスク
      case 'getTasks':
        result = getTasks();
        break;
      case 'addTask':
        result = addTask(params);
        break;
      case 'completeTask':
        result = completeTask(params.taskId);
        break;
      case 'deleteTask':
        result = deleteTask(params.taskId);
        break;

      // ペナルティ
      case 'getPenalties':
        result = getPenalties();
        break;
      case 'addPenalty':
        result = addPenalty(params);
        break;
      case 'updatePenalty':
        result = updatePenalty(params);
        break;
      case 'deletePenalty':
        result = deletePenalty(params.penaltyId);
        break;

      // ペナルティ履歴
      case 'getHistory':
        result = getHistory();
        break;
      case 'triggerPenalty':
        result = triggerPenalty(params.taskId);
        break;
      case 'markHistoryDone':
        result = markHistoryDone(params.historyId);
        break;

      // 全データ取得（初期読み込み用）
      case 'getAll':
        result = {
          tasks: getTasks(),
          penalties: getPenalties(),
          history: getHistory()
        };
        break;

      default:
        result = { error: '不明なアクション: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ユーティリティ
// ============================================================

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function generateId() {
  return Utilities.getUuid().split('-')[0];
}

function toDateString(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function nowString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

// ============================================================
// タスク操作
// ============================================================

function getTasks() {
  const sheet = getSheet('タスク');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const tasks = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // 空行スキップ
    tasks.push({
      taskId: String(row[0]),
      name: String(row[1]),
      deadline: toDateString(row[2]),
      penaltyId: String(row[3] || ''),
      completed: row[4] === true || row[4] === 'TRUE' || row[4] === '完了',
      createdAt: String(row[5] || ''),
      completedAt: String(row[6] || '')
    });
  }
  return tasks;
}

function addTask(params) {
  const sheet = getSheet('タスク');
  const taskId = generateId();
  sheet.appendRow([
    taskId,
    params.name || '',
    params.deadline || '',
    params.penaltyId || '',
    false,
    nowString(),
    ''
  ]);
  return { success: true, taskId: taskId };
}

function completeTask(taskId) {
  const sheet = getSheet('タスク');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(taskId)) {
      sheet.getRange(i + 1, 5).setValue('完了');
      sheet.getRange(i + 1, 7).setValue(nowString());
      return { success: true };
    }
  }
  return { error: 'タスクが見つかりません' };
}

function deleteTask(taskId) {
  const sheet = getSheet('タスク');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(taskId)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'タスクが見つかりません' };
}

// ============================================================
// ペナルティ操作
// ============================================================

function getPenalties() {
  const sheet = getSheet('ペナルティ');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const penalties = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    penalties.push({
      penaltyId: String(row[0]),
      name: String(row[1]),
      detail: String(row[2] || '')
    });
  }
  return penalties;
}

function addPenalty(params) {
  const sheet = getSheet('ペナルティ');
  const penaltyId = generateId();
  sheet.appendRow([
    penaltyId,
    params.name || '',
    params.detail || ''
  ]);
  return { success: true, penaltyId: penaltyId };
}

function updatePenalty(params) {
  const sheet = getSheet('ペナルティ');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(params.penaltyId)) {
      if (params.name) sheet.getRange(i + 1, 2).setValue(params.name);
      if (params.detail !== undefined) sheet.getRange(i + 1, 3).setValue(params.detail);
      return { success: true };
    }
  }
  return { error: 'ペナルティが見つかりません' };
}

function deletePenalty(penaltyId) {
  const sheet = getSheet('ペナルティ');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(penaltyId)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: 'ペナルティが見つかりません' };
}

// ============================================================
// ペナルティ履歴操作
// ============================================================

function getHistory() {
  const sheet = getSheet('ペナルティ履歴');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const history = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    history.push({
      historyId: String(row[0]),
      taskId: String(row[1]),
      taskName: String(row[2]),
      penaltyId: String(row[3]),
      penaltyName: String(row[4]),
      triggeredAt: String(row[5] || ''),
      done: row[6] === true || row[6] === 'TRUE' || row[6] === '実行済み'
    });
  }
  return history;
}

/**
 * タスクの期限超過によるペナルティ発動
 */
function triggerPenalty(taskId) {
  const tasks = getTasks();
  const task = tasks.find(t => t.taskId === String(taskId));
  if (!task) return { error: 'タスクが見つかりません' };
  if (!task.penaltyId) return { error: 'このタスクにペナルティが設定されていません' };

  const penalties = getPenalties();
  const penalty = penalties.find(p => p.penaltyId === task.penaltyId);
  if (!penalty) return { error: 'ペナルティが見つかりません' };

  const historySheet = getSheet('ペナルティ履歴');
  const historyId = generateId();
  historySheet.appendRow([
    historyId,
    task.taskId,
    task.name,
    penalty.penaltyId,
    penalty.name,
    nowString(),
    false
  ]);

  return { success: true, historyId: historyId };
}

/**
 * ペナルティ履歴を「実行済み」にする
 */
function markHistoryDone(historyId) {
  const sheet = getSheet('ペナルティ履歴');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(historyId)) {
      sheet.getRange(i + 1, 7).setValue('実行済み');
      return { success: true };
    }
  }
  return { error: '履歴が見つかりません' };
}
