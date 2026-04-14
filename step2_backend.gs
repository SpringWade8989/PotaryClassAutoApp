// ══════════════════════════════════════════════════════════════════
//  도예 체험 예약 시스템 — Google Apps Script (Backend)
//  파일명: step2_backend.gs
//  역할: doPost(예약 접수), doGet(마감 슬롯 조회), onEdit(관리자 승인 트리거)
// ══════════════════════════════════════════════════════════════════

/* ──────────────────────────────────────────────────────────────────
   ★ 설정값 — 반드시 본인 환경에 맞게 수정하세요
────────────────────────────────────────────────────────────────── */
const CONFIG = {
  // Google Sheets ID (URL에서 /d/ 뒤의 긴 문자열)
  SHEET_ID: 'YOUR_GOOGLE_SHEET_ID',

  // 시트 탭 이름
  SHEET_NAME_DB:       '예약DB',        // 예약 데이터가 쌓이는 시트
  SHEET_NAME_SETTINGS: '설정',          // 견적 단가 등 설정값 시트 (선택)

  // Jandi(또는 Slack) Incoming Webhook URL
  WEBHOOK_URL: 'https://wh.jandi.com/connect-api/webhook/YOUR_JANDI_KEY',

  // 관리자 이메일 (예약 확정 알림 수신)
  ADMIN_EMAIL: 'admin@yourdomain.com',

  // Google Drive — 견적서 템플릿 파일 ID (Google Sheets 형식)
  ESTIMATE_TEMPLATE_ID: 'YOUR_TEMPLATE_SHEET_ID',

  // Google Drive — 완성된 견적서 PDF를 저장할 폴더 ID
  ESTIMATE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID',

  // Google Calendar ID (보통 관리자 이메일과 동일, 또는 캘린더 설정에서 확인)
  CALENDAR_ID: 'YOUR_CALENDAR_ID@group.calendar.google.com',

  // 예약 DB 시트의 열 인덱스 (1-based)
  COL: {
    ROW_ID:      1,   // A: 접수번호
    SUBMITTED:   2,   // B: 접수일시
    DATE:        3,   // C: 체험날짜
    PROGRAM:     4,   // D: 프로그램
    TIME:        5,   // E: 시간대
    COUNT:       6,   // F: 인원수
    NAME:        7,   // G: 신청자명
    PHONE:       8,   // H: 연락처
    EMAIL:       9,   // I: 이메일
    MEMO:        10,  // J: 메모
    STATUS:      11,  // K: 상태 (대기/확정/취소)
    APPROVE_CB:  12,  // L: ✅ 승인 체크박스
    CANCEL_CB:   13,  // M: ❌ 취소 체크박스
    CALENDAR_ID: 14,  // N: 등록된 캘린더 이벤트 ID
    ESTIMATE_URL:15,  // O: 견적서 URL
  },
};

/* ══════════════════════════════════════════════════════════════════
   1. doGet — 프론트에서 마감된 예약 슬롯 조회
══════════════════════════════════════════════════════════════════ */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';

  if (action === 'getBookedSlots') {
    return handleGetBookedSlots();
  }

  return jsonResponse({ status: 'ok', message: 'Pottery Reservation API' });
}

function handleGetBookedSlots() {
  try {
    const sheet = getSheet(CONFIG.SHEET_NAME_DB);
    const data  = sheet.getDataRange().getValues();

    // 날짜별로 확정(또는 대기)된 시간대 수집
    // → 각 날짜·시간대 조합이 몇 건인지 카운트 (비즈니스 규칙: 1타임 = 1팀만 허용)
    const slotMap = {};

    for (let i = 1; i < data.length; i++) {
      const row    = data[i];
      const status = String(row[CONFIG.COL.STATUS - 1]).trim();
      if (status === '취소') continue;  // 취소 건은 제외

      const date = formatDate(row[CONFIG.COL.DATE - 1]);
      const time = String(row[CONFIG.COL.TIME - 1]).trim();
      if (!date || !time) continue;

      if (!slotMap[date]) slotMap[date] = [];
      if (!slotMap[date].includes(time)) slotMap[date].push(time);
    }

    return jsonResponse({ status: 'ok', data: slotMap });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

/* ══════════════════════════════════════════════════════════════════
   2. doPost — 프론트에서 예약 데이터 수신 및 DB 저장
══════════════════════════════════════════════════════════════════ */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action || '';

    if (action === 'reserve') {
      return handleReserve(payload);
    }

    return jsonResponse({ status: 'error', message: '알 수 없는 action입니다.' });

  } catch (err) {
    Logger.log('doPost 오류: ' + err.message);
    return jsonResponse({ status: 'error', message: err.message });
  }
}

