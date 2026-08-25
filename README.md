# SunDO. v0.18.0

안녕하십니까?  **SunDO**의 개발자 유이준입니다.  
해당 마크다운 문서에서는 업데이트 로그, 사용법, F&Q, 오픈소스 라이선스를 서술하고 있습니다.

참조1) 해당 프로그램은 PWA 방식으로 작동되며, iOS (26.6.1) 모바일 기기를 기준으로 제작되었습니다.  
(Status Bar, Dynamic Island, Home Indicator, etc...)  

## 업데이트 로그
<pre><code>( 진행 완료 ) v0.0.1 Project Scaffolding   
( 진행 완료 ) v0.0.2 Design Token Track   
( 진행 완료 ) v0.0.3 Layer, Appshell, Field, Switch     
( 진행 완료 ) v0.0.4 Surface Component, Dock, Footer    
( 진행 완료 ) v0.0.5 Toast, BottomSheet, ConfirmModal   
( 진행 완료 ) v0.0.6 Firebase, Google OAuth   
( 진행 완료 ) v0.0.7 Routing, Role   
( 진행 완료 ) v0.0.8 SignUp Page   
( 진행 완료 ) v0.0.9 AccessPage   
( 진행 완료 ) v0.1.0 OfflineBannerSlot   
( 진행 완료 ) v0.1.1 Main Page, GradeSelect   
( 진행 완료 ) v0.2.0 ClassSelect, StudentSelect  
( 진행 완료 ) v0.3.0 Record Page   
( 진행 완료 ) v0.4.0 Schedule Page   
( 진행 완료 ) v0.5.0 Admin Page, SignUpAccessLogic, SignUpCode   
( 진행 완료 ) v0.6.0 Admin Page, MemberSlot, Permission   
( 진행 완료 ) v0.7.0 Security Rules, Index   
( 진행 완료 ) v0.8.0 Demo Deploy   
( 진행 완료 ) v0.9.0 Setting Page, DeleteAccount    
( 진행 완료 ) v0.9.1 Bug Fixed   
( 진행 완료 ) v0.10.1 License Page   
( 진행 완료 ) v0.11.0 PWA Settings   
( 진행 완료 ) v0.12.0 OfflinefixedLogic   
( 진행 완료 ) v0.13.0 UI/UX Patches  
( 진행 완료 ) v0.14.0 LOTS OF BUGS FIXED.  
( 진행 완료 ) v0.15.0 Functions Added.  
( 진행 완료 ) v0.16.0 Deploy Check.  
( 진행 완료 ) v0.16.1 Database fixed.  
( 진행 완료 ) v0.17.0 LOTS OF BUGS FIXED.  
( 진행 완료 ) v0.18.0 Deploy Settings.  
( 진행 대기 ) **v1.0.0 DEPLOY**   </code></pre>

## 남은 작업
<pre><code>1. 온라인 / 오프라인 멤버 확인 기능  
2. 오프라인 상태에서 토스트 알림 마진 설정    
3. 검색 로직 수정.
4. 선도 일정 범위화  
5. 선도 인원 부장 확인  
6. AI 챗봇  
(C) 7. 차장 role 생성    
(C) 8. 화면 모바일 기기 최적화 및 스크롤 범위 제한  
(C) 9. PWA 편의성 패치 (복사 불가, 확대 불가, 자동 전체 화면(ui 숨기기))  
(C) 10. 미기록 상태일때의 위젯 마진 설정</code></pre>

## 미결정 사항들
<code>업데이트 대기중입니다.</code>

## 사용법

### 회원가입 및 로그인 방식

#### 회원가입

아래 기술된 회원가입 절차를 따라 진행하는 것을 권장함.  
각각의 절차에 부적격 처리를 받은 과정 진행 시, 거부될 수 있음.

1. 학교 도메인 구글 계정으로 OAuth 인증을 진행합니다.
2. 부장에게 발급받은 코드를 올바르게 입력합니다.
3. 부장이 승인할 때까지 대기합니다.
4. 승인이 완료되면 회원가입이 완료됩니다.

#### 로그인

아래 기술된 로그인 절차를 따라 진행하는 것을 권장함.  
각각의 절차에 부적격 처리를 받은 과정 진행 시, 거부될 수 있음.  

1. 학교 도메인 구글 계정으로 OAuth 인증을 진행합니다.
2. 올바르게 인증이 완료되었다면, 로그인이 완료됩니다.
  
### 하단 Dock 바  

#### 하단 Dock 바 - 홈  

해당 페이지에서는 SunDO PWA의 전반적인 기능을 한번에 볼 수 있는 페이지입니다.  

#### 하단 Dock 바 - 기록  

해당 페이지에서는 선도 조건에 부적합한 학생들을 선택형으로 기록하는 페이지입니다.  

#### 하단 Dock 바 - 일정  

해당 페이지에서는 최근 1주일 간의 선도 일정을 확인할 수 있습니다.  

#### 하단 Dock 바 - 관리  

해당 페이지는 부장만 접근이 가능하며, 기능은 공개하지 않습니다.  

#### 하단 Dock 바 - 설정  

해당 페이지에서는 부원 여러분들이 각자의 계정에 대한 정보나 SunDO PWA에 관한 설정들을 조작할 수 있습니다.  

## F&Q

## 오픈소스 라이선스
<pre><code>MIT License

Copyright (c) 2026 Yijun Yoo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
</code></pre>
