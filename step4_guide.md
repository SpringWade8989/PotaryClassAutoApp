# 도예 체험 예약 시스템 — 배포 및 설정 가이드

> **전체 소요 시간:** 약 30~40분  
> **준비물:** Google 계정(Google Workspace 권장), 아임웹 관리자 계정, Jandi(또는 Slack) Webhook URL

---

## 📁 파일 구성 요약

| 파일 | 역할 |
|------|------|
| `step1_frontend.html` | 아임웹 코드 위젯에 삽입할 예약 UI |
| `step2_backend.gs` | GAS 메인 백엔드 (doPost, doGet, onEdit) |
| `step3_integrations.gs` | GAS 연동 함수 (캘린더, 드라이브, Jandi) |

---

## STEP 1 — Google Sheets 예약 DB 준비

### 1-1. 새 Google Sheet 생성
1. [Google Sheets](https://sheets.google.com) 에서 **새 스프레드시트** 생성
2. 파일 이름을 `도예체험 예약 DB`로 저장
3. URL에서 Sheet ID를 복사해 메모  
   예: `https://docs.google.com/spreadsheets/d/`**`1abc...XYZ`**`/edit`  
   → **`1abc...XYZ`** 부분이 Sheet ID

### 1-2. 견적서 템플릿 Google Sheet 생성
1. 새 Google Sheet 생성 → 파일 이름: `도예체험 견적서 템플릿`
2. 아래 플레이스홀더를 셀에 입력하여 견적서 양식 디자인:
   - `{{접수번호}}` `{{신청자명}}` `{{연락처}}` `{{이메일}}`
   - `{{체험날짜}}` `{{시간대}}` `{{프로그램}}` `{{인원수}}`
   - `{{단가}}` `{{견적금액}}` `{{비고}}` `{{발행일}}`
3. 원하는 대로 로고, 테두리, 색상 등 서식 적용 후 저장
4. 이 파일의 **Sheet ID**도 복사해 메모

### 1-3. Drive 폴더 생성
1. Google Drive에서 `도예체험_견적서` 폴더 생성
2. 폴더 열기 → 주소창 URL 끝의 **폴더 ID** 복사  
   예: `https://drive.google.com/drive/folders/`**`1Folder...ABC`**

---

## STEP 2 — Google Calendar 준비

1. [Google Calendar](https://calendar.google.com) → 왼쪽 **+ 다른 캘린더** 클릭
2. **새 캘린더 만들기** 선택 → 이름: `도예체험 예약`
3. 생성 후 캘린더 **설정** 진입 → **캘린더 ID** 복사  
   예: `abc123def@group.calendar.google.com`

---

## STEP 3 — Jandi Webhook 설정

### Jandi 사용 시
1. Jandi 앱 → 채널 선택 → **서비스 연동** → **Incoming Webhook** 추가
2. 생성된 **Webhook URL** 복사  
   예: `https://wh.jandi.com/connect-api/webhook/xxxxx/...`

### Slack 사용 시 (선택)
1. [api.slack.com/apps](https://api.slack.com/apps) → 앱 생성 → **Incoming Webhooks** 활성화
2. **Add New Webhook to Workspace** → 채널 선택 → URL 복사

---

## STEP 4 — Google Apps Script 프로젝트 생성

### 4-1. 프로젝트 생성
1. [script.google.com](https://script.google.com) → **새 프로젝트**
2. 프로젝트 이름: `도예체험 예약 시스템`

### 4-2. 코드 파일 추가
1. 기본 `Code.gs` 파일 선택 → 이름을 `step2_backend`로 변경
2. `step2_backend.gs` 전체 코드를 붙여넣기

3. 왼쪽 **+** 버튼 → **스크립트** → 이름: `step3_integrations`
4. `step3_integrations.gs` 전체 코드를 붙여넣기

### 4-3. 설정값(CONFIG) 입력
`step2_backend.gs` 상단 `CONFIG` 객체에서 아래 항목을 실제 값으로 교체:

```javascript
const CONFIG = {
  SHEET_ID:             '← 1-1에서 복사한 Sheet ID',
  WEBHOOK_URL:          '← 3에서 복사한 Webhook URL',
  ADMIN_EMAIL:          '← 관리자 이메일',
  ESTIMATE_TEMPLATE_ID: '← 1-2에서 복사한 템플릿 Sheet ID',
  ESTIMATE_FOLDER_ID:   '← 1-3에서 복사한 Drive 폴더 ID',
  CALENDAR_ID:          '← 2에서 복사한 캘린더 ID',
  // 나머지는 그대로 유지
};
```

### 4-4. 시트 초기화 (최초 1회)
1. 에디터 상단 함수 선택 드롭다운에서 **`setupSheet`** 선택
2. **▶ 실행** 클릭 → 권한 승인 → Google Sheet에 헤더 행이 생성됨

### 4-5. onEdit 트리거 등록 (최초 1회)
1. 에디터 상단 드롭다운에서 **`installTrigger`** 선택
2. **▶ 실행** → 권한 승인 → 트리거 등록 완료 확인

---

## STEP 5 — GAS 웹 앱 배포

1. 에디터 우측 상단 **배포** → **새 배포** 클릭
2. 유형 선택: **웹 앱**
3. 설정:
   - **설명:** `도예체험 예약 API v1`
   - **다음 사용자로 실행:** `나(내 계정)` ← 반드시 이 옵션 선택
   - **액세스 권한:** `모든 사용자(익명 포함)` ← 프론트에서 호출 가능하게
4. **배포** 클릭 → 권한 승인 (모든 권한 허용)
5. 생성된 **웹 앱 URL** 복사  
   예: `https://script.google.com/macros/s/AKfycby.../exec`

> ⚠️ **주의:** 코드를 수정할 때마다 **새 배포(새 버전)** 를 생성해야 변경사항이 반영됩니다.  
> "배포 관리"에서 기존 배포를 새 버전으로 업데이트하거나 새 배포를 생성하세요.

---

## STEP 6 — 프론트엔드 설정 및 아임웹 삽입

### 6-1. GAS URL 입력
`step1_frontend.html` 상단 설정값에 5에서 복사한 URL을 입력:

```javascript
const GAS_URL = 'https://script.google.com/macros/s/AKfycby.../exec';
```

### 6-2. 아임웹에 삽입
1. 아임웹 관리자 → **페이지 편집** → 예약 페이지 선택
2. 위젯 추가 → **코드 위젯** (HTML/CSS/JS) 선택
3. `step1_frontend.html`의 `<body>` 태그 **안쪽** 내용 전체를 붙여넣기  
   (즉, `<div class="min-h-screen...">` 부터 마지막 `</script>` 까지)
4. **저장** → 페이지 미리보기로 확인

> 💡 **팁:** 아임웹 코드 위젯은 `<html>`, `<head>`, `<body>` 태그 없이  
> 내부 컨텐츠만 입력합니다. Tailwind·Flatpickr CDN은 `<head>` 안에 있으므로  
> `<link>`와 `<script src>` 태그를 아임웹 **[사이트 설정 > 헤더 스크립트]** 에  
> 별도로 추가하거나, 위젯 코드 맨 앞에 함께 붙여넣으세요.

### 아임웹 헤더에 추가할 CDN (사이트 설정 > SEO/스크립트 > head 영역)
```html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>
<!-- Flatpickr -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
<script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
<script src="https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js"></script>
```

---

## STEP 7 — 연동 테스트

### 7-1. GAS 단위 테스트
Apps Script 에디터에서 아래 함수를 순서대로 실행하여 각 기능 검증:

| 함수명 | 테스트 내용 |
|--------|-------------|
| `testWebhook()` | Jandi/Slack 알림 수신 확인 |
| `testCalendar()` | 캘린더 이벤트 등록 확인 |
| `testEstimate()` | 견적서 PDF 생성 및 Drive 저장 확인 |
| `testDoPost()` | 예약 접수 로직 전체 흐름 확인 |
| `testDoGet()` | 마감 슬롯 조회 응답 확인 |

### 7-2. 프론트엔드 E2E 테스트
1. 아임웹 예약 페이지 접속
2. 날짜 선택 → 프로그램 선택 → 시간 선택 → 인원 설정 → 정보 입력
3. **예약 접수하기** 클릭
4. 확인 사항:
   - ✅ 성공 팝업 표시
   - ✅ Google Sheet `예약DB` 시트에 새 행 추가, 상태 = `대기`
   - ✅ Jandi 채널에 "신규 예약 접수" 알림 수신

### 7-3. 관리자 승인 테스트
1. Google Sheet `예약DB` 시트 → 해당 예약 행의 L열 체크박스 클릭
2. 확인 사항:
   - ✅ 상태가 `확정`으로 변경
   - ✅ Google Calendar에 일정 등록
   - ✅ Drive 폴더에 PDF 견적서 저장
   - ✅ 신청자 이메일로 확정 안내 발송
   - ✅ Jandi 채널에 "예약 확정 완료" 알림 수신

---

## ⚠️ 주의사항 및 자주 발생하는 오류

### CORS 오류
- GAS 웹 앱은 기본적으로 CORS를 허용하지 않습니다.
- 프론트에서 `Content-Type: 'text/plain'`으로 POST 하는 방식이 우회 방법입니다.
- 이미 코드에 적용되어 있으므로 별도 수정 불필요합니다.

### 권한 오류 (Permission denied)
- GAS 배포 시 **"다음 사용자로 실행: 나"** 옵션을 반드시 선택하세요.
- 처음 실행 시 Google 계정 권한 승인 화면이 나타나면 **모두 허용** 클릭.

### 코드 수정 후 변경사항이 반영되지 않음
- GAS는 배포된 버전이 고정됩니다.
- 코드 수정 후 → **배포 > 배포 관리 > 편집 > 버전: 새 버전** 선택 후 배포.

### 견적서 PDF 생성 실패
- 템플릿 파일에 대한 **편집 권한**이 GAS 실행 계정에 있어야 합니다.
- 템플릿이 다른 계정 소유라면, 복사 가능하도록 **공유 설정: 편집자** 권한 부여.

### 캘린더 이벤트 등록 실패
- 캘린더 ID에 `@group.calendar.google.com`이 포함되어야 합니다.
- 개인 기본 캘린더라면 Google 이메일 주소 자체가 캘린더 ID입니다.

---

## 📋 운영 체크리스트

- [ ] Google Sheet `예약DB` 헤더 초기화 (`setupSheet()` 실행)
- [ ] `installTrigger()` 실행 완료
- [ ] GAS 웹 앱 배포 URL 복사 완료
- [ ] `step1_frontend.html`에 GAS URL 입력
- [ ] 아임웹 헤더에 CDN 추가
- [ ] 아임웹 코드 위젯에 프론트 코드 삽입
- [ ] Jandi Webhook 알림 수신 확인
- [ ] 테스트 예약 접수 → 관리자 승인 전 과정 검증

---

## 🔧 향후 확장 아이디어

| 기능 | 구현 방법 |
|------|-----------|
| 예약 가능 인원 상한 설정 | CONFIG에 `MAX_PER_SLOT` 추가, isSlotTaken()에서 인원 합산 비교 |
| 특정 날짜 휴무일 설정 | '설정' 시트에 휴무일 목록 관리 → doGet에서 Flatpickr disable 배열로 반환 |
| SMS 알림 발송 | GAS에서 알리고(Aligo) API 또는 네이버 클라우드 SMS API 연동 |
| 예약 취소 셀프서비스 | 접수번호 + 연락처로 본인 확인 후 취소 URL 제공 |
| 통계 대시보드 | Google Sheets 내 별도 시트에 QUERY/COUNTIFS 함수로 월별 통계 |