function handleReserve(data) {
  // ① 중복 예약 체크 (동일 날짜·시간에 대기/확정 건이 있으면 거부)
  if (isSlotTaken(data.date, data.time)) {
    return jsonResponse({
      status:  'error',
      message: '선택하신 날짜/시간대는 이미 예약이 마감되었습니다. 다른 시간을 선택해 주세요.'
    });
  }

  const sheet  = getSheet(CONFIG.SHEET_NAME_DB);
  const rowId  = generateRowId();
  const now    = new Date();

  // ② 시트에 새 행 추가
  sheet.appendRow([
    rowId,                                           // A: 접수번호
    now,                                             // B: 접수일시
    data.date,                                       // C: 체험날짜
    data.program,                                    // D: 프로그램
    data.time,                                       // E: 시간대
    Number(data.count),                              // F: 인원수
    data.name,                                       // G: 신청자명
    data.phone,                                      // H: 연락처
    data.email,                                      // I: 이메일
    data.memo || '',                                 // J: 메모
    '대기',                                          // K: 상태
    false,                                           // L: 승인 체크박스
    false,                                           // M: 취소 체크박스
    '',                                              // N: 캘린더 이벤트 ID
    '',                                              // O: 견적서 URL
  ]);

  // ③ 승인 체크박스 열에 체크박스 UI 적용 (appendRow 직후 마지막 행)
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, CONFIG.COL.APPROVE_CB).insertCheckboxes();
  sheet.getRange(lastRow, CONFIG.COL.CANCEL_CB).insertCheckboxes();

  // ④ 관리자에게 Webhook 알림 발송
  sendWebhookNotification({
    type:    '신규 예약 접수',
    rowId,
    date:    data.date,
    program: data.program,
    time:    data.time,
    count:   data.count,
    name:    data.name,
    phone:   data.phone,
    email:   data.email,
  });

  return jsonResponse({ status: 'ok', rowId });
}

/* ══════════════════════════════════════════════════════════════════
   3. onEdit 트리거 — 관리자가 Google Sheets에서 체크박스 클릭
      (트리거: 설치형 onEdit 또는 프로젝트 트리거로 등록)
══════════════════════════════════════════════════════════════════ */
function onEditTrigger(e) {
  if (!e) return;

  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== CONFIG.SHEET_NAME_DB) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row < 2) return; // 헤더 행 무시

  // ── 승인 체크박스 (L열)
  if (col === CONFIG.COL.APPROVE_CB && e.value === 'TRUE') {
    handleApproval(sheet, row);
  }

  // ── 취소 체크박스 (M열)
  if (col === CONFIG.COL.CANCEL_CB && e.value === 'TRUE') {
    handleCancellation(sheet, row);
  }
}

/* ── 승인 처리 ── */
function handleApproval(sheet, row) {
  const rowData  = sheet.getRange(row, 1, 1, 15).getValues()[0];
  const status   = String(rowData[CONFIG.COL.STATUS - 1]).trim();

  if (status === '확정') {
    SpreadsheetApp.getUi().alert('이미 확정된 예약입니다.');
    return;
  }

  const reservationInfo = extractReservationInfo(rowData);

  try {
    // ① 상태를 '확정'으로 변경
    sheet.getRange(row, CONFIG.COL.STATUS).setValue('확정');

    // ② 견적서 생성 → PDF 변환 → Drive 저장
    const estimateUrl = createEstimatePdf(reservationInfo);
    if (estimateUrl) {
      sheet.getRange(row, CONFIG.COL.ESTIMATE_URL).setValue(estimateUrl);
      reservationInfo.estimateUrl = estimateUrl;
    }

    // ③ Google Calendar 이벤트 등록
    const eventId = addCalendarEvent(reservationInfo);
    if (eventId) {
      sheet.getRange(row, CONFIG.COL.CALENDAR_ID).setValue(eventId);
    }

    // ④ 신청자에게 확정 이메일 발송
    sendConfirmationEmail(reservationInfo);

    // ⑤ 관리자 Webhook 알림 (확정 완료)
    sendWebhookNotification({
      type:        '예약 확정 완료',
      rowId:       reservationInfo.rowId,
      date:        reservationInfo.date,
      program:     reservationInfo.program,
      time:        reservationInfo.time,
      count:       reservationInfo.count,
      name:        reservationInfo.name,
      phone:       reservationInfo.phone,
      email:       reservationInfo.email,
      estimateUrl: estimateUrl || '(생성 실패)',
    });

  } catch (err) {
    Logger.log('승인 처리 오류: ' + err.message);
    SpreadsheetApp.getUi().alert('처리 중 오류가 발생했습니다: ' + err.message);
    // 오류 시 체크박스 해제 & 상태 원복
    sheet.getRange(row, CONFIG.COL.APPROVE_CB).setValue(false);
    sheet.getRange(row, CONFIG.COL.STATUS).setValue('대기');
  }
}

