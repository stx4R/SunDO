/**
 * 정책 문서 3종의 본문 — PRD §8.12 · design `20i`·`20g`·`20h`.
 *
 * 🔴 **왜 JSX가 아니라 데이터인가**(W-18 §4).
 *
 * 1. §8.12.1이 「세 화면은 **동일한 레이아웃**을 쓰고 제목·소제목·본문만 교체한다」로
 *    규정한다. 셸 1개 + 데이터 3벌이 그 문장을 그대로 옮긴 형태다. JSX 세 벌이면
 *    「같은 레이아웃」이 규격이 아니라 우연이 된다.
 * 2. 🔴 **문안은 PM 검토 대상이다**(W-18 결정 3). 한 파일에 모여 있어야 보고서 §8의
 *    「PM 확인이 필요한 문장」과 1:1로 대조되고, DoD 5의 금지 문장 `grep`이 성립한다.
 *    JSX에 흩어지면 마크업과 문장이 섞여 둘 다 어려워진다.
 * 3. 번들 — 문장이 `jsx()` 호출이 아니라 문자열 배열이라 minify가 짧게 접는다. 실측값은 보고서 §4.
 *
 * 🔴 **본문의 모든 사실 주장에는 근거가 있다**(규약 4-3). 문장 ↔ 근거 대조표는
 * `reports/W-18.md` §3이다. **근거 없이 한 문장도 더하지 마라.**
 *
 * 🔴 **다음 다섯 종류의 문장을 쓰지 마라** — 지금 사실이 아니다(지시서 §3.2):
 * 탈퇴 시 즉시 파기 · 탈퇴 시 식별 정보 대체 · 기간 경과 후 스스로 파기 ·
 * 앱에서 열람·정정·삭제 가능 · 알림 발송.
 */

export interface PolicySection {
  /** 소제목. 14px/700 `#1F5138`. */
  heading: string
  /** 문단. 한 원소가 한 문단이다. 13px/500 `rgba(20,53,38,0.70)` · 줄간격 1.7. */
  body: readonly string[]
}

export interface PolicyDoc {
  /** `data-screen` 값. `router.tsx`의 자리표시자가 쓰던 것을 그대로 잇는다. */
  screen: string
  /** H2 제목. §6.1 화면 맵의 이름과 같아야 한다. */
  title: string
  /**
   * 카드 상단 고정 블록. design `20i`는 라벨 + 칩, `20h`는 안내 1줄, `20g`는 **없다**.
   * 있을 때만 구분선과 스크롤 영역 상단 여백 16px이 함께 생긴다.
   */
  head?:
    | { kind: 'chips'; label: string; chips: readonly string[] }
    | { kind: 'note'; text: string }
  sections: readonly PolicySection[]
}

/* ============================================================================
   S-privacy 개인정보 처리방침 — design `20i` · PRD §8.12.2
   근거 조항: §14.1(수집·최소화) · §14.2(접근 통제·감사) · §14.3(보관·파기) ·
             §14.4 CP-02·CP-03·CP-07
   ========================================================================== */

/**
 * 🔴 칩은 **4개**다. PRD §8.12.2 본문은 3개로 적지만 §20.7 채택표가 `20i`를
 * 「칩 4개 · 기타 사유 수집 명시」로 규정한다 — DS-02(최신본 채택)로 4개가 정본이다.
 */
