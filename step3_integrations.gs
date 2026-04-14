// ══════════════════════════════════════════════════════════════════
//  도예 체험 예약 시스템 — GAS 연동 함수 모음
//  파일명: step3_integrations.gs
//  역할: Google Calendar, Google Drive(견적서), Jandi Webhook
//
//  ※ 이 파일은 step2_backend.gs 와 같은 GAS 프로젝트에 추가합니다.
//     (Apps Script 에디터 → + 파일 → step3_integrations)
// ══════════════════════════════════════════════════════════════════

/* ══════════════════════════════════════════════════════════════════
   A. Google Calendar — 예약 일정 등록
══════════════════════════════════════════════════════════════════ */

/**
 * 예약 확정 시 캘린더에 이벤트를 등록하고, 이벤트 ID를 반환합니다.
 * @param {Object} info — extractReservationInfo()가 반환한 예약 객체
 * @returns {string} eventId
 */
function addCalendarEvent(info) {
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) throw new Error('캘린더를 찾을 수 없습니다. CALENDAR_ID를 확인하세요.');

  // ── 시작·종료 시각 계산
  const [year, month, day] = info.date.split('-').map(Number);
  let startHour, endHour;

  if (info.time === '오전') {
    startHour = 10; endHour = 12;
  } else {
    startHour = 14; endHour = 16;
  }

  const startTime = new Date(year, month - 1, day, startHour, 0);
  const endTime   = new Date(year, month - 1, day, endHour,   0);

  // ── 이벤트 제목 / 설명
  const title       = `[도예체험] ${info.program} — ${info.name}님 (${info.count}명)`;
  const description = [
    `📋 접수번호: ${info.rowId}`,
    `🎨 프로그램: ${info.program}`,
    `👥 인원: ${info.count}명`,
    `📞 연락처: ${info.phone}`,
    `📧 이메일: ${info.email}`,
    info.memo ? `📝 메모: ${info.memo}` : '',
    info.estimateUrl ? `🔗 견적서: ${info.estimateUrl}` : '',
  ].filter(Boolean).join('\n');

  // ── 이벤트 생성 옵션
  const options = {
    description,
    guests:       info.email,           // 신청자 이메일을 참석자로 추가
    sendInvites:  true,                 // 참석자에게 캘린더 초대 발송
    location:     '도예 공방',          // 필요 시 실제 주소로 변경
  };

  const event = calendar.createEvent(title, startTime, endTime, options);

  Logger.log('캘린더 이벤트 등록 완료: ' + event.getId());
  return event.getId();
}

/**
 * 캘린더 이벤트 삭제 (취소 처리 시)
 * @param {string} eventId
 */
function deleteCalendarEvent(eventId) {
  if (!eventId) return;
  try {
    const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
    const event    = calendar.getEventById(eventId);
    if (event) event.deleteEvent();
    Logger.log('캘린더 이벤트 삭제 완료: ' + eventId);
  } catch (err) {
    Logger.log('캘린더 이벤트 삭제 실패: ' + err.message);
  }
}

/* ══════════════════════════════════════════════════════════════════
   B. Google Drive — 견적서 생성 (템플릿 복사 → 치환 → PDF 저장)
══════════════════════════════════════════════════════════════════ */

/**
 * 견적서 템플릿(Google Sheets)을 복사하고, 예약 정보로 플레이스홀더를 치환한 뒤
 * PDF로 변환하여 Drive 폴더에 저장합니다.
 *
 * 템플릿 Google Sheet에서 사용할 플레이스홀더 예시:
 *   {{접수번호}}, {{신청자명}}, {{연락처}}, {{이메일}}
 *   {{체험날짜}}, {{시간대}}, {{프로그램}}, {{인원수}}
 *   {{견적금액}}, {{비고}}
 *
 * @param {Object} info — extractReservationInfo()가 반환한 예약 객체
 * @returns {string} 생성된 PDF 파일의 Drive URL
 */
function createEstimatePdf(info) {
  if (!CONFIG.ESTIMATE_TEMPLATE_ID || CONFIG.ESTIMATE_TEMPLATE_ID.includes('YOUR_')) {
    Logger.log('견적서 템플릿 ID가 설정되지 않았습니다. 건너뜁니다.');
    return '';
  }

  // ── ① 템플릿 Google Sheet 복사
  const templateFile = DriveApp.getFileById(CONFIG.ESTIMATE_TEMPLATE_ID);
  const folder       = DriveApp.getFolderById(CONFIG.ESTIMATE_FOLDER_ID);
  const fileName     = `견적서_${info.name}_${info.date}_${info.program}`;
  const copiedFile   = templateFile.makeCopy(fileName, folder);

  // ── ② 복사된 파일을 Spreadsheet로 열기
  const ss    = SpreadsheetApp.openById(copiedFile.getId());
  const sheet = ss.getActiveSheet();

  // ── ③ 견적 금액 계산 (단가 설정 시트 참조 또는 하드코딩)
  const unitPrice = getUnitPrice(info.program);  // 1인당 가격
  const totalAmount = unitPrice * Number(info.count);
  const timeLabel   = info.time === '오전' ? '오전 10:00~12:00' : '오후 14:00~16:00';

  // ── ④ 플레이스홀더 치환
  const replacements = {
    '{{접수번호}}':  String(info.rowId),
    '{{신청자명}}':  info.name,
    '{{연락처}}':    info.phone,
    '{{이메일}}':    info.email,
    '{{체험날짜}}':  info.date,
    '{{시간대}}':    timeLabel,
    '{{프로그램}}':  info.program,
    '{{인원수}}':    `${info.count}명`,
    '{{단가}}':      `${unitPrice.toLocaleString()}원`,
    '{{견적금액}}':  `${totalAmount.toLocaleString()}원`,
    '{{비고}}':      info.memo || '',
    '{{발행일}}':    formatDate(new Date()),
  };

  replaceAllInSheet(sheet, replacements);

  // 저장을 위해 잠시 대기
  SpreadsheetApp.flush();

  // ── ⑤ PDF 변환 및 저장
  const pdfBlob = convertSheetToPdf(copiedFile.getId(), ss.getActiveSheet().getSheetId());
  const pdfFile = folder.createFile(pdfBlob.setName(`${fileName}.pdf`));

  // ── ⑥ 원본 Google Sheet 파일 삭제 (PDF만 보존)
  //    보존하고 싶으면 아래 줄을 주석 처리하세요.
  // copiedFile.setTrashed(true);

  Logger.log('견적서 PDF 생성 완료: ' + pdfFile.getUrl());
  return pdfFile.getUrl();
}