/* ── 취소 처리 ── */
function handleCancellation(sheet, row) {
  const rowData = sheet.getRange(row, 1, 1, 15).getValues()[0];
  const eventId = String(rowData[CONFIG.COL.CALENDAR_ID - 1]).trim();

  sheet.getRange(row, CONFIG.COL.STATUS).setValue('취소');
  sheet.getRange(row, CONFIG.COL.APPROVE_CB).setValue(false);

  // 캘린더 이벤트 삭제
  if (eventId) {
    try {
      CalendarApp.getCalendarById(CONFIG.CALENDAR_ID)
                 .getEventById(eventId)
                 .deleteEvent();
      sheet.getRange(row, CONFIG.COL.CALENDAR_ID).setValue('');
    } catch (err) {
      Logger.log('캘린더 이벤트 삭제 실패: ' + err.message);
    }
  }

  const info = extractReservationInfo(rowData);
  sendWebhookNotification({
    type:    '예약 취소 처리',
    rowId:   info.rowId,
    date:    info.date,
    program: info.program,
    time:    info.time,
    count:   info.count,
    name:    info.name,
    phone:   info.phone,
    email:   info.email,
  });
}

/* ══════════════════════════════════════════════════════════════════
   4. 헬퍼 함수
══════════════════════════════════════════════════════════════════ */

/** 예약 행 데이터를 객체로 변환 */
function extractReservationInfo(rowData) {
  const C = CONFIG.COL;
  return {
    rowId:    rowData[C.ROW_ID - 1],
    date:     formatDate(rowData[C.DATE - 1]),
    program:  rowData[C.PROGRAM - 1],
    time:     rowData[C.TIME - 1],
    count:    rowData[C.COUNT - 1],
    name:     rowData[C.NAME - 1],
    phone:    rowData[C.PHONE - 1],
    email:    rowData[C.EMAIL - 1],
    memo:     rowData[C.MEMO - 1],
  };
}

/** 동일 날짜·시간대에 대기/확정 예약이 있는지 확인 */
function isSlotTaken(date, time) {
  const sheet  = getSheet(CONFIG.SHEET_NAME_DB);
  const data   = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const status = String(row[CONFIG.COL.STATUS - 1]).trim();
    if (status === '취소') continue;

    const rowDate = formatDate(row[CONFIG.COL.DATE - 1]);
    const rowTime = String(row[CONFIG.COL.TIME - 1]).trim();

    if (rowDate === date && rowTime === time) return true;
  }
  return false;
}

/** 접수번호 생성 (YYYYMMDD-HHMM-랜덤4자리) */
function generateRowId() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const rand    = Math.floor(Math.random() * 9000) + 1000;
  return `${dateStr}-${timeStr}-${rand}`;
}

/** Date 객체 또는 문자열을 'YYYY-MM-DD' 형식으로 통일 */
function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).trim().slice(0, 10);
}

/** 시트 객체 가져오기 */
function getSheet(sheetName) {
  const ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`시트 "${sheetName}"를 찾을 수 없습니다.`);
  return sheet;
}