export const PRIVACY: PolicyDoc = {
  screen: 'S-privacy',
  title: '개인정보 처리방침',
  head: {
    kind: 'chips',
    label: '수집하는 정보',
    chips: ['이름', '학교 이메일', '학년·반·번호·이름', '기타 사유 입력값'],
  },
  sections: [
    {
      heading: '1. 수집 항목',
      body: [
        /* §14.1 수집 항목 표 1~3행 + §9.3.1 실제 필드. `lastActiveAt`·`recordCount`·
           `notificationPrefs`를 빠뜨리면 「그 밖의 개인정보는 수집하지 않습니다」가 거짓이 된다. */
        '자율생활부 부원의 계정에는 이름, 학교 이메일, Google 계정 식별자, Google 표시 이름 원문, 본인 학번과 거기서 갈라 낸 학년·반·번호가 저장됩니다. 앱을 마지막으로 연 시각, 작성한 기록 건수, 알림 설정값도 함께 보관합니다.',
        /* §14.1 「수집하지 않는 항목」 + PR-06(사진) + §9.3.1 각주(비밀번호). */
        '비밀번호와 프로필 사진은 수집하지 않습니다. 로그인은 Google 계정이 전담하므로 이 앱은 비밀번호를 다루지 않습니다.',
        /* 🔴 §2.2-3 정보주체 ≠ 이용자. PR-01 · PR-03. DoD 6. */
        '지도 기록의 대상이 되는 학생은 이 앱을 이용하지 않지만 이름이 저장됩니다. 학생에 대해서는 학년·반·번호·이름 네 가지만 보관하며 연락처, 주소, 생년월일, 사진, 보호자 정보는 수집하지 않습니다. 학교 재학생 명부가 학년도 단위로 등록되어 있습니다.',
        /* §9.3.5 records 필드 + CP-07(기타 사유 명시 의무) + PR-02 ①③. */
        '기록에는 대상 학생의 학년·반·번호·이름, 적발 사유, 발생 시각, 작성자의 이름과 계정 식별자가 들어갑니다. 사유를 `기타`로 고르면 2자 이상 20자 이하의 짧은 사유를 함께 적습니다. 이 자유 기입란은 검색과 집계의 대상에서 빠져 있습니다.',
        /* PR-05가 처리방침에 명시하도록 요구하는 문장. */
        '학교 이메일은 주소 전체를 그대로 보관하며 그 구성 요소를 따로 분리해 이용하지 않습니다.',
      ],
    },
    {
      heading: '2. 이용 목적',
      body: [
        /* CP-03 — 처리 목적 한정. */
        '수집한 정보는 등교 지도 기록의 작성과 조회, 자율생활부 구성원 확인, 순찰 일정 편성에만 이용합니다. 학교 생활지도 업무 밖의 목적으로는 이용하지 않습니다.',
        /* 🔴 §2.2-4 — `firestore.rules`의 실제 경계다. 「이름·역할만」은 규칙이 아니라
           클라이언트 규율이므로 「화면에는」과 「저장된 문서는」을 갈라 적는다. */
        '승인을 받은 자율생활부 부원은 학생 명부와 지도 기록 전체를 열람할 수 있습니다. 부원 명단은 화면에 이름과 역할만 보여 주지만, 저장된 계정 문서 자체는 승인된 부원이면 읽을 수 있습니다. 감사 기록은 부장과 담당 교사만 열람합니다.',
        /* §2.2-8 실측 — 코드 내 외부 전송 0건. §2.2-7 위탁. 리전은 확인 전이라 위치를 적지 않는다. */
        '정보를 외부에 제공하거나 판매하지 않습니다. 자료는 Google이 운영하는 Firebase에 저장되며 그 범위에서 Google이 처리를 위탁받습니다. 그 밖에 화면에 쓰이는 글꼴 파일을 외부 배포처에서 내려받습니다.',
      ],
    },
    {
      heading: '3. 보관 기간',
      body: [
        /* §14.3 1·2행. 🔴 실제 파기 경로가 없으므로 「스스로 지우지 않는다」를 함께 적는다. */
        '지도 기록은 해당 학년도가 끝난 뒤 1년 동안 보관합니다. 기록을 삭제 표시하더라도 문서 자체는 남고, 실제 삭제는 학년도 단위로 담당자가 직접 수행합니다. 앱이 정해진 시점에 스스로 지우는 기능은 없습니다.',
        /* 🔴 W-17 §5.1 실측 — 탈퇴 뒤 17필드 불변 · `anonymizedAt` 없음. §14.3의 6개월
           절차는 v1.2다. 「~할 예정입니다」도 쓰지 않는다(결정 1). */
        '탈퇴하면 계정은 이용 종료 상태로 바뀌지만 이름과 학교 이메일을 비롯한 계정 정보는 문서에 그대로 남습니다. 식별 정보를 지우는 절차는 아직 앱에 들어 있지 않습니다. 탈퇴한 계정의 정보를 지우려면 담당 교사에게 요청해 주세요.',
        /* 🔴 §9.3.5 비정규화 보관 — `studentName`·`studentNo`·`createdByName`. C7 · BR-54. DoD 6. */
        '탈퇴하거나 졸업해도 그동안 작성한 지도 기록은 지워지지 않습니다. 기록에는 작성 당시의 작성자 이름과 대상 학생의 이름·학번이 사본으로 들어 있어, 계정 정보를 지우더라도 기록 안의 이름은 그대로 남습니다. 생활지도 기록의 작성 책임을 남기기 위한 것입니다.',
        /* 🔴 §14.2 SC-04 + `firestore.rules` `update:false`·`delete:false` 실측.
           `actorName`은 §9.3.8 필수 필드라 모든 로그가 행위자 실명을 담는다. DoD 6. */
        '가입 승인, 가입 거절, 부장 권한 양도, 가입 코드 발급, 계정 탈퇴는 감사 기록으로 남습니다. 감사 기록은 고치거나 지울 수 없도록 막혀 있어 계정을 정리한 뒤에도 남으며, 여기에는 행위자의 이름과 역할이 함께 저장됩니다. 기록이 고쳐질 수 있으면 감사가 성립하지 않기 때문입니다.',
      ],
    },
    {
      heading: '4. 파기 절차',
      body: [
        /* §14.3 실행 주체 행(「Dev가 학기말에 수동 실행」) + CP-05(서면 보고). */
        '보관 기간이 지난 정보는 담당자가 학년도 단위로 직접 삭제하고 담당 교사에게 결과를 보고합니다.',
        /* 🔴 감사 로그는 규칙이 delete를 막고 있어 이 절차에서 구조적으로 빠진다. */
        '감사 기록은 위·변조를 막기 위해 삭제가 차단되어 있어 이 절차에서 제외됩니다.',
      ],
    },
    {
      heading: '5. 문의처',
      body: [
        /* PR-03 — 학생 본인·보호자는 앱 사용자가 아니다. 열람 요청은 학교 절차. */
        '개인정보 열람·정정·삭제 요청은 자율생활부 담당 교사에게 문의해 주세요. 기록 대상이 된 학생과 보호자도 같은 경로로 요청할 수 있습니다.',
        /* 🔴 §2.2-11 실측 — 앱 내 권리 행사 경로 0건. §8.11 T-02(이름 변경 불가). */
        '앱 안에는 이 요청을 직접 처리하는 화면이 없습니다. 이름과 학교 이메일은 Google 계정 정보라 앱에서 고칠 수 없습니다.',
      ],
    },
  ],
}