/** 시트 전체에서 플레이스홀더 치환 */
function replaceAllInSheet(sheet, replacements) {
  const range  = sheet.getDataRange();
  let   values = range.getValues();

  values = values.map(row =>
    row.map(cell => {
      if (typeof cell !== 'string') return cell;
      let result = cell;
      Object.entries(replacements).forEach(([placeholder, value]) => {
        result = result.split(placeholder).join(value);
      });
      return result;
    })
  );

  range.setValues(values);
}

/** Google Sheets → PDF Blob 변환 (Drive API 활용) */
function convertSheetToPdf(fileId, sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${fileId}/export`
    + `?exportFormat=pdf`
    + `&format=pdf`
    + `&size=A4`
    + `&portrait=true`
    + `&fitw=true`
    + `&gid=${sheetId}`
    + `&top_margin=0.5`
    + `&bottom_margin=0.5`
    + `&left_margin=0.5`
    + `&right_margin=0.5`
    + `&gridlines=false`
    + `&printtitle=false`
    + `&sheetnames=false`;

  const token    = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('PDF 변환 실패: ' + response.getContentText());
  }

  return response.getBlob().setContentType('application/pdf');
}

/**
 * 프로그램별 1인당 단가 반환
 * → 실제 단가는 이 함수에서 수정하거나 '설정' 시트에서 가져오세요.
 */
function getUnitPrice(program) {
  const prices = {
    '코일링':           30000,
    '얼굴접시':         35000,
    '핸드페인팅':       25000,
    '캐릭터접시':       35000,
    '엔틱접시':         40000,
    'ESG 도자기텀블러': 45000,
    'ESG 유아식기세트': 55000,
    '칠보공예':         35000,
  };
  return prices[program] || 30000; // 미등록 프로그램은 기본 3만원
}

/* ══════════════════════════════════════════════════════════════════
   C. 테스트용 함수 — Apps Script 에디터에서 직접 실행 가능
══════════════════════════════════════════════════════════════════ */

/** Webhook 알림 테스트 */
function testWebhook() {
  sendWebhookNotification({
    type:    '신규 예약 접수',
    rowId:   '20241215-1030-TEST',
    date:    '2024-12-25',
    program: '코일링',
    time:    '오전',
    count:   4,
    name:    '홍길동',
    phone:   '010-1234-5678',
    email:   'test@example.com',
  });
  Logger.log('Webhook 테스트 완료');
}

/** 캘린더 이벤트 등록 테스트 */
function testCalendar() {
  const info = {
    rowId:       '20241215-TEST',
    date:        '2024-12-25',
    program:     '핸드페인팅',
    time:        '오후',
    count:       2,
    name:        '테스트 신청자',
    phone:       '010-0000-0000',
    email:       'test@example.com',
    memo:        '테스트 예약입니다.',
    estimateUrl: '',
  };
  const eventId = addCalendarEvent(info);
  Logger.log('테스트 이벤트 ID: ' + eventId);
}

/** 견적서 PDF 생성 테스트 */
function testEstimate() {
  const info = {
    rowId:   '20241215-TEST',
    date:    '2024-12-25',
    program: '코일링',
    time:    '오전',
    count:   3,
    name:    '홍길동',
    phone:   '010-1234-5678',
    email:   'test@example.com',
    memo:    '테스트용 견적서',
  };
  const url = createEstimatePdf(info);
  Logger.log('생성된 견적서 URL: ' + url);
}

/** doGet 응답 테스트 (실행 후 로그 확인) */
function testDoGet() {
  const fakeEvent = { parameter: { action: 'getBookedSlots' } };
  const result = doGet(fakeEvent);
  Logger.log(result.getContent());
}

/** doPost 응답 테스트 */
function testDoPost() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        action:      'reserve',
        date:        '2024-12-25',
        program:     '코일링',
        time:        '오전',
        count:       2,
        name:        '홍길동',
        phone:       '010-1234-5678',
        email:       'test@example.com',
        memo:        '테스트 예약',
        submittedAt: new Date().toISOString(),
      }),
    },
  };
  const result = doPost(fakeEvent);
  Logger.log(result.getContent());
}