/** JSON ContentService 응답 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ══════════════════════════════════════════════════════════════════
   5. Jandi(Slack) Webhook 알림
══════════════════════════════════════════════════════════════════ */
function sendWebhookNotification(info) {
  if (!CONFIG.WEBHOOK_URL || CONFIG.WEBHOOK_URL.includes('YOUR_')) return;

  const emoji = info.type === '예약 확정 완료' ? '✅' :
                info.type === '예약 취소 처리' ? '❌' : '📋';

  const body = {
    body: `${emoji} *[${info.type}]*`,
    connectColor: info.type === '예약 확정 완료' ? '#27ae60' :
                  info.type === '예약 취소 처리' ? '#e74c3c' : '#f39c12',
    connectInfo: [
      {
        title: '접수번호',
        description: String(info.rowId),
      },
      {
        title: '체험날짜',
        description: `${info.date} (${info.time === '오전' ? '오전 10:00~12:00' : '오후 14:00~16:00'})`,
      },
      {
        title: '프로그램',
        description: `${info.program} / ${info.count}명`,
      },
      {
        title: '신청자',
        description: `${info.name} | ${info.phone} | ${info.email}`,
      },
      ...(info.estimateUrl ? [{ title: '견적서', description: info.estimateUrl }] : []),
    ],
  };

  try {
    UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
      method:      'post',
      contentType: 'application/json',
      payload:     JSON.stringify(body),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log('Webhook 전송 오류: ' + err.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   6. 예약 확정 이메일 발송
══════════════════════════════════════════════════════════════════ */
function sendConfirmationEmail(info) {
  const subject = `[도예 체험] 예약이 확정되었습니다 — ${info.date} ${info.time}`;
  const timeLabel = info.time === '오전' ? '오전 10:00~12:00' : '오후 14:00~16:00';

  const htmlBody = `
    <div style="font-family: 'Apple SD Gothic Neo', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #fffbf5; border-radius: 12px;">
      <h2 style="color: #92400e; border-bottom: 2px solid #fef3c7; padding-bottom: 12px;">
        🎨 도예 체험 예약 확정 안내
      </h2>
      <p style="color: #57534e;">${info.name}님, 예약이 확정되었습니다!</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; background:#fef3c7; font-weight:bold; width:35%;">날짜</td><td style="padding: 8px; background:#fffbf5;">${info.date}</td></tr>
        <tr><td style="padding: 8px; background:#fef3c7; font-weight:bold;">시간</td><td style="padding: 8px; background:#fffbf5;">${timeLabel}</td></tr>
        <tr><td style="padding: 8px; background:#fef3c7; font-weight:bold;">프로그램</td><td style="padding: 8px; background:#fffbf5;">${info.program}</td></tr>
        <tr><td style="padding: 8px; background:#fef3c7; font-weight:bold;">인원</td><td style="padding: 8px; background:#fffbf5;">${info.count}명</td></tr>
      </table>
      ${info.estimateUrl ? `<p style="margin-top:16px;"><a href="${info.estimateUrl}" style="background:#92400e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">📄 견적서 보기</a></p>` : ''}
      <p style="color: #78716c; font-size: 13px; margin-top: 24px;">
        문의: ${CONFIG.ADMIN_EMAIL}<br/>
        ※ 체험 당일 10분 전 도착 부탁드립니다.
      </p>
    </div>
  `;

  try {
    GmailApp.sendEmail(info.email, subject, '', {
      htmlBody,
      name: '도예 체험 예약 시스템',
      replyTo: CONFIG.ADMIN_EMAIL,
    });
  } catch (err) {
    Logger.log('이메일 발송 오류: ' + err.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   7. Google Sheets 초기 헤더 생성 (최초 1회 수동 실행)
      Apps Script 에디터에서 setupSheet() 함수를 실행하세요.
══════════════════════════════════════════════════════════════════ */
function setupSheet() {
  const ss    = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let   sheet = ss.getSheetByName(CONFIG.SHEET_NAME_DB);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_DB);
  }

  const headers = [
    '접수번호', '접수일시', '체험날짜', '프로그램', '시간대',
    '인원수', '신청자명', '연락처', '이메일', '메모',
    '상태', '승인', '취소', '캘린더이벤트ID', '견적서URL',
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
       .setBackground('#92400e')
       .setFontColor('#ffffff')
       .setFontWeight('bold');
  sheet.setFrozenRows(1);

  // 열 너비 자동 조정
  sheet.autoResizeColumns(1, headers.length);

  SpreadsheetApp.getUi().alert('시트 초기화가 완료되었습니다!');
}

/* ══════════════════════════════════════════════════════════════════
   8. onEdit 트리거 등록 (최초 1회 수동 실행)
      Apps Script 에디터에서 installTrigger() 함수를 실행하세요.
══════════════════════════════════════════════════════════════════ */
function installTrigger() {
  // 기존 트리거 삭제 (중복 방지)
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('onEditTrigger')
           .forSpreadsheet(CONFIG.SHEET_ID)
           .onEdit()
           .create();

  Logger.log('트리거 등록 완료');
  SpreadsheetApp.getUi().alert('onEdit 트리거가 등록되었습니다!');
}