/* ============================================================================
   S-terms 서비스 이용약관 — design `20g` · PRD §8.12.3
   근거 조항: §8.1.3(도메인) · §8.2(가입) · §4.1~4.3(역할) · §10.10 BR-56·R-07 ·
             §14.1 PR-02·PR-04 · §14.4 CP-04·CP-08
   ========================================================================== */

export const TERMS: PolicyDoc = {
  screen: 'S-terms',
  title: '서비스 이용약관',
  sections: [
    {
      heading: '1. 목적',
      body: [
        '이 약관은 대전대신고등학교 자율생활부 앱의 이용 조건과 절차를 정합니다.',
        /* 🔴 동의 시점 — 규격 공백이었고 사용자 결정으로 S2에 동의 확인이 신설됐다(W-18 §4). */
        '가입 신청 화면에서 이 약관과 개인정보 처리방침에 대한 동의를 확인합니다. 동의하지 않으면 가입 신청을 보낼 수 없습니다.',
      ],
    },
    {
      heading: '2. 이용 자격',
      body: [
        /* §8.1.3 3중 방어 + `firestore.rules` `isSignedIn()`의 도메인 정규식. */
        '학교가 발급한 @dshs.kr 계정으로 로그인하고 부장의 승인을 받은 자율생활부 구성원만 이용할 수 있습니다. 개인 Google 계정으로는 로그인할 수 없습니다.',
      ],
    },
    {
      heading: '3. 계정과 승인',
      body: [
        /* §8.2 + `firestore.rules` `approvalRequests` update = `isHead()`. */
        '가입에는 부장이 발급한 코드가 필요합니다. 코드를 넣어 신청하면 부장이 승인해야 이용이 시작됩니다.',
        /* §9.3.1 `name`·`email` 제약 + §8.10.5 S2 신원 카드 문구. */
        '이름과 학교 이메일은 Google 계정 정보를 따르며 본인이 앱에서 바꿀 수 없습니다.',
        /* §4.1~4.3 역할과 권한 + `firestore.rules`의 `isHead()`·`isVice()` 경계. */
        '계정에는 부원·차장·부장·교사 역할이 있고 역할에 따라 할 수 있는 일이 다릅니다. 기록 작성과 조회는 승인된 구성원 모두가, 가입 승인과 코드 발급과 명부 등록은 부장이, 순찰 일정 편성은 차장 이상이 맡습니다.',
        /* 🔴 지시서 §3.3 필수 — OP-11 · BR-19 · W-15B §4-1. 되돌리기 경로가 앱에 없다. */
        '부장 권한을 다른 부원에게 넘기면 내 계정은 곧바로 일반 부원으로 바뀝니다. 이 양도는 앱에서 되돌릴 수 없으며, 되돌리려면 새 부장이 다시 양도해야 합니다.',
      ],
    },
    {
      heading: '4. 금지 행위',
      body: [
        /* PR-04(캡처) + CP-04(외부 반출). */
        '화면 캡처와 외부 공유, 타인 계정 사용, 사실과 다른 기록 작성을 금지합니다. 학생 개인정보를 개인 클라우드, 메신저, 개인 기기로 옮기지 않습니다.',
        /* PR-02 ② — §8.10.5 S6 상시 안내 문구와 같은 내용이다. */
        '`기타` 사유에는 사실만 짧게 적고 학생에 대한 평가나 별명은 쓰지 않습니다.',
      ],
    },
    {
      heading: '5. 서비스 중단과 탈퇴',
      body: [
        /* 🔴 BR-56 · R-07 · `firestore.rules` `selfWithdraw()`의 `role != 'head'` ·
           §8.11.5(오프라인 잠금). 「언제든지」는 사실이 아니다. */
        '설정 화면에서 탈퇴할 수 있습니다. 다만 부장은 부장 권한을 다른 부원에게 먼저 넘겨야 탈퇴할 수 있고, 오프라인 상태에서는 탈퇴할 수 없습니다.',
        /* C7 · CP-08 · MD-07 · W-17 §5.1 실측(`recordCount` 보존). */
        '탈퇴해도 본인이 작성한 지도 기록은 삭제되지 않고 그대로 남습니다.',
        /* 「사전에 공지합니다」를 쓰지 않는다 — 공지를 읽는 경로가 앱에 없다(보고서 §8). */
        '학교 사정이나 기술적 문제로 서비스가 중단될 수 있습니다.',
      ],
    },
    {
      heading: '6. 책임의 한계',
      body: [
        '이 앱은 자율생활부의 생활지도 업무를 돕는 도구이며, 기록의 내용과 그에 따른 지도 판단은 학교와 담당 교사의 몫입니다.',
        /* §9.3.5 `source: 'offline'` + EC-01 오프라인 큐. */
        '오프라인에서 작성한 기록은 연결이 회복될 때 전송되므로 다른 부원에게 보이는 시점이 늦어질 수 있습니다.',
      ],
    },
  ],
}

/* ============================================================================
   S-oss 오픈소스 라이선스 — design `20h` · PRD §8.12.4
   ========================================================================== */

/**
 * 🔴 **범위는 `package.json`의 `dependencies` 6개 + 폰트 1개다**(W-18 결정 2 · DoD 7).
 *
 * - `devDependencies`(`vite`·`tailwindcss`·`oxlint`·`typescript` 등)는 **사용자에게
 *   배포되지 않으므로** 넣지 않는다. design `20h`가 Vite·Tailwind를 그리지만 그것은
 *   시안의 예시 목록이고 버전도 실제와 다르다(React 19.0.0 · Firebase 11.0.0 …).
 * - PRD §8.12.4 「최소 포함」의 **Workbox는 이 저장소에 존재하지 않는다**(W-19 PWA 예정).
 * - **Spoqa Han Sans Neo는 넣는다** — `index.html`이 CDN에서 받아 **사용자에게 실제로
 *   배포되는** 서드파티 자산이고, design `20h`와 §8.12.4가 둘 다 포함을 지시한다.
 * - 전이 의존성 55개는 열거하지 않는다. 전량 허용형(Apache-2.0 49 · MIT 4 · ISC 1 ·
 *   0BSD 1)이고 카피레프트가 0이라 상위 패키지 고지로 덮인다. 근거는 보고서 §4.
 *
 * ⚠ **버전은 `package.json`과 손으로 맞추지 마라.** 어긋나면 §8.12.4의 「1:1 일치」가
 * 조용히 깨진다. 갱신할 때 `npm ls --depth=0`으로 대조하라.
 */
export const OSS: PolicyDoc = {
  screen: 'S-oss',
  title: '오픈소스 라이선스',
  head: { kind: 'note', text: '이 앱은 아래 오픈소스 소프트웨어를 사용합니다.' },
  sections: [
    {
      heading: 'React 19.2.8',
      body: ['MIT License', 'Copyright (c) Meta Platforms, Inc. and affiliates.'],
    },
    {
      heading: 'React DOM 19.2.8',
      body: ['MIT License', 'Copyright (c) Meta Platforms, Inc. and affiliates.'],
    },
    {
      heading: 'React Router 8.3.0',
      body: [
        'MIT License',
        'Copyright (c) React Training LLC 2015-2019',
        'Copyright (c) Remix Software Inc. 2020-2021',
        'Copyright (c) Shopify Inc. 2022-2023',
      ],
    },
    {
      /* 🔴 npm 패키지에 LICENSE·NOTICE 파일이 없다. 근거는 번들 각 파일 상단의
         `@license` 헤더뿐이므로 Apache-2.0 4조 (d)의 NOTICE 재배포 의무는 발생하지 않는다. */
      heading: 'Firebase JavaScript SDK 12.18.0',
      body: ['Apache License 2.0', 'Copyright 2025 Google LLC'],
    },
    {
      heading: 'clsx 2.1.1',
      body: ['MIT License', 'Copyright (c) Luke Edwards (lukeed.com)'],
    },
    {
      heading: 'tailwind-merge 3.6.0',
      body: ['MIT License', 'Copyright (c) 2021 Dany Castillo'],
    },
    {
      heading: 'Spoqa Han Sans Neo',
      body: ['SIL Open Font License 1.1', 'Copyright (c) Spoqa Inc.'],
    },
    {
      /* 🔴 §3.4 — MIT는 저작권 고지와 **이 허가 고지**를 함께 유지하는 것이 조건이다.
         패키지마다 전문을 반복하지 않고 한 번 싣는다. 위 저작권 표기가 각각의 고지다. */
      heading: 'MIT License 전문',
      body: [
        'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
        'The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.',
        'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
      ],
    },
    {
      /* §3.4 — Apache-2.0은 라이선스 사본 제공과 면책 고지가 조건이다. */
      heading: 'Apache License 2.0 고지',
      body: [
        'Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0',
        'Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.',
      ],
    },
    {
      /* OFL 1.1 — 저작권 고지와 라이선스를 함께 배포하고, 폰트 자체를 팔지 않는 것이 조건이다. */
      heading: 'SIL Open Font License 1.1 고지',
      body: [
        '이 글꼴은 SIL Open Font License 1.1에 따라 배포되며, 저작권 표기와 라이선스를 함께 유지하는 조건으로 자유롭게 사용·재배포할 수 있습니다. 글꼴 파일 자체를 판매하지 않습니다. 원문은 https://openfontlicense.org 에서 볼 수 있습니다.',
      ],
    },
  ],
}
